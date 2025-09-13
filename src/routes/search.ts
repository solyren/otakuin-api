import { Elysia, t } from 'elysia';
import { searchAnilist } from '../lib/anilist';

export const searchRoutes = new Elysia()
    .get('/search', async ({ query }) => {
        const { q, page = 1, perPage = 20 } = query;
        if (!q) {
            return { error: 'Query parameter "q" is required.' };
        }

        const results = await searchAnilist(q, Number(page), Number(perPage));
        return results;
    }, {
        query: t.Object({
            q: t.String(),
            page: t.Optional(t.Numeric()),
            perPage: t.Optional(t.Numeric()),
        })
    });
