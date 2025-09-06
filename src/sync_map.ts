
import { redis } from './lib/redis';
import fs from 'fs/promises';
import path from 'path';

const MANUAL_MAP_KEY = 'manual_map:anilist_id_to_slug';
const MAP_FILE_PATH = path.join(__dirname, 'data', 'manual_map.json');

const syncMapToRedis = async () => {
    console.log(`Reading manual map from: ${MAP_FILE_PATH}`);
    let mapData: Record<string, string> = {};

    try {
        const fileContent = await fs.readFile(MAP_FILE_PATH, 'utf-8');
        mapData = JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading or parsing map file. Nothing to sync.', error);
        process.exit(1);
    }

    const entries = Object.entries(mapData);

    if (entries.length === 0) {
        console.log('Map file is empty. No data to sync to Redis.');
        return;
    }

    console.log(`Found ${entries.length} entries to sync to Redis...`);

    try {
        // Use a pipeline for efficiency
        const pipeline = redis.pipeline();
        for (const [id, slug] of entries) {
            pipeline.hset(MANUAL_MAP_KEY, { [id]: slug });
        }
        await pipeline.exec();

        // For verification, we can check the number of items in the hash
        const redisCount = await redis.hlen(MANUAL_MAP_KEY);
        console.log(`Successfully synced ${redisCount} mappings to Redis hash "${MANUAL_MAP_KEY}".`);

    } catch (error) {
        console.error('Failed to sync mappings to Redis:', error);
        process.exit(1);
    }
};

syncMapToRedis();
