import { Elysia } from 'elysia';
import { getHome } from '../controllers/anime.controller';

// -- homeRoute --
export const homeRoute = new Elysia({ prefix: '/api' }).get('/home', getHome);
