import type { Elysia } from 'elysia';
import { logger } from '../config/logger';

// -- loggerMiddleware --
export const loggerMiddleware = (app: Elysia) => {
  app.onBeforeHandle(({ request }) => {
    logger.info({
      method: request.method,
      url: request.url,
      msg: 'Incoming request',
    });
  });

  app.onAfterHandle(({ request }) => {
    logger.info({
      method: request.method,
      url: request.url,
      msg: 'Request completed',
    });
  });

  app.onError(({ error, request }) => {
    logger.error({
      method: request.method,
      url: request.url,
      error: error.message,
      msg: 'Request error',
    });

    return {
      success: false,
      message: error.message,
    };
  });

  return app;
};
