import 'dotenv/config';
import { startNimegamiScraping } from './nimegami_scraper';
import { startSamehadakuScraping } from './samehadaku_scraper';
import { logger, errorLogger } from '../lib/logger';

// --- Scrape All ---
async function scrapeAll() {
    logger('Starting all scrapers...');
    try {
        logger('Starting Nimegami scraper...');
        await startNimegamiScraping();
        logger('Nimegami scraper finished.');
    } catch (error: any) {
        errorLogger(new Error(`Nimegami scraper failed: ${error.message}`));
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

    try {
        logger('Starting Samehadaku scraper...');
        await startSamehadakuScraping();
        logger('Samehadaku scraper finished.');
    } catch (error: any) {
        errorLogger(new Error(`Samehadaku scraper failed: ${error.message}`));
    }
    logger('All scrapers finished.');
}

scrapeAll();