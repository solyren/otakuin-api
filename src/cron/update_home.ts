import 'dotenv/config';
import * as cheerio from 'cheerio';
import { redis } from '../lib/redis';
import { normalizeSlug } from '../lib/anilist';

const ENRICHMENT_QUEUE_KEY = 'queue:enrichment';
const HOME_CACHE_KEY = 'home:anime_list';

const scrapePage = async (page: number) => {
    const url = page === 1
        ? `${process.env.SAMEHADAKU_BASE_URL}/anime-terbaru/`
        : `${process.env.SAMEHADAKU_BASE_URL}/anime-terbaru/page/${page}/`;
    
    console.log(`[Scraper] Scraping page: ${url}`)
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`[Scraper] Failed to fetch page ${page}. Status: ${response.status}`);
        return [];
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const animeList: any[] = [];
    $('div.post-show ul li').each((index, element) => {
        const linkElement = $(element).find('a');
        const rawSlug = linkElement.attr('href');
        const titleFromPage = $(element).find('h2.entry-title').text().trim();
        const thumbnail = $(element).find('img').attr('src');

        // --- Mencari Episode Terakhir (Logika Baru) ---
        let last_episode: number | null = null;
        const episodeText = $(element).find('div.dtla span').first().text().trim();
        if (episodeText) {
            const match = episodeText.match(/Episode\s*(\d+)/i);
            if (match) {
                last_episode = parseInt(match[1], 10);
            }
        }
        // ---------------------------------------------

        if (rawSlug && titleFromPage) {
            const normalizedSlug = normalizeSlug(rawSlug);
            animeList.push({
                id: null, // Start with null ID
                rawSlug, // Keep raw slug for matching in worker
                title: titleFromPage,
                thumbnail,
                normalizedSlug,
                last_episode
            });
        }
    });

    return animeList;
}

export const updateHome = async () => {
    console.log('[Scraper] Starting smart update cron job...');

    // 1. Ambil daftar anime yang sudah ada di cache
    const existingCache = await redis.get(HOME_CACHE_KEY);
    const existingList = existingCache ? (typeof existingCache === 'string' ? JSON.parse(existingCache) : existingCache) : [];
    const existingMap = new Map(existingList.map((item: any) => [item.rawSlug, item]));
    console.log(`[Scraper] Found ${existingList.length} items in existing cache.`);

    // 2. Scrape halaman untuk mendapatkan daftar anime terbaru
    let scrapedList: any[] = [];
    for (let i = 1; i <= 2; i++) {
        const pageAnimeList = await scrapePage(i);
        scrapedList = [...scrapedList, ...pageAnimeList];
    }
    const uniqueScrapedList = scrapedList.reduce((acc, current) => {
        if (!acc.find((item: any) => item.rawSlug === current.rawSlug)) {
            acc.push(current);
        }
        return acc;
    }, []);
    console.log(`[Scraper] Scraped ${uniqueScrapedList.length} unique items from the source.`);

    // 3. Gabungkan daftar baru dan lama secara cerdas
    const newList: any[] = [];
    const newJobs: any[] = [];

    uniqueScrapedList.forEach(scrapedItem => {
        const existingItem = existingMap.get(scrapedItem.rawSlug);
        if (existingItem) {
            // Jika item sudah ada, gunakan data lama yang sudah diperkaya
            // tapi pastikan data non-Anilist (seperti last_episode) diperbarui
            newList.push({ ...existingItem, last_episode: scrapedItem.last_episode });
        } else {
            // Jika item benar-benar baru, tambahkan ke daftar dan antrian kerja
            newList.push(scrapedItem);
            newJobs.push(scrapedItem);
        }
    });

    console.log(`[Scraper] Merged list contains ${newList.length} items. Found ${newJobs.length} new items to enrich.`);

    // 4. Perbarui cache utama dengan daftar yang sudah digabungkan
    await redis.set(HOME_CACHE_KEY, JSON.stringify(newList));
    console.log(`[Scraper] Home cache updated with smart-merged list.`);

    // 5. Dorong hanya pekerjaan baru ke antrian
    if (newJobs.length > 0) {
        const pipeline = redis.pipeline();
        for (const anime of newJobs) {
            pipeline.rpush(ENRICHMENT_QUEUE_KEY, JSON.stringify(anime));
        }
        await pipeline.exec();
        console.log(`[Scraper] Added ${newJobs.length} new jobs to the enrichment queue.`);
    } else {
        console.log('[Scraper] No new anime found to add to the queue.');
    }
    console.log('[Scraper] Smart update cron job finished.');
}