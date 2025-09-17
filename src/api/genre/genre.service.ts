import { getAnilistByGenre as getAnilistByGenreFromLib } from '../../lib/anilist';

export const getAnilistByGenre = async (genre: string, page: number, perPage: number) => {
    return await getAnilistByGenreFromLib(genre, page, perPage);
}
