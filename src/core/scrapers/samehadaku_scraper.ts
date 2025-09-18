import * as cheerio from 'cheerio';
import { redis } from '../../lib/redis';
import { logger, errorLogger } from '../../lib/logger';

const BASE_URL = `${process.env.SAMEHADAKU_BASE_URL}/daftar-anime-2/`;
const SOURCE_KEY = 'slugs:samehadaku';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<boolean> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
    logger(`[Samehadaku] Scraping page ${page} from ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            errorLogger(new Error(`[Samehadaku] Failed to fetch ${url}. Status: ${response.status}`));
            return false;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.relat article.animpost div.animposx a');
        logger(`[Samehadaku] Found ${animeLinks.length} anime links on page ${page}.`);

        if (animeLinks.length === 0) {
            logger('[Samehadaku] No more anime links found. Exiting.');
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
        logger(`[Samehadaku] Successfully stored ${animeLinks.length} slugs from page ${page} in Redis.`);
        return true;

    } catch (error: any) {
        errorLogger(new Error(`[Samehadaku] An error occurred on page ${page}: ${error.message}`));
        return false;
    }
}

// --- Scrape Pages Concurrently ---
async function scrapePagesConcurrently(startPage: number, pageCount: number): Promise<boolean> {
    const pagePromises = [];
    for (let i = 0; i < pageCount; i++) {
        pagePromises.push(scrapePage(startPage + i));
    }

    const results = await Promise.all(pagePromises);
    
    // Check if any page failed
    const hasError = results.some(result => !result);
    if (hasError) {
        errorLogger(new Error('[Samehadaku] One or more pages failed during concurrent scraping.'));
        return false;
    }

    // Check if we should continue (any page had content)
    const shouldContinue = results.some(result => result);
    return shouldContinue;
}

// --- Start Samehadaku Scraping ---
export async function startSamehadakuScraping() {
    logger('[Samehadaku] Starting scraping...');
    await redis.del(SOURCE_KEY);
    logger(`[Samehadaku] Cleared old data from ${SOURCE_KEY}`);

    let currentPage = 1;
    const pagesPerBatch = 10; // Process 10 pages at a time
    let hasMorePages = true;

    while (hasMorePages) {
        hasMorePages = await scrapePagesConcurrently(currentPage, pagesPerBatch);
        currentPage += pagesPerBatch;
        
        // Add a small delay between batches to be respectful to the server
        if (hasMorePages) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const total = await redis.hlen(SOURCE_KEY);
    logger(`[Samehadaku] Finished scraping. Total slugs stored: ${total}`);
}
