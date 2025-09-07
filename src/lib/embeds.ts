import * as cheerio from 'cheerio';
import { redis } from './redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';
import axios from 'axios';

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

// --- Resolve Player ---
async function resolvePlayer(url: string, playerName: string): Promise<string | null> {
    try {
        const headers = {
            'User-Agent': FAKE_USER_AGENT,
            'Referer': process.env.ANIMESAIL_BASE_URL,
            'Cookie': '_as_ipin_tz=UTC; _as_ipin_lc=en-US; _as_ipin_ct=ID'
        };

        const { data: html } = await axios.get(url, { headers });
        const $ = cheerio.load(html);
        const videoSource = $('video source').first().attr('src');

        if (videoSource) {
            return videoSource;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// --- Get Samehadaku Embeds ---
async function getSamehadakuEmbeds(url: string): Promise<any[]> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return [];
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const playerOptions = $('.server_option .east_player_option');
        const post_id = playerOptions.first().data('post');

        if (!post_id) {
            return [];
        }

        const embeds = [];

        for (const el of playerOptions.toArray()) {
            const option = $(el);
            const serverName = option.text().trim();
            const nume = option.data('nume');
            const type = option.data('type');

            const ajaxResponse = await fetch(`${process.env.SAMEHADAKU_BASE_URL}/wp-admin/admin-ajax.php`, {
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
                    }
                }
            }
        }
        return embeds;

    } catch (error) {
        return [];
    }
}

// --- Get Animesail Embeds ---
async function getAnimesailEmbeds(url: string): Promise<any[]> {
    try {
        const response = await fetch(url, animesailFetchOptions);
        if (!response.ok) {
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
                    }
                }
            } catch (e) {
                // ignore
            }
        }

        return embeds;

    } catch (error) {
        return [];
    }
}


export { getSamehadakuEmbeds, getAnimesailEmbeds };
