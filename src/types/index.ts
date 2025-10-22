export interface AnimeItem {
  title: string;
  slug: string;
  cover: string;
}

export interface HomeResponse {
  data: AnimeItem[];
  total: number;
}

export interface ElementNode {
  tag: string;
  text?: string;
  attributes: { [key: string]: string };
  children?: ElementNode[];
}
