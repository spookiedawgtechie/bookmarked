export type BookStatus = 'want' | 'reading' | 'read';

export interface Book {
  id: number;
  olKey: string;
  title: string;
  author: string;
  coverUrl: string | null;
  totalPages: number | null;
  // null = never fetched, '' = fetched but Open Library has none
  description: string | null;
  status: BookStatus;
  currentPage: number;
  rating: number | null; // 0.5–10, half-point steps
  review: string | null;
  addedAt: string; // ISO date strings
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null; // last progress/status activity
}
