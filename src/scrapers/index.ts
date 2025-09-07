import 'dotenv/config';
import { startAnimesailScraping } from './animesail_scraper';
import { startSamehadakuScraping } from './samehadaku_scraper';

async function scrapeAll() {
    console.log('--- Starting All Scrapers ---');
    
    console.log('\n');
    await startAnimesailScraping();
    console.log('\n');
    
    console.log('--- Animesail scraping finished. Starting Samehadaku scraper in 5 seconds... ---');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('\n');

    await startSamehadakuScraping();
    
    console.log('\n');
    console.log('--- All scraping tasks completed. ---');
}

scrapeAll();
