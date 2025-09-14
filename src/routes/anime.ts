import { Elysia, t } from 'elysia';
import { redis } from '../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getAnimesailEmbeds } from '../lib/embeds';
import { randomBytes } from 'crypto';
import * as cheerio from 'cheerio';
import { getAnilistDataById, normalizeSlug } from '../lib/anilist';
import axios from 'axios';
import https from 'https';

// --- Find Best Match ---
const findBestMatch = (animeDetails: any, slugList: { title: string; slug: string }[]) => {
    if (!slugList || slugList.length === 0) return null;

    const normalizedSlugList = slugList.map(item => ({
        ...item,
        normalizedTitle: normalizeSlug(item.slug)
    }));


    const fuse = new Fuse(normalizedSlugList, {
        keys: ['normalizedTitle'],
        includeScore: true,
        threshold: 0.4,
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
                searchResult.sort((a, b) => {
                    if (a.score !== b.score) {
                        return a.score - b.score;
                    }
                    return a.item.title.length - b.item.title.length;
                });

                const bestMatchResult = searchResult[0];
                if (bestMatchResult.score > 0.1) {
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
const STREAM_EXPIRATION_SECONDS = 21600;
const EPISODE_CACHE_KEY_PREFIX = 'episode:';
const EPISODE_CACHE_EXPIRATION_SECONDS = 7200;
const EPISODE_LIST_CACHE_KEY_PREFIX = 'episode_list:';
const EPISODE_LIST_CACHE_EXPIRATION_SECONDS = 300;

// --- Get Samehadaku Episode List ---
const getSamehadakuEpisodeList = async (id: number, animeDetails: any) => {
    const samehadakuSlugsData = await redis.hgetall(SLUGS_KEY);
    const samehadakuManualSlug = await redis.hget(getManualMapKey('samehadaku'), id.toString());

    let samehadakuSlug: string | null = null;
    if (samehadakuManualSlug) {
        samehadakuSlug = samehadakuManualSlug as string;
    } else if (samehadakuSlugsData) {
        const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, samehadakuSlugList);
        if (match) {
            samehadakuSlug = match.found_slug;
        }
    }

    if (!samehadakuSlug) {
        return [];
    }

    const samehadakuUrl = samehadakuSlug.startsWith('http') ? samehadakuSlug : `${process.env.SAMEHADAKU_BASE_URL}/anime${samehadakuSlug.startsWith('/') ? '' : '/'}${samehadakuSlug}`;

    const response = await fetch(samehadakuUrl, { redirect: 'follow' });

    const finalUrl = response.url;
    if (!finalUrl.includes(samehadakuSlug)) {
        console.log(`Redirect detected for slug ${samehadakuSlug}. Expected ${samehadakuUrl}, got ${finalUrl}.`);
        return [];
    }

    if (!response.ok) {
        return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const episodeList: { episode: number; title: string; url: string }[] = [];
    $('div.lstepsiode.listeps ul li').each((i, el) => {
        const linkElement = $(el).find('.lchx a');
        const title = linkElement.text().trim();
        const url = linkElement.attr('href');

        if (title && url) {
            const episodeMatch = title.match(/Episode\s+(\d+(\.\d+)?)/i);
            const episode = episodeMatch ? parseFloat(episodeMatch[1]) : 0;

            if (episode > 0) {
                episodeList.push({ episode, title, url });
            }
        }
    });

    return episodeList.sort((a, b) => b.episode - a.episode);
}

// --- Get Animesail Episode List ---
const getAnimesailEpisodeList = async (id: number, animeDetails: any) => {
    const animesailSlugsData = await redis.hgetall(ANIME_SAIL_SLUGS_KEY);
    const animesailManualSlug = await redis.hget(getManualMapKey('animesail'), id.toString());

    let animesailSlug: string | null = null;
    if (animesailManualSlug) {
        animesailSlug = animesailManualSlug as string;
    } else if (animesailSlugsData) {
        const animesailSlugList = Object.entries(animesailSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, animesailSlugList);
        if (match) {
            animesailSlug = match.found_slug;
        }
    }

    if (!animesailSlug) {
        return [];
    }

    const animesailUrl = animesailSlug.startsWith('http') ? animesailSlug : `${process.env.ANIMESAIL_BASE_URL}${animesailSlug}`;

    try {
        const response = await axios.get(animesailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
                'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });

        if (response.status !== 200) {
            return [];
        }

        const html = response.data;
        const $ = cheerio.load(html);

        const episodeList: { episode: number; title: string; url: string }[] = [];
        $('ul.daftar li a').each((i, el) => {
            const title = $(el).text().trim();
            const url = $(el).attr('href') || '';
            const episodeMatch = title.match(/Episode\s+(\d+)/i);
            const episode = episodeMatch ? parseInt(episodeMatch[1]) : 0;

            if (episode > 0) {
                episodeList.push({ episode, title, url });
            }
        });

        return episodeList.sort((a, b) => b.episode - a.episode);
    } catch (error) {
        console.error('Error fetching Animesail episode list:', error);
        return [];
    }
}

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

export const anime = new Elysia({ prefix: '/anime' })
    .get('/:id', async ({ params, set }) => {
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

        const episodeCacheKey = `${EPISODE_LIST_CACHE_KEY_PREFIX}${id}`;
        const cachedEpisodeList = await redis.get(episodeCacheKey);

        let episodeList;
        if (cachedEpisodeList) {
            episodeList = cachedEpisodeList as any[];
        } else {
            episodeList = await getSamehadakuEpisodeList(id, animeDetails);

            if (!episodeList || episodeList.length === 0) {
                episodeList = await getAnimesailEpisodeList(id, animeDetails);
            }

            if (episodeList.length > 0) {
                await redis.set(episodeCacheKey, episodeList, { ex: EPISODE_LIST_CACHE_EXPIRATION_SECONDS });
            }
        }

        return {
            id: animeDetails.id,
            title: animeDetails.title.romaji || animeDetails.title.english,
            status: animeDetails.status,
            description: animeDetails.description,
            startDate: animeDetails.startDate,
            endDate: animeDetails.endDate,
            year: animeDetails.seasonYear,
            total_episodes: animeDetails.episodes,
            duration: animeDetails.duration,
            trailer: animeDetails.trailer,
            coverImage: animeDetails.coverImage.large,
            bannerImage: animeDetails.bannerImage,
            genres: animeDetails.genres,
            rating: animeDetails.averageScore,
            studios: animeDetails.studios && animeDetails.studios.nodes ? animeDetails.studios.nodes.map((studio: any) => studio.name) : [],
            episodes: episodeList
        };
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

        const cacheKey = `${EPISODE_CACHE_KEY_PREFIX}${id}:${episode}`;
        const cachedResponse = await redis.get(cacheKey);
        if (cachedResponse) {
            return cachedResponse as any;
        }

        const animeDetails = await getAnilistDataById(id);
        if (!animeDetails) {
            set.status = 404;
            return { error: 'Anime not found on Anilist' };
        }

        const [samehadakuSlugsData, animesailSlugsData, samehadakuManualSlug, animesailManualSlug] = await Promise.all([
            redis.hgetall(SLUGS_KEY),
            redis.hgetall(ANIME_SAIL_SLUGS_KEY),
            redis.hget(getManualMapKey('samehadaku'), id.toString()),
            redis.hget(getManualMapKey('animesail'), id.toString())
        ]);

        const samehadakuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
        const animesailInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };

        if (samehadakuManualSlug) {
            samehadakuInfo.found_slug = samehadakuManualSlug as string;
            samehadakuInfo.found_slug_title = 'Manual Mapping';
            samehadakuInfo.match_method = 'manual';
            samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, samehadakuInfo.found_slug, episode);
        } else if (samehadakuSlugsData) {
            const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
            const match = findBestMatch(animeDetails, samehadakuSlugList);
            if (match) {
                samehadakuInfo.found_slug = match.found_slug;
                samehadakuInfo.found_slug_title = match.found_slug_title;
                samehadakuInfo.match_method = match.match_method;
                samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, match.found_slug, episode);
            }
        }

        if (animesailManualSlug) {
            animesailInfo.found_slug = animesailManualSlug as string;
            animesailInfo.found_slug_title = 'Manual Mapping';
            animesailInfo.match_method = 'manual';
            animesailInfo.episode_url = getAnimesailEpisodeUrl(animesailInfo.found_slug, episode);
        } else if (animesailSlugsData) {
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

        const [samehadakuEmbeds, animesailEmbeds] = await Promise.all([
            samehadakuInfo.episode_url ? getSamehadakuEmbeds(samehadakuInfo.episode_url) : Promise.resolve([]),
            animesailInfo.episode_url ? getAnimesailEmbeds(animesailInfo.episode_url) : Promise.resolve([])
        ]);

        const [samehadakuStreams, animesailStreams] = await Promise.all([
            generateStreamIds(samehadakuEmbeds),
            generateStreamIds(animesailEmbeds)
        ]);

        const response = {
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

        await redis.set(cacheKey, response, { ex: EPISODE_CACHE_EXPIRATION_SECONDS });

        return response;

    }, {
        params: t.Object({
            id: t.Numeric(),
            episode: t.Numeric()
        }),
        detail: {
            summary: 'Sumber Stream Episode',
            description: 'Mencari dan menyediakan sumber stream untuk episode anime tertentu dari berbagai provider.',
            tags: ['Anime']
        }
    });