import * as cheerio from 'cheerio';
import { redis } from '../../lib/redis';
import { logger, errorLogger } from '../../lib/logger';

const BASE_URL = `${process.env.ANIMASU_BASE_URL}/pencarian/?urutan=abjad`;
const SOURCE_KEY = 'slugs:animasu';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<{ success: boolean; hasMorePages: boolean }> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}&halaman=${page}`;
    logger(`[Animasu] Scraping page ${page} from ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            errorLogger(new Error(`[Animasu] Failed to fetch ${url}. Status: ${response.status}`));
            return { success: false, hasMorePages: false };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.bs div.bsx a');
        logger(`[Animasu] Found ${animeLinks.length} anime links on page ${page}.`);

        if (animeLinks.length === 0) {
            logger('[Animasu] No more anime links found. Exiting.');
            return { success: true, hasMorePages: false };
        }

        const pipeline = redis.pipeline();

        animeLinks.each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).find('div.tt').text().trim();

            if (href && title) {
                try {
                    const urlObj = new URL(href);
                    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
                    
                    if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'anime') {
                        const slug = pathParts[pathParts.length - 1];
                        if (slug) {
                            pipeline.hset(SOURCE_KEY, { [title]: slug });
                        }
                    }
                } catch (e) {
                  logger(`[Animasu] Skipping invalid URL: ${href}`);
                }
            }
        });

        await pipeline.exec();
        logger(`[Animasu] Successfully stored ${animeLinks.length} slugs from page ${page} in Redis.`);
        return { success: true, hasMorePages: true };

    } catch (error: any) {
        errorLogger(new Error(`[Animasu] An error occurred on page ${page}: ${error.message}`));
        return { success: false, hasMorePages: false }; // Stop on error
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
    const hasError = results.some(result => !result.success);
    if (hasError) {
        errorLogger(new Error('[Animasu] One or more pages failed during concurrent scraping.'));
        return false;
    }

    const shouldContinue = results.some(result => result.hasMorePages);
    return shouldContinue;
}

// --- Start Animasu Scraping ---
export async function startAnimasuScraping() {
    logger('[Animasu] Starting scraping...');
    await redis.del(SOURCE_KEY);
    logger(`[Animasu] Cleared old data from ${SOURCE_KEY}`);

    let currentPage = 1;
    const pagesPerBatch = 10; // Process 10 pages at a time
    let hasMorePages = true;

    while (hasMorePages) {
        hasMorePages = await scrapePagesConcurrently(currentPage, pagesPerBatch);
        currentPage += pagesPerBatch;
        
        if (hasMorePages) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const total = await redis.hlen(SOURCE_KEY);
    logger(`[Animasu] Finished scraping. Total slugs stored: ${total}`);
}