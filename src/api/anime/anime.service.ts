
import { redis } from '../../lib/redis';
import Fuse from 'fuse.js';
import { getSamehadakuEmbeds, getNimegamiEmbeds, getAnimesuEmbeds } from '../../lib/embeds';
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
const ANIMESU_SLUGS_KEY = 'slugs:animesu';

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

// -- Get AnimeSU Episode List --
const getAnimesuEpisodeList = async (id: number, animeDetails: any) => {
    const [animesuSlugsData, homeCache] = await Promise.all([
        redis.hgetall(ANIMESU_SLUGS_KEY),
        redis.get('home:anime_list')
    ]);
    
    const animesuManualSlug = await redis.hget(getManualMapKey('animesu'), id.toString());

    let animesuSlug: string | null = null;
    let matchInfo: any = null;
    
    if (animesuManualSlug) {
        animesuSlug = animesuManualSlug as string;
        matchInfo = { found_slug: animesuSlug, match_method: 'manual' };
    } else if (animesuSlugsData) {
        const animesuSlugList = Object.entries(animesuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, animesuSlugList);
        if (match) {
            animesuSlug = match.found_slug;
            matchInfo = match;
        } else {
            if (homeCache) {
                try {
                    const homeList = typeof homeCache === 'string' ? JSON.parse(homeCache) : homeCache;
                    const animeInHome = homeList.find((item: any) => item.id === id);
                    if (animeInHome && animeInHome.title) {
                        const animeWithHomeTitle = { ...animeDetails, title: animeInHome.title };
                        const match = findBestMatch(animeWithHomeTitle, animesuSlugList);
                        if (match) {
                            animesuSlug = match.found_slug;
                            matchInfo = { ...match, match_method: 'home_cache' };
                        }
                    }
                } catch (e) {
                    console.error('Error parsing home cache:', e);
                }
            }
        }
    }

    if (!animesuSlug) {
        return [];
    }

    console.log(`[AnimeSU] Found slug for anime ID ${id}: ${animesuSlug} (matched via ${matchInfo?.match_method || 'unknown'})`);

    const animesuUrl = `https://v1.animasu.top/anime/${animesuSlug}/`;

    const response = await fetch(animesuUrl, { redirect: 'follow' });

    const finalUrl = response.url;
    const extractAnimeSlug = (url: string) => {
        try {
            return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
            return '';
        }
    };

    const originalSlugPart = extractAnimeSlug(animesuUrl);
    const finalSlugPart = extractAnimeSlug(finalUrl);

    if (originalSlugPart && finalSlugPart && originalSlugPart !== finalSlugPart) {
        console.log(`Redirect detected for slug ${animesuSlug}. Expected slug part ${originalSlugPart}, got ${finalSlugPart}.`);
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
            stream_id: streamId
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
            episodeList = await getAnimesuEpisodeList(id, animeDetails);
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

    const [samehadakuSlugsData, nimegamiSlugsData, animesuSlugsData, samehadakuManualSlug, nimegamiManualSlug, animesuManualSlug, homeCache] = await Promise.all([
        redis.hgetall(SLUGS_KEY),
        redis.hgetall(NIMEGAMI_SLUGS_KEY),
        redis.hgetall(ANIMESU_SLUGS_KEY),
        redis.hget(getManualMapKey('samehadaku'), id.toString()),
        redis.hget(getManualMapKey('nimegami'), id.toString()),
        redis.hget(getManualMapKey('animesu'), id.toString()),
        redis.get('home:anime_list')
    ]);

    const samehadakuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
    const nimegamiInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };
    const animesuInfo: any = { found_slug_title: null, found_slug: null, episode_url: null, match_method: null };

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

    if (animesuManualSlug) {
        animesuInfo.found_slug = animesuManualSlug as string;
        animesuInfo.found_slug_title = 'Manual Mapping';
        animesuInfo.match_method = 'manual';
        animesuInfo.episode_url = `https://v1.animasu.top/nonton-${animesuInfo.found_slug}-episode-${episode}/`;
    } else if (animesuSlugsData) {
        const animesuSlugList = Object.entries(animesuSlugsData).map(([title, slug]) => ({ title, slug: slug as string }));
        const match = findBestMatch(animeDetails, animesuSlugList);
        if (match) {
            animesuInfo.found_slug = match.found_slug;
            animesuInfo.found_slug_title = match.found_slug_title;
            animesuInfo.match_method = match.match_method;
            animesuInfo.episode_url = `https://v1.animasu.top/nonton-${match.found_slug}-episode-${episode}/`;
        } else {
            const homeTitle = getAnimeTitleFromHomeCache(id);
            if (homeTitle) {
                const animeWithHomeTitle = { ...animeDetails, title: homeTitle };
                const match = findBestMatch(animeWithHomeTitle, animesuSlugList);
                if (match) {
                    animesuInfo.found_slug = match.found_slug;
                    animesuInfo.found_slug_title = match.found_slug_title;
                    animesuInfo.match_method = 'home_cache';
                    animesuInfo.episode_url = `https://v1.animasu.top/nonton-${match.found_slug}-episode-${episode}/`;
                    console.log(`[Episode Route] Found AnimeSU slug using home cache title for anime ID ${id}`);
                }
            }
        }
    }

    if (!samehadakuInfo.found_slug && !nimegamiInfo.found_slug && !animesuInfo.found_slug) {
        return { error: `Could not find a matching slug for ID ${id} from any source.` };
    }

    let nimegamiEpisodeData: string | null = null;
    if (nimegamiInfo.found_slug) {
        const episodeList = await getNimegamiEpisodeList(id, animeDetails);
        const foundEpisode = episodeList.find(e => e.episode === episode);
        if (foundEpisode) {
            nimegamiEpisodeData = foundEpisode.data;
        }
    }

    // Get AnimeSU episode URL
    let animesuEpisodeUrl: string | null = null;
    if (animesuInfo.found_slug) {
        const episodeList = await getAnimesuEpisodeList(id, animeDetails);
        const foundEpisode = episodeList.find(e => e.episode === episode);
        if (foundEpisode) {
            animesuEpisodeUrl = foundEpisode.url;
        }
    }

    const [samehadakuEmbeds, nimegamiEmbeds, animesuEmbeds] = await Promise.all([
        samehadakuInfo.episode_url ? getSamehadakuEmbeds(samehadakuInfo.episode_url) : Promise.resolve([]),
        nimegamiEpisodeData ? getNimegamiEmbeds(nimegamiEpisodeData) : Promise.resolve([]),
        animesuEpisodeUrl ? getAnimesuEmbeds(animesuEpisodeUrl) : Promise.resolve([])
    ]);

    const [samehadakuStreams, nimegamiStreams, animesuStreams] = await Promise.all([
        generateStreamIds(samehadakuEmbeds),
        generateStreamIds(nimegamiEmbeds),
        generateStreamIds(animesuEmbeds)
    ]);

    const response = {
        anilist_id: id,
        episode: episode,
        sources: {
            samehadaku: samehadakuInfo,
            nimegami: nimegamiInfo,
            animesu: animesuInfo
        },
        streams: {
            samehadaku: samehadakuStreams,
            nimegami: nimegamiStreams,
            animesu: animesuStreams
        }
    };

    await redis.set(cacheKey, response, { ex: EPISODE_CACHE_EXPIRATION_SECONDS });

    return response;
}
