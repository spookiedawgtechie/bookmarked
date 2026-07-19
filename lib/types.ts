export type BookStatus = 'want' | 'reading' | 'read';
export type BookOwnership = 'owned' | 'wishlist' | 'borrowed';

export interface Book {
  id: number;
  readingId: number;
  readingSequence: number;
  olKey: string;
  title: string;
  author: string;
  ownership: BookOwnership;
  editionKey: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  coverUrl: string | null;
  totalPages: number | null;
  // null = never fetched, '' = fetched but Open Library has none
  description: string | null;
  status: BookStatus;
  currentPage: number;
  rating: number | null; // 0.5–10, half-point steps
  review: string | null;
  notes: string | null;
  addedAt: string; // ISO date strings
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null; // last progress/status activity
}

export interface ReadingSession {
  id: number;
  readingId: number;
  bookId: number;
  loggedAt: string; // ISO timestamp
  fromPage: number;
  toPage: number;
}
