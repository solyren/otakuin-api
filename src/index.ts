
import 'dotenv/config';

import { Elysia } from 'elysia';
import { home } from './routes/home';
import { anime } from './routes/anime';
import { stream } from './routes/stream';
import { swagger } from '@elysiajs/swagger';

const app = new Elysia();

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

app.get('/', () => 'Hello from Otakuin API!');
app.group('/api', (app) => app.use(home).use(anime).use(stream));


app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
