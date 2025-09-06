
import { Elysia } from 'elysia';
import * as cheerio from 'cheerio';

const normalizeSlug = (slug: string) => {
    let lastPart = slug.split('/').filter(Boolean).pop() || '';
    // A safer way to remove episode markers without being too greedy
    lastPart = lastPart.replace(/-episode-\d+.*$/, '');
    return lastPart.replace(/-/g, ' ');
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

    const animeElements = $('div.post-show ul li');

    const animeListPromises = animeElements.map(async (index, element) => {
        const linkElement = $(element).find('a');
        const rawSlug = linkElement.attr('href') || '';
        
        if (!rawSlug) {
            return null;
        }

        const normalizedSlug = normalizeSlug(rawSlug);
        const anilistData = await getAnilistData(normalizedSlug);

        if (!anilistData) {
            const titleFromPage = $(element).find('h2.entry-title').text().trim();
            return {
                id: null,
                title: titleFromPage || normalizedSlug,
                thumbnail: $(element).find('img').attr('src')
            };
        }

        return {
            id: anilistData.id,
            title: anilistData.title.romaji || anilistData.title.english || normalizedSlug,
            thumbnail: anilistData.coverImage.large || anilistData.coverImage.medium
        };
    }).get();

    const animeList = (await Promise.all(animeListPromises)).filter(Boolean);

    return animeList;
});
