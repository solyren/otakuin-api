import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';
import { logger, errorLogger } from '../lib/logger';

const BASE_URL = `${process.env.ANIMESAIL_BASE_URL}/anime/`;
const SOURCE_KEY = 'slugs:animesail';

const fetchOptions = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

// --- Start Animesail Scraping ---
export async function startAnimesailScraping() {
    const url = BASE_URL;
    logger(`[Animesail] Starting scraping from ${url}`);

    try {
        await redis.del(SOURCE_KEY);
        logger(`[Animesail] Cleared old data from ${SOURCE_KEY}`);

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            errorLogger(new Error(`[Animesail] Failed to fetch ${url}. Status: ${response.status}`));
            return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.soralist a.series');
        logger(`[Animesail] Found ${animeLinks.length} anime links.`);

        if (animeLinks.length === 0) {
            logger('[Animesail] No anime links found. Exiting.');
            return;
        }

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

    } catch (error: any) {
        errorLogger(new Error(`[Animesail] An error occurred: ${error.message}`));
        throw error;
    }
}
