import { Elysia, t } from 'elysia';
import { searchAnilist } from '../lib/anilist';

export const searchRoutes = new Elysia()
    .get('/search', async ({ query }) => {
        const { q } = query;
        if (!q) {
            return { error: 'Query parameter "q" is required.' };
        }

        const results = await searchAnilist(q);
        return results;
    }, {
        query: t.Object({
            q: t.String(),
        })
    });
