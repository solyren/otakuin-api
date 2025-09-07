import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getAnimesailEmbeds } from '../lib/embeds';
import { randomBytes } from 'crypto';

const SLUGS_KEY = 'slugs:samehadaku';
const ANIME_SAIL_SLUGS_KEY = 'slugs:animesail';
const MANUAL_MAP_KEY = 'manual_map:anilist_id_to_slug';
const STREAM_KEY_PREFIX = 'stream:';
const STREAM_EXPIRATION_SECONDS = 21600; // 6 hours

// --- Get Anilist Data By Id ---
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

// --- Format Episode Slug ---
const formatEpisodeSlug = (domain: string, pathSlug: string, episode: number) => {
    let baseUrl = domain;
    let cleanedPath = pathSlug;

    if (pathSlug.startsWith('http://') || pathSlug.startsWith('https://')) {
        const urlObj = new URL(pathSlug);
        baseUrl = urlObj.origin;
        cleanedPath = urlObj.pathname;
    }

    cleanedPath = cleanedPath.replace(/^\/anime\//, '').replace(/\/$/, '');
    return `${baseUrl}/${cleanedPath}-episode-${episode}/`;
};

// --- Get Animesail Episode Url ---
const getAnimesailEpisodeUrl = (foundEpisodeSlug: string, requestedEpisode: number): string => {
    let baseUrl = process.env.ANIMESAIL_BASE_URL;
    let path = foundEpisodeSlug;

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

// --- Generate Stream Ids ---
const generateStreamIds = async (embeds: any[]): Promise<any[]> => {
    if (!embeds || embeds.length === 0) {
        return [];
    }

    const pipeline = redis.pipeline();
    const processedEmbeds = embeds.map(embed => {
        if (!embed.url) return null;
        const streamId = randomBytes(4).toString('hex');
        pipeline.set(`${STREAM_KEY_PREFIX}${streamId}`, embed.url, { ex: STREAM_EXPIRATION_SECONDS });
        return {
            server: embed.server,
            url: embed.url,
            stream_id: streamId
        };
    }).filter(Boolean);

    if (processedEmbeds.length > 0) {
        await pipeline.exec();
    }
    return processedEmbeds;
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

        const animeDetails = await getAnilistDataById(id);
        if (!animeDetails) {
            set.status = 404;
            return { error: 'Anime not found on Anilist' };
        }

        const samehadakuSlugsData = await redis.hgetall(SLUGS_KEY);
        const animesailSlugsData = await redis.hgetall(ANIME_SAIL_SLUGS_KEY);

        const samehadakuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
        const animesailInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };

        const manualSlug = await redis.hget(MANUAL_MAP_KEY, id.toString());
        if (manualSlug) {
            samehadakuInfo.found_slug = manualSlug as string;
            samehadakuInfo.found_slug_title = 'Manual Mapping';
            samehadakuInfo.match_method = 'manual';
            samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, samehadakuInfo.found_slug, episode);
        }

        if (!samehadakuInfo.found_slug && samehadakuSlugsData) {
            const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const samehadakuFuse = new Fuse(samehadakuSlugList, { keys: ['title'], includeScore: true, threshold: 0.2 });
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
                        samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, samehadakuInfo.found_slug, episode);
                        break;
                    }
                }
            }
        }

        if (animesailSlugsData) {
            const animesailSlugList = Object.entries(animesailSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const animesailFuse = new Fuse(animesailSlugList, { keys: ['title'], includeScore: true, threshold: 0.2 });
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
                        animesailInfo.episode_url = getAnimesailEpisodeUrl(animesailInfo.found_slug, episode);
                        break;
                    }
                }
            }
        }

        if (!samehadakuInfo.found_slug && !animesailInfo.found_slug) {
            set.status = 404;
            return { error: `Could not find a matching slug for ID ${id} from either source.` };
        }

        let samehadakuEmbeds = [];
        if (samehadakuInfo.episode_url) {
            samehadakuEmbeds = await getSamehadakuEmbeds(samehadakuInfo.episode_url);
        }

        let animesailEmbeds = [];
        if (animesailInfo.episode_url) {
            animesailEmbeds = await getAnimesailEmbeds(animesailInfo.episode_url);
        }

        const samehadakuStreams = await generateStreamIds(samehadakuEmbeds);
        const animesailStreams = await generateStreamIds(animesailEmbeds);

        return {
            anilist_id: id,
            episode: episode,
            sources: {
                samehadaku: samehadakuInfo,
                animesail: animesailInfo,
            },
            streams: {
                samehadaku: samehadakuStreams,
                animesail: animesailStreams,
            }
        };

    }, {
        params: t.Object({
            id: t.Numeric(),
            episode: t.Numeric()
        })
    });