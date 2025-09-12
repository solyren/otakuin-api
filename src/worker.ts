import 'dotenv/config';
import { redis } from './lib/redis';
import { getAnilistData, getAnilistDataById } from './lib/anilist';

const ENRICHMENT_QUEUE_KEY = 'queue:enrichment';
const HOME_CACHE_KEY = 'home:anime_list';
const MANUAL_MAP_KEY = 'manual_map:samehadaku:anilist_id_to_slug';

// Function to get the slug part from a full Samehadaku URL
const getSlugFromUrl = (url: string) => {
    try {
        const path = new URL(url).pathname;
        return path.split('/').filter(Boolean).pop() || '';
    } catch (e) {
        return '';
    }
}

const processJob = async (jobData: any) => {
    try {
        console.log(`[Worker] Processing job for: "${jobData.title}"`);

        let anilistData;

        // Step 1: Check for a manual mapping first
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

        // Step 2: If no manual map found, use fuzzy search
        if (!anilistData) {
            anilistData = await getAnilistData(jobData.normalizedSlug);
        }

        let finalAnimeData;
        if (anilistData) {
            finalAnimeData = {
                id: anilistData.id,
                title: anilistData.title.romaji || anilistData.title.english || jobData.normalizedSlug,
                thumbnail: anilistData.coverImage.large || anilistData.coverImage.medium
            };
        } else {
            // If enrichment fails, keep the original raw data
            console.log(`-> [Worker] Anilist match failed for "${jobData.title}". Keeping raw data.`);
            finalAnimeData = {
                id: null,
                title: jobData.title,
                thumbnail: jobData.thumbnail
            };
        }

        // Update the item in the main home cache without changing order
        const cachedData = await redis.get(HOME_CACHE_KEY);
        let homeList = cachedData ? (typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData) : [];

        const itemIndex = homeList.findIndex((item: any) => item.rawSlug === jobData.rawSlug);

        if (itemIndex !== -1) {
            console.log(`[Worker] Updating item "${finalAnimeData.title}" at index ${itemIndex}`);
            // Preserve rawSlug and normalizedSlug in the final object for future lookups
            homeList[itemIndex] = { ...finalAnimeData, rawSlug: jobData.rawSlug, normalizedSlug: jobData.normalizedSlug };
            await redis.set(HOME_CACHE_KEY, JSON.stringify(homeList));
            console.log(`[Worker] Finished job for "${finalAnimeData.title}". Home cache updated.`);
        } else {
            console.log(`[Worker] Could not find item with rawSlug "${jobData.rawSlug}" in home cache. It might be from an old scrape.`);
        }

    } catch (error) {
        console.error('[Worker] Error processing job:', error);
    }
};

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
