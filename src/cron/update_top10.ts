import 'dotenv/config';
import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';
import { normalizeSlug } from '../lib/anilist';

const ENRICHMENT_QUEUE_KEY = 'queue:enrichment';
const TOP10_CACHE_KEY = 'top10:anime_list';

// --- Scrape Top 10 ---
const scrapeTop10 = async () => {
    const url = process.env.SAMEHADAKU_BASE_URL;
    if (!url) {
        throw new Error('SAMEHADAKU_BASE_URL is not defined');
    }

    console.log(`[Scraper:Top10] Scraping page: ${url}`)
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`[Scraper:Top10] Failed to fetch page. Status: ${response.status}`);
        return [];
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const animeList: any[] = [];
    $('div.topten-animesu ul li').each((index, element) => {
        const linkElement = $(element).find('a.series');
        const rawSlug = linkElement.attr('href');
        const title = $(element).find('span.judul').text().trim();
        const thumbnail = $(element).find('img').attr('src');
        const rankText = $(element).find('b.is-topten').text().replace('TOP', '').trim();
        const rank = parseInt(rankText, 10);

        if (rawSlug && title) {
            const normalizedSlug = normalizeSlug(rawSlug);
            animeList.push({
                id: null,
                rawSlug,
                title,
                thumbnail,
                normalizedSlug,
                rank
            });
        }
    });

    return animeList.sort((a, b) => a.rank - b.rank);
}

// --- Update Top 10 ---
export const updateTop10 = async () => {
    console.log('[Scraper:Top10] Starting smart update cron job...');

    const existingCache = await redis.get(TOP10_CACHE_KEY);
    const existingList = existingCache ? (typeof existingCache === 'string' ? JSON.parse(existingCache) : existingCache) : [];
    const existingMap = new Map(existingList.map((item: any) => [item.rawSlug, item]));
    console.log(`[Scraper:Top10] Found ${existingList.length} items in existing cache.`);

    const scrapedList = await scrapeTop10();
    console.log(`[Scraper:Top10] Scraped ${scrapedList.length} items from the source.`);

    const newList: any[] = [];
    const newJobs: any[] = [];

    scrapedList.forEach(scrapedItem => {
        const existingItem = existingMap.get(scrapedItem.rawSlug);
        if (existingItem) {
            newList.push({ ...existingItem, rank: scrapedItem.rank });
        } else {
            newList.push(scrapedItem);
            newJobs.push(scrapedItem);
        }
    });

    console.log(`[Scraper:Top10] Merged list contains ${newList.length} items. Found ${newJobs.length} new items to enrich.`);

    await redis.set(TOP10_CACHE_KEY, JSON.stringify(newList));
    console.log(`[Scraper:Top10] Top10 cache updated with smart-merged list.`);

    if (newJobs.length > 0) {
        const pipeline = redis.pipeline();
        for (const anime of newJobs) {
            pipeline.rpush(ENRICHMENT_QUEUE_KEY, JSON.stringify({ ...anime, source: 'top10' }));
        }
        await pipeline.exec();
        console.log(`[Scraper:Top10] Added ${newJobs.length} new jobs to the enrichment queue.`);
    } else {
        console.log('[Scraper:Top10] No new anime found to add to the queue.');
    }
    console.log('[Scraper:Top10] Smart update cron job finished.');
}