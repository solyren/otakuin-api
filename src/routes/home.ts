import { Elysia } from 'elysia';
import { redis } from '../lib/redis';

const HOME_CACHE_KEY = 'home:anime_list';

// --- Home Route ---
export const home = new Elysia().get('/home', async () => {
    const cachedData = await redis.get(HOME_CACHE_KEY);
    if (cachedData) {
        if (typeof cachedData === 'string') {
            return JSON.parse(cachedData);
        }
        return cachedData;
    }

    return [];
}, {
    detail: {
        summary: 'Halaman Utama',
        description: 'Mengambil daftar anime terbaru dari halaman utama Samehadaku.',
        tags: ['Umum']
    }
});
