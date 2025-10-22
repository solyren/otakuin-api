import { getHomeAnime } from '../services/anime.service';
import type { HomeResponse } from '../types';
import { logger } from '../config/logger';

// -- getHome --
export const getHome = async (): Promise<HomeResponse> => {
  try {
    logger.info('Controller: getHome called');
    const result = await getHomeAnime();
    return result;
  } catch (error) {
    logger.error({ error }, 'Controller: getHome error');
    throw error;
  }
};
