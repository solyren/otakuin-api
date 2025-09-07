import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';

const BASE_URL = `${process.env.SAMEHADAKU_BASE_URL}/daftar-anime-2/`;
const SOURCE_KEY = 'slugs:samehadaku';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<boolean> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
    console.log(`Scraping page: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.log(`Failed to fetch page ${page}. Status: ${response.status}`);
            return false;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.relat article.animpost div.animposx a');

        if (animeLinks.length === 0) {
            console.log(`No anime found on page ${page}. Assuming end of list.`);
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
        console.log(`Successfully processed ${animeLinks.length} anime from page ${page}.`);
        return true;

    } catch (error) {
        console.error(`An error occurred while scraping page ${page}:`, error);
        return false;
    }
}

// --- Start Scraping ---
export async function startSamehadakuScraping() {
    console.log('Starting slug scraping process for Samehadaku...');
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
        hasMorePages = await scrapePage(page);
        if (hasMorePages) {
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('Scraping finished.');
    const total = await redis.hlen(SOURCE_KEY);
    console.log(`Total slugs stored for Samehadaku: ${total}`);
}
