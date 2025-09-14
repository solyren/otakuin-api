import 'dotenv/config';
import { startAnimesailScraping } from './animesail_scraper';
import { startSamehadakuScraping } from './samehadaku_scraper';

// --- Scrape All ---
async function scrapeAll() {
    await startAnimesailScraping();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await startSamehadakuScraping();
}

scrapeAll();