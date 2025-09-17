import { Elysia, t } from 'elysia';
import { getStream } from './stream.service';

export const streamController = new Elysia()
    .get('/anime/stream/:id', async ({ params, set, request, ip }) => {
        const { id } = params;

        if (!id) {
            set.status = 400;
            return { error: 'Missing stream ID' };
        }

        try {
            const result = await getStream(id, request, ip);

            if (result instanceof Response) {
                return result;
            }

            if (result.error) {
                if (result.error.includes('not found')) {
                    set.status = 404;
                } else if (result.error.includes('not yet supported')) {
                    set.status = 501;
                } else {
                    set.status = 500;
                }
                return { error: result.error };
            }

            return result;
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || 'Internal server error' };
        }

    }, {
        params: t.Object({
            id: t.String()
        }),
        detail: {
            summary: 'Proxy Stream Video',
            description: 'Proxy untuk stream video dari provider pihak ketiga. Endpoint ini akan mengambil video dari URL asli dan meneruskannya ke client. Mendukung "range requests" untuk seeking.',
            tags: ['Stream']
        }
    });
