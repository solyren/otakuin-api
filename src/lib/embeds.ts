import * as cheerio from 'cheerio';
import { redis } from './redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';
import axios from 'axios';
import https from 'https';

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
    for (let i = 0; i < 3; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': FAKE_USER_AGENT,
                    'Referer': url,
                    'Cookie': '_as_ipin_tz=UTC; _as_ipin_lc=en-US; _as_ipin_ct=SG',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            });

            if (response.status === 200) {
                const html = response.data;
                const $ = cheerio.load(html);
                const videoSource = $('video source').first().attr('src');

                if (videoSource) {
                    return videoSource;
                } else if (i === 0) {
                    console.log(`resolvePlayer for ${url} failed. Received HTML:`);
                    console.log(html);
                }
            }
        } catch (error) {
            console.error(`Error resolving player (attempt ${i + 1}):`, error);
        }

        if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    return null;
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
    for (let i = 0; i < 3; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': FAKE_USER_AGENT,
                    'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=SG',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            });

            if (response.status === 200) {
                const html = response.data;
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
                    }
                }

                if (embeds.length > 0) {
                    return embeds;
                } else if (i === 0) {
                    console.log(`getAnimesailEmbeds for ${url} failed. Received HTML:`);
                    console.log(html);
                }
            }
        } catch (error) {
            console.error(`Error getting Animesail embeds (attempt ${i + 1}):`, error);
        }

        if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    return [];
}


export { getSamehadakuEmbeds, getAnimesailEmbeds };
