import { Elysia } from 'elysia';
import { getHome } from './home.service';

export const homeController = new Elysia().get('/home', async () => {
    return await getHome();
}, {
    detail: {
        summary: 'Halaman Utama',
        description: 'Mengambil daftar anime terbaru dari halaman utama Samehadaku.',
        tags: ['Umum']
    }
});
