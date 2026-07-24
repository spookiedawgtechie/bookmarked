import type { SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookOwnership, BookStatus, ReadingSession } from './types';

const RELATIONAL_SCHEMA_VERSION = 3;
export const DATABASE_VERSION = 4;

function createUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function scalar(db: SQLiteDatabase, sql: string): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>(sql);
  return row?.value ?? 0;
}

async function prepareLegacySchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
  await db.execAsync(`
    INSERT OR IGNORE INTO sessions (book_id, logged_at, from_page, to_page)
    SELECT id, COALESCE(finished_at, started_at, added_at), 0, current_page
    FROM books
    WHERE current_page > 0 AND id NOT IN (SELECT book_id FROM sessions);
  `);
}

async function createV3Schema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      ol_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE library_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      ownership TEXT NOT NULL CHECK (ownership IN ('owned', 'wishlist', 'borrowed')),
      edition_key TEXT,
      isbn TEXT,
      publisher TEXT,
      publish_date TEXT,
      language TEXT,
      cover_url TEXT,
      total_pages INTEGER CHECK (total_pages IS NULL OR total_pages > 0),
      notes TEXT,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE reading_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      library_item_id INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      status TEXT NOT NULL CHECK (status IN ('want', 'reading', 'read')),
      current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0),
      rating REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 10)),
      review TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(library_item_id, sequence)
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      reading_entry_id INTEGER NOT NULL REFERENCES reading_entries(id) ON DELETE CASCADE,
      logged_at TEXT NOT NULL,
      from_page INTEGER NOT NULL CHECK (from_page >= 0),
      to_page INTEGER NOT NULL CHECK (to_page >= 0),
      updated_at TEXT NOT NULL,
      UNIQUE(reading_entry_id, logged_at, from_page, to_page)
    );
    CREATE TABLE tombstones (
      entity_type TEXT NOT NULL CHECK (entity_type IN ('work', 'library_item', 'reading_entry', 'session')),
      uid TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, uid)
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_v3_items_work ON library_items(work_id);
    CREATE INDEX idx_v3_readings_item ON reading_entries(library_item_id, sequence DESC);
    CREATE UNIQUE INDEX idx_v3_one_active_reading
      ON reading_entries(library_item_id) WHERE status = 'reading';
    CREATE INDEX idx_v3_sessions_reading ON sessions(reading_entry_id);
    CREATE INDEX idx_v3_sessions_logged_at ON sessions(logged_at);
  `);
}

async function migrateLegacyToV3(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE books RENAME TO legacy_books_v1;
    ALTER TABLE sessions RENAME TO legacy_sessions_v2;
  `);
  await createV3Schema(db);
  await db.execAsync(`
    INSERT INTO works (uid, ol_key, title, author, description, created_at, updated_at)
    SELECT
      'work:' || ol_key,
      ol_key,
      title,
      COALESCE(author, ''),
      description,
      added_at,
      COALESCE(updated_at, finished_at, started_at, added_at)
    FROM legacy_books_v1;

    INSERT INTO library_items
      (uid, work_id, title, ownership, edition_key, isbn, publisher, publish_date,
       language, cover_url, total_pages, notes, added_at, updated_at)
    SELECT
      'item:' || legacy_books_v1.ol_key || ':1',
      works.id,
      legacy_books_v1.title,
      CASE WHEN legacy_books_v1.status = 'want' THEN 'wishlist' ELSE 'owned' END,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      legacy_books_v1.cover_url,
      legacy_books_v1.total_pages,
      legacy_books_v1.notes,
      legacy_books_v1.added_at,
      COALESCE(legacy_books_v1.updated_at, legacy_books_v1.finished_at,
               legacy_books_v1.started_at, legacy_books_v1.added_at)
    FROM legacy_books_v1
    JOIN works ON works.ol_key = legacy_books_v1.ol_key;

    INSERT INTO reading_entries
      (uid, library_item_id, sequence, status, current_page, rating, review,
       started_at, finished_at, created_at, updated_at)
    SELECT
      'reading:' || legacy_books_v1.ol_key || ':1',
      library_items.id,
      1,
      legacy_books_v1.status,
      legacy_books_v1.current_page,
      legacy_books_v1.rating,
      legacy_books_v1.review,
      legacy_books_v1.started_at,
      legacy_books_v1.finished_at,
      legacy_books_v1.added_at,
      COALESCE(legacy_books_v1.updated_at, legacy_books_v1.finished_at,
               legacy_books_v1.started_at, legacy_books_v1.added_at)
    FROM legacy_books_v1
    JOIN works ON works.ol_key = legacy_books_v1.ol_key
    JOIN library_items ON library_items.work_id = works.id;

    INSERT INTO sessions
      (uid, reading_entry_id, logged_at, from_page, to_page, updated_at)
    SELECT
      'session:' || legacy_books_v1.ol_key || ':' || legacy_sessions_v2.logged_at || ':' ||
        legacy_sessions_v2.from_page || ':' || legacy_sessions_v2.to_page,
      reading_entries.id,
      legacy_sessions_v2.logged_at,
      legacy_sessions_v2.from_page,
      legacy_sessions_v2.to_page,
      legacy_sessions_v2.logged_at
    FROM legacy_sessions_v2
    JOIN legacy_books_v1 ON legacy_books_v1.id = legacy_sessions_v2.book_id
    JOIN works ON works.ol_key = legacy_books_v1.ol_key
    JOIN library_items ON library_items.work_id = works.id
    JOIN reading_entries ON reading_entries.library_item_id = library_items.id
                              AND reading_entries.sequence = 1;
  `);

  const legacyBooks = await scalar(db, 'SELECT COUNT(*) AS value FROM legacy_books_v1');
  const legacySessions = await scalar(
    db,
    'SELECT COUNT(*) AS value FROM legacy_sessions_v2'
  );
  const workCount = await scalar(db, 'SELECT COUNT(*) AS value FROM works');
  const itemCount = await scalar(db, 'SELECT COUNT(*) AS value FROM library_items');
  const readingCount = await scalar(db, 'SELECT COUNT(*) AS value FROM reading_entries');
  const sessionCount = await scalar(db, 'SELECT COUNT(*) AS value FROM sessions');
  if (
    legacyBooks !== workCount ||
    legacyBooks !== itemCount ||
    legacyBooks !== readingCount ||
    legacySessions !== sessionCount
  ) {
    throw new Error('Bookmarked migration integrity check failed');
  }
  const foreignKeyFailure = await db.getFirstAsync<Record<string, unknown>>(
    'PRAGMA foreign_key_check'
  );
  if (foreignKeyFailure) throw new Error('Bookmarked migration created an orphaned row');
  await db.execAsync(`PRAGMA user_version = ${RELATIONAL_SCHEMA_VERSION};`);
}

async function migrateV3ToV4(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>('PRAGMA table_info(library_items)');
  const columns = new Set(rows.map((row) => row.name));
  const additions = [
    ['edition_key', 'ALTER TABLE library_items ADD COLUMN edition_key TEXT'],
    ['isbn', 'ALTER TABLE library_items ADD COLUMN isbn TEXT'],
    ['publisher', 'ALTER TABLE library_items ADD COLUMN publisher TEXT'],
    ['publish_date', 'ALTER TABLE library_items ADD COLUMN publish_date TEXT'],
    ['language', 'ALTER TABLE library_items ADD COLUMN language TEXT'],
  ] as const;
  for (const [column, ddl] of additions) {
    if (!columns.has(column)) await db.execAsync(ddl);
  }

  const migratedRows = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(library_items)'
  );
  const migratedColumns = new Set(migratedRows.map((row) => row.name));
  if (additions.some(([column]) => !migratedColumns.has(column))) {
    throw new Error('Bookmarked edition metadata migration failed');
  }
  const foreignKeyFailure = await db.getFirstAsync<Record<string, unknown>>(
    'PRAGMA foreign_key_check'
  );
  if (foreignKeyFailure) throw new Error('Bookmarked edition migration found an orphaned row');
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;
  if (version > DATABASE_VERSION) {
    throw new Error('This Bookmarked database was created by a newer app version');
  }
  if (version === DATABASE_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (version < RELATIONAL_SCHEMA_VERSION) {
      await prepareLegacySchema(db);
      await migrateLegacyToV3(db);
    }
    await migrateV3ToV4(db);
  });
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

const BOOK_SELECT = `
  SELECT
    items.id,
    readings.id AS reading_id,
    readings.sequence AS reading_sequence,
    works.ol_key,
    items.title,
    works.author,
    items.ownership,
    items.edition_key,
    items.isbn,
    items.publisher,
    items.publish_date,
    items.language,
    items.cover_url,
    items.total_pages,
    works.description,
    readings.status,
    readings.current_page,
    readings.rating,
    readings.review,
    items.notes,
    items.added_at,
    readings.started_at,
    readings.finished_at,
    CASE WHEN readings.updated_at >= items.updated_at
         THEN readings.updated_at ELSE items.updated_at END AS updated_at
  FROM library_items AS items
  JOIN works ON works.id = items.work_id
  JOIN reading_entries AS readings ON readings.library_item_id = items.id
`;

function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: r.id as number,
    readingId: r.reading_id as number,
    readingSequence: r.reading_sequence as number,
    olKey: r.ol_key as string,
    title: r.title as string,
    author: r.author as string,
    ownership: r.ownership as BookOwnership,
    editionKey: (r.edition_key as string) ?? null,
    isbn: (r.isbn as string) ?? null,
    publisher: (r.publisher as string) ?? null,
    publishDate: (r.publish_date as string) ?? null,
    language: (r.language as string) ?? null,
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
    readingId: r.reading_id as number,
    bookId: r.book_id as number,
    loggedAt: r.logged_at as string,
    fromPage: r.from_page as number,
    toPage: r.to_page as number,
  };
}

export async function getAllBooks(db: SQLiteDatabase): Promise<Book[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${BOOK_SELECT}
     WHERE readings.sequence = (
       SELECT MAX(latest.sequence) FROM reading_entries AS latest
       WHERE latest.library_item_id = items.id
     )
     ORDER BY items.added_at DESC`
  );
  return rows.map(rowToBook);
}

export async function getAllReadingHistory(db: SQLiteDatabase): Promise<Book[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${BOOK_SELECT}
     ORDER BY readings.finished_at DESC, readings.created_at DESC`
  );
  return rows.map(rowToBook);
}

export async function getReadingHistoryForBook(
  db: SQLiteDatabase,
  id: number
): Promise<Book[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${BOOK_SELECT}
     WHERE items.id = ?
     ORDER BY readings.sequence DESC`,
    id
  );
  return rows.map(rowToBook);
}

export async function getOwnedOlKeys(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ ol_key: string }>(
    `SELECT DISTINCT works.ol_key
     FROM works JOIN library_items ON library_items.work_id = works.id`
  );
  return rows.map((row) => row.ol_key);
}

export async function getAllSessions(db: SQLiteDatabase): Promise<ReadingSession[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT sessions.id, sessions.reading_entry_id AS reading_id,
            library_items.id AS book_id, sessions.logged_at,
            sessions.from_page, sessions.to_page
     FROM sessions
     JOIN reading_entries ON reading_entries.id = sessions.reading_entry_id
     JOIN library_items ON library_items.id = reading_entries.library_item_id
     ORDER BY sessions.logged_at ASC`
  );
  return rows.map(rowToSession);
}

export async function getBook(db: SQLiteDatabase, id: number): Promise<Book | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `${BOOK_SELECT}
     WHERE items.id = ? AND readings.sequence = (
       SELECT MAX(latest.sequence) FROM reading_entries AS latest
       WHERE latest.library_item_id = items.id
     )`,
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
    editionKey: string | null;
    isbn: string | null;
    publisher: string | null;
    publishDate: string | null;
    language: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO works (uid, ol_key, title, author, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(ol_key) DO NOTHING`,
      `work:${input.olKey}`,
      input.olKey,
      input.title,
      input.author,
      now,
      now
    );
    const existing = await db.getFirstAsync<{ id: number }>(
      `SELECT library_items.id FROM library_items
       JOIN works ON works.id = library_items.work_id
       WHERE works.ol_key = ? LIMIT 1`,
      input.olKey
    );
    if (existing) return;
    const work = await db.getFirstAsync<{ id: number }>('SELECT id FROM works WHERE ol_key = ?', input.olKey);
    if (!work) throw new Error('Could not create work');
    const itemUid = createUid('item');
    await db.runAsync(
      `INSERT INTO library_items
         (uid, work_id, title, ownership, edition_key, isbn, publisher, publish_date,
          language, cover_url, total_pages, notes, added_at, updated_at)
       VALUES (?, ?, ?, 'wishlist', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      itemUid,
      work.id,
      input.title,
      input.editionKey,
      input.isbn,
      input.publisher,
      input.publishDate,
      input.language,
      input.coverUrl,
      input.totalPages,
      now,
      now
    );
    const item = await db.getFirstAsync<{ id: number }>('SELECT id FROM library_items WHERE uid = ?', itemUid);
    if (!item) throw new Error('Could not create library item');
    await db.runAsync(
      `INSERT INTO reading_entries
         (uid, library_item_id, sequence, status, current_page, rating, review,
          started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, 1, 'want', 0, NULL, NULL, NULL, NULL, ?, ?)`,
      `reading:${itemUid}:1`,
      item.id,
      now,
      now
    );
  });
}

async function latestReadingId(db: SQLiteDatabase, itemId: number): Promise<number> {
  const reading = await latestReading(db, itemId);
  return reading.id;
}

async function latestReading(
  db: SQLiteDatabase,
  itemId: number
): Promise<{ id: number; status: BookStatus }> {
  const reading = await db.getFirstAsync<{ id: number; status: BookStatus }>(
    `SELECT id, status FROM reading_entries WHERE library_item_id = ?
     ORDER BY sequence DESC LIMIT 1`,
    itemId
  );
  if (!reading) throw new Error('Reading entry not found');
  return reading;
}

export async function setStatus(
  db: SQLiteDatabase,
  id: number,
  status: BookStatus
): Promise<void> {
  const now = new Date().toISOString();
  const reading = await latestReading(db, id);
  if (reading.status === 'read' && status !== 'read') {
    throw new Error('Completed readings must be preserved or explicitly corrected');
  }
  const readingId = reading.id;
  if (status === 'reading') {
    await db.runAsync(
      `UPDATE reading_entries SET status = ?, started_at = COALESCE(started_at, ?),
       finished_at = NULL, updated_at = ? WHERE id = ?`,
      status,
      now,
      now,
      readingId
    );
  } else if (status === 'read') {
    await db.runAsync(
      `UPDATE reading_entries SET status = ?, started_at = COALESCE(started_at, ?),
       finished_at = ?, current_page = COALESCE(
         (SELECT total_pages FROM library_items WHERE id = ?), current_page
       ), updated_at = ? WHERE id = ?`,
      status,
      now,
      now,
      id,
      now,
      readingId
    );
  } else {
    await db.runAsync(
      `UPDATE reading_entries SET status = ?, finished_at = NULL, updated_at = ? WHERE id = ?`,
      status,
      now,
      readingId
    );
  }
}

export async function correctCompletedReadingToWant(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const now = new Date().toISOString();
  const reading = await latestReading(db, id);
  if (reading.status !== 'read') throw new Error('Only a completed reading can be corrected');
  await db.runAsync(
    `UPDATE reading_entries SET status = 'want', current_page = 0,
     started_at = NULL, finished_at = NULL, updated_at = ? WHERE id = ?`,
    now,
    reading.id
  );
}

export async function logProgress(
  db: SQLiteDatabase,
  id: number,
  fromPage: number,
  toPage: number
): Promise<boolean> {
  const now = new Date().toISOString();
  let completed = false;
  await db.withTransactionAsync(async () => {
    const readingId = await latestReadingId(db, id);
    if (toPage !== fromPage) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sessions
           (uid, reading_entry_id, logged_at, from_page, to_page, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        createUid('session'),
        readingId,
        now,
        fromPage,
        toPage,
        now
      );
    }
    await db.runAsync(
      'UPDATE reading_entries SET current_page = ?, updated_at = ? WHERE id = ?',
      toPage,
      now,
      readingId
    );
    const result = await db.runAsync(
      `UPDATE reading_entries SET status = 'read',
       started_at = COALESCE(started_at, ?), finished_at = ?,
       current_page = (SELECT total_pages FROM library_items WHERE id = ?), updated_at = ?
       WHERE id = ? AND status <> 'read' AND EXISTS (
         SELECT 1 FROM library_items
         WHERE id = ? AND total_pages IS NOT NULL AND ? >= total_pages
       )`,
      now,
      now,
      id,
      now,
      readingId,
      id,
      toPage
    );
    completed = result.changes > 0;
  });
  return completed;
}

export async function setCoverUrl(db: SQLiteDatabase, id: number, coverUrl: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE library_items SET cover_url = ?, updated_at = ? WHERE id = ?', coverUrl, now, id);
}

export async function setTitle(db: SQLiteDatabase, id: number, title: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE library_items SET title = ?, updated_at = ? WHERE id = ?', title, now, id);
}

export async function setTotalPages(db: SQLiteDatabase, id: number, totalPages: number): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE library_items SET total_pages = ?, updated_at = ? WHERE id = ?', totalPages, now, id);
}

export async function setOwnership(db: SQLiteDatabase, id: number, ownership: BookOwnership): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE library_items SET ownership = ?, updated_at = ? WHERE id = ?', ownership, now, id);
}

export async function setRating(db: SQLiteDatabase, id: number, rating: number | null): Promise<void> {
  const now = new Date().toISOString();
  const readingId = await latestReadingId(db, id);
  await db.runAsync('UPDATE reading_entries SET rating = ?, updated_at = ? WHERE id = ?', rating, now, readingId);
}

export async function setReview(db: SQLiteDatabase, id: number, review: string): Promise<void> {
  const now = new Date().toISOString();
  const readingId = await latestReadingId(db, id);
  await db.runAsync('UPDATE reading_entries SET review = ?, updated_at = ? WHERE id = ?', review, now, readingId);
}

export async function setNotes(db: SQLiteDatabase, id: number, notes: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE library_items SET notes = ?, updated_at = ? WHERE id = ?', notes, now, id);
}

export async function setDescription(db: SQLiteDatabase, id: number, description: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE works SET description = ?, updated_at = ? WHERE id = (
       SELECT work_id FROM library_items WHERE id = ?
     )`,
    description,
    now,
    id
  );
}

export async function setFinishedDate(db: SQLiteDatabase, id: number, isoDate: string): Promise<void> {
  const now = new Date().toISOString();
  const readingId = await latestReadingId(db, id);
  await db.runAsync(
    'UPDATE reading_entries SET finished_at = ?, updated_at = ? WHERE id = ?',
    isoDate,
    now,
    readingId
  );
}

export async function startReread(db: SQLiteDatabase, id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const latest = await db.getFirstAsync<{ status: BookStatus; sequence: number; item_uid: string }>(
      `SELECT reading_entries.status, reading_entries.sequence, library_items.uid AS item_uid
       FROM reading_entries
       JOIN library_items ON library_items.id = reading_entries.library_item_id
       WHERE reading_entries.library_item_id = ?
       ORDER BY reading_entries.sequence DESC LIMIT 1`,
      id
    );
    if (!latest || latest.status !== 'read') throw new Error('Only a finished book can be reread');
    await db.runAsync(
      `INSERT INTO reading_entries
         (uid, library_item_id, sequence, status, current_page, rating, review,
          started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, 'reading', 0, NULL, NULL, ?, NULL, ?, ?)`,
      `reading:${latest.item_uid}:${latest.sequence + 1}`,
      id,
      latest.sequence + 1,
      now,
      now,
      now
    );
  });
}

export async function getAppSetting(
  db: SQLiteDatabase,
  key: string
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setAppSetting(
  db: SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    now
  );
}

export async function deleteBook(db: SQLiteDatabase, id: number): Promise<void> {
  const item = await db.getFirstAsync<{ uid: string }>('SELECT uid FROM library_items WHERE id = ?', id);
  if (!item) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO tombstones (entity_type, uid, deleted_at)
       VALUES ('library_item', ?, ?)
       ON CONFLICT(entity_type, uid) DO UPDATE SET deleted_at = excluded.deleted_at
       WHERE excluded.deleted_at > tombstones.deleted_at`,
      item.uid,
      now
    );
    await db.runAsync('DELETE FROM library_items WHERE id = ?', id);
  });
}
