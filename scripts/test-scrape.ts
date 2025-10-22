import { load } from 'cheerio';

const testScrape = async (): Promise<void> => {
  try {
    const response = await fetch('https://v1.samehadaku.how/anime-terbaru/');
    const html = await response.text();
    const $ = load(html);

    console.log('=== Analyzing .post-show ul li ===\n');
    console.log('Total items:', $('.post-show ul li').length);

    $('.post-show ul li')
      .slice(0, 3)
      .each((i, el) => {
        console.log(`\n--- Item ${i + 1} ---`);
        console.log('HTML:', $(el).html()?.substring(0, 300));
        console.log('\nTesting selectors:');
        console.log('  .title:', $(el).find('.title').text().trim());
        console.log('  h2:', $(el).find('h2').text().trim());
        console.log('  a text:', $(el).find('a').text().trim());
        console.log('  a href:', $(el).find('a').attr('href'));
        console.log('  img src:', $(el).find('img').attr('src'));
        console.log('  img data-src:', $(el).find('img').attr('data-src'));
      });
  } catch (error) {
    console.error(`Error: ${error}`);
  }
};

void testScrape();
