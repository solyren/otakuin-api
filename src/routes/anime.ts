import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getAnimesailEmbeds } from '../lib/scraper_embeds';

const SLUGS_KEY = 'slugs:samehadaku';
const ANIME_SAIL_SLUGS_KEY = 'slugs:animesail'; // New constant
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
const formatEpisodeSlug = (domain: string, pathSlug: string, episode: number) => {
    let baseUrl = domain;
    let cleanedPath = pathSlug;

    // Check if pathSlug is already a full URL
    if (pathSlug.startsWith('http://') || pathSlug.startsWith('https://')) {
        const urlObj = new URL(pathSlug);
        baseUrl = urlObj.origin;
        cleanedPath = urlObj.pathname;
    }

    // Remove leading /anime/ if present, and trailing slash
    cleanedPath = cleanedPath.replace(/^\/anime\//, '').replace(/\/$/, '');

    return `${baseUrl}/${cleanedPath}-episode-${episode}/`;
};

// New helper for Animesail specific slug manipulation
const getAnimesailEpisodeUrl = (foundEpisodeSlug: string, requestedEpisode: number): string => {
    let baseUrl = 'https://154.26.137.28'; // Default base for Animesail
    let path = foundEpisodeSlug;

    // Check if foundEpisodeSlug is already a full URL
    if (foundEpisodeSlug.startsWith('http://') || foundEpisodeSlug.startsWith('https://')) {
        const urlObj = new URL(foundEpisodeSlug);
        baseUrl = urlObj.origin;
        path = urlObj.pathname;
    }

    const pathParts = path.split('/').filter(Boolean);

    let baseSeriesPath = '';
    const lastPart = pathParts[pathParts.length - 1];
    const episodeIndex = lastPart.lastIndexOf('-episode-');
    if (episodeIndex !== -1) {
        baseSeriesPath = lastPart.substring(0, episodeIndex);
    } else {
        baseSeriesPath = lastPart;
    }

    return `${baseUrl}/${baseSeriesPath}-episode-${requestedEpisode}/`;
};

// New helper for Animesail specific slug manipulation


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

        const animeDetails = await getAnilistDataById(id);
        if (!animeDetails) {
            set.status = 404;
            return { error: 'Anime not found on Anilist' };
        }

        const samehadakuSlugsData = await redis.hgetall(SLUGS_KEY);
        const animesailSlugsData = await redis.hgetall(ANIME_SAIL_SLUGS_KEY); 

        const samehadakuInfo: any = {
            found_slug_title: null,
            found_slug: null,
            episode_url: null,
            match_method: null
        };
        const animesailInfo: any = {
            found_slug_title: null,
            found_slug: null,
            episode_url: null,
            match_method: null
        };

        // 1. Check for a manual mapping first (applies to Samehadaku for now, can be extended)
        const manualSlug = await redis.hget(MANUAL_MAP_KEY, id.toString());

        if (manualSlug) {
            // Assuming manual map is primarily for samehadaku for now
            samehadakuInfo.found_slug = manualSlug as string;
            samehadakuInfo.found_slug_title = 'Manual Mapping';
            samehadakuInfo.match_method = 'manual';
            samehadakuInfo.episode_url = formatEpisodeSlug('https://v1.samehadaku.how', samehadakuInfo.found_slug, episode);
        }

        // If no manual map, proceed with fuzzy search for Samehadaku
        if (!samehadakuInfo.found_slug && samehadakuSlugsData) {
            const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const samehadakuFuse = new Fuse(samehadakuSlugList, {
                keys: ['title'],
                includeScore: true,
                threshold: 0.2
            });

            const titlesToSearch = [
                { source: 'romaji', title: animeDetails.title.romaji },
                { source: 'english', title: animeDetails.title.english },
                { source: 'native', title: animeDetails.title.native },
            ];

            for (const search of titlesToSearch) {
                if (search.title) {
                    const searchResult = samehadakuFuse.search(search.title);
                    if (searchResult.length > 0) {
                        const bestMatch = searchResult[0].item;
                        samehadakuInfo.found_slug = bestMatch.slug;
                        samehadakuInfo.found_slug_title = bestMatch.title;
                        samehadakuInfo.match_method = search.source;
                        samehadakuInfo.episode_url = formatEpisodeSlug('https://v1.samehadaku.how', samehadakuInfo.found_slug, episode);
                        break;
                    }
                }
            }
        }

        // Fuzzy search for Animesail
        if (animesailSlugsData) {
            const animesailSlugList = Object.entries(animesailSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const animesailFuse = new Fuse(animesailSlugList, {
                keys: ['title'],
                includeScore: true,
                threshold: 0.2
            });

            const titlesToSearch = [
                { source: 'romaji', title: animeDetails.title.romaji },
                { source: 'english', title: animeDetails.title.english },
                { source: 'native', title: animeDetails.title.native },
            ];

            for (const search of titlesToSearch) {
                if (search.title) {
                    const searchResult = animesailFuse.search(search.title);
                    if (searchResult.length > 0) {
                        const bestMatch = searchResult[0].item;
                        animesailInfo.found_slug = bestMatch.slug;
                        animesailInfo.found_slug_title = bestMatch.title;
                        animesailInfo.match_method = search.source;
                        animesailInfo.episode_url = getAnimesailEpisodeUrl(animesailInfo.found_slug, episode); // Use new helper
                        break;
                    }
                }
            }
        }

        // If neither source found a slug, return 404
        if (!samehadakuInfo.found_slug && !animesailInfo.found_slug) {
            set.status = 404;
            return { error: `Could not find a matching slug for ID ${id} from either source.` };
        }

        // Scrape for embeds
        let samehadakuEmbeds = [];
        if (samehadakuInfo.episode_url) {
            samehadakuEmbeds = await getSamehadakuEmbeds(samehadakuInfo.episode_url);
        }

        let animesailEmbeds = [];
        if (animesailInfo.episode_url) {
            animesailEmbeds = await getAnimesailEmbeds(animesailInfo.episode_url);
        }

        return {
            anilist_id: id,
            episode: episode,
            samehadaku_info: samehadakuInfo,
            animesail_info: animesailInfo,
            embeds: {
                samehadaku: samehadakuEmbeds,
                animesail: animesailEmbeds,
            }
        };

    }, {
        params: t.Object({
            id: t.Numeric(),
            episode: t.Numeric()
        })
    });