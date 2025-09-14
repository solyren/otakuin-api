import { logger } from './logger';

export const requestLogger = (app: any) => {
  return app.onBeforeHandle(({ request }: any) => {
    logger(`[Request] ${request.method} ${request.url}`);
  });
};