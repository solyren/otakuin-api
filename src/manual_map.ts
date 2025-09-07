import { redis } from './lib/redis';
import fs from 'fs/promises';
import path from 'path';

const getManualMapKey = (source: string) => `manual_map:${source}:anilist_id_to_slug`;
const getMapFilePath = (source: string) => path.join(__dirname, 'data', `manual_map_${source}.json`);

const readMapFile = async (source: string): Promise<Record<string, string>> => {
    const filePath = getMapFilePath(source);
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.warn(`Could not read map file for ${source}, starting fresh.`);
        return {};
    }
};

const writeMapFile = async (source: string, data: Record<string, string>) => {
    const filePath = getMapFilePath(source);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const mapIdToSlug = async () => {
    const source = process.argv[2];
    const anilistId = process.argv[3];
    const slug = process.argv[4];

    if (!source || !anilistId || !slug) {
        console.error('Error: Please provide source, Anilist ID, and a slug.');
        console.log('Usage: bun run map <source> <anilistId> <slug>');
        console.log('Available sources: samehadaku, animesail');
        process.exit(1);
    }

    if (!['samehadaku', 'animesail'].includes(source)) {
        console.error('Error: Invalid source. Must be "samehadaku" or "animesail".');
        process.exit(1);
    }

    const id = parseInt(anilistId, 10);
    if (isNaN(id)) {
        console.error('Error: Anilist ID must be a number.');
        process.exit(1);
    }

    const MANUAL_MAP_KEY = getManualMapKey(source);
    
    try {
        // Update the JSON file
        const mapData = await readMapFile(source);
        mapData[id] = slug;
        await writeMapFile(source, mapData);
        console.log(`Successfully updated ${getMapFilePath(source)}`);

        // Also update Redis for fast lookups
        await redis.hset(MANUAL_MAP_KEY, { [id]: slug });
        console.log(`Successfully mapped Anilist ID ${id} to slug in Redis for ${source}: ${slug}`);

    } catch (error) {
        console.error('Failed to map ID to slug:', error);
        process.exit(1);
    }
};

mapIdToSlug();