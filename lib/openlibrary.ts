export interface SearchResult {
  key: string;
  title: string;
  originalTitle: string | null;
  author: string;
  editionKey: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  coverUrl: string | null;
  pages: number | null;
  year: number | null;
}

// Open Library descriptions sometimes contain Markdown links added by users.
// Keep the useful label but discard the destination before showing the text.
export function sanitizeDescription(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface OpenLibrarySearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
  editions?: {
    docs?: {
      title?: string;
      key?: string;
      isbn?: string[];
      publisher?: string[];
      publish_date?: string[];
      cover_i?: number;
      number_of_pages?: number;
      language?: string[];
    }[];
  };
}

export function mapOpenLibraryDoc(d: OpenLibrarySearchDoc): SearchResult {
  // `lang=en` influences the single nested edition selected by Open
  // Library without excluding works that only match another language.
  // Keep the Work key as identity, but display the selected edition's
  // metadata when present (especially important for translated classics).
  const edition = d.editions?.docs?.[0];
  const preferredTitle = edition?.title?.trim() || d.title;
  const originalTitle =
    preferredTitle.localeCompare(d.title, undefined, { sensitivity: 'base' }) === 0
      ? null
      : d.title;
  const coverId = edition?.cover_i ?? d.cover_i;
  return {
    key: d.key,
    title: preferredTitle,
    originalTitle,
    author: d.author_name?.join(', ') ?? 'Unknown author',
    editionKey: edition?.key ?? null,
    isbn: edition?.isbn?.[0] ?? null,
    publisher: edition?.publisher?.[0] ?? null,
    publishDate: edition?.publish_date?.[0] ?? null,
    language: edition?.language?.[0] ?? null,
    coverUrl: coverId ? coverUrl(coverId) : null,
    pages: edition?.number_of_pages ?? d.number_of_pages_median ?? null,
    year: d.first_publish_year ?? null,
  };
}

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

// A dead network must produce an error the UI can show, not a spinner that
// hangs for the platform's multi-minute default. (Manual controller instead
// of AbortSignal.timeout for RN/Hermes compatibility.)
function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// A work lists cover IDs from all its editions — the raw material for the
// "pick the cover matching your physical copy" feature.
export async function fetchCoverIds(olKey: string): Promise<number[]> {
  const res = await fetchWithTimeout(`https://openlibrary.org${olKey}.json`);
  if (!res.ok) return [];
  const json = (await res.json()) as { covers?: number[] };
  return (json.covers ?? []).filter((id) => id > 0).slice(0, 30);
}

// Work pages (e.g. /works/OL45883W) carry the book blurb; the field is either
// a plain string or a { value } wrapper depending on the record.
export async function fetchDescription(olKey: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://openlibrary.org${olKey}.json`);
  // null means "definitively no description" and gets cached as the ''
  // sentinel by the caller; a transient server error must THROW instead,
  // or one bad 500 would permanently suppress the book's blurb.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  const json = (await res.json()) as { description?: string | { value?: string } };
  const d = json.description;
  if (!d) return null;
  return typeof d === 'string' ? d : (d.value ?? null);
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url =
    'https://openlibrary.org/search.json?q=' +
    encodeURIComponent(query) +
    '&lang=en' +
    '&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year,' +
    'editions,editions.key,editions.title,editions.language,editions.isbn,' +
    'editions.publisher,editions.publish_date,editions.cover_i,editions.number_of_pages' +
    '&limit=25';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  const json = (await res.json()) as { docs: OpenLibrarySearchDoc[] };
  return json.docs.map(mapOpenLibraryDoc);
}
