import 'dotenv/config';
import { redis } from './lib/redis';
import { getAnilistData, getAnilistDataById } from './lib/anilist';

const ENRICHMENT_QUEUE_KEY = 'queue:enrichment';
const HOME_CACHE_KEY = 'home:anime_list';
const MANUAL_MAP_KEY = 'manual_map:samehadaku:anilist_id_to_slug';
const MAX_HOME_LIST_SIZE = 50;

// Function to get the slug part from a full Samehadaku URL
const getSlugFromUrl = (url: string) => {
    try {
        const path = new URL(url).pathname;
        // Assuming slug is the last part of the path, e.g., /anime/bocchi-the-rock -> bocchi-the-rock
        return path.split('/').filter(Boolean).pop() || '';
    } catch (e) {
        return ''; // Return empty string if URL is invalid
    }
}

const processJob = async (jobData: any) => {
    try {
        console.log(`[Worker] Processing job for: "${jobData.titleFromPage}"`);

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
            console.log(`-> [Worker] Anilist match failed for "${jobData.titleFromPage}". Storing with null ID.`);
            finalAnimeData = {
                id: null,
                title: jobData.titleFromPage,
                thumbnail: jobData.thumbnail
            };
        }

        // Update the main home cache
        const cachedData = await redis.get(HOME_CACHE_KEY);
        let homeList = cachedData ? (typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData) : [];

        // Remove any old version of this anime from the list
        homeList = homeList.filter((item: any) => {
            if (finalAnimeData.id && item.id) {
                return item.id !== finalAnimeData.id;
            }
            return item.title !== finalAnimeData.title;
        });

        // Add the new, enriched item to the beginning of the list
        const updatedHomeList = [finalAnimeData, ...homeList];

        // Trim the list to the max size
        if (updatedHomeList.length > MAX_HOME_LIST_SIZE) {
            updatedHomeList.length = MAX_HOME_LIST_SIZE;
        }

        await redis.set(HOME_CACHE_KEY, JSON.stringify(updatedHomeList));
        console.log(`[Worker] Finished job for "${finalAnimeData.title}". Home cache updated.`);

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