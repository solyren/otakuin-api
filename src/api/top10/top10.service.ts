import { redis } from '../../lib/redis';

const TOP10_CACHE_KEY = 'top10:anime_list';

export const getTop10 = async () => {
    const cachedData = await redis.get(TOP10_CACHE_KEY);
    if (cachedData) {
        if (typeof cachedData === 'string') {
            return JSON.parse(cachedData);
        }
        return cachedData;
    }

    return [];
}
