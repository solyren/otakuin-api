import { Elysia } from 'elysia';
import { homeRoute } from './routes/home.route';
import { loggerMiddleware } from './middlewares/logger.middleware';
import { logger } from './config/logger';
import { appConfig } from './config/app';

// -- createApp --
const createApp = () => {
  const app = new Elysia();

  loggerMiddleware(app);

  app.get('/', () => ({
    message: 'Otakuin API - Anime Scraper',
    version: '1.0.0',
    status: 'running',
  }));

  app.use(homeRoute);

  return app;
};

// -- startServer --
const startServer = () => {
  const app = createApp();

  app.listen(appConfig.port);

  logger.info(
    `🚀 Server is running at ${app.server?.hostname}:${app.server?.port}`
  );
  logger.info(`📝 Environment: ${appConfig.env}`);
};

startServer();
