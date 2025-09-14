import { Elysia, t } from 'elysia';

// --- Security ---
export const security = new Elysia()
    .onRequest(({ request, set }) => {
        if (process.env.API_AUTH_ENABLED !== 'true') {
            return;
        }

        const apiKey = request.headers.get('x-api-key');

        if (apiKey !== process.env.API_KEY) {
            set.status = 401;
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });