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
    console.log('[Scraper] Starting cron job...');
    let rawAnimeList: any[] = [];
    for (let i = 1; i <= 2; i++) {
        const pageAnimeList = await scrapePage(i);
        rawAnimeList = [...rawAnimeList, ...pageAnimeList];
    }

    const uniqueRawAnime = rawAnimeList.reduce((acc, current) => {
        if (!acc.find((item: any) => item.rawSlug === current.rawSlug)) {
            acc.push(current);
        }
        return acc;
    }, []);

    console.log(`[Scraper] Found ${uniqueRawAnime.length} unique raw anime listings.`);

    // Overwrite the home cache with the correctly ordered but raw list
    await redis.set(HOME_CACHE_KEY, JSON.stringify(uniqueRawAnime));
    console.log(`[Scraper] Home cache updated with ${uniqueRawAnime.length} raw items in correct order.`);

    // Push jobs to the queue for enrichment
    if (uniqueRawAnime.length > 0) {
        const pipeline = redis.pipeline();
        for (const anime of uniqueRawAnime) {
            pipeline.rpush(ENRICHMENT_QUEUE_KEY, JSON.stringify(anime));
        }
        await pipeline.exec();
        console.log(`[Scraper] Added ${uniqueRawAnime.length} jobs to the enrichment queue.`);
    } else {
        console.log('[Scraper] No new anime found to add to the queue.');
    }
    console.log('[Scraper] Cron job finished.');
}