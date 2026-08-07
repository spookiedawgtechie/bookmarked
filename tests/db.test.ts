import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import {
  addBook,
  addBookCopy,
  applyEditionMetadata,
  getAllBooks,
  getBook,
  getOwnedWorkItems,
  logProgress,
  migrate,
  setNotes,
  setRating,
  setReview,
  setStatus,
  setTitle,
  setTotalPages,
} from '../lib/db';
import { NodeSQLiteAdapter } from './sqlite';

interface Operation {
  sql: string;
  params: unknown[];
}

class TransactionalFakeDb {
  committed: Operation[] = [];
  completionChanges = 1;
  failOnRun: number | null = null;
  private staged: Operation[] | null = null;
  private runCount = 0;

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    assert.equal(this.staged, null, 'nested transaction is not expected');
    this.staged = [];
    try {
      await task();
      this.committed.push(...this.staged);
    } finally {
      this.staged = null;
    }
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<SQLiteRunResult> {
    this.runCount += 1;
    if (this.runCount === this.failOnRun) throw new Error('simulated write failure');
    const operation = { sql, params };
    if (this.staged) this.staged.push(operation);
    else this.committed.push(operation);
    return {
      lastInsertRowId: 0,
      changes: sql.includes("status = 'read'") ? this.completionChanges : 1,
    };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return { id: 77 } as T;
  }

  asDatabase(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }
}

test('progress, session history, and automatic completion commit together', async () => {
  const fake = new TransactionalFakeDb();
  const completed = await logProgress(fake.asDatabase(), 9, 20, 100);

  assert.equal(completed, true);
  assert.equal(fake.committed.length, 3);
  assert.match(fake.committed[0].sql, /INSERT OR IGNORE INTO sessions/);
  assert.match(fake.committed[1].sql, /UPDATE reading_entries SET current_page/);
  assert.match(fake.committed[2].sql, /status = 'read'/);
});

test('an unmoved progress slider does not create a reading session', async () => {
  const fake = new TransactionalFakeDb();
  fake.completionChanges = 0;
  const completed = await logProgress(fake.asDatabase(), 9, 20, 20);

  assert.equal(completed, false);
  assert.equal(fake.committed.length, 2);
  assert.equal(fake.committed.some((operation) => operation.sql.includes('INSERT')), false);
});

test('a failed progress transaction commits none of its staged writes', async () => {
  const fake = new TransactionalFakeDb();
  fake.failOnRun = 2;

  await assert.rejects(() => logProgress(fake.asDatabase(), 9, 20, 50), /simulated/);
  assert.deepEqual(fake.committed, []);
});

test('directly marking an old book read does not invent a session dated today', async () => {
  const fake = new TransactionalFakeDb();

  await setStatus(fake.asDatabase(), 9, 'read');

  assert.equal(fake.committed.length, 1);
  assert.match(fake.committed[0].sql, /UPDATE reading_entries SET status/);
  assert.equal(fake.committed[0].sql.includes('sessions'), false);
});

test('using an exact ISBN edition preserves personal and reading data', async () => {
  const adapter = new NodeSQLiteAdapter();
  const db = adapter.asDatabase();
  await migrate(db);
  await addBook(db, {
    olKey: '/works/OL17802920W',
    title: 'Leonardo da Vinci',
    author: 'Walter Isaacson',
    coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg',
    totalPages: 599,
    editionKey: '/books/OLD',
    isbn: '0000000000',
    publisher: 'Old publisher',
    publishDate: 'Old date',
    language: 'spa',
  });
  const [created] = await getAllBooks(db);
  await setTitle(db, created.id, 'My Leonardo copy');
  await setTotalPages(db, created.id, 624);
  await setNotes(db, created.id, 'Signed copy');
  await setStatus(db, created.id, 'reading');
  await logProgress(db, created.id, 0, 190);
  await setRating(db, created.id, 8.5);
  await setReview(db, created.id, 'Excellent so far');

  await applyEditionMetadata(db, created.id, {
    editionKey: '/books/OL27102596M',
    isbn: '9781501139154',
    publisher: 'Simon & Schuster',
    publishDate: '2017',
    language: 'eng',
    coverUrl: 'https://covers.openlibrary.org/b/id/8740542-M.jpg?default=false',
    totalPages: 568,
  });

  const updated = await getBook(db, created.id);
  assert.ok(updated);
  assert.equal(updated.title, 'My Leonardo copy');
  assert.equal(updated.totalPages, 624);
  assert.equal(updated.notes, 'Signed copy');
  assert.equal(updated.currentPage, 190);
  assert.equal(updated.rating, 8.5);
  assert.equal(updated.review, 'Excellent so far');
  assert.equal(updated.editionKey, '/books/OL27102596M');
  assert.equal(updated.isbn, '9781501139154');
  assert.equal(updated.publisher, 'Simon & Schuster');
  assert.equal(updated.language, 'eng');
  assert.equal(
    updated.coverUrl,
    'https://covers.openlibrary.org/b/id/8740542-M.jpg?default=false'
  );
});

test('multiple physical copies share one work but keep independent edition records', async () => {
  const adapter = new NodeSQLiteAdapter();
  const db = adapter.asDatabase();
  await migrate(db);

  const firstCopy = {
    olKey: '/works/OL45883W',
    title: 'The Odyssey',
    author: 'Homer',
    coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg',
    totalPages: 320,
    editionKey: '/books/OL1M',
    isbn: '9780140449112',
    publisher: 'Penguin Classics',
    publishDate: '2003',
    language: 'eng',
  };
  await addBook(db, firstCopy);
  await addBookCopy(db, {
    ...firstCopy,
    title: 'The Odyssey: Indian Edition',
    coverUrl: 'https://covers.openlibrary.org/b/id/2-M.jpg',
    totalPages: 384,
    editionKey: '/books/OL2M',
    isbn: '9789358560426',
    publisher: 'Fingerprint Publishing',
    publishDate: '2023',
  });

  const books = await getAllBooks(db);
  const ownedItems = await getOwnedWorkItems(db);
  const workCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM works');
  const readingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM reading_entries'
  );

  assert.equal(workCount?.count, 1);
  assert.equal(books.length, 2);
  assert.equal(readingCount?.count, 2);
  assert.deepEqual(
    books.map((book) => book.isbn).sort(),
    ['9780140449112', '9789358560426']
  );
  assert.equal(new Set(books.map((book) => book.id)).size, 2);
  assert.equal(ownedItems.length, 2);
  assert.equal(ownedItems.every((item) => item.olKey === '/works/OL45883W'), true);
});
