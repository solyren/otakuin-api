import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';

const STREAM_KEY_PREFIX = 'stream:';
const STREAM_DATA_CACHE_PREFIX = 'cache:stream_data:';
const STREAM_DATA_EXPIRATION_SECONDS = 3600; // 1 hour

// Function to handle Blogger URLs
const getBloggerStreams = async (url: string, clientHeaders: Headers) => {
    const cacheKey = `${STREAM_DATA_CACHE_PREFIX}${url}`;

    // Check cache first
    const cachedStreams = await redis.get(cacheKey);
    if (cachedStreams) {
        console.log(`[Cache] HIT for Blogger stream data: ${url}`);
        return cachedStreams;
    }

    console.log(`[Cache] MISS for Blogger stream data. Fetching Blogger URL: ${url}`);
    const response = await fetch(url, {
        headers: {
            'User-Agent': clientHeaders.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
            'Referer': url,
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch video config from Blogger. Status: ${response.status}`);
    }
    const html = await response.text();

    // Use string manipulation instead of regex for robustness
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
                // Store the result in cache
                await redis.set(cacheKey, JSON.stringify(videoConfig.streams), { ex: STREAM_DATA_EXPIRATION_SECONDS });
                return videoConfig.streams;
            }
        }
    } else {
        console.error('VIDEO_CONFIG not found. Blogger HTML response:');
        console.error(html);
    }

    throw new Error('No streams found in VIDEO_CONFIG');
};

export const stream = new Elysia()
    .get('/anime/stream/:id', async ({ params, set, request }) => {
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

            // Determine the provider from the URL
            if (streamUrl.includes('blogger.com')) {
                const streams = await getBloggerStreams(streamUrl, request.headers);
                if (streams && streams[0] && streams[0].play_url) {
                    const videoUrl = streams[0].play_url;

                    // Fetch the video from Google's server and stream it back
                    // This acts as a true proxy
                    const fetchHeaders: Record<string, string> = {
                        'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
                        'Referer': streamUrl, // The key is to use the blogger page as the referer
                    };

                    // Forward the Range header if it exists, for seeking
                    const rangeHeader = request.headers.get('range');
                    if (rangeHeader) {
                        fetchHeaders['range'] = rangeHeader;
                    }

                    const videoResponse = await fetch(videoUrl, {
                        headers: fetchHeaders
                    });

                    // Check if the request to Google was successful
                    if (!videoResponse.ok) {
                        throw new Error(`Failed to fetch video from Google. Status: ${videoResponse.status}`)
                    }

                    // Return the response from Google directly to the client
                    return videoResponse;
                } else {
                    throw new Error('No play_url found in streams');
                }
            } else {
                // Placeholder for other providers
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