
import { Elysia } from 'elysia';
import * as cheerio from 'cheerio';

const normalizeSlug = (slug: string) => {
    const lastPart = slug.split('/').filter(Boolean).pop() || '';
    const cleaned = lastPart.replace(/(?:-episode.*|-season.*|-movie.*|-special.*)/, '');
    return cleaned.replace(/-/g, ' ');
};

const getAnilistData = async (search: string) => {
    const query = `
    query ($search: String) {
        Media (search: $search, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
            coverImage {
                large
                medium
            }
        }
    }
    `;

    const variables = {
        search
    };

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            return null;
        }

        const { data } = await response.json();
        return data.Media;
    } catch (error) {
        return null;
    }
};

export const home = new Elysia().get('/home', async () => {
    const response = await fetch('https://v1.samehadaku.how/anime-terbaru/');
    const html = await response.text();
    const $ = cheerio.load(html);

    const animeListPromises = $('div.post-show ul li').map(async (index, element) => {
        const rawSlug = $(element).find('a').attr('href') || '';
        const normalizedSlug = normalizeSlug(rawSlug);
        const anilistData = await getAnilistData(normalizedSlug);

        if (!anilistData) {
            return null;
        }

        return {
            id: anilistData.id,
            title: anilistData.title.romaji || anilistData.title.english || normalizedSlug,
            thumbnail: anilistData.coverImage.large || anilistData.coverImage.medium
        };
    }).get();

    const animeList = await Promise.all(animeListPromises);

    return animeList.filter(anime => anime && anime.id);
});
