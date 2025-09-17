import { Elysia } from 'elysia';
import { homeController } from './home.controller';

export const homeRouter = new Elysia()
    .use(homeController);
