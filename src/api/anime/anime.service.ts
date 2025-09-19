
import { redis } from '../../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getNimegamiEmbeds, getAnimasuEmbeds } from '../../lib/embeds';
import { randomBytes } from 'crypto';
import * as cheerio from 'cheerio';
import { getAnilistDataById, normalizeSlug } from '../../lib/anilist';

// -- Calculate Similarity --
const calculateSimilarity = (str1: string, str2: string): number => {
    const clean1 = str1.toLowerCase().replace(/\s+/g, ' ').trim();
    const clean2 = str2.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
        return 0.8;
    }
    
    const len1 = clean1.length;
    const len2 = clean2.length;
    const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = clean1[i - 1] === clean2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return 1 - (distance / maxLength);
};

// -- Find Best Match --
const findBestMatch = (animeDetails: any, slugList: { title: string; slug: string }[]) => {
    if (!slugList || slugList.length === 0) return null;

    const normalizedSlugList = slugList.map(item => ({
        ...item,
        normalizedTitle: typeof item.slug === 'string' ? normalizeSlug(item.slug) : ''
    }));

    const fuse = new Fuse(normalizedSlugList, {
        keys: ['normalizedTitle', 'title'],
        includeScore: true,
        threshold: 0.6,
    });

    const titlesToSearch = [
        { source: 'romaji', title: animeDetails.title.romaji },
        { source: 'english', title: animeDetails.title.english },
        { source: 'native', title: animeDetails.title.native },
    ];

    let bestMatch: any = null;
    let bestScore = 0;

    for (const search of titlesToSearch) {
        if (search.title) {
            const searchResult = fuse.search(search.title);
            if (searchResult.length > 0) {
                const topResult = searchResult[0];
                if (topResult.score !== undefined && (1 - topResult.score) > bestScore) {
                    bestScore = 1 - topResult.score;
                    bestMatch = {
                        found_slug: topResult.item.slug,
                        found_slug_title: topResult.item.title,
                        match_method: search.source,
                    };
                }
            }
        }
    }
    
    if (bestScore < 0.7) {
        for (const search of titlesToSearch) {
            if (search.title) {
                for (const item of normalizedSlugList) {
                    const similarity = calculateSimilarity(search.title, item.title);
                    if (similarity > bestScore && similarity > 0.5) {
                        bestScore = similarity;
                        bestMatch = {
                            found_slug: item.slug,
                            found_slug_title: item.title,
                            match_method: 'character_similarity',
                        };
                    }
                }
            }
        }
    }
    
    if (bestScore < 0.7 && animeDetails.title && typeof animeDetails.title === 'string') {
        const searchResult = fuse.search(animeDetails.title);
        if (searchResult.length > 0) {
            const topResult = searchResult[0];
            if (topResult.score !== undefined && (1 - topResult.score) > bestScore) {
                bestScore = 1 - topResult.score;
                bestMatch = {
                    found_slug: topResult.item.slug,
                    found_slug_title: topResult.item.title,
                    match_method: 'home_title',
                };
            }
        }
        
        if (bestScore < 0.7) {
            for (const item of normalizedSlugList) {
                const similarity = calculateSimilarity(animeDetails.title, item.title);
                if (similarity > bestScore && similarity > 0.5) {
                    bestScore = similarity;
                    bestMatch = {
                        found_slug: item.slug,
                        found_slug_title: item.title,
                        match_method: 'home_character_similarity',
                    };
                }
            }
        }
    }
    
    return bestMatch;
};

const SLUGS_KEY = 'slugs:samehadaku';
const NIMEGAMI_SLUGS_KEY = 'slugs:nimegami';
const ANIMASU_SLUGS_KEY = 'slugs:animasu';

const getManualMapKey = (source: string) => `manual_map:${source}:anilist_id_to_slug`;
const STREAM_KEY_PREFIX = 'stream:';
const STREAM_EXPIRATION_SECONDS = 21600;
const EPISODE_CACHE_KEY_PREFIX = 'episode:';
const EPISODE_CACHE_EXPIRATION_SECONDS = 7200;
const EPISODE_LIST_CACHE_KEY_PREFIX = 'episode_list:';
const EPISODE_LIST_CACHE_EXPIRATION_SECONDS = 300;

// -- Get Samehadaku Episode List --
const getSamehadakuEpisodeList = async (id: number, animeDetails: any) => {
    const [samehadakuSlugsData, homeCache] = await Promise.all([
        redis.hgetall(SLUGS_KEY),
        redis.get('home:anime_list')
    ]);
    
    const samehadakuManualSlug = await redis.hget(getManualMapKey('samehadaku'), id.toString());

    let samehadakuSlug: string | null = null;
    let matchInfo: any = null;
    
    if (samehadakuManualSlug) {
        samehadakuSlug = samehadakuManualSlug as string;
        matchInfo = { found_slug: samehadakuSlug, match_method: 'manual' };
    } else if (samehadakuSlugsData) {
        const samehadakuSlugList = Object.entries(samehadakuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, samehadakuSlugList);
        if (match) {
            samehadakuSlug = match.found_slug;
            matchInfo = match;
        } else {
            if (homeCache) {
                try {
                    const homeList = typeof homeCache === 'string' ? JSON.parse(homeCache) : homeCache;
                    const animeInHome = homeList.find((item: any) => item.id === id);
                    if (animeInHome && animeInHome.title) {
                        const animeWithHomeTitle = { ...animeDetails, title: animeInHome.title };
                        const match = findBestMatch(animeWithHomeTitle, samehadakuSlugList);
                        if (match) {
                            samehadakuSlug = match.found_slug;
                            matchInfo = { ...match, match_method: 'home_cache' };
                        }
                    }
                } catch (e) {
                    console.error('Error parsing home cache:', e);
                }
            }
        }
    }

    if (!samehadakuSlug) {
        return [];
    }

    console.log(`[Samehadaku] Found slug for anime ID ${id}: ${samehadakuSlug} (matched via ${matchInfo?.match_method || 'unknown'})`);

    const samehadakuUrl = samehadakuSlug.startsWith('http') ? samehadakuSlug : `${process.env.SAMEHADAKU_BASE_URL}/anime${samehadakuSlug.startsWith('/') ? '' : '/'}${samehadakuSlug}`;

    const response = await fetch(samehadakuUrl, { redirect: 'follow' });

    const finalUrl = response.url;
    const extractAnimeSlug = (url: string) => {
        try {
            return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
            return '';
        }
    };

    const originalSlugPart = extractAnimeSlug(samehadakuUrl);
    const finalSlugPart = extractAnimeSlug(finalUrl);

    if (originalSlugPart && finalSlugPart && originalSlugPart !== finalSlugPart) {
        console.log(`Redirect detected for slug ${samehadakuSlug}. Expected slug part ${originalSlugPart}, got ${finalSlugPart}.`);
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

// -- Get Nimegami Episode List --
const getNimegamiEpisodeList = async (id: number, animeDetails: any) => {
    const [nimegamiSlugsData, homeCache] = await Promise.all([
        redis.hgetall(NIMEGAMI_SLUGS_KEY),
        redis.get('home:anime_list')
    ]);
    
    const nimegamiManualSlug = await redis.hget(getManualMapKey('nimegami'), id.toString());

    let nimegamiSlug: string | null = null;
    let matchInfo: any = null;
    
    if (nimegamiManualSlug) {
        nimegamiSlug = nimegamiManualSlug as string;
        matchInfo = { found_slug: nimegamiSlug, match_method: 'manual' };
    } else if (nimegamiSlugsData) {
        const nimegamiSlugList = Object.entries(nimegamiSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, nimegamiSlugList);
        if (match) {
            nimegamiSlug = match.found_slug;
            matchInfo = match;
        } else {
            if (homeCache) {
                try {
                    const homeList = typeof homeCache === 'string' ? JSON.parse(homeCache) : homeCache;
                    const animeInHome = homeList.find((item: any) => item.id === id);
                    if (animeInHome && animeInHome.title) {
                        const animeWithHomeTitle = { ...animeDetails, title: animeInHome.title };
                        const match = findBestMatch(animeWithHomeTitle, nimegamiSlugList);
                        if (match) {
                            nimegamiSlug = match.found_slug;
                            matchInfo = { ...match, match_method: 'home_cache' };
                        }
                    }
                } catch (e) {
                    console.error('Error parsing home cache:', e);
                }
            }
        }
    }

    if (!nimegamiSlug) {
        return [];
    }

    console.log(`[Nimegami] Found slug for anime ID ${id}: ${nimegamiSlug} (matched via ${matchInfo?.match_method || 'unknown'})`);

    const nimegamiUrl = `${process.env.NIMEGAMI_BASE_URL}/${nimegamiSlug}`;

    const response = await fetch(nimegamiUrl, { redirect: 'follow' });

    const finalUrl = response.url;
    const extractAnimeSlug = (url: string) => {
        try {
            return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
            return '';
        }
    };

    const originalSlugPart = extractAnimeSlug(nimegamiUrl);
    const finalSlugPart = extractAnimeSlug(finalUrl);

    if (originalSlugPart && finalSlugPart && originalSlugPart !== finalSlugPart) {
        console.log(`Redirect detected for slug ${nimegamiSlug}. Expected slug part ${originalSlugPart}, got ${finalSlugPart}.`);
        return [];
    }

    if (!response.ok) {
        return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const episodeList: { episode: number; title: string; data: string }[] = [];
    $('div.list_eps_stream li').each((i, el) => {
        const title = $(el).attr('title');
        const data = $(el).attr('data');
        const episodeMatch = $(el).text().match(/Episode\s+(\d+(\.\d+)?)/i);
        const episode = episodeMatch ? parseFloat(episodeMatch[1]) : 0;

        if (title && data && episode > 0) {
            episodeList.push({ episode, title, data });
        }
    });

    return episodeList.sort((a, b) => b.episode - a.episode);
}

// -- Get Animasu Episode List --
const getAnimasuEpisodeList = async (id: number, animeDetails: any) => {
    const [animasuSlugsData, homeCache] = await Promise.all([
        redis.hgetall(ANIMASU_SLUGS_KEY),
        redis.get('home:anime_list')
    ]);
    
    const animasuManualSlug = await redis.hget(getManualMapKey('animasu'), id.toString());

    let animasuSlug: string | null = null;
    let matchInfo: any = null;
    
    if (animasuManualSlug) {
        animasuSlug = animasuManualSlug as string;
        matchInfo = { found_slug: animasuSlug, match_method: 'manual' };
    } else if (animasuSlugsData) {
        const animasuSlugList = Object.entries(animasuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, animasuSlugList);
        if (match) {
            animasuSlug = match.found_slug;
            matchInfo = match;
        } else {
            if (homeCache) {
                try {
                    const homeList = typeof homeCache === 'string' ? JSON.parse(homeCache) : homeCache;
                    const animeInHome = homeList.find((item: any) => item.id === id);
                    if (animeInHome && animeInHome.title) {
                        const animeWithHomeTitle = { ...animeDetails, title: animeInHome.title };
                        const match = findBestMatch(animeWithHomeTitle, animasuSlugList);
                        if (match) {
                            animasuSlug = match.found_slug;
                            matchInfo = { ...match, match_method: 'home_cache' };
                        }
                    }
                } catch (e) {
                    console.error('Error parsing home cache:', e);
                }
            }
        }
    }

    if (!animasuSlug) {
        return [];
    }

    console.log(`[Animasu] Found slug for anime ID ${id}: ${animasuSlug} (matched via ${matchInfo?.match_method || 'unknown'})`);

    const animasuUrl = `${process.env.ANIMASU_BASE_URL}/anime/${animasuSlug}/`;

    const response = await fetch(animasuUrl, { redirect: 'follow' });

    const finalUrl = response.url;
    const extractAnimeSlug = (url: string) => {
        try {
            return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
            return '';
        }
    };

    const originalSlugPart = extractAnimeSlug(animasuUrl);
    const finalSlugPart = extractAnimeSlug(finalUrl);

    if (originalSlugPart && finalSlugPart && originalSlugPart !== finalSlugPart) {
        console.log(`Redirect detected for slug ${animasuSlug}. Expected slug part ${originalSlugPart}, got ${finalSlugPart}.`);
        return [];
    }

    if (!response.ok) {
        return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const episodeList: { episode: number; title: string; url: string }[] = [];
    $('ul#daftarepisode li').each((i, el) => {
        const linkElement = $(el).find('span.lchx a');
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

// -- Format Episode Slug --
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

// -- Generate Stream Ids --
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
            stream_id: streamId,
            resolution: embed.resolution || "default"
        };
    }).filter(Boolean);

    if (processedEmbeds.length > 0) {
        await pipeline.exec();
    }
    return processedEmbeds;
};

export const getAnimeDetail = async (id: number) => {
    const animeDetails = await getAnilistDataById(id);
    if (!animeDetails) {
        return null;
    }

    const episodeCacheKey = `${EPISODE_LIST_CACHE_KEY_PREFIX}${id}`;
    const cachedEpisodeList = await redis.get(episodeCacheKey);

    let episodeList;
    if (cachedEpisodeList) {
        episodeList = cachedEpisodeList as any[];
    } else {
        episodeList = await getSamehadakuEpisodeList(id, animeDetails);

        if (!episodeList || episodeList.length === 0) {
            episodeList = await getNimegamiEpisodeList(id, animeDetails);
        }

        if (!episodeList || episodeList.length === 0) {
            episodeList = await getAnimasuEpisodeList(id, animeDetails);
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
}

const EMBED_CACHE_KEY_PREFIX = 'embeds:';
const EMBED_CACHE_EXPIRATION_SECONDS = 3600; // 1 hour

export const getEpisodeStream = async (id: number, episode: number) => {
    const cacheKey = `${EPISODE_CACHE_KEY_PREFIX}${id}:${episode}`;
    const cachedResponse = await redis.get(cacheKey);
    if (cachedResponse) {
        return cachedResponse as any;
    }

    const animeDetails = await getAnilistDataById(id);
    if (!animeDetails) {
        return null;
    }

    const [samehadakuSlugsData, nimegamiSlugsData, animasuSlugsData, samehadakuManualSlug, nimegamiManualSlug, animasuManualSlug, homeCache] = await Promise.all([
        redis.hgetall(SLUGS_KEY),
        redis.hgetall(NIMEGAMI_SLUGS_KEY),
        redis.hgetall(ANIMASU_SLUGS_KEY),
        redis.hget(getManualMapKey('samehadaku'), id.toString()),
        redis.hget(getManualMapKey('nimegami'), id.toString()),
        redis.hget(getManualMapKey('animasu'), id.toString()),
        redis.get('home:anime_list')
    ]);

    const samehadakuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
    const nimegamiInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
    const animasuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };

    const getAnimeTitleFromHomeCache = (animeId: number) => {
        if (!homeCache) return null;
        try {
            const homeList = typeof homeCache === 'string' ? JSON.parse(homeCache) : homeCache;
            const animeInHome = homeList.find((item: any) => item.id === animeId);
            return animeInHome ? animeInHome.title : null;
        } catch (e) {
            console.error('Error parsing home cache:', e);
            return null;
        }
    };

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
        } else {
            const homeTitle = getAnimeTitleFromHomeCache(id);
            if (homeTitle) {
                const animeWithHomeTitle = { ...animeDetails, title: homeTitle };
                const match = findBestMatch(animeWithHomeTitle, samehadakuSlugList);
                if (match) {
                    samehadakuInfo.found_slug = match.found_slug;
                    samehadakuInfo.found_slug_title = match.found_slug_title;
                    samehadakuInfo.match_method = 'home_cache';
                    samehadakuInfo.episode_url = formatEpisodeSlug(process.env.SAMEHADAKU_BASE_URL, match.found_slug, episode);
                    console.log(`[Episode Route] Found Samehadaku slug using home cache title for anime ID ${id}`);
                }
            }
        }
    }

    if (nimegamiManualSlug) {
        nimegamiInfo.found_slug = nimegamiManualSlug as string;
        nimegamiInfo.found_slug_title = 'Manual Mapping';
        nimegamiInfo.match_method = 'manual';
        nimegamiInfo.episode_url = `${process.env.NIMEGAMI_BASE_URL}/${nimegamiInfo.found_slug}`;
    } else if (nimegamiSlugsData) {
        const nimegamiSlugList = Object.entries(nimegamiSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, nimegamiSlugList);
        if (match) {
            nimegamiInfo.found_slug = match.found_slug;
            nimegamiInfo.found_slug_title = match.found_slug_title;
            nimegamiInfo.match_method = match.match_method;
            nimegamiInfo.episode_url = `${process.env.NIMEGAMI_BASE_URL}/${match.found_slug}`;
        } else {
            const homeTitle = getAnimeTitleFromHomeCache(id);
            if (homeTitle) {
                const animeWithHomeTitle = { ...animeDetails, title: homeTitle };
                const match = findBestMatch(animeWithHomeTitle, nimegamiSlugList);
                if (match) {
                    nimegamiInfo.found_slug = match.found_slug;
                    nimegamiInfo.found_slug_title = match.found_slug_title;
                    nimegamiInfo.match_method = 'home_cache';
                    nimegamiInfo.episode_url = `${process.env.NIMEGAMI_BASE_URL}/${match.found_slug}`;
                    console.log(`[Episode Route] Found Nimegami slug using home cache title for anime ID ${id}`);
                }
            }
        }
    }

    if (animasuManualSlug) {
        animasuInfo.found_slug = animasuManualSlug as string;
        animasuInfo.found_slug_title = 'Manual Mapping';
        animasuInfo.match_method = 'manual';
        animasuInfo.episode_url = `${process.env.ANIMASU_BASE_URL}/nonton-${animasuInfo.found_slug}-episode-${episode}/`;
    } else if (animasuSlugsData) {
        const animasuSlugList = Object.entries(animasuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, animasuSlugList);
        if (match) {
            animasuInfo.found_slug = match.found_slug;
            animasuInfo.found_slug_title = match.found_slug_title;
            animasuInfo.match_method = match.match_method;
            animasuInfo.episode_url = `${process.env.ANIMASU_BASE_URL}/nonton-${match.found_slug}-episode-${episode}/`;
        } else {
            const homeTitle = getAnimeTitleFromHomeCache(id);
            if (homeTitle) {
                const animeWithHomeTitle = { ...animeDetails, title: homeTitle };
                const match = findBestMatch(animeWithHomeTitle, animasuSlugList);
                if (match) {
                    animasuInfo.found_slug = match.found_slug;
                    animasuInfo.found_slug_title = match.found_slug_title;
                    animasuInfo.match_method = 'home_cache';
                    animasuInfo.episode_url = `${process.env.ANIMASU_BASE_URL}/nonton-${match.found_slug}-episode-${episode}/`;
                    console.log(`[Episode Route] Found Animasu slug using home cache title for anime ID ${id}`);
                }
            }
        }
    }

    if (!samehadakuInfo.found_slug && !nimegamiInfo.found_slug && !animasuInfo.found_slug) {
        return { error: `Could not find a matching slug for ID ${id} from any source.` };
    }

    const [nimegamiEpisodeData, animasuEpisodeUrl] = await Promise.all([
        (async () => {
            if (nimegamiInfo.found_slug) {
                const episodeList = await getNimegamiEpisodeList(id, animeDetails);
                const foundEpisode = episodeList.find(e => e.episode === episode);
                return foundEpisode ? foundEpisode.data : null;
            }
            return null;
        })(),
        (async () => {
            if (animasuInfo.found_slug) {
                const episodeList = await getAnimasuEpisodeList(id, animeDetails);
                const foundEpisode = episodeList.find(e => e.episode === episode);
                return foundEpisode ? foundEpisode.url : null;
            }
            return null;
        })()
    ]);

    const samehadakuEmbedCacheKey = samehadakuInfo.episode_url ? `${EMBED_CACHE_KEY_PREFIX}${samehadakuInfo.episode_url}` : null;
    const nimegamiEmbedCacheKey = nimegamiEpisodeData ? `${EMBED_CACHE_KEY_PREFIX}${nimegamiEpisodeData}` : null;
    const animasuEmbedCacheKey = animasuEpisodeUrl ? `${EMBED_CACHE_KEY_PREFIX}${animasuEpisodeUrl}` : null;

    const [cachedSamehadakuEmbeds, cachedNimegamiEmbeds, cachedAnimasuEmbeds] = await Promise.all([
        samehadakuEmbedCacheKey ? redis.get(samehadakuEmbedCacheKey) : Promise.resolve(null),
        nimegamiEmbedCacheKey ? redis.get(nimegamiEmbedCacheKey) : Promise.resolve(null),
        animasuEmbedCacheKey ? redis.get(animasuEmbedCacheKey) : Promise.resolve(null)
    ]);

    let samehadakuEmbeds: any[] = [];
    let nimegamiEmbeds: any[] = [];
    let animasuEmbeds: any[] = [];

    const embedFetchPromises: Promise<void>[] = [];

    if (samehadakuInfo.episode_url) {
        if (cachedSamehadakuEmbeds) {
            samehadakuEmbeds = JSON.parse(cachedSamehadakuEmbeds as string);
        } else {
            embedFetchPromises.push(
                getSamehadakuEmbeds(samehadakuInfo.episode_url).then(embeds => {
                    samehadakuEmbeds = embeds;
                    if (samehadakuEmbedCacheKey) {
                        redis.set(samehadakuEmbedCacheKey, JSON.stringify(embeds), { ex: EMBED_CACHE_EXPIRATION_SECONDS });
                    }
                }).catch(error => {
                    console.error(`Error fetching Samehadaku embeds: ${error}`);
                    samehadakuEmbeds = [];
                })
            );
        }
    }

    if (nimegamiEpisodeData) {
        if (cachedNimegamiEmbeds) {
            nimegamiEmbeds = JSON.parse(cachedNimegamiEmbeds as string);
        } else {
            embedFetchPromises.push(
                getNimegamiEmbeds(nimegamiEpisodeData).then(embeds => {
                    nimegamiEmbeds = embeds;
                    if (nimegamiEmbedCacheKey) {
                        redis.set(nimegamiEmbedCacheKey, JSON.stringify(embeds), { ex: EMBED_CACHE_EXPIRATION_SECONDS });
                    }
                }).catch(error => {
                    console.error(`Error fetching Nimegami embeds: ${error}`);
                    nimegamiEmbeds = [];
                })
            );
        }
    }

    if (animasuEpisodeUrl) {
        if (cachedAnimasuEmbeds) {
            animasuEmbeds = JSON.parse(cachedAnimasuEmbeds as string);
        } else {
            embedFetchPromises.push(
                getAnimasuEmbeds(animasuEpisodeUrl).then(embeds => {
                    animasuEmbeds = embeds;
                    if (animasuEmbedCacheKey) {
                        redis.set(animasuEmbedCacheKey, JSON.stringify(embeds), { ex: EMBED_CACHE_EXPIRATION_SECONDS });
                    }
                }).catch(error => {
                    console.error(`Error fetching Animasu embeds: ${error}`);
                    animasuEmbeds = [];
                })
            );
        }
    }

    await Promise.all(embedFetchPromises);

    const [samehadakuStreams, nimegamiStreams, animasuStreams] = await Promise.all([
        generateStreamIds(samehadakuEmbeds),
        generateStreamIds(nimegamiEmbeds),
        generateStreamIds(animasuEmbeds)
    ]);

    const response = {
        anilist_id: id,
        episode: episode,
        sources: {
            samehadaku: samehadakuInfo,
            nimegami: nimegamiInfo,
            animasu: animasuInfo
        },
        streams: {
            samehadaku: samehadakuStreams,
            nimegami: nimegamiStreams,
            animasu: animasuStreams
        }
    };

    await redis.set(cacheKey, response, { ex: EPISODE_CACHE_EXPIRATION_SECONDS });

    return response;
}
