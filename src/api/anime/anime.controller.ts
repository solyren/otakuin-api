import { Elysia, t } from 'elysia';
import { getAnimeDetail, getEpisodeStream } from './anime.service';

export const animeController = new Elysia({ prefix: '/anime' })
    .get('/:id', async ({ params, set }) => {
        const id = parseInt(params.id);
        if (isNaN(id)) {
            set.status = 400;
            return { error: 'Invalid ID' };
        }
        const animeDetails = await getAnimeDetail(id);
        if (!animeDetails) {
            set.status = 404;
            return { error: 'Anime not found' };
        }

        return animeDetails;
    }, {
        detail: {
            summary: 'Detail Anime',
            description: 'Mengambil detail informasi sebuah anime dari Anilist berdasarkan ID.',
            tags: ['Anime']
        }
    })
    .get('/:id/episode/:episode', async ({ params, set }) => {
        const id = parseInt(params.id);
        const episode = parseInt(params.episode);

        if (isNaN(id) || isNaN(episode)) {
            set.status = 400;
            return { error: 'Invalid ID or episode number' };
        }

        const result = await getEpisodeStream(id, episode);

        if (result && result.error) {
            set.status = 404;
            return result;
        }

        if (!result) {
            set.status = 404;
            return { error: 'Anime not found on Anilist' };
        }

        return result;

    }, {
        detail: {
            summary: 'Sumber Stream Episode',
            description: 'Mencari dan menyediakan sumber stream untuk episode anime tertentu dari berbagai provider.',
            tags: ['Anime']
        }
    });
