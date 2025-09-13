import Fuse from 'fuse.js';
import { redis } from './redis';

// --- Normalize Slug ---
export const normalizeSlug = (slug: string) => {
    let lastPart = slug.split('/').filter(Boolean).pop() || '';
    lastPart = lastPart.replace(/-episode-\d+.*$/, '');
    return lastPart.replace(/-/g, ' ');
};

// --- Get Anilist Data by Fuzzy Search ---
export const getAnilistData = async (originalSearch: string) => {
    const searchTerms = [
        originalSearch,
        originalSearch.replace(/(season|part|cour) \d+/i, '').trim(),
    ];
    const uniqueSearchTerms = [...new Set(searchTerms)].filter(Boolean);

    for (const searchTerm of uniqueSearchTerms) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`[Anilist] Searching for: "${searchTerm}"`);
        const query = `
        query ($search: String) {
            Page (page: 1, perPage: 10) {
                media (search: $search, type: ANIME) {
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
                    averageScore
                }
            }
        }
        `;

        const variables = { search: searchTerm };

        try {
            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                console.log(`[Anilist] API request failed for "${searchTerm}" with status: ${response.status}`);
                continue;
            }

            const { data } = await response.json();
            if (data.Page.media && data.Page.media.length > 0) {
                const fuse = new Fuse(data.Page.media, {
                    keys: ['title.romaji', 'title.english', 'title.native'],
                    includeScore: true,
                    threshold: 0.6,
                });
                const result = fuse.search(originalSearch);
                console.log(`Fuse.js results for "${originalSearch}" (using search term "${searchTerm}"):`, result.map(r => ({ title: r.item.title.romaji, score: r.score })));
                
                if (result.length > 0) {
                    const seasonMatch = originalSearch.match(/(season|part|cour) (\d+)/i);
                    if (seasonMatch && result.length > 1) {
                        const seasonNumber = seasonMatch[2];
                        const topResultTitle = ((result[0].item.title.romaji || '') + (result[0].item.title.english || '')).toLowerCase();

                        if (!topResultTitle.includes(seasonNumber)) {
                            const betterMatch = result.find(r => {
                                const title = ((r.item.title.romaji || '') + (r.item.title.english || '')).toLowerCase();
                                return title.includes(seasonNumber) || title.includes(`${seasonNumber}nd`) || title.includes(`${seasonNumber}rd`) || title.includes(`${seasonNumber}th`);
                            });

                            if (betterMatch) {
                                console.log(`[Anilist] Tie-breaker: Chose "${betterMatch.item.title.romaji}" over "${result[0].item.title.romaji}"`);
                                return betterMatch.item;
                            }
                        }
                    }
                    
                    return result[0].item;
                }

                return data.Page.media[0];
            }
        } catch (error) {
            console.error(`[Anilist] Error during fetch for "${searchTerm}":`, error);
        }
        console.log(`[Anilist] No media found for "${searchTerm}".`);
    }

    console.log(`[Anilist] Could not find any media for original search "${originalSearch}" after multiple attempts.`);
    return null;
};

// --- Get Anilist Data By Id (with cache) ---
const ANILIST_CACHE_KEY_PREFIX = 'anilist:';
const ANILIST_CACHE_EXPIRATION_SECONDS = 86400;

export const getAnilistDataById = async (id: number) => {
    const cacheKey = `${ANILIST_CACHE_KEY_PREFIX}${id}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`[Anilist] Getting data by ID: ${id}`);

    const query = `
    query ($id: Int) {
        Media (id: $id, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
            status
            description(asHtml: false)
            startDate { year month day }
            endDate { year month day }
            seasonYear
            episodes
            duration
            trailer { id site thumbnail }
            coverImage { large }
            bannerImage
            genres
            averageScore
            studios { nodes { name } }
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

        if (!response.ok) {
            console.log(`[Anilist] API request failed for ID "${id}" with status: ${response.status}`);
            return null;
        }
        const { data } = await response.json();
        await redis.set(cacheKey, data.Media, { ex: ANILIST_CACHE_EXPIRATION_SECONDS });
        return data.Media;
    } catch (error) {
        console.error(`[Anilist] Error during fetch for ID "${id}":`, error);
        return null;
    }
};

// --- Search Anilist ---
const SEARCH_CACHE_EXPIRATION_SECONDS = 3600; // 1 hour

export const searchAnilist = async (search: string, page: number, perPage: number) => {
    const cacheKey = `search:${search}:${page}:${perPage}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    }

    console.log(`[Anilist] Searching for: "${search}" with page: ${page} and perPage: ${perPage}`);
    const query = `
    query ($search: String, $page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
            }
            media (search: $search, type: ANIME, sort: POPULARITY_DESC) {
                id
                title {
                    romaji
                    english
                    native
                }
                coverImage {
                    large
                }
                averageScore
            }
        }
    }
    `;

    const variables = { search, page, perPage };

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
            console.log(`[Anilist] API request failed for "${search}" with status: ${response.status}`);
            return null;
        }

        const { data } = await response.json();
        const result = {
            pageInfo: data.Page.pageInfo,
            anime: data.Page.media.map((anime: any) => ({
                id: anime.id,
                title: anime.title,
                coverImage: anime.coverImage.large,
                rating: anime.averageScore,
            })),
        };

        await redis.set(cacheKey, JSON.stringify(result), { ex: SEARCH_CACHE_EXPIRATION_SECONDS });
        return result;
    } catch (error) {
        console.error(`[Anilist] Error during fetch for "${search}":`, error);
        return null;
    }
}

// --- Search Anilist by Genre ---
const GENRE_CACHE_EXPIRATION_SECONDS = 3600; // 1 hour

export const getAnilistByGenre = async (genre: string, page: number, perPage: number) => {
    const cacheKey = `genre:${genre}:${page}:${perPage}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    }

    console.log(`[Anilist] Searching for genre: "${genre}" with page: ${page} and perPage: ${perPage}`);
    const query = `
    query ($genre: String, $page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
            }
            media (genre_in: [$genre], type: ANIME, sort: POPULARITY_DESC) {
                id
                title {
                    romaji
                    english
                    native
                }
                coverImage {
                    large
                }
                averageScore
            }
        }
    }
    `;

    const variables = { genre, page, perPage };

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
            console.log(`[Anilist] API request failed for genre "${genre}" with status: ${response.status}`);
            return null;
        }

        const { data } = await response.json();
        const result = {
            pageInfo: data.Page.pageInfo,
            anime: data.Page.media.map((anime: any) => ({
                id: anime.id,
                title: anime.title,
                coverImage: anime.coverImage.large,
                rating: anime.averageScore,
            })),
        };

        await redis.set(cacheKey, JSON.stringify(result), { ex: GENRE_CACHE_EXPIRATION_SECONDS });
        return result;
    } catch (error) {
        console.error(`[Anilist] Error during fetch for genre "${genre}":`, error);
        return null;
    }
}