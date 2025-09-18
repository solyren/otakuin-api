import * as cheerio from 'cheerio';
import { redis } from '../../lib/redis';
import { logger, errorLogger } from '../../lib/logger';

const BASE_URL = `${process.env.NIMEGAMI_BASE_URL}/anime-list/`;
const SOURCE_KEY = 'slugs:nimegami';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<boolean> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
    logger(`[Nimegami] Scraping page ${page} from ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            errorLogger(new Error(`[Nimegami] Failed to fetch ${url}. Status: ${response.status}`));
            return false;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.animelist ul li a');
        logger(`[Nimegami] Found ${animeLinks.length} anime links on page ${page}.`);

        if (animeLinks.length === 0) {
            logger('[Nimegami] No more anime links found. Exiting.');
            return false;
        }

        const pipeline = redis.pipeline();

        animeLinks.each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).attr('title');

            if (href && title) {
                const slug = href.split('/').slice(-2, -1)[0];
                if (slug) {
                    pipeline.hset(SOURCE_KEY, { [title]: slug });
                }
            }
        });

        await pipeline.exec();
        logger(`[Nimegami] Successfully stored ${animeLinks.length} slugs from page ${page} in Redis.`);
        return true;

    } catch (error: any) {
        errorLogger(new Error(`[Nimegami] An error occurred on page ${page}: ${error.message}`));
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
        errorLogger(new Error('[Nimegami] One or more pages failed during concurrent scraping.'));
        return false;
    }

    // Check if we should continue (any page had content)
    const shouldContinue = results.some(result => result);
    return shouldContinue;
}

// --- Start Nimegami Scraping ---
export async function startNimegamiScraping() {
    logger('[Nimegami] Starting scraping...');
    await redis.del(SOURCE_KEY);
    logger(`[Nimegami] Cleared old data from ${SOURCE_KEY}`);

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
    logger(`[Nimegami] Finished scraping. Total slugs stored: ${total}`);
}
