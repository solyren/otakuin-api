import { load } from 'cheerio';
import type { AnimeItem } from '../types';
import { logger } from '../config/logger';

// -- fetchAnimeList --
export const fetchAnimeList = async (): Promise<AnimeItem[]> => {
  try {
    logger.info('Fetching anime list from samehadaku');

    const response = await fetch('https://v1.samehadaku.how/anime-terbaru/');
    const html = await response.text();
    const $ = load(html);

    const animeList: AnimeItem[] = [];

    $('.post-show ul li').each((_, element) => {
      const title = $(element).find('h2').text().trim();
      const slug = $(element).find('a').attr('href') || '';
      const cover = $(element).find('img').attr('src') || '';

      if (title && slug && cover) {
        animeList.push({
          title,
          slug,
          cover,
        });
      }
    });

    logger.info(`Successfully fetched ${animeList.length} anime items`);
    return animeList;
  } catch (error) {
    logger.error({ error }, 'Error fetching anime list');
    throw new Error('Failed to fetch anime list');
  }
};

// -- getHomeAnime --
export const getHomeAnime = async (): Promise<{
  data: AnimeItem[];
  total: number;
}> => {
  const data = await fetchAnimeList();
  return {
    data,
    total: data.length,
  };
};
