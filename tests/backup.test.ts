import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBackupPayload,
  importBackupPayload,
  parseBackupPayload,
  parseBackupText,
  type BackupV3,
} from '../lib/backup';
import {
  addBook,
  correctCompletedReadingToWant,
  deleteBook,
  getAllBooks,
  getAllReadingHistory,
  migrate,
  setNotes,
  setRating,
  setStatus,
  startReread,
} from '../lib/db';
import { NodeSQLiteAdapter } from './sqlite';

async function emptyDatabase(): Promise<NodeSQLiteAdapter> {
  const adapter = new NodeSQLiteAdapter();
  await migrate(adapter.asDatabase());
  return adapter;
}

async function databaseWithBook(): Promise<NodeSQLiteAdapter> {
  const adapter = await emptyDatabase();
  await addBook(adapter.asDatabase(), {
    olKey: '/works/OL1W',
    title: 'The Odyssey',
    author: 'Homer',
    coverUrl: 'cover-old',
    totalPages: 300,
    editionKey: '/books/OL1M',
    isbn: '9780140449136',
    publisher: 'Penguin Classics',
    publishDate: '2003',
    language: 'eng',
  });
  return adapter;
}

test('backup v3 round-trips portable relationships without local numeric ids', async () => {
  const source = await databaseWithBook();
  const sourceBook = (await getAllBooks(source.asDatabase()))[0];
  await setStatus(source.asDatabase(), sourceBook.id, 'read');
  await setNotes(source.asDatabase(), sourceBook.id, 'Blue hardcover');
  const payload = await createBackupPayload(source.asDatabase());

  assert.equal(payload.schemaVersion, 3);
  assert.equal(payload.works[0].uid, 'work:/works/OL1W');
  assert.equal(payload.libraryItems[0].workUid, payload.works[0].uid);
  assert.equal(payload.readingEntries[0].libraryItemUid, payload.libraryItems[0].uid);

  const target = await emptyDatabase();
  const summary = await importBackupPayload(target.asDatabase(), payload);
  const restored = (await getAllBooks(target.asDatabase()))[0];
  assert.ok(summary.changed >= 3);
  assert.equal(restored.title, 'The Odyssey');
  assert.equal(restored.notes, 'Blue hardcover');
  assert.equal(restored.status, 'read');
});

test('merge keeps a newer local edit instead of overwriting it with an older backup', async () => {
  const adapter = await databaseWithBook();
  const older = await createBackupPayload(adapter.asDatabase());
  const item = older.libraryItems[0];
  item.notes = 'From an old backup';
  item.updatedAt = '2020-01-01T00:00:00.000Z';

  const book = (await getAllBooks(adapter.asDatabase()))[0];
  await setNotes(adapter.asDatabase(), book.id, 'Keep this newer note');
  const summary = await importBackupPayload(adapter.asDatabase(), older);

  assert.ok(summary.skipped > 0);
  assert.equal((await getAllBooks(adapter.asDatabase()))[0].notes, 'Keep this newer note');
});

test('a deletion tombstone prevents an older backup from resurrecting a removed copy', async () => {
  const adapter = await databaseWithBook();
  const oldBackup = await createBackupPayload(adapter.asDatabase());
  const book = (await getAllBooks(adapter.asDatabase()))[0];
  await deleteBook(adapter.asDatabase(), book.id);

  await importBackupPayload(adapter.asDatabase(), oldBackup);

  assert.equal((await getAllBooks(adapter.asDatabase())).length, 0);
  const exported = await createBackupPayload(adapter.asDatabase());
  assert.equal(exported.tombstones.some((row) => row.entityType === 'library_item'), true);
});

test('a newer restored copy clears an older tombstone before the next export', async () => {
  const source = await databaseWithBook();
  const payload = await createBackupPayload(source.asDatabase());
  const item = payload.libraryItems[0];
  payload.tombstones.push({
    entityType: 'library_item',
    uid: item.uid,
    deletedAt: '2020-01-01T00:00:00.000Z',
  });
  item.updatedAt = '2021-01-01T00:00:00.000Z';

  const firstTarget = await emptyDatabase();
  await importBackupPayload(firstTarget.asDatabase(), payload);
  const reExported = await createBackupPayload(firstTarget.asDatabase());

  assert.equal((await getAllBooks(firstTarget.asDatabase())).length, 1);
  assert.equal(
    reExported.tombstones.some(
      (row) => row.entityType === 'library_item' && row.uid === item.uid
    ),
    false
  );

  const secondTarget = await emptyDatabase();
  await importBackupPayload(secondTarget.asDatabase(), reExported);
  assert.equal((await getAllBooks(secondTarget.asDatabase())).length, 1);
});

test('legacy schema v2 backups normalize into deterministic v3 identities', () => {
  const normalized = parseBackupPayload({
    app: 'bookmarked',
    schemaVersion: 2,
    exportedAt: '2024-01-01T00:00:00.000Z',
    books: [
      {
        ol_key: '/works/OL1W',
        title: 'The Odyssey',
        author: 'Homer',
        status: 'read',
        current_page: 300,
        total_pages: 300,
        added_at: '2023-01-01T00:00:00.000Z',
        finished_at: '2023-02-01T00:00:00.000Z',
      },
    ],
    sessions: [
      {
        book_ol_key: '/works/OL1W',
        logged_at: '2023-02-01T00:00:00.000Z',
        from_page: 0,
        to_page: 300,
      },
    ],
  });

  assert.equal(normalized.works[0].uid, 'work:/works/OL1W');
  assert.equal(normalized.libraryItems[0].uid, 'item:/works/OL1W:1');
  assert.equal(normalized.readingEntries[0].uid, 'reading:/works/OL1W:1');
  assert.match(normalized.sessions[0].uid, /^session:\/works\/OL1W:/);
});

test('old APK backups sanitize legacy values, tolerate a BOM, and import fully', async () => {
  const normalized = parseBackupText(`\uFEFF${JSON.stringify({
    app: 'bookmarked',
    schemaVersion: 2,
    exportedAt: '2024-01-01T00:00:00.000Z',
    books: [
      {
        ol_key: '/works/OL1W',
        title: 'The Odyssey',
        author: 'Homer',
        status: 'reading',
        current_page: '42',
        total_pages: 0,
        rating: 0,
        added_at: '2023-01-01T00:00:00.000Z',
        updated_at: null,
      },
    ],
    sessions: [
      {
        book_ol_key: '/works/deleted',
        logged_at: 'not-a-date',
        from_page: 0,
        to_page: 10,
      },
    ],
  })}`);

  assert.equal(normalized.libraryItems[0].totalPages, null);
  assert.equal(normalized.readingEntries[0].currentPage, 42);
  assert.equal(normalized.readingEntries[0].rating, null);
  assert.equal(normalized.sessions.length, 0);

  const target = await emptyDatabase();
  const summary = await importBackupPayload(target.asDatabase(), normalized);
  const restored = (await getAllBooks(target.asDatabase()))[0];
  assert.ok(summary.changed >= 3);
  assert.equal(restored.title, 'The Odyssey');
  assert.equal(restored.currentPage, 42);
  assert.equal(restored.totalPages, null);
});

test('validation rejects malformed relationships before any database write', async () => {
  const adapter = await emptyDatabase();
  const malformed: BackupV3 = {
    app: 'bookmarked',
    schemaVersion: 3,
    exportedAt: '2024-01-01T00:00:00.000Z',
    works: [],
    libraryItems: [],
    readingEntries: [],
    sessions: [
      {
        uid: 'session-orphan',
        readingEntryUid: 'missing',
        loggedAt: '2024-01-01T00:00:00.000Z',
        fromPage: 0,
        toPage: 10,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    tombstones: [],
  };

  await assert.rejects(() => importBackupPayload(adapter.asDatabase(), malformed), /without its reading/);
  assert.equal((adapter.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 0);
});

test('a reread creates a new current entry while preserving completed history', async () => {
  const adapter = await databaseWithBook();
  const original = (await getAllBooks(adapter.asDatabase()))[0];
  await setStatus(adapter.asDatabase(), original.id, 'read');
  await setRating(adapter.asDatabase(), original.id, 9);
  const finishedBefore = (await getAllBooks(adapter.asDatabase()))[0].finishedAt;

  await assert.rejects(
    () => setStatus(adapter.asDatabase(), original.id, 'reading'),
    /Completed readings must be preserved/
  );
  assert.equal((await getAllBooks(adapter.asDatabase()))[0].finishedAt, finishedBefore);
  await startReread(adapter.asDatabase(), original.id);

  const current = (await getAllBooks(adapter.asDatabase()))[0];
  const history = await getAllReadingHistory(adapter.asDatabase());
  assert.equal(current.status, 'reading');
  assert.equal(current.currentPage, 0);
  assert.equal(current.rating, null);
  assert.equal(current.readingSequence, 2);
  assert.equal(history.length, 2);
  assert.equal(history.find((reading) => reading.readingSequence === 1)?.rating, 9);
});

test('explicitly correcting a completed reading resets status without creating a reread', async () => {
  const adapter = await databaseWithBook();
  const original = (await getAllBooks(adapter.asDatabase()))[0];
  await setStatus(adapter.asDatabase(), original.id, 'read');

  await correctCompletedReadingToWant(adapter.asDatabase(), original.id);

  const corrected = (await getAllBooks(adapter.asDatabase()))[0];
  assert.equal(corrected.status, 'want');
  assert.equal(corrected.currentPage, 0);
  assert.equal(corrected.startedAt, null);
  assert.equal(corrected.finishedAt, null);
  assert.equal(corrected.readingSequence, 1);
});

test('a failure late in backup import rolls back every earlier entity write', async () => {
  const source = await databaseWithBook();
  const payload = await createBackupPayload(source.asDatabase());
  const target = await emptyDatabase();
  target.failWhenSqlContains = 'DELETE FROM sessions WHERE EXISTS';

  await assert.rejects(
    () => importBackupPayload(target.asDatabase(), payload),
    /simulated migration failure/
  );

  assert.equal((target.raw.prepare('SELECT COUNT(*) AS n FROM works').get() as { n: number }).n, 0);
  assert.equal((target.raw.prepare('SELECT COUNT(*) AS n FROM library_items').get() as { n: number }).n, 0);
  assert.equal((target.raw.prepare('SELECT COUNT(*) AS n FROM reading_entries').get() as { n: number }).n, 0);
});
