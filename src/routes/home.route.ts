import { Elysia } from 'elysia';
import { getHome } from '../controllers/samehadaku.controller';

// -- homeRoute --
export const homeRoute = new Elysia({ prefix: '/api' }).get('/home', getHome);
