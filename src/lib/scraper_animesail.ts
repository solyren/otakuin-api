
import * as cheerio from 'cheerio';
import { redis } from './redis';

const BASE_URL = 'https://154.26.137.28/anime/';
const SOURCE_KEY = 'slugs:animesail';

const fetchOptions = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

// The website uses an IP address with a certificate for a different name,
// so we need to disable certificate validation.
// This is a workaround for the fact that fetch() in Node.js 18+
// does not have a built-in way to ignore certificate errors.
// We will use a custom agent.
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';

// @ts-ignore
const agent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});

setGlobalDispatcher(agent);


async function startScraping() {
    const url = BASE_URL;
    console.log(`Scraping page: ${url}`);

    try {
        // Let's clear any old data first
        await redis.del(SOURCE_KEY);
        console.log('Cleared old slugs from Redis.');

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            console.log(`Failed to fetch page. Status: ${response.status}`);
            return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const animeLinks = $('div.soralist a.series');

        if (animeLinks.length === 0) {
            console.log(`No anime found on the page.`);
            return;
        }

        const pipeline = redis.pipeline();

        animeLinks.each((i, el) => {
            const slug = $(el).attr('href') || '';
            const title = $(el).text().trim();

            if (title && slug) {
                pipeline.hset(SOURCE_KEY, { [title]: slug });
            }
        });

        await pipeline.exec();
        console.log(`Successfully processed ${animeLinks.length} anime.`);

        const total = await redis.hlen(SOURCE_KEY);
        console.log(`Total slugs stored for AnimeSail: ${total}`);

    } catch (error) {
        console.error(`An error occurred while scraping:`, error);
    }
}

startScraping();
