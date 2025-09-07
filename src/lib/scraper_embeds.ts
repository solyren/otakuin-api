
import * as cheerio from 'cheerio';
import { redis } from './redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';

// @ts-ignore
const agent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});

setGlobalDispatcher(agent);

const animesailFetchOptions = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Cookie': '_as_ipin_tz=UTC;_as_ipin_lc=en-US;_as_ipin_ct=ID'
    }
};

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
                const $ = cheerio.load(ajaxData);
                const iframe = $('iframe');
                if (iframe.length > 0) {
                    embeds.push({
                        server: serverName,
                        url: iframe.attr('src'),
                    });
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

        mirrorOptions.each((i, el) => {
            const option = $(el);
            const serverName = option.text().trim();
            const base64Embed = option.data('em');

            if (serverName && base64Embed) {
                try {
                    const decodedIframe = Buffer.from(base64Embed, 'base64').toString('utf-8');
                    const $ = cheerio.load(decodedIframe);
                    const iframeSrc = $('iframe').attr('src');
                    if (iframeSrc) {
                        embeds.push({
                            server: serverName,
                            url: iframeSrc,
                        });
                    }
                } catch (e) {
                    console.error(`Failed to decode or parse base64 for server: ${serverName}`, e);
                }
            }
        });

        return embeds;

    } catch (error) {
        console.error('Error scraping AnimeSail embeds:', error);
        return [];
    }
}


export { getSamehadakuEmbeds, getAnimesailEmbeds };
