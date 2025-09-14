import 'dotenv/config';
import { Elysia } from 'elysia';
import { errorLogger, logger } from './lib/logger';

process.on('uncaughtException', (err) => {
    errorLogger(err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason instanceof Error) {
        errorLogger(reason);
    } else {
        logger(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    }
    process.exit(1);
});
import { home } from './routes/home';
import { anime } from './routes/anime';
import { stream } from './routes/stream';
import { searchRoutes } from './routes/search';
import { genreRoutes } from './routes/genre';
import { top10 } from './routes/top10';
import { swagger } from '@elysiajs/swagger';

import { requestLogger } from './lib/request_logger';

// --- App ---
export const app = new Elysia().onError(({ code, error, set }) => {
    errorLogger(error);
    return new Response(error.toString())
});

app.use(requestLogger);

app.use(swagger({
    path: '/docs',
    documentation: {
        info: {
            title: 'Otakuin API',
            version: '1.0.0',
            description: 'Dokumentasi API untuk layanan streaming anime Otakuin.'
        }
    }
}));

import { security } from './lib/security';

app.get('/', () => 'Hello from Otakuin API!');
app.group('/api', (app) => app.use(security).use(home).use(anime).use(stream).use(searchRoutes).use(genreRoutes).use(top10));