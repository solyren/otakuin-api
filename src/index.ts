import 'dotenv/config';

import { Elysia } from 'elysia';
import { home } from './routes/home';
import { anime } from './routes/anime';
import { stream } from './routes/stream';
import { searchRoutes } from './routes/search';
import { genreRoutes } from './routes/genre';
import { top10 } from './routes/top10';
import { swagger } from '@elysiajs/swagger';

// --- App ---
export const app = new Elysia();

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