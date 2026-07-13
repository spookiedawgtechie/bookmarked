import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { shareFile } from './share';

// Full-library JSON dump. On web this doubles as insurance against Safari
// evicting site storage; on Android it's a general backup you can save anywhere.
export async function exportLibrary(db: SQLiteDatabase): Promise<void> {
  const books = await db.getAllAsync('SELECT * FROM books');
  // Sessions carry the book's ol_key (not its local numeric id, which is
  // meaningless on another device) so import can re-link them correctly.
  const sessions = await db.getAllAsync(
    `SELECT sessions.logged_at, sessions.from_page, sessions.to_page, books.ol_key as book_ol_key
     FROM sessions JOIN books ON books.id = sessions.book_id`
  );
  const payload = JSON.stringify(
    {
      app: 'bookmarked',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      books,
      sessions,
    },
    null,
    2
  );

  const fileName = `bookmarked-backup-${new Date().toISOString().slice(0, 10)}.json`;

  await shareFile({
    content: payload,
    filename: fileName,
    mimeType: 'application/json',
    dialogTitle: 'Export Bookmarked backup',
  });
}

// Import field validators: a backup file is user-editable (and SQLite's
// dynamic typing would happily store a string in a REAL column), so every
// field is normalized at this trust boundary. A bad status would make a book
// vanish from every shelf filter; a string rating would corrupt avg math.
const VALID_STATUSES = new Set(['want', 'reading', 'read']);

function importStatus(v: unknown): string {
  return typeof v === 'string' && VALID_STATUSES.has(v) ? v : 'want';
}

function importNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function importDate(v: unknown): string | null {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;
}

function importString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// Restores a backup produced by exportLibrary. Books are matched by their
// Open Library key: existing rows are overwritten, new ones inserted.
// Returns the number of books imported, or throws on an unrecognized file.
export async function importLibrary(db: SQLiteDatabase): Promise<number | null> {
  // text/plain included so backups that platforms saved as .txt still import.
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return null;
  const asset = picked.assets[0];

  let text: string;
  if (Platform.OS === 'web') {
    text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  const payload = JSON.parse(text) as {
    app?: string;
    books?: Record<string, unknown>[];
    sessions?: Record<string, unknown>[];
  };
  if (payload.app !== 'bookmarked' || !Array.isArray(payload.books)) {
    throw new Error('Not a Bookmarked backup file');
  }

  let count = 0;
  // One transaction for the whole restore: an interrupted import must not
  // leave a partial library behind (and per-row autocommit is slow anyway).
  await db.withTransactionAsync(async () => {
    for (const b of payload.books!) {
      if (typeof b.ol_key !== 'string' || typeof b.title !== 'string') continue;
      const totalPagesRaw = importNumber(b.total_pages);
      const totalPages =
        totalPagesRaw !== null && totalPagesRaw > 0 ? Math.round(totalPagesRaw) : null;
      const currentPage = Math.max(0, Math.round(importNumber(b.current_page) ?? 0));
      const ratingRaw = importNumber(b.rating);
      const rating = ratingRaw !== null && ratingRaw >= 0.5 && ratingRaw <= 10 ? ratingRaw : null;
      await db.runAsync(
        `INSERT INTO books
           (ol_key, title, author, cover_url, total_pages, status, current_page,
            rating, review, added_at, started_at, finished_at, description, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ol_key) DO UPDATE SET
           title = excluded.title, author = excluded.author,
           cover_url = excluded.cover_url, total_pages = excluded.total_pages,
           status = excluded.status, current_page = excluded.current_page,
           rating = excluded.rating, review = excluded.review,
           added_at = excluded.added_at, started_at = excluded.started_at,
           finished_at = excluded.finished_at, description = excluded.description,
           updated_at = excluded.updated_at`,
        b.ol_key,
        b.title,
        importString(b.author) ?? '',
        importString(b.cover_url),
        totalPages,
        importStatus(b.status),
        currentPage,
        rating,
        importString(b.review),
        importDate(b.added_at) ?? new Date().toISOString(),
        importDate(b.started_at),
        importDate(b.finished_at),
        importString(b.description),
        importDate(b.updated_at)
      );
      count += 1;
    }

    // Sessions reference books by ol_key in the backup (schemaVersion 1
    // backups predate sessions entirely — payload.sessions is simply absent).
    if (Array.isArray(payload.sessions)) {
      for (const s of payload.sessions) {
        const fromPage = importNumber(s.from_page);
        const toPage = importNumber(s.to_page);
        if (
          typeof s.book_ol_key !== 'string' ||
          importDate(s.logged_at) === null ||
          fromPage === null ||
          fromPage < 0 ||
          toPage === null ||
          toPage < 0
        ) {
          continue;
        }
        const row = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM books WHERE ol_key = ?',
          s.book_ol_key
        );
        if (!row) continue;
        await db.runAsync(
          `INSERT OR IGNORE INTO sessions (book_id, logged_at, from_page, to_page) VALUES (?, ?, ?, ?)`,
          row.id,
          s.logged_at as string,
          Math.round(fromPage),
          Math.round(toPage)
        );
      }
    }
  });

  return count;
}
