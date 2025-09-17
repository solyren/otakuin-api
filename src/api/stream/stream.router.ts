import { Elysia } from 'elysia';
import { streamController } from './stream.controller';

export const streamRouter = new Elysia()
    .use(streamController);
