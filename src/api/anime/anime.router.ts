import { Elysia } from 'elysia';
import { animeController } from './anime.controller';

export const animeRouter = new Elysia()
    .use(animeController);
