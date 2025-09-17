import '../../config';
import { redis } from '../../lib/redis';
import { getAnilistData, getAnilistDataById } from '../../lib/anilist';

const ENRICHMENT_QUEUE_KEY = 'queue:enrichment';
const HOME_CACHE_KEY = 'home:anime_list';
const MANUAL_MAP_KEY = 'manual_map:samehadaku:anilist_id_to_slug';

// --- Get Slug From URL ---
const getSlugFromUrl = (url: string) => {
    try {
        const path = new URL(url).pathname;
        return path.split('/').filter(Boolean).pop() || '';
    } catch (e) {
        return '';
    }
}

// --- Process Job ---
const processJob = async (jobData: any) => {
    try {
        console.log(`[Worker] Processing job for: "${jobData.title}"`);

        let anilistData;

        const manualMap = await redis.hgetall(MANUAL_MAP_KEY);
        if (manualMap) {
            const invertedMap = Object.fromEntries(Object.entries(manualMap).map(([id, slug]) => [slug, id]));
            const jobSlug = getSlugFromUrl(jobData.rawSlug);
            const manualId = invertedMap[jobSlug];

            if (manualId) {
                console.log(`[Worker] Found manual mapping for slug "${jobSlug}": Anilist ID ${manualId}`);
                anilistData = await getAnilistDataById(parseInt(manualId, 10));
            }
        }

        if (!anilistData) {
            anilistData = await getAnilistData(jobData.normalizedSlug);
        }

        let finalAnimeData;
        if (anilistData) {
            finalAnimeData = {
                id: anilistData.id,
                title: anilistData.title.romaji || anilistData.title.english || jobData.normalizedSlug,
                thumbnail: anilistData.coverImage.large || anilistData.coverImage.medium,
                rating: anilistData.averageScore
            };
        } else {
            console.log(`-> [Worker] Anilist match failed for "${jobData.title}". Keeping raw data.`);
            finalAnimeData = {
                id: null,
                title: jobData.title,
                thumbnail: jobData.thumbnail,
                rating: null
            };
        }

        if (jobData.source === 'home') {
            finalAnimeData.last_episode = jobData.last_episode;
        } else if (jobData.source === 'top10') {
            finalAnimeData.rank = jobData.rank;
        }

        const cacheKey = jobData.source === 'top10' ? 'top10:anime_list' : HOME_CACHE_KEY;

        const cachedData = await redis.get(cacheKey);
        let list = cachedData ? (typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData) : [];

        const itemIndex = list.findIndex((item: any) => item.rawSlug === jobData.rawSlug);

        if (itemIndex !== -1) {
            console.log(`[Worker] Updating item "${finalAnimeData.title}" in ${jobData.source} list at index ${itemIndex}`);
            list[itemIndex] = { ...finalAnimeData, rawSlug: jobData.rawSlug, normalizedSlug: jobData.normalizedSlug };
            await redis.set(cacheKey, JSON.stringify(list));
            console.log(`[Worker] Finished job for "${finalAnimeData.title}". ${jobData.source} cache updated.`);
        } else {
            console.log(`[Worker] Could not find item with rawSlug "${jobData.rawSlug}" in ${jobData.source} cache. It might be from an old scrape.`);
        }

    } catch (error) {
        console.error('[Worker] Error processing job:', error);
    }
};

// --- Main ---
const main = async () => {
    console.log('[Worker] Starting enrichment worker...');
    while (true) {
        try {
            const jobData = await redis.lpop(ENRICHMENT_QUEUE_KEY);
            if (jobData) {
                await processJob(jobData);
            } else {
                console.log('[Worker] Queue is empty. Waiting for 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        } catch (error) {
            console.error('[Worker] Error in main loop:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

main();