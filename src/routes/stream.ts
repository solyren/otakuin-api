import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';

const STREAM_KEY_PREFIX = 'stream:';
const STREAM_DATA_CACHE_PREFIX = 'cache:stream_data:';
const STREAM_DATA_EXPIRATION_SECONDS = 3600;
const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

const commonFetchOptions = {
    headers: {
        'User-Agent': FAKE_USER_AGENT,
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

// --- Get DoodStream ---
const getDoodStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;
    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT, 'Referer': url } });
    if (!response.ok) {
        throw new Error(`Failed to fetch DoodStream page. Status: ${response.status}`);
    }
    const html = await response.text();

    const passMd5Match = html.match(/\/pass_md5\/([^']+)/);
    if (!passMd5Match || !passMd5Match[1]) {
        throw new Error('Could not find pass_md5 token on DoodStream page');
    }

    const passMd5Url = `https://d-s.io/pass_md5/${passMd5Match[1]}`;
    const md5Response = await fetch(passMd5Url, { headers: { 'User-Agent': FAKE_USER_AGENT, 'Referer': url } });
    if (!md5Response.ok) {
        throw new Error(`Failed to fetch pass_md5 URL. Status: ${md5Response.status}`);
    }
    const baseUrl = await md5Response.text();

    const randomString = (Math.random() + 1).toString(36).substring(7);
    const finalUrl = `${baseUrl}${randomString}?token=${passMd5Match[1].split('/').pop()}&expiry=${Date.now()}`;

    const result = { url: finalUrl, type: 'mp4' };
    await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
    return result;
};

// --- Get YourUpload Stream ---
const getYourUploadStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch YourUpload page. Status: ${response.status}`);
    }
    const html = await response.text();
    
    const fileMatch = html.match(/file:\s*'([^']+)'/);

    if (fileMatch && fileMatch[1]) {
        const result = { url: fileMatch[1], type: 'mp4' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    throw new Error('No stream URL found on YourUpload page');
};

// --- Get Blogger Streams ---
const getBloggerStreams = async (url: string, clientIp: string | null) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;
    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }
    
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
                const result = { streams: videoConfig.streams, cookie };
                await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
                return result;
            }
        }
    }

    throw new Error('No streams found in VIDEO_CONFIG');
};

// --- Get Filedon Stream ---
const getFiledonStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Filedon page. Status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:\/\/[^ vital]+\.m3u8[^ vital]*)"/);
    if (m3u8Match && m3u8Match[1]) {
        const result = { url: m3u8Match[1], type: 'm3u8' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    const dataPage = $("#app").attr('data-page');
    if (dataPage) {
        const pageProps = JSON.parse(dataPage);
        const videoUrl = pageProps?.props?.url;
        if (videoUrl) {
            const result = { url: videoUrl, type: 'mp4' };
            await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
            return result;
        }
    }

    throw new Error('No stream URL found on Filedon page');
};

// --- Get Pixeldrain Stream ---
const getPixeldrainStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

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
        throw new Error(`Pixeldrain error: ${info.value}`);
    }

    const result = { url: downloadUrl, type: info.mime_type || 'application/octet-stream' };
    await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
    return result;
};

// --- Get Wibufile Stream ---
const getWibufileStream = async (url: string, request: Request) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }
    
    try {
        const jar = new CookieJar();
        const client = axiosCookieJarSupport(axios.create({ jar }));

        const { data: pageHtml } = await client.get(url, {
            headers: {
                ...commonFetchOptions.headers,
                'Referer': process.env.SAMEHADAKU_BASE_URL,
            },
        });

        const apiUrlMatch = pageHtml.match(/url:\s*["'](.*api.wibufile.com\/api\/?.*?)["']/);
        if (!apiUrlMatch || !apiUrlMatch[1]) {
            throw new Error('Could not find dynamic API URL in Wibufile page.');
        }

        const dynamicApiUrl = apiUrlMatch[1].startsWith('//') ? `https:${apiUrlMatch[1]}` : apiUrlMatch[1];

        const { data: apiResponse } = await client.get(dynamicApiUrl, {
            headers: {
                ...commonFetchOptions.headers,
                'Referer': url,
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
        throw new Error(`Failed to resolve Wibufile stream: ${error.message}`);
    }
};

// --- Get Mp4upload Stream ---
const getMp4uploadStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Mp4upload page. Status: ${response.status}`);
    }
    const html = await response.text();
    
    const urlMatch = html.match(/player\.src\({[^{}]*src:\s*"([^"]+)"/);
    if (urlMatch && urlMatch[1]) {
        const result = { url: urlMatch[1].trim(), type: 'mp4' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    throw new Error('No stream URL found on Mp4upload page');
};

// --- Get Krakenfiles Stream ---
const getKrakenfilesStream = async (url: string) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    const cachedResult: any = await redis.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Krakenfiles page. Status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const videoSource = $("video#my-video source").attr('src');

    if (videoSource) {
        const result = { url: videoSource, type: 'mp4' };
        await redis.set(cacheKey, result, { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    throw new Error('No stream URL found on Krakenfiles page');
};

// --- Stream Route ---
export const stream = new Elysia()
    .get('/anime/stream/:id', async ({ params, set, request, ip }) => {
        const { id } = params;

        if (!id) {
            set.status = 400;
            return { error: 'Missing stream ID' };
        }

        // --- Generic Proxy Handler ---
        const genericProxyHandler = async (url: string, referer?: string) => {
            const fetchHeaders: Record<string, string> = {
                'User-Agent': FAKE_USER_AGENT,
            };
            if (referer) {
                fetchHeaders['Referer'] = referer;
            }

            const rangeHeader = request.headers.get('range');
            if (rangeHeader) {
                fetchHeaders['range'] = rangeHeader;
            }

            const videoResponse = await fetch(url, { headers: fetchHeaders });

            if (!videoResponse.ok) {
                throw new Error(`Failed to fetch video from ${url}. Status: ${videoResponse.status}`);
            }

            const responseHeaders = new Headers(videoResponse.headers);
            responseHeaders.set('Content-Disposition', 'inline');

            const originalContentType = responseHeaders.get('Content-Type');
            if (!originalContentType || originalContentType.includes('octet-stream')) {
                if (url.includes('.m3u8')) {
                    responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
                } else {
                    responseHeaders.set('Content-Type', 'video/mp4');
                }
            }

            return new Response(videoResponse.body, {
                status: videoResponse.status,
                statusText: videoResponse.statusText,
                headers: responseHeaders
            });
        };

        try {
            let streamUrl = await redis.get(`${STREAM_KEY_PREFIX}${id}`);

            if (!streamUrl) {
                set.status = 404;
                return { error: 'Stream ID not found or has expired. Please fetch a new one.' };
            }

            if (streamUrl.includes('doply.net') || streamUrl.includes('d-s.io')) {
                const doodResult = await getDoodStream(streamUrl);
                return genericProxyHandler(doodResult.url, streamUrl);
            }

            if (streamUrl.includes('yourupload.com')) {
                const yourUploadResult = await getYourUploadStream(streamUrl);
                return genericProxyHandler(yourUploadResult.url, streamUrl);
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
                        throw new Error(`Failed to fetch video from Google. Status: ${videoResponse.status}`)
                    }
                    return videoResponse;
                } else {
                    throw new Error('No play_url found in streams');
                }
            } else if (streamUrl.includes('filedon.co')) {
                const filedonResult = await getFiledonStream(streamUrl);
                return genericProxyHandler(filedonResult.url, streamUrl);
            } else if (streamUrl.includes('pixeldrain.com')) {
                let videoUrl = streamUrl;
                if (!streamUrl.includes('/api/file/')) {
                    const pixeldrainResult = await getPixeldrainStream(streamUrl);
                    videoUrl = pixeldrainResult.url;
                }
                return genericProxyHandler(videoUrl, 'https://pixeldrain.com/');
            } else if (streamUrl.includes('wibufile.com')) {
                let videoUrl: string;
                if (streamUrl.includes('s0.wibufile.com') || streamUrl.includes('.mp4')) {
                    videoUrl = streamUrl;
                } else {
                    const wibufileResult = await getWibufileStream(streamUrl, request);
                    videoUrl = wibufileResult.url;
                }
                return genericProxyHandler(videoUrl, process.env.SAMEHADAKU_BASE_URL);
            } else if (streamUrl.includes('krakenfiles.com')) {
                const krakenResult = await getKrakenfilesStream(streamUrl);
                return genericProxyHandler(krakenResult.url, streamUrl);
            } else if (streamUrl.includes('mp4upload.com')) {
                const mp4uploadResult = await getMp4uploadStream(streamUrl);
                return genericProxyHandler(mp4uploadResult.url, streamUrl);
            } else if (streamUrl.includes('tsukasa.my.id') || streamUrl.includes('googleapis.com') || streamUrl.includes('dropbox.com') || streamUrl.includes('vidcache.net')) {
                const videoUrl = streamUrl.includes('dropbox.com') ? streamUrl.replace(/&dl=1$/, '&raw=1') : streamUrl;
                const referer = streamUrl.includes('dropbox.com') ? process.env.ANIMESAIL_BASE_URL : undefined;
                return genericProxyHandler(videoUrl, referer);
            } else {
                set.status = 501;
                return { error: 'This stream provider is not yet supported for proxying.' };
            }

        } catch (error: any) {
            set.status = 500;
            return { error: error.message || 'Internal server error' };
        }

    }, {
        params: t.Object({
            id: t.String()
        }),
        detail: {
            summary: 'Proxy Stream Video',
            description: 'Proxy untuk stream video dari provider pihak ketiga. Endpoint ini akan mengambil video dari URL asli dan meneruskannya ke client. Mendukung "range requests" untuk seeking.',
            tags: ['Stream']
        }
    });