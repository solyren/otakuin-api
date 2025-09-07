import * as cheerio from 'cheerio';
import { redis } from './redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';
import axios from 'axios';

// @ts-ignore
const agent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});

setGlobalDispatcher(agent);

const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

const animesailFetchOptions = {
    headers: {
        'User-Agent': FAKE_USER_AGENT,
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

async function resolvePlayer(url: string, playerName: string): Promise<string | null> {
    console.log(`Resolving ${playerName} URL: ${url}`);
    try {
        const headers = {
            'User-Agent': FAKE_USER_AGENT,
            'Referer': 'https://154.26.137.28/',
            'Cookie': '_as_ipin_tz=UTC; _as_ipin_lc=en-US; _as_ipin_ct=ID'
        };

        const { data: html } = await axios.get(url, { headers });
        const $ = cheerio.load(html);
        const videoSource = $('video source').first().attr('src');

        if (videoSource) {
            console.log(`Found ${playerName} stream source: ${videoSource}`);
            return videoSource;
        }
        console.log(`Could not find video source in ${playerName} HTML.`);
        return null;
    } catch (error) {
        console.error(`Failed to resolve ${playerName} URL ${url}:`, error);
        return null;
    }
}

async function getSamehadakuEmbeds(url: string): Promise<any[]> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch Samehadaku page: ${url}`);
            return [];
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const playerOptions = $('.server_option .east_player_option');
        const post_id = playerOptions.first().data('post');

        if (!post_id) {
            console.error('Could not find post_id on Samehadaku page.');
            return [];
        }

        const embeds = [];

        for (const el of playerOptions.toArray()) {
            const option = $(el);
            const serverName = option.text().trim();
            const nume = option.data('nume');
            const type = option.data('type');

            const ajaxResponse = await fetch('https://v1.samehadaku.how/wp-admin/admin-ajax.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                },
                body: `action=player_ajax&post=${post_id}&nume=${nume}&type=${type}`,
            });

            if (ajaxResponse.ok) {
                const ajaxData = await ajaxResponse.text();
                const $iframeDoc = cheerio.load(ajaxData);
                let iframeSrc = $iframeDoc('iframe').attr('src');

                if (iframeSrc) {
                    let resolvedUrl: string | null = iframeSrc;
                    if (iframeSrc.includes('/utils/player/')) {
                        const playerName = iframeSrc.split('/utils/player/')[1].split('/')[0];
                        resolvedUrl = await resolvePlayer(iframeSrc, playerName);
                    }

                    if (resolvedUrl) {
                        embeds.push({ server: serverName, url: resolvedUrl });
                    } else {
                        console.warn(`Skipping unresolved URL from Samehadaku for server: ${serverName}`);
                    }
                }
            }
        }
        return embeds;

    } catch (error) {
        console.error('Error scraping Samehadaku embeds:', error);
        return [];
    }
}

async function getAnimesailEmbeds(url: string): Promise<any[]> {
    try {
        const response = await fetch(url, animesailFetchOptions);
        if (!response.ok) {
            console.error(`Failed to fetch AnimeSail page: ${url}`);
            return [];
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const embeds = [];
        const mirrorOptions = $('select.mirror option');

        for (const el of mirrorOptions.toArray()) {
            const option = $(el);
            const serverName = option.text().trim();
            const base64Embed = option.data('em');

            if (!serverName || !base64Embed) continue;

            try {
                const decodedIframe = Buffer.from(base64Embed, 'base64').toString('utf-8');
                const $iframe = cheerio.load(decodedIframe);
                const originalUrl = $iframe('iframe').attr('src');

                if (originalUrl) {
                    let resolvedUrl: string | null = originalUrl;
                    if (originalUrl.includes('/utils/player/')) {
                        const playerName = originalUrl.split('/utils/player/')[1].split('/')[0];
                        resolvedUrl = await resolvePlayer(originalUrl, playerName);
                    }

                    if (resolvedUrl) {
                        embeds.push({ server: serverName, url: resolvedUrl });
                    } else {
                        console.warn(`Skipping unresolved URL for server: ${serverName}`);
                    }
                }
            } catch (e) {
                console.error(`Failed to process embed for server: ${serverName}`, e);
            }
        }

        return embeds;

    } catch (error) {
        console.error('Error scraping AnimeSail embeds:', error);
        return [];
    }
}


export { getSamehadakuEmbeds, getAnimesailEmbeds };