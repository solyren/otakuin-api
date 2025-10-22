import { load } from 'cheerio';
import type { ElementNode } from '../types';

// -- deepScan --
export const deepScan = async (url: string): Promise<void> => {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = load(html);

    // -- traverse --
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
        children: children.map((i, el) => traverse(el)).get(),
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
