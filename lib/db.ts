import type { SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookStatus, ReadingSession } from './types';

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
      notes TEXT,
      added_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      description TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      from_page INTEGER NOT NULL,
      to_page INTEGER NOT NULL,
      UNIQUE(book_id, logged_at, from_page, to_page)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_book ON sessions(book_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_logged_at ON sessions(logged_at);
  `);
  // Upgrade paths for databases created before these columns existed;
  // each ALTER throws harmlessly once the column is present.
  for (const ddl of [
    'ALTER TABLE books ADD COLUMN description TEXT',
    'ALTER TABLE books ADD COLUMN updated_at TEXT',
    'ALTER TABLE books ADD COLUMN notes TEXT',
  ]) {
    try {
      await db.execAsync(ddl);
    } catch {
      // Column already exists.
    }
  }
  // One-time backfill for books that had progress before sessions existed:
  // treat all progress-to-date as a single historical session, so existing
  // libraries don't lose stats history. Only affects books with zero
  // sessions so far, so it's a no-op on every later launch.
  await db.execAsync(`
    INSERT OR IGNORE INTO sessions (book_id, logged_at, from_page, to_page)
    SELECT id, COALESCE(finished_at, started_at, added_at), 0, current_page
    FROM books
    WHERE current_page > 0 AND id NOT IN (SELECT book_id FROM sessions);
  `);
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
    notes: (r.notes as string) ?? null,
    addedAt: r.added_at as string,
    startedAt: (r.started_at as string) ?? null,
    finishedAt: (r.finished_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  };
}

function rowToSession(r: Record<string, unknown>): ReadingSession {
  return {
    id: r.id as number,
    bookId: r.book_id as number,
    loggedAt: r.logged_at as string,
    fromPage: r.from_page as number,
    toPage: r.to_page as number,
  };
}

export async function getAllBooks(db: SQLiteDatabase): Promise<Book[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM books ORDER BY added_at DESC'
  );
  return rows.map(rowToBook);
}

export async function getAllSessions(db: SQLiteDatabase): Promise<ReadingSession[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM sessions ORDER BY logged_at ASC'
  );
  return rows.map(rowToSession);
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

// The single write path for progress: updates the book AND records a
// session delta (skipped if fromPage === toPage, e.g. an unmoved slider).
// Screens must call this instead of writing current_page directly, so no
// progress update can bypass session history.
export async function logProgress(
  db: SQLiteDatabase,
  id: number,
  fromPage: number,
  toPage: number
): Promise<void> {
  const now = new Date().toISOString();
  if (toPage !== fromPage) {
    await db.runAsync(
      'INSERT OR IGNORE INTO sessions (book_id, logged_at, from_page, to_page) VALUES (?, ?, ?, ?)',
      id,
      now,
      fromPage,
      toPage
    );
  }
  await db.runAsync(
    'UPDATE books SET current_page = ?, updated_at = ? WHERE id = ?',
    toPage,
    now,
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

export async function setNotes(
  db: SQLiteDatabase,
  id: number,
  notes: string
): Promise<void> {
  await db.runAsync('UPDATE books SET notes = ? WHERE id = ?', notes, id);
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
  // One transaction: an interruption must not delete the history but keep
  // the book (no FK cascade is declared, so atomicity lives here).
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sessions WHERE book_id = ?', id);
    await db.runAsync('DELETE FROM books WHERE id = ?', id);
  });
}
