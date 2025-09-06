import * as cheerio from 'cheerio';
import { redis } from './redis';

const BASE_URL = 'https://v1.samehadaku.how/daftar-anime-2/';
const SOURCE_KEY = 'slugs:samehadaku';

async function scrapePage(page: number): Promise<boolean> {
    // Handle page 1 having a different URL structure
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
                // Using a HASH to store title -> slug mapping for the source
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

async function startScraping() {
    console.log('Starting slug scraping process for Samehadaku...');
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
        hasMorePages = await scrapePage(page);
        if (hasMorePages) {
            page++;
            // Add a small delay to avoid getting blocked
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('Scraping finished.');
    const total = await redis.hlen(SOURCE_KEY);
    console.log(`Total slugs stored for Samehadaku: ${total}`);
}

startScraping();