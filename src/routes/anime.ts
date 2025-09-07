import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getAnimesailEmbeds } from '../lib/embeds';
import { randomBytes } from 'crypto';

// --- Find Best Match ---
const findBestMatch = (animeDetails: any, slugList: { title: string; slug: string }[]) => {
    if (!slugList || slugList.length === 0) return null;

    const fuse = new Fuse(slugList, {
        keys: ['title'],
        includeScore: true,
        threshold: 0.4, // A bit more lenient to get more results for sorting
    });

    const titlesToSearch = [
        { source: 'romaji', title: animeDetails.title.romaji },
        { source: 'english', title: animeDetails.title.english },
        { source: 'native', title: animeDetails.title.native },
    ];

    for (const search of titlesToSearch) {
        if (search.title) {
            const searchResult = fuse.search(search.title);
            if (searchResult.length > 0) {
                // Sort by score (ascending), then by title length (ascending)
                // This prefers shorter titles (closer to query length) if scores are similar
                searchResult.sort((a, b) => {
                    if (a.score !== b.score) {
                        return a.score - b.score;
                    }
                    return a.item.title.length - b.item.title.length;
                });

                const bestMatchResult = searchResult[0];
                // If the best match is still too far off, consider it no match
                if (bestMatchResult.score > 0.1) { // Changed from 0.3 to 0.1
                    return null;
                }

                const bestMatch = bestMatchResult.item;
                return {
                    found_slug: bestMatch.slug,
                    found_slug_title: bestMatch.title,
                    match_method: search.source,
                };
            }
        }
    }
    return null;
};

const SLUGS_KEY = 'slugs:samehadaku';
const ANIME_SAIL_SLUGS_KEY = 'slugs:animesail';
const getManualMapKey = (source: string) => `manual_map:${source}:anilist_id_to_slug`;
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

        // Manual map for Samehadaku
        const samehadakuManualSlug = await redis.hget(getManualMapKey('samehadaku'), id.toString());
        if (samehadakuManualSlug) {
            samehadakuInfo.found_slug = samehadakuManualSlug as string;
            samehadakuInfo.found_slug_title = 'Manual Mapping';
            samehadakuInfo.match_method = 'manual';
            samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, samehadakuInfo.found_slug, episode);
        }

        // Manual map for Animesail
        const animesailManualSlug = await redis.hget(getManualMapKey('animesail'), id.toString());
        if (animesailManualSlug) {
            animesailInfo.found_slug = animesailManualSlug as string;
            animesailInfo.found_slug_title = 'Manual Mapping';
            animesailInfo.match_method = 'manual';
            animesailInfo.episode_url = getAnimesailEpisodeUrl(animesailInfo.found_slug, episode);
        }

        if (!samehadakuInfo.found_slug && samehadakuSlugsData) {
            const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const match = findBestMatch(animeDetails, samehadakuSlugList);
            if (match) {
                samehadakuInfo.found_slug = match.found_slug;
                samehadakuInfo.found_slug_title = match.found_slug_title;
                samehadakuInfo.match_method = match.match_method;
                samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, match.found_slug, episode);
            }
        }

        if (animesailSlugsData) {
            const animesailSlugList = Object.entries(animesailSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const match = findBestMatch(animeDetails, animesailSlugList);
            if (match) {
                animesailInfo.found_slug = match.found_slug;
                animesailInfo.found_slug_title = match.found_slug_title;
                animesailInfo.match_method = match.match_method;
                animesailInfo.episode_url = getAnimesailEpisodeUrl(match.found_slug, episode);
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