import { Elysia } from 'elysia';
import { getTop10 } from './top10.service';

export const top10Controller = new Elysia().get('/top10', async () => {
    return await getTop10();
}, {
    detail: {
        summary: 'Top 10 Anime Minggu Ini',
        description: 'Mengambil daftar 10 anime teratas minggu ini dari Samehadaku.',
        tags: ['Umum']
    }
});
