export interface SearchResult {
  key: string;
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  year: number | null;
}

interface OLDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
}

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

// Work pages (e.g. /works/OL45883W) carry the book blurb; the field is either
// a plain string or a { value } wrapper depending on the record.
export async function fetchDescription(olKey: string): Promise<string | null> {
  const res = await fetch(`https://openlibrary.org${olKey}.json`);
  if (!res.ok) return null;
  const json = (await res.json()) as { description?: string | { value?: string } };
  const d = json.description;
  if (!d) return null;
  return typeof d === 'string' ? d : (d.value ?? null);
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url =
    'https://openlibrary.org/search.json?q=' +
    encodeURIComponent(query) +
    '&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year&limit=25';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  const json = (await res.json()) as { docs: OLDoc[] };
  return json.docs.map((d) => ({
    key: d.key,
    title: d.title,
    author: d.author_name?.join(', ') ?? 'Unknown author',
    coverUrl: d.cover_i ? coverUrl(d.cover_i) : null,
    pages: d.number_of_pages_median ?? null,
    year: d.first_publish_year ?? null,
  }));
}
