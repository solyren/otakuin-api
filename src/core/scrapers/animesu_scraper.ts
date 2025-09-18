import * as cheerio from 'cheerio';
import { redis } from '../../lib/redis';
import { logger, errorLogger } from '../../lib/logger';

// Using the alphabetical order endpoint which shows more anime per page
const BASE_URL = 'https://v1.animasu.top/pencarian/?urutan=abjad';
const SOURCE_KEY = 'slugs:animesu';

// --- Scrape Page ---
async function scrapePage(page: number): Promise<{ success: boolean; hasMorePages: boolean }> {
    const url = page === 1 ? BASE_URL : `${BASE_URL}&halaman=${page}`;
    logger(`[AnimeSU] Scraping page ${page} from ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            errorLogger(new Error(`[AnimeSU] Failed to fetch ${url}. Status: ${response.status}`));
            return { success: false, hasMorePages: false };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.bs div.bsx a');
        logger(`[AnimeSU] Found ${animeLinks.length} anime links on page ${page}.`);

        // If no anime links found, we've reached the end
        if (animeLinks.length === 0) {
            logger('[AnimeSU] No more anime links found. Exiting.');
            return { success: true, hasMorePages: false };
        }

        const pipeline = redis.pipeline();

        animeLinks.each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).find('div.tt').text().trim();

            if (href && title) {
                // Extract slug from URL like: https://v1.animasu.top/anime/tensei-shitara-dainana-ouji-datta-node-kimama-ni-majutsu-wo-kiwamemasu-s2/
                // The slug is the last part of the path before the trailing slash
                try {
                    const urlObj = new URL(href);
                    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
                    
                    // The slug should be the last part of the path for anime URLs
                    if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'anime') {
                        const slug = pathParts[pathParts.length - 1];
                        if (slug) {
                            pipeline.hset(SOURCE_KEY, { [title]: slug });
                        }
                    }
                } catch (e) {
                    // If href is not a valid URL, skip it
                    logger(`[AnimeSU] Skipping invalid URL: ${href}`);
                }
            }
        });

        await pipeline.exec();
        logger(`[AnimeSU] Successfully stored ${animeLinks.length} slugs from page ${page} in Redis.`);
        return { success: true, hasMorePages: true };

    } catch (error: any) {
        errorLogger(new Error(`[AnimeSU] An error occurred on page ${page}: ${error.message}`));
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
        errorLogger(new Error('[AnimeSU] One or more pages failed during concurrent scraping.'));
        return false;
    }

    // Check if we should continue (any page had content)
    const shouldContinue = results.some(result => result.hasMorePages);
    return shouldContinue;
}

// --- Start AnimeSU Scraping ---
export async function startAnimesuScraping() {
    logger('[AnimeSU] Starting scraping...');
    await redis.del(SOURCE_KEY);
    logger(`[AnimeSU] Cleared old data from ${SOURCE_KEY}`);

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
    logger(`[AnimeSU] Finished scraping. Total slugs stored: ${total}`);
}