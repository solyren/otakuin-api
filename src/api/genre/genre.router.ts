import { Elysia } from 'elysia';
import { genreController } from './genre.controller';

export const genreRouter = new Elysia()
    .use(genreController);
