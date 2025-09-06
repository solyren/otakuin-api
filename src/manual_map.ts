
import { redis } from './lib/redis';
import fs from 'fs/promises';
import path from 'path';

const MANUAL_MAP_KEY = 'manual_map:anilist_id_to_slug';
const MAP_FILE_PATH = path.join(__dirname, 'data', 'manual_map.json');

const readMapFile = async (): Promise<Record<string, string>> => {
    try {
        const fileContent = await fs.readFile(MAP_FILE_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        // If file doesn't exist or is invalid json, start with an empty object
        console.warn('Could not read map file, starting fresh.');
        return {};
    }
};

const writeMapFile = async (data: Record<string, string>) => {
    await fs.writeFile(MAP_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

const mapIdToSlug = async () => {
    const anilistId = process.argv[2];
    const slug = process.argv[3];

    if (!anilistId || !slug) {
        console.error('Error: Please provide both an Anilist ID and a slug.');
        console.log('Usage: bun run map <anilistId> <slug>');
        process.exit(1);
    }

    const id = parseInt(anilistId, 10);
    if (isNaN(id)) {
        console.error('Error: Anilist ID must be a number.');
        process.exit(1);
    }

    try {
        // Update the JSON file
        const mapData = await readMapFile();
        mapData[id] = slug;
        await writeMapFile(mapData);
        console.log(`Successfully updated ${MAP_FILE_PATH}`);

        // Also update Redis for fast lookups
        await redis.hset(MANUAL_MAP_KEY, { [id]: slug });
        console.log(`Successfully mapped Anilist ID ${id} to slug in Redis: ${slug}`);

    } catch (error) {
        console.error('Failed to map ID to slug:', error);
        process.exit(1);
    }
};

mapIdToSlug();
