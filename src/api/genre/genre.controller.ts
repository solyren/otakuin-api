import { Elysia, t } from 'elysia';
import { getAnilistByGenre } from './genre.service';

export const genreController = new Elysia()
    .get('/genre/:genre', async ({ params, query }) => {
        const { genre } = params;
        const { page = 1, perPage = 20 } = query;

        if (!genre) {
            return { error: 'Genre parameter is required.' };
        }

        const results = await getAnilistByGenre(genre, Number(page), Number(perPage));
        return results;
    }, {
        params: t.Object({
            genre: t.String(),
        }),
        query: t.Object({
            page: t.Optional(t.Numeric()),
            perPage: t.Optional(t.Numeric()),
        }),
        detail: {
            summary: 'Cari Anime Berdasarkan Genre',
            description: 'Mencari anime berdasarkan genre dengan paginasi.',
            tags: ['Genre']
        }
    });
