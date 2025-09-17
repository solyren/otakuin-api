import { Elysia } from 'elysia';
import { searchController } from './search.controller';

export const searchRouter = new Elysia()
    .use(searchController);
