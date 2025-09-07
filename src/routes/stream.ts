import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';

const STREAM_KEY_PREFIX = 'stream:';
const STREAM_DATA_CACHE_PREFIX = 'cache:stream_data:';
const STREAM_DATA_EXPIRATION_SECONDS = 3600; // 1 hour
const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

// Common fetch options, inspired by Animesail
const commonFetchOptions = {
    headers: {
        'User-Agent': FAKE_USER_AGENT,
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

// Function to handle Blogger URLs
const getBloggerStreams = async (url: string, clientIp: string | null) => {
    console.log(`Fetching Blogger page to get cookies and config: ${url}`);
    
    const fetchHeaders: Record<string, string> = {
        'User-Agent': FAKE_USER_AGENT,
        'Referer': url,
    };

    if (clientIp) {
        fetchHeaders['X-Forwarded-For'] = clientIp;
    }

    const response = await fetch(url, { headers: fetchHeaders });

    if (!response.ok) {
        throw new Error(`Failed to fetch video config from Blogger. Status: ${response.status}`);
    }

    const cookie = response.headers.get('set-cookie');
    const html = await response.text();

    const searchString = 'var VIDEO_CONFIG = ';
    const startIndex = html.indexOf(searchString);

    if (startIndex !== -1) {
        const scriptContent = html.substring(startIndex + searchString.length);
        const endIndex = scriptContent.indexOf('</script>');
        if (endIndex !== -1) {
            let jsonString = scriptContent.substring(0, endIndex).trim();
            if (jsonString.endsWith(';')) {
                jsonString = jsonString.slice(0, -1);
            }
            
            const videoConfig = JSON.parse(jsonString);

            if (videoConfig.streams && videoConfig.streams.length > 0) {
                return { streams: videoConfig.streams, cookie };
            }
        }
    } else {
        console.error('VIDEO_CONFIG not found. Blogger HTML response:');
        console.error(html);
    }

    throw new Error('No streams found in VIDEO_CONFIG');
};

// Function to handle Filedon URLs
const getFiledonStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache] HIT for Filedon stream data: ${url}`);
        return cachedResult; // Upstash Redis client auto-parses JSON
    }

    console.log(`[Cache] MISS for Filedon stream data. Fetching Filedon page: ${url}`);
    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Filedon page. Status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:[^"]+\\.m3u8[^"]*)"/);
    if (m3u8Match && m3u8Match[1]) {
        console.log(`Found M3U8 stream in script: ${m3u8Match[1]}`);
        const result = { url: m3u8Match[1], type: 'm3u8' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    const dataPage = $("#app").attr('data-page');
    if (dataPage) {
        const pageProps = JSON.parse(dataPage);
        const videoUrl = pageProps?.props?.url;
        if (videoUrl) {
            console.log(`Found stream in data-page: ${videoUrl}`);
            const result = { url: videoUrl, type: 'mp4' };
            await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
            return result;
        }
    }

    throw new Error('No stream URL found on Filedon page');
};

// Function to handle Pixeldrain URLs
const getPixeldrainStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache] HIT for Pixeldrain stream data: ${url}`);
        return cachedResult; // Upstash Redis client auto-parses JSON
    }

    console.log(`[Cache] MISS for Pixeldrain stream data. Fetching Pixeldrain page: ${url}`);
    const id = new URL(url).pathname.split('/').pop();
    if (!id) {
        throw new Error('Invalid Pixeldrain URL: missing ID');
    }

    const infoUrl = `https://pixeldrain.com/api/file/${id}/info`;
    const downloadUrl = `https://pixeldrain.com/api/file/${id}`;

    const infoResponse = await fetch(infoUrl, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!infoResponse.ok) {
        throw new Error(`Failed to fetch Pixeldrain info. Status: ${infoResponse.status}`);
    }
    const info = await infoResponse.json();

    if (!info.success) {
        throw new Error(`Pixeldrain file ${id} is not available or info check failed.`);
    }

    const result = { url: downloadUrl, type: info.mime_type || 'application/octet-stream' };
    await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
    return result;
};

// Function to handle Wibufile URLs
const getWibufileStream = async (url: string, request: Request) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache] HIT for Wibufile stream data: ${url}`);
        return cachedResult; // Upstash Redis client auto-parses JSON
    }

    console.log(`[Cache] MISS for Wibufile stream data. Fetching Wibufile embed page: ${url}`);
    
    try {
        const jar = new CookieJar();
        const client = axiosCookieJarSupport(axios.create({ jar }));

        const { data: pageHtml } = await client.get(url, {
            headers: {
                ...commonFetchOptions.headers,
                'Referer': 'https://v1.samehadaku.how/',
            },
        });

        const apiUrlMatch = pageHtml.match(/url:\s*["'](.*api\.wibufile\.com\/api\/\?.*?)["']/);
        if (!apiUrlMatch || !apiUrlMatch[1]) {
            throw new Error('Could not find dynamic API URL in Wibufile page.');
        }

        const dynamicApiUrl = apiUrlMatch[1].startsWith('//') ? `https:${apiUrlMatch[1]}` : apiUrlMatch[1];
        console.log(`Found dynamic Wibufile API URL: ${dynamicApiUrl}`);

        const { data: apiResponse } = await client.get(dynamicApiUrl, {
            headers: {
                ...commonFetchOptions.headers,
                'Referer': url, // Referer is the embed page itself
            }
        });

        if (apiResponse.status !== 'ok' || !apiResponse.sources || apiResponse.sources.length === 0) {
            throw new Error(`Wibufile API call failed or returned no sources. Message: ${apiResponse.message || 'No message'}`);
        }

        const sources = apiResponse.sources;
        const hlsSource = sources.find((s: any) => s.file && s.file.includes('.m3u8'));
        
        let finalUrl = null;
        let finalType = null;

        if (hlsSource && hlsSource.file) {
            finalUrl = hlsSource.file;
            finalType = 'm3u8';
        } else if (sources[0] && sources[0].file) {
            finalUrl = sources[0].file;
            finalType = 'mp4';
        }

        if (finalUrl && finalType) {
            const result = { url: finalUrl, type: finalType };
            await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
            return result;
        }

        throw new Error('No valid stream URL found in the Wibufile API response.');

    } catch (error: any) {
        console.error(`Error in getWibufileStream: ${error.message}`);
        throw new Error(`Failed to resolve Wibufile stream: ${error.message}`);
    }
};

// Function to handle Mp4upload URLs
const getMp4uploadStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache] HIT for Mp4upload stream data: ${url}`);
        return cachedResult;
    }

    console.log(`[Cache] MISS for Mp4upload stream data. Fetching Mp4upload page: ${url}`);
    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Mp4upload page. Status: ${response.status}`);
    }
    const html = await response.text();
    
    const videoUrlMatch = html.match(/player\.src\({\s*type: "video\/mp4",\s*src: "([^"]+)"/);

    if (videoUrlMatch && videoUrlMatch[1]) {
        console.log(`Found stream in script: ${videoUrlMatch[1]}`);
        const result = { url: videoUrlMatch[1], type: 'mp4' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    throw new Error('No stream URL found on Mp4upload page');
};

// Function to handle Krakenfiles URLs
const getKrakenfilesStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache] HIT for Krakenfiles stream data: ${url}`);
        return cachedResult;
    }

    console.log(`[Cache] MISS for Krakenfiles stream data. Fetching Krakenfiles page: ${url}`);
    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Krakenfiles page. Status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const videoSource = $('video#my-video source').attr('src');

    if (videoSource) {
        console.log(`Found stream in video source: ${videoSource}`);
        const result = { url: videoSource, type: 'mp4' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    throw new Error('No stream URL found on Krakenfiles page');
};

export const stream = new Elysia()
    .get('/anime/stream/:id', async ({ params, set, request, ip }) => {
        const { id } = params;

        if (!id) {
            set.status = 400;
            return { error: 'Missing stream ID' };
        }

        try {
            const streamUrl = await redis.get(`${STREAM_KEY_PREFIX}${id}`);

            if (!streamUrl) {
                set.status = 404;
                return { error: 'Stream ID not found or has expired. Please fetch a new one.' };
            }

            if (streamUrl.includes('blogger.com')) {
                const result = await getBloggerStreams(streamUrl, ip);
                if (result && result.streams && result.streams[0] && result.streams[0].play_url) {
                    const videoUrl = result.streams[0].play_url;
                    const fetchHeaders: Record<string, string> = {
                        'User-Agent': FAKE_USER_AGENT,
                        'Referer': streamUrl,
                    };
                    if (result.cookie) {
                        fetchHeaders['Cookie'] = result.cookie;
                    }
                    const rangeHeader = request.headers.get('range');
                    if (rangeHeader) {
                        fetchHeaders['range'] = rangeHeader;
                    }
                    const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });
                    if (!videoResponse.ok) {
                        const errorBody = await videoResponse.text();
                        console.error(`Google Video Fetch Error: Status ${videoResponse.status}, Body: ${errorBody}`);
                        throw new Error(`Failed to fetch video from Google. Status: ${videoResponse.status}`)
                    }
                    return videoResponse;
                } else {
                    throw new Error('No play_url found in streams');
                }
            } else if (streamUrl.includes('filedon.co')) {
                const filedonResult = await getFiledonStream(streamUrl);
                const videoUrl = filedonResult.url;
                const videoType = filedonResult.type;

                const fetchHeaders: Record<string, string> = {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': streamUrl,
                };

                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    fetchHeaders['range'] = rangeHeader;
                }

                const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to fetch video from Filedon. Status: ${videoResponse.status}`);
                }

                const responseHeaders = new Headers();

                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }

                responseHeaders.set('Content-Disposition', 'inline');

                if (videoType === 'm3u8') {
                    responseHeaders.set('Content-Type', 'application/x-mpegURL');
                } else if (videoType === 'mp4') {
                    responseHeaders.set('Content-Type', 'video/mp4');
                } else {
                    const originalContentType = videoResponse.headers.get('Content-Type');
                    if (originalContentType) {
                        responseHeaders.set('Content-Type', originalContentType);
                    }
                }

                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    statusText: videoResponse.statusText,
                    headers: responseHeaders
                });
            } else if (streamUrl.includes('pixeldrain.com')) {
                const pixeldrainResult = await getPixeldrainStream(streamUrl);
                const videoUrl = pixeldrainResult.url;

                const fetchHeaders: Record<string, string> = {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': streamUrl, // Adding the Referer header
                };

                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    fetchHeaders['range'] = rangeHeader;
                }

                const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to fetch video from Pixeldrain. Status: ${videoResponse.status}`);
                }

                const responseHeaders = new Headers();
                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }
                responseHeaders.set('Content-Disposition', 'inline');

                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    statusText: videoResponse.statusText,
                    headers: responseHeaders
                });
            } else if (streamUrl.includes('wibufile.com')) {
                let videoUrl: string;
                let videoType: string;

                if (streamUrl.includes('s0.wibufile.com') || streamUrl.includes('.mp4')) {
                    console.log('[Resolver] Wibufile URL is already a direct link, skipping resolution.');
                    videoUrl = streamUrl;
                    videoType = streamUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
                } else {
                    const wibufileResult = await getWibufileStream(streamUrl, request);
                    videoUrl = wibufileResult.url;
                    videoType = wibufileResult.type;
                }

                const fetchHeaders: Record<string, string> = {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': 'https://v1.samehadaku.how/', // This needs to match the referer used to get the stream URL
                };

                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    fetchHeaders['range'] = rangeHeader;
                }

                const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to fetch video from Wibufile. Status: ${videoResponse.status}`);
                }

                const responseHeaders = new Headers();
                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }
                responseHeaders.set('Content-Disposition', 'inline');

                if (videoType === 'm3u8') {
                    responseHeaders.set('Content-Type', 'application/x-mpegURL');
                } else if (videoType === 'mp4') {
                    responseHeaders.set('Content-Type', 'video/mp4');
                } else {
                    const originalContentType = videoResponse.headers.get('Content-Type');
                    if (originalContentType) {
                        responseHeaders.set('Content-Type', originalContentType);
                    }
                }

                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    statusText: videoResponse.statusText,
                    headers: responseHeaders
                });
            } else if (streamUrl.includes('krakenfiles.com')) {
                const krakenResult = await getKrakenfilesStream(streamUrl);
                const videoUrl = krakenResult.url;
                const videoType = krakenResult.type;

                const fetchHeaders: Record<string, string> = {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': streamUrl,
                };

                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    fetchHeaders['range'] = rangeHeader;
                }

                const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to fetch video from Krakenfiles. Status: ${videoResponse.status}`);
                }

                const responseHeaders = new Headers();

                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }

                responseHeaders.set('Content-Disposition', 'inline');

                if (videoType === 'mp4') {
                    responseHeaders.set('Content-Type', 'video/mp4');
                } else {
                    const originalContentType = videoResponse.headers.get('Content-Type');
                    if (originalContentType) {
                        responseHeaders.set('Content-Type', originalContentType);
                    }
                }

                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    statusText: videoResponse.statusText,
                    headers: responseHeaders
                });
            } else if (streamUrl.includes('mp4upload.com')) {
                const mp4uploadResult = await getMp4uploadStream(streamUrl);
                const videoUrl = mp4uploadResult.url;
                const videoType = mp4uploadResult.type;

                const fetchHeaders: Record<string, string> = {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': streamUrl,
                };

                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    fetchHeaders['range'] = rangeHeader;
                }

                const videoResponse = await fetch(videoUrl, { headers: fetchHeaders });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to fetch video from Mp4upload. Status: ${videoResponse.status}`);
                }

                const responseHeaders = new Headers();

                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }

                responseHeaders.set('Content-Disposition', 'inline');

                if (videoType === 'mp4') {
                    responseHeaders.set('Content-Type', 'video/mp4');
                } else {
                    const originalContentType = videoResponse.headers.get('Content-Type');
                    if (originalContentType) {
                        responseHeaders.set('Content-Type', originalContentType);
                    }
                }

                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    statusText: videoResponse.statusText,
                    headers: responseHeaders
                });
            } else {
                set.status = 501;
                return { error: 'This stream provider is not yet supported for proxying.' };
            }

        } catch (error: any) {
            console.error(`Error proxying stream for ID ${id}:`, error);
            set.status = 500;
            return { error: error.message || 'Internal server error' };
        }

    }, {
        params: t.Object({
            id: t.String()
        })
    });