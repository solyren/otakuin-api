import { load } from 'cheerio';

interface ElementNode {
  tag: string;
  text?: string;
  attributes: { [key: string]: string };
  children?: ElementNode[];
}

const deepScan = async (url: string): Promise<void> => {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = load(html);

    const traverse = (element: cheerio.Element): ElementNode => {
      const children = $(element).children();
      if (children.length === 0) {
        return {
          tag: element.tagName,
          text: $(element).text().trim(),
          attributes: element.attribs,
        };
      }

      return {
        tag: element.tagName,
        attributes: element.attribs,
        children: children
          .map((_i: number, el: cheerio.Element) => traverse(el))
          .get(),
      };
    };

    const root = $('body').get(0);
    if (root) {
      const tree = traverse(root);
      console.log(JSON.stringify(tree, null, 2));
    } else {
      console.log('Could not find body element.');
    }
  } catch (error) {
    console.error(`Error during deep scan: ${error}`);
  }
};

const url = process.argv[2];
if (!url) {
  console.log('Usage: bun run scan <url>');
  console.log(
    'Example: bun run scan https://v1.samehadaku.how/daftar-anime-2/'
  );
  process.exit(1);
}

void deepScan(url);
