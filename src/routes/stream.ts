import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import * as cheerio from 'cheerio';

const STREAM_KEY_PREFIX = 'stream:';
const STREAM_DATA_CACHE_PREFIX = 'cache:stream_data:';
const STREAM_DATA_EXPIRATION_SECONDS = 3600; // 1 hour
const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

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
        return cachedResult;
    }

    console.log(`[Cache] MISS for Filedon stream data. Fetching Filedon page: ${url}`);
    const response = await fetch(url, { headers: { 'User-Agent': FAKE_USER_AGENT } });
    if (!response.ok) {
        throw new Error(`Failed to fetch Filedon page. Status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    // Try to find M3U8 in script tags first (as per original reference)
    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:[^"]+\\.m3u8[^"]*)"/);
    if (m3u8Match && m3u8Match[1]) {
        console.log(`Found M3U8 stream in script: ${m3u8Match[1]}`);
        const result = { url: m3u8Match[1], type: 'm3u8' };
        await redis.set(cacheKey, JSON.stringify(result), { ex: STREAM_DATA_EXPIRATION_SECONDS });
        return result;
    }

    // Fallback to data-page JSON
    const dataPage = $("#app").attr('data-page');
    if (dataPage) {
        const pageProps = JSON.parse(dataPage);
        const videoUrl = pageProps?.props?.url;
        if (videoUrl) {
            console.log(`Found stream in data-page: ${videoUrl}`);
            const result = { url: videoUrl, type: 'mp4' }; // Assuming mp4 if not m3u8
            await redis.set(cacheKey, JSON.stringify(result), { ex: STREAM_DATA_EXPIRATION_SECONDS });
            return result;
        }
    }

    throw new Error('No stream URL found on Filedon page');
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

                console.log('Original Filedon Response Headers:', Object.fromEntries(videoResponse.headers.entries()));

                const responseHeaders = new Headers();

                for (const [key, value] of videoResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-disposition') {
                        responseHeaders.set(key, value);
                    }
                }

                responseHeaders.set('Content-Disposition', 'inline');

                // Explicitly set Content-Type based on detected type
                if (videoType === 'm3u8') {
                    responseHeaders.set('Content-Type', 'application/x-mpegURL');
                } else if (videoType === 'mp4') {
                    responseHeaders.set('Content-Type', 'video/mp4');
                } else {
                    // Fallback to original Content-Type if type is unknown
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