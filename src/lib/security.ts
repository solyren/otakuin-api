import { Elysia, t } from 'elysia';

export const security = new Elysia()
    .onRequest(({ request, set }) => {
        const apiKey = request.headers.get('x-api-key');

        if (apiKey !== process.env.API_KEY) {
            set.status = 401;
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });
