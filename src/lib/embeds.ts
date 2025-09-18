import * as cheerio from 'cheerio';
import { redis } from './redis';
import { Agent } from 'https';
import { setGlobalDispatcher } from 'undici';
import axios from 'axios';
import https from 'https';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const agent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});

setGlobalDispatcher(agent);

// --- Resolve Player ---
async function resolvePlayer(url: string, playerName: string): Promise<string | null> {
    for (let i = 0; i < 3; i++) {
        try {
            const initialResponse = await axios.get(url, { headers: { 'User-Agent': getRandomUserAgent() } });
            const countryCode = initialResponse.headers['x-local'] || 'ID';

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Referer': url,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cookie': `_as_ipin_ct=${countryCode}; _as_ipin_tz=UTC; _as_ipin_lc=en-US`
                }
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

// --- Get AnimeSU Embeds ---
async function getAnimasuEmbeds(url: string): Promise<any[]> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return [];
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const embeds = [];
        const mirrorOptions = $('select.mirror option').toArray();

        // Skip the first option as it's just a placeholder
        for (let i = 1; i < mirrorOptions.length; i++) {
            const option = $(mirrorOptions[i]);
            const encodedValue = option.attr('value');
            const serverName = option.text().trim();

            if (encodedValue) {
                try {
                    // Decode the Base64 encoded HTML
                    const decodedHtml = Buffer.from(encodedValue, 'base64').toString('utf-8');
                    const $decoded = cheerio.load(decodedHtml);
                    const iframeSrc = $decoded('iframe').attr('src');

                    if (iframeSrc) {
                        let resolvedUrl: string | null = iframeSrc;
                        // AnimeSU uses different player URLs, we'll just return the iframe src directly
                        if (resolvedUrl) {
                            embeds.push({ server: serverName, url: resolvedUrl });
                        }
                    }
                } catch (decodeError) {
                    console.error(`Error decoding embed for ${url}:`, decodeError);
                }
            }
        }
        return embeds;

    } catch (error) {
        console.error(`Error in getAnimasuEmbeds for ${url}:`, error);
        return [];
    }
}

// --- Get DlBerkasDrive Servers ---
async function getDlBerkasDriveServers(baseUrl: string, resolution: string, useResolutionOnly: boolean = false): Promise<any[]> {
    try {
        // Tambahkan penanganan untuk URL yang mungkin sudah memiliki parameter
        const urlObj = new URL(baseUrl);
        // Hapus parameter server jika ada
        urlObj.searchParams.delete('server');
        const cleanUrl = urlObj.toString();
        
        const response = await fetch(cleanUrl, { 
            headers: { 
                'User-Agent': getRandomUserAgent() 
            } 
        });
        if (!response.ok) {
            return [];
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const servers = [];
        $('.daftar_server li').each((i, el) => {
            const serverElement = $(el);
            const serverNumber = serverElement.attr('server');
            
            if (serverNumber) {
                const serverUrl = `${cleanUrl}&server=${serverNumber}`;
                
                let serverName;
                if (useResolutionOnly) {
                    // Untuk nimegami, tampilkan resolusi + nomor server
                    serverName = `${resolution} server ${serverNumber}`;
                } else {
                    // Format nama server: "dlberkas {resolusi} server {nomor}"
                    serverName = `dlberkas ${resolution} server ${serverNumber}`;
                }
                
                servers.push({ 
                    server: serverName, 
                    url: serverUrl 
                });
            }
        });

        return servers;
    } catch (error) {
        console.error('Error getting DlBerkasDrive servers:', error);
        return [];
    }
}

// --- Get Nimegami Embeds ---
async function getNimegamiEmbeds(data: string): Promise<any[]> {
    try {
        const decodedData = Buffer.from(data, 'base64').toString('utf-8');
        const streams = JSON.parse(decodedData);

        const embeds = [];
        for (const stream of streams) {
            if (stream.url && stream.url.length > 0) {
                const baseUrl = stream.url[0];
                
                // Jika URL berasal dari dl.berkasdrive.com, kita perlu mem-parsing server-servernya
                if (baseUrl.includes('dl.berkasdrive.com')) {
                    const dlBerkasServers = await getDlBerkasDriveServers(baseUrl, stream.format); // Selalu sertakan info server
                    embeds.push(...dlBerkasServers);
                } else {
                    embeds.push({ server: stream.format, url: baseUrl });
                }
            }
        }
        return embeds;

    } catch (error) {
        console.error('Error in getNimegamiEmbeds:', error);
        return [];
    }
}

export { getSamehadakuEmbeds, getNimegamiEmbeds, getAnimasuEmbeds };