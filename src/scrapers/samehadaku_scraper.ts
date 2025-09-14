import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';

const BASE_URL = `${process.env.SAMEHADAKU_BASE_URL}/daftar-anime-2/`;
const SOURCE_KEY = 'slugs:samehadaku';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<boolean> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return false;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.relat article.animpost div.animposx a');

        if (animeLinks.length === 0) {
            return false;
        }

        const pipeline = redis.pipeline();

        animeLinks.each((i, el) => {
            const slug = $(el).attr('href') || '';
            const title = $(el).find('div.data h2').text().trim();

            if (title && slug) {
                pipeline.hset(SOURCE_KEY, { [title]: slug });
            }
        });

        await pipeline.exec();
        return true;

    } catch (error) {
        return false;
    }
}

// --- Start Samehadaku Scraping ---
export async function startSamehadakuScraping() {
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
        hasMorePages = await scrapePage(page);
        if (hasMorePages) {
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const total = await redis.hlen(SOURCE_KEY);
}