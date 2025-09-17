import { redis } from '../../lib/redis';

const HOME_CACHE_KEY = 'home:anime_list';

export const getHome = async () => {
    const cachedData = await redis.get(HOME_CACHE_KEY);
    if (cachedData) {
        if (typeof cachedData === 'string') {
            return JSON.parse(cachedData);
        }
        return cachedData;
    }

    return [];
}
