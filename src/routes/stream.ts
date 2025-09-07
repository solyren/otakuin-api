import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';

const STREAM_KEY_PREFIX = 'stream:';
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

    // Extract cookies from the response
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
                // Return both streams and the cookie
                return { streams: videoConfig.streams, cookie };
            }
        }
    } else {
        console.error('VIDEO_CONFIG not found. Blogger HTML response:');
        console.error(html);
    }

    throw new Error('No streams found in VIDEO_CONFIG');
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
                // Get both streams and cookies
                const result = await getBloggerStreams(streamUrl, ip);
                
                if (result && result.streams && result.streams[0] && result.streams[0].play_url) {
                    const videoUrl = result.streams[0].play_url;

                    const fetchHeaders: Record<string, string> = {
                        'User-Agent': FAKE_USER_AGENT,
                        'Referer': streamUrl,
                    };

                    // Add the retrieved cookie to the request
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