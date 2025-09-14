import { redis } from './lib/redis';
import fs from 'fs/promises';
import path from 'path';

const getManualMapKey = (source: string) => `manual_map:${source}:anilist_id_to_slug`;
const getMapFilePath = (source: string) => path.join(__dirname, 'data', `manual_map_${source}.json`);

// --- Sync Map to Redis ---
const syncMapToRedis = async () => {
    const source = process.argv[2];

    if (!source) {
        console.error('Error: Please provide a source.');
        console.log('Usage: bun run sync:map <source>');
        console.log('Available sources: samehadaku, animesail');
        process.exit(1);
    }

    if (!['samehadaku', 'animesail'].includes(source)) {
        console.error('Error: Invalid source. Must be "samehadaku" or "animesail".');
        process.exit(1);
    }

    const MAP_FILE_PATH = getMapFilePath(source);
    const MANUAL_MAP_KEY = getManualMapKey(source);

    let mapData: Record<string, string> = {};

    try {
        const fileContent = await fs.readFile(MAP_FILE_PATH, 'utf-8');
        mapData = JSON.parse(fileContent);
    } catch (error) {
        process.exit(1);
    }

    const entries = Object.entries(mapData);

    if (entries.length === 0) {
        return;
    }

    try {
        const pipeline = redis.pipeline();
        for (const [id, slug] of entries) {
            pipeline.hset(MANUAL_MAP_KEY, { [id]: slug });
        }
        await pipeline.exec();

    } catch (error) {
        process.exit(1);
    }
};

syncMapToRedis();