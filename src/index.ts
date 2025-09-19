import './config';
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
import { homeRouter } from './api/home/home.router';
import { animeRouter } from './api/anime/anime.router';
import { streamRouter } from './api/stream/stream.router';
import { searchRouter } from './api/search/search.router';
import { genreRouter } from './api/genre/genre.router';
import { top10Router } from './api/top10/top10.router';
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
            version: '0.0.3',
            description: 'Dokumentasi API untuk layanan streaming anime Otakuin.'
        }
    }
}));

import { security } from './lib/security';

app.get('/', () => 'Hello from Otakuin API!');
app.group('/api', (app) => app.use(security).use(homeRouter).use(animeRouter).use(streamRouter).use(searchRouter).use(genreRouter).use(top10Router));