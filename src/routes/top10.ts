import { Elysia } from 'elysia';
import { redis } from '../lib/redis';

const TOP10_CACHE_KEY = 'top10:anime_list';

// --- Top 10 Route ---
export const top10 = new Elysia().get('/top10', async () => {
    const cachedData = await redis.get(TOP10_CACHE_KEY);
    if (cachedData) {
        if (typeof cachedData === 'string') {
            return JSON.parse(cachedData);
        }
        return cachedData;
    }

    return [];
}, {
    detail: {
        summary: 'Top 10 Anime Minggu Ini',
        description: 'Mengambil daftar 10 anime teratas minggu ini dari Samehadaku.',
        tags: ['Umum']
    }
});