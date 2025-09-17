import { searchAnilist as searchAnilistFromLib } from '../../lib/anilist';

export const searchAnilist = async (query: string, page: number, perPage: number) => {
    return await searchAnilistFromLib(query, page, perPage);
}
