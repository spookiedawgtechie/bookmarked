import type { SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookStatus } from './types';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ol_key TEXT UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      cover_url TEXT,
      total_pages INTEGER,
      status TEXT NOT NULL DEFAULT 'want',
      current_page INTEGER NOT NULL DEFAULT 0,
      rating REAL,
      review TEXT,
      added_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      description TEXT,
      updated_at TEXT
    );
  `);
  // Upgrade paths for databases created before these columns existed;
  // each ALTER throws harmlessly once the column is present.
  for (const ddl of [
    'ALTER TABLE books ADD COLUMN description TEXT',
    'ALTER TABLE books ADD COLUMN updated_at TEXT',
  ]) {
    try {
      await db.execAsync(ddl);
    } catch {
      // Column already exists.
    }
  }
}

function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: r.id as number,
    olKey: r.ol_key as string,
    title: r.title as string,
    author: r.author as string,
    coverUrl: (r.cover_url as string) ?? null,
    totalPages: (r.total_pages as number) ?? null,
    description: (r.description as string) ?? null,
    status: r.status as BookStatus,
    currentPage: r.current_page as number,
    rating: (r.rating as number) ?? null,
    review: (r.review as string) ?? null,
    addedAt: r.added_at as string,
    startedAt: (r.started_at as string) ?? null,
    finishedAt: (r.finished_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  };
}

export async function getAllBooks(db: SQLiteDatabase): Promise<Book[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM books ORDER BY added_at DESC'
  );
  return rows.map(rowToBook);
}

export async function getBook(db: SQLiteDatabase, id: number): Promise<Book | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM books WHERE id = ?',
    id
  );
  return row ? rowToBook(row) : null;
}

export async function addBook(
  db: SQLiteDatabase,
  input: {
    olKey: string;
    title: string;
    author: string;
    coverUrl: string | null;
    totalPages: number | null;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO books (ol_key, title, author, cover_url, total_pages, status, current_page, added_at)
     VALUES (?, ?, ?, ?, ?, 'want', 0, ?)`,
    input.olKey,
    input.title,
    input.author,
    input.coverUrl,
    input.totalPages,
    new Date().toISOString()
  );
}

export async function setStatus(
  db: SQLiteDatabase,
  id: number,
  status: BookStatus
): Promise<void> {
  const now = new Date().toISOString();
  if (status === 'reading') {
    await db.runAsync(
      `UPDATE books SET status = ?, started_at = COALESCE(started_at, ?), finished_at = NULL, updated_at = ? WHERE id = ?`,
      status,
      now,
      now,
      id
    );
  } else if (status === 'read') {
    await db.runAsync(
      `UPDATE books SET status = ?, started_at = COALESCE(started_at, ?), finished_at = ?,
       current_page = COALESCE(total_pages, current_page), updated_at = ? WHERE id = ?`,
      status,
      now,
      now,
      now,
      id
    );
  } else {
    await db.runAsync(
      `UPDATE books SET status = ?, finished_at = NULL, updated_at = ? WHERE id = ?`,
      status,
      now,
      id
    );
  }
}

export async function setProgress(
  db: SQLiteDatabase,
  id: number,
  currentPage: number
): Promise<void> {
  await db.runAsync(
    'UPDATE books SET current_page = ?, updated_at = ? WHERE id = ?',
    currentPage,
    new Date().toISOString(),
    id
  );
}

export async function setCoverUrl(
  db: SQLiteDatabase,
  id: number,
  coverUrl: string
): Promise<void> {
  await db.runAsync('UPDATE books SET cover_url = ? WHERE id = ?', coverUrl, id);
}

export async function setTotalPages(
  db: SQLiteDatabase,
  id: number,
  totalPages: number
): Promise<void> {
  await db.runAsync('UPDATE books SET total_pages = ? WHERE id = ?', totalPages, id);
}

export async function setRating(
  db: SQLiteDatabase,
  id: number,
  rating: number | null
): Promise<void> {
  await db.runAsync('UPDATE books SET rating = ? WHERE id = ?', rating, id);
}

export async function setReview(
  db: SQLiteDatabase,
  id: number,
  review: string
): Promise<void> {
  await db.runAsync('UPDATE books SET review = ? WHERE id = ?', review, id);
}

export async function setDescription(
  db: SQLiteDatabase,
  id: number,
  description: string
): Promise<void> {
  await db.runAsync('UPDATE books SET description = ? WHERE id = ?', description, id);
}

export async function setFinishedDate(
  db: SQLiteDatabase,
  id: number,
  isoDate: string
): Promise<void> {
  await db.runAsync('UPDATE books SET finished_at = ? WHERE id = ?', isoDate, id);
}

export async function deleteBook(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}
