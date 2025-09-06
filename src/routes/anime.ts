
import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import Fuse from 'fuse.js';

const SLUGS_KEY = 'slugs:samehadaku';
const MANUAL_MAP_KEY = 'manual_map:anilist_id_to_slug';

const getAnilistDataById = async (id: number) => {
    const query = `
    query ($id: Int) {
        Media (id: $id, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
            description(asHtml: false)
            genres
            coverImage {
                large
                medium
            }
        }
    }
    `;

    const variables = { id };

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) return null;
        const { data } = await response.json();
        return data.Media;
    } catch (error) {
        return null;
    }
};

// Helper function to format the slug for an episode
const formatEpisodeSlug = (slug: string, episode: number) => {
    const url = new URL(slug);
    const path = url.pathname.replace(/\/$/, ''); // remove trailing slash
    return `${url.origin}${path}-episode-${episode}/`;
};

export const anime = new Elysia()
    .get('/anime/:id', async ({ params, set }) => {
        const id = parseInt(params.id);
        if (isNaN(id)) {
            set.status = 400;
            return { error: 'Invalid ID' };
        }

        const animeDetails = await getAnilistDataById(id);

        if (!animeDetails) {
            set.status = 404;
            return { error: 'Anime not found' };
        }

        return {
            id: animeDetails.id,
            title: animeDetails.title.romaji || animeDetails.title.english,
            synopsis: animeDetails.description,
            genres: animeDetails.genres,
            thumbnail: animeDetails.coverImage.large || animeDetails.coverImage.medium
        };
    })
    .get('/anime/:id/episode/:episode', async ({ params, set }) => {
        const id = parseInt(params.id);
        const episode = parseInt(params.episode);

        if (isNaN(id) || isNaN(episode)) {
            set.status = 400;
            return { error: 'Invalid ID or episode number' };
        }

        let finalSlug: string | null = null;
        let slugTitle: string | null = null;
        let titleSource: string | null = null;

        // 1. Check for a manual mapping first
        const manualSlug = await redis.hget(MANUAL_MAP_KEY, id.toString());

        if (manualSlug) {
            finalSlug = manualSlug as string;
            slugTitle = 'Manual Mapping';
            titleSource = 'manual';
        } else {
            // If no manual map, proceed with multi-step fuzzy search
            const animeDetails = await getAnilistDataById(id);
            if (!animeDetails) {
                set.status = 404;
                return { error: 'Anime not found on Anilist' };
            }

            const slugsData = await redis.hgetall(SLUGS_KEY);
            if (!slugsData) {
                set.status = 500;
                return { error: 'Could not retrieve slugs from database.' };
            }

            const slugList = Object.entries(slugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const fuse = new Fuse(slugList, {
                keys: ['title'],
                includeScore: true,
                threshold: 0.2
            });

            // Search Priority: Romaji -> English -> Native
            const titlesToSearch = [
                { source: 'romaji', title: animeDetails.title.romaji },
                { source: 'english', title: animeDetails.title.english },
                { source: 'native', title: animeDetails.title.native },
            ];

            for (const search of titlesToSearch) {
                if (search.title) {
                    const searchResult = fuse.search(search.title);
                    if (searchResult.length > 0) {
                        const bestMatch = searchResult[0].item;
                        finalSlug = bestMatch.slug;
                        slugTitle = bestMatch.title;
                        titleSource = search.source;
                        break; // Stop on first successful match
                    }
                }
            }
        }

        if (!finalSlug) {
            set.status = 404;
            return { error: `Could not find a matching slug for ID ${id}` };
        }

        const episodeUrl = formatEpisodeSlug(finalSlug, episode);

        return {
            anilist_id: id,
            episode: episode,
            match_method: titleSource,
            found_slug_title: slugTitle,
            found_slug: finalSlug,
            episode_url: episodeUrl
        };

    }, {
        params: t.Object({
            id: t.Numeric(),
            episode: t.Numeric()
        })
    });
