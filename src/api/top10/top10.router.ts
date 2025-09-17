import { Elysia } from 'elysia';
import { top10Controller } from './top10.controller';

export const top10Router = new Elysia()
    .use(top10Controller);
