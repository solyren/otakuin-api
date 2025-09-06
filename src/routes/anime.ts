
import { Elysia } from 'elysia';

const getAnimeDetails = async (id: number) => {
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

    const variables = {
        id
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

export const anime = new Elysia().get('/anime/:id', async ({ params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) {
        return { error: 'Invalid ID' };
    }

    const animeDetails = await getAnimeDetails(id);

    if (!animeDetails) {
        return { error: 'Anime not found' };
    }

    return {
        id: animeDetails.id,
        title: animeDetails.title.romaji || animeDetails.title.english,
        synopsis: animeDetails.description,
        genres: animeDetails.genres,
        thumbnail: animeDetails.coverImage.large || animeDetails.coverImage.medium
    };
});
