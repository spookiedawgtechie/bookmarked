import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DATABASE_VERSION,
  getAllBooks,
  getAllReadingHistory,
  getAllSessions,
  migrate,
} from '../lib/db';
import { NodeSQLiteAdapter } from './sqlite';

function seedLegacyDatabase(adapter: NodeSQLiteAdapter): void {
  adapter.raw.exec(`
    CREATE TABLE books (
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
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      from_page INTEGER NOT NULL,
      to_page INTEGER NOT NULL,
      UNIQUE(book_id, logged_at, from_page, to_page)
    );
    INSERT INTO books
      (ol_key, title, author, cover_url, total_pages, status, current_page,
       rating, review, notes, added_at, started_at, finished_at, description, updated_at)
    VALUES
      ('/works/OL1W', 'The Odyssey', 'Homer', 'cover-1', 300, 'read', 300,
       9, 'Enduring', 'My blue copy', '2023-01-01T00:00:00.000Z',
       '2023-01-02T00:00:00.000Z', '2023-02-01T00:00:00.000Z', 'Epic',
       '2023-02-01T00:00:00.000Z'),
      ('/works/OL2W', 'Future Book', 'A. Writer', NULL, NULL, 'want', 0,
       NULL, NULL, NULL, '2024-01-01T00:00:00.000Z', NULL, NULL, NULL, NULL);
    INSERT INTO sessions (book_id, logged_at, from_page, to_page)
    VALUES (1, '2023-01-10T00:00:00.000Z', 0, 100),
           (1, '2023-02-01T00:00:00.000Z', 100, 300);
  `);
}

test('legacy books migrate transactionally into works, copies, readings, and sessions', async () => {
  const adapter = new NodeSQLiteAdapter();
  seedLegacyDatabase(adapter);

  await migrate(adapter.asDatabase());

  const version = adapter.raw.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(version.user_version, DATABASE_VERSION);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM works').get() as { n: number }).n, 2);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM library_items').get() as { n: number }).n, 2);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM reading_entries').get() as { n: number }).n, 2);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 2);

  const books = await getAllBooks(adapter.asDatabase());
  const odyssey = books.find((book) => book.olKey === '/works/OL1W');
  const future = books.find((book) => book.olKey === '/works/OL2W');
  assert.equal(odyssey?.ownership, 'owned');
  assert.equal(odyssey?.notes, 'My blue copy');
  assert.equal(odyssey?.rating, 9);
  assert.equal(future?.ownership, 'wishlist');
  assert.equal((await getAllReadingHistory(adapter.asDatabase())).length, 2);
  assert.equal((await getAllSessions(adapter.asDatabase())).length, 2);

  await migrate(adapter.asDatabase());
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM works').get() as { n: number }).n, 2);
});

test('a migration failure restores the untouched legacy tables and version', async () => {
  const adapter = new NodeSQLiteAdapter();
  seedLegacyDatabase(adapter);
  adapter.failWhenSqlContains = 'INSERT INTO works';

  await assert.rejects(() => migrate(adapter.asDatabase()), /simulated migration failure/);

  assert.equal(
    (adapter.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='books'").get() as { n: number }).n,
    1
  );
  assert.equal(
    (adapter.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='works'").get() as { n: number }).n,
    0
  );
  assert.equal((adapter.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n, 2);
});
