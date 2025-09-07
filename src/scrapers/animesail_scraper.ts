import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';

const BASE_URL = `${process.env.ANIMESAIL_BASE_URL}/anime/`;
const SOURCE_KEY = 'slugs:animesail';

const fetchOptions = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

// --- Set Global Dispatcher ---
const agent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});
setGlobalDispatcher(agent);

// --- Start Scraping ---
export async function startAnimesailScraping() {
    const url = BASE_URL;
    console.log(`Scraping page: ${url}`);

    try {
        await redis.del(SOURCE_KEY);
        console.log('Cleared old slugs from Redis.');

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            console.log(`Failed to fetch page. Status: ${response.status}`);
            return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.soralist a.series');

        if (animeLinks.length === 0) {
            console.log(`No anime found on the page.`);
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
        console.log(`Successfully processed ${animeLinks.length} anime.`);

        const total = await redis.hlen(SOURCE_KEY);
        console.log(`Total slugs stored for AnimeSail: ${total}`);

    } catch (error) {
        console.error(`An error occurred while scraping:`, error);
    }
}