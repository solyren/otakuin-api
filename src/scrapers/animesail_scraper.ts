import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';
import { logger, errorLogger } from '../lib/logger';
import axios from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const BASE_URL = `${process.env.ANIMESAIL_BASE_URL}/anime/`;
const SOURCE_KEY = 'slugs:animesail';

// --- Start Animesail Scraping ---
export async function startAnimesailScraping() {
    const url = BASE_URL;
    logger(`[Animesail] Starting scraping from ${url}`);

    try {
        const proxy = process.env.PROXY_URL;
        const agent = proxy ? new HttpsProxyAgent(proxy) : new https.Agent({ rejectUnauthorized: false });

        const countryCode = 'ID'; // Hardcode country to Indonesia
        logger(`[Animesail] Using country code: ${countryCode}`);

        const axiosConfig: any = {
            httpsAgent: agent,
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': url,
                'Cookie': `_as_ipin_ct=${countryCode}; _as_ipin_tz=UTC; _as_ipin_lc=en-US`
            }
        };

        await redis.del(SOURCE_KEY);
        logger(`[Animesail] Cleared old data from ${SOURCE_KEY}`);

        for (let i = 0; i < 3; i++) {
            const response = await axios.get(url, axiosConfig);

            if (response.status !== 200) {
                errorLogger(new Error(`[Animesail] Failed to fetch ${url}. Status: ${response.status}`));
                return;
            }

            const html = response.data;
            const $ = cheerio.load(html);

            const animeLinks = $('div.soralist a.series');
            logger(`[Animesail] Found ${animeLinks.length} anime links on attempt ${i + 1}.`);

            if (animeLinks.length > 0) {
                const pipeline = redis.pipeline();
                animeLinks.each((i, el) => {
                    const slug = $(el).attr('href') || '';
                    const title = $(el).text().trim();

                    if (title && slug) {
                        pipeline.hset(SOURCE_KEY, { [title]: slug });
                    }
                });
                await pipeline.exec();
                logger(`[Animesail] Successfully stored ${animeLinks.length} slugs in Redis.`);
                return; // Success, exit the function
            } else if (i === 0) {
                // On the first failed attempt, log the HTML for debugging
                console.log('Animesail scraper failed. Received HTML:');
                console.log(html);
            }

            if (i < 2) {
                logger('[Animesail] No links found, retrying in 3 seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        logger('[Animesail] No anime links found after 3 attempts.');

    } catch (error: any) {
        let errorMessage = `[Animesail] An error occurred: ${error.message}`;
        if (error.response) {
            errorMessage += ` | Status: ${error.response.status} ${error.response.statusText}`;
        }
        errorLogger(new Error(errorMessage));
        throw error;
    }
}