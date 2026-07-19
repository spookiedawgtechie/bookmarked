import type { SQLiteDatabase } from 'expo-sqlite';
import type { BookOwnership, BookStatus } from './types';

interface BackupWork {
  uid: string;
  olKey: string;
  title: string;
  author: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackupLibraryItem {
  uid: string;
  workUid: string;
  title: string;
  ownership: BookOwnership;
  editionKey: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  coverUrl: string | null;
  totalPages: number | null;
  notes: string | null;
  addedAt: string;
  updatedAt: string;
}

interface BackupReadingEntry {
  uid: string;
  libraryItemUid: string;
  sequence: number;
  status: BookStatus;
  currentPage: number;
  rating: number | null;
  review: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackupSession {
  uid: string;
  readingEntryUid: string;
  loggedAt: string;
  fromPage: number;
  toPage: number;
  updatedAt: string;
}

interface BackupTombstone {
  entityType: 'work' | 'library_item' | 'reading_entry' | 'session';
  uid: string;
  deletedAt: string;
}

export interface BackupV3 {
  app: 'bookmarked';
  schemaVersion: 3;
  exportedAt: string;
  works: BackupWork[];
  libraryItems: BackupLibraryItem[];
  readingEntries: BackupReadingEntry[];
  sessions: BackupSession[];
  tombstones: BackupTombstone[];
}

export interface ImportSummary {
  changed: number;
  skipped: number;
}

const VALID_STATUSES = new Set<BookStatus>(['want', 'reading', 'read']);
const VALID_OWNERSHIP = new Set<BookOwnership>(['owned', 'wishlist', 'borrowed']);
const VALID_ENTITY_TYPES = new Set<BackupTombstone['entityType']>([
  'work',
  'library_item',
  'reading_entry',
  'session',
]);

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string or null`);
  return value;
}

function isoDate(value: unknown, label: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO date`);
  }
  return new Date(value).toISOString();
}

function finiteNumber(value: unknown, label: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined)) return null;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number`);
  return number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number === null || number < 0) throw new Error(`${label} must be non-negative`);
  return Math.round(number);
}

function positiveIntegerOrNull(value: unknown, label: string): number | null {
  const number = finiteNumber(value, label, true);
  if (number === null) return null;
  if (number <= 0) throw new Error(`${label} must be positive`);
  return Math.round(number);
}

function ratingOrNull(value: unknown, label: string): number | null {
  const rating = finiteNumber(value, label, true);
  if (rating === null) return null;
  if (rating < 0.5 || rating > 10) throw new Error(`${label} must be between 0.5 and 10`);
  return rating;
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate UIDs`);
}

function normalizeV3(payload: Record<string, unknown>): BackupV3 {
  const exportedAt = isoDate(payload.exportedAt, 'exportedAt') as string;
  const works = asArray(payload.works, 'works').map((value, index): BackupWork => {
    const row = asRecord(value, `works[${index}]`);
    return {
      uid: requiredString(row.uid, `works[${index}].uid`),
      olKey: requiredString(row.olKey, `works[${index}].olKey`),
      title: requiredString(row.title, `works[${index}].title`),
      author: typeof row.author === 'string' ? row.author : '',
      description: nullableString(row.description, `works[${index}].description`),
      createdAt: isoDate(row.createdAt, `works[${index}].createdAt`) as string,
      updatedAt: isoDate(row.updatedAt, `works[${index}].updatedAt`) as string,
    };
  });
  const libraryItems = asArray(payload.libraryItems, 'libraryItems').map(
    (value, index): BackupLibraryItem => {
      const row = asRecord(value, `libraryItems[${index}]`);
      const ownership = requiredString(row.ownership, `libraryItems[${index}].ownership`) as BookOwnership;
      if (!VALID_OWNERSHIP.has(ownership)) throw new Error(`Invalid ownership at libraryItems[${index}]`);
      return {
        uid: requiredString(row.uid, `libraryItems[${index}].uid`),
        workUid: requiredString(row.workUid, `libraryItems[${index}].workUid`),
        title: requiredString(row.title, `libraryItems[${index}].title`),
        ownership,
        editionKey: nullableString(row.editionKey, `libraryItems[${index}].editionKey`),
        isbn: nullableString(row.isbn, `libraryItems[${index}].isbn`),
        publisher: nullableString(row.publisher, `libraryItems[${index}].publisher`),
        publishDate: nullableString(row.publishDate, `libraryItems[${index}].publishDate`),
        language: nullableString(row.language, `libraryItems[${index}].language`),
        coverUrl: nullableString(row.coverUrl, `libraryItems[${index}].coverUrl`),
        totalPages: positiveIntegerOrNull(row.totalPages, `libraryItems[${index}].totalPages`),
        notes: nullableString(row.notes, `libraryItems[${index}].notes`),
        addedAt: isoDate(row.addedAt, `libraryItems[${index}].addedAt`) as string,
        updatedAt: isoDate(row.updatedAt, `libraryItems[${index}].updatedAt`) as string,
      };
    }
  );
  const readingEntries = asArray(payload.readingEntries, 'readingEntries').map(
    (value, index): BackupReadingEntry => {
      const row = asRecord(value, `readingEntries[${index}]`);
      const status = requiredString(row.status, `readingEntries[${index}].status`) as BookStatus;
      if (!VALID_STATUSES.has(status)) throw new Error(`Invalid status at readingEntries[${index}]`);
      const sequence = nonNegativeInteger(row.sequence, `readingEntries[${index}].sequence`);
      if (sequence < 1) throw new Error(`readingEntries[${index}].sequence must be positive`);
      return {
        uid: requiredString(row.uid, `readingEntries[${index}].uid`),
        libraryItemUid: requiredString(row.libraryItemUid, `readingEntries[${index}].libraryItemUid`),
        sequence,
        status,
        currentPage: nonNegativeInteger(row.currentPage, `readingEntries[${index}].currentPage`),
        rating: ratingOrNull(row.rating, `readingEntries[${index}].rating`),
        review: nullableString(row.review, `readingEntries[${index}].review`),
        startedAt: isoDate(row.startedAt, `readingEntries[${index}].startedAt`, true),
        finishedAt: isoDate(row.finishedAt, `readingEntries[${index}].finishedAt`, true),
        createdAt: isoDate(row.createdAt, `readingEntries[${index}].createdAt`) as string,
        updatedAt: isoDate(row.updatedAt, `readingEntries[${index}].updatedAt`) as string,
      };
    }
  );
  readingEntries.sort(
    (a, b) => a.libraryItemUid.localeCompare(b.libraryItemUid) || a.sequence - b.sequence
  );
  const sessions = asArray(payload.sessions, 'sessions').map((value, index): BackupSession => {
    const row = asRecord(value, `sessions[${index}]`);
    return {
      uid: requiredString(row.uid, `sessions[${index}].uid`),
      readingEntryUid: requiredString(row.readingEntryUid, `sessions[${index}].readingEntryUid`),
      loggedAt: isoDate(row.loggedAt, `sessions[${index}].loggedAt`) as string,
      fromPage: nonNegativeInteger(row.fromPage, `sessions[${index}].fromPage`),
      toPage: nonNegativeInteger(row.toPage, `sessions[${index}].toPage`),
      updatedAt: isoDate(row.updatedAt, `sessions[${index}].updatedAt`) as string,
    };
  });
  const tombstones = asArray(payload.tombstones, 'tombstones').map(
    (value, index): BackupTombstone => {
      const row = asRecord(value, `tombstones[${index}]`);
      const entityType = requiredString(row.entityType, `tombstones[${index}].entityType`) as BackupTombstone['entityType'];
      if (!VALID_ENTITY_TYPES.has(entityType)) throw new Error(`Invalid tombstone type at index ${index}`);
      return {
        entityType,
        uid: requiredString(row.uid, `tombstones[${index}].uid`),
        deletedAt: isoDate(row.deletedAt, `tombstones[${index}].deletedAt`) as string,
      };
    }
  );

  unique(works.map((row) => row.uid), 'works');
  unique(libraryItems.map((row) => row.uid), 'libraryItems');
  unique(readingEntries.map((row) => row.uid), 'readingEntries');
  unique(sessions.map((row) => row.uid), 'sessions');
  const workUids = new Set(works.map((row) => row.uid));
  const itemUids = new Set(libraryItems.map((row) => row.uid));
  const readingUids = new Set(readingEntries.map((row) => row.uid));
  if (libraryItems.some((row) => !workUids.has(row.workUid))) throw new Error('Backup contains an item without its Work');
  if (readingEntries.some((row) => !itemUids.has(row.libraryItemUid))) throw new Error('Backup contains a reading without its library item');
  if (sessions.some((row) => !readingUids.has(row.readingEntryUid))) throw new Error('Backup contains a session without its reading');
  const activeByItem = new Set<string>();
  const sequences = new Set<string>();
  for (const reading of readingEntries) {
    const sequenceKey = `${reading.libraryItemUid}:${reading.sequence}`;
    if (sequences.has(sequenceKey)) throw new Error('Backup contains duplicate reading sequences');
    sequences.add(sequenceKey);
    if (reading.status === 'reading') {
      if (activeByItem.has(reading.libraryItemUid)) throw new Error('Backup contains multiple active rereads for one copy');
      activeByItem.add(reading.libraryItemUid);
    }
  }
  return { app: 'bookmarked', schemaVersion: 3, exportedAt, works, libraryItems, readingEntries, sessions, tombstones };
}

function legacyString(row: Record<string, unknown>, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] : null;
}

function legacyDate(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function legacyNonNegativeInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function legacyPositiveIntegerOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function legacyRatingOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0.5 && number <= 10 ? number : null;
}

function normalizeLegacy(payload: Record<string, unknown>): BackupV3 {
  const exportedAt = legacyDate(payload.exportedAt) ?? new Date().toISOString();
  const rawBooks = asArray(payload.books, 'books').map((value, index) => asRecord(value, `books[${index}]`));
  const works: BackupWork[] = [];
  const libraryItems: BackupLibraryItem[] = [];
  const readingEntries: BackupReadingEntry[] = [];
  const bookKeys = new Set<string>();
  for (const [index, row] of rawBooks.entries()) {
    const olKey = requiredString(row.ol_key, `books[${index}].ol_key`);
    if (bookKeys.has(olKey)) throw new Error('Legacy backup contains duplicate books');
    bookKeys.add(olKey);
    const title = requiredString(row.title, `books[${index}].title`);
    const addedAt = legacyDate(row.added_at) ?? exportedAt;
    const startedAt = legacyDate(row.started_at);
    const finishedAt = legacyDate(row.finished_at);
    const updatedAt = legacyDate(row.updated_at) ?? finishedAt ?? startedAt ?? addedAt;
    const statusCandidate = typeof row.status === 'string' ? row.status as BookStatus : 'want';
    const status = VALID_STATUSES.has(statusCandidate) ? statusCandidate : 'want';
    const workUid = `work:${olKey}`;
    const itemUid = `item:${olKey}:1`;
    works.push({
      uid: workUid,
      olKey,
      title,
      author: legacyString(row, 'author') ?? '',
      description: legacyString(row, 'description'),
      createdAt: addedAt,
      updatedAt,
    });
    libraryItems.push({
      uid: itemUid,
      workUid,
      title,
      ownership: status === 'want' ? 'wishlist' : 'owned',
      editionKey: null,
      isbn: null,
      publisher: null,
      publishDate: null,
      language: null,
      coverUrl: legacyString(row, 'cover_url'),
      totalPages: legacyPositiveIntegerOrNull(row.total_pages),
      notes: legacyString(row, 'notes'),
      addedAt,
      updatedAt,
    });
    readingEntries.push({
      uid: `reading:${olKey}:1`,
      libraryItemUid: itemUid,
      sequence: 1,
      status,
      currentPage: legacyNonNegativeInteger(row.current_page),
      rating: legacyRatingOrNull(row.rating),
      review: legacyString(row, 'review'),
      startedAt,
      finishedAt,
      createdAt: addedAt,
      updatedAt,
    });
  }
  const sessions: BackupSession[] = [];
  for (const [index, value] of asArray(payload.sessions ?? [], 'sessions').entries()) {
    const row = asRecord(value, `sessions[${index}]`);
    const olKey = typeof row.book_ol_key === 'string' ? row.book_ol_key : null;
    const loggedAt = legacyDate(row.logged_at);
    const fromPage = legacyNonNegativeInteger(row.from_page);
    const toPage = legacyNonNegativeInteger(row.to_page);
    if (!olKey || !bookKeys.has(olKey) || !loggedAt) continue;
    sessions.push({
      uid: `session:${olKey}:${loggedAt}:${fromPage}:${toPage}`,
      readingEntryUid: `reading:${olKey}:1`,
      loggedAt,
      fromPage,
      toPage,
      updatedAt: loggedAt,
    });
  }
  return { app: 'bookmarked', schemaVersion: 3, exportedAt, works, libraryItems, readingEntries, sessions, tombstones: [] };
}

export function parseBackupText(text: string): BackupV3 {
  const withoutBom = text.replace(/^\uFEFF/, '').trim();
  const parsed = JSON.parse(withoutBom) as unknown;
  return parseBackupPayload(
    typeof parsed === 'string' ? JSON.parse(parsed) as unknown : parsed
  );
}

export function parseBackupPayload(value: unknown): BackupV3 {
  const payload = asRecord(value, 'backup');
  if (payload.app !== 'bookmarked') throw new Error('Not a Bookmarked backup file');
  return payload.schemaVersion === 3 ? normalizeV3(payload) : normalizeLegacy(payload);
}

export async function createBackupPayload(db: SQLiteDatabase): Promise<BackupV3> {
  const works = await db.getAllAsync<BackupWork>(
    `SELECT uid, ol_key AS olKey, title, author, description,
            created_at AS createdAt, updated_at AS updatedAt FROM works`
  );
  const libraryItems = await db.getAllAsync<BackupLibraryItem>(
    `SELECT library_items.uid, works.uid AS workUid, library_items.title,
            library_items.ownership, library_items.edition_key AS editionKey,
            library_items.isbn, library_items.publisher,
            library_items.publish_date AS publishDate, library_items.language,
            library_items.cover_url AS coverUrl,
            library_items.total_pages AS totalPages, library_items.notes,
            library_items.added_at AS addedAt, library_items.updated_at AS updatedAt
     FROM library_items JOIN works ON works.id = library_items.work_id`
  );
  const readingEntries = await db.getAllAsync<BackupReadingEntry>(
    `SELECT reading_entries.uid, library_items.uid AS libraryItemUid,
            reading_entries.sequence, reading_entries.status,
            reading_entries.current_page AS currentPage, reading_entries.rating,
            reading_entries.review, reading_entries.started_at AS startedAt,
            reading_entries.finished_at AS finishedAt,
            reading_entries.created_at AS createdAt, reading_entries.updated_at AS updatedAt
     FROM reading_entries
     JOIN library_items ON library_items.id = reading_entries.library_item_id`
  );
  const sessions = await db.getAllAsync<BackupSession>(
    `SELECT sessions.uid, reading_entries.uid AS readingEntryUid,
            sessions.logged_at AS loggedAt, sessions.from_page AS fromPage,
            sessions.to_page AS toPage, sessions.updated_at AS updatedAt
     FROM sessions JOIN reading_entries ON reading_entries.id = sessions.reading_entry_id`
  );
  const tombstones = await db.getAllAsync<BackupTombstone>(
    `SELECT entity_type AS entityType, uid, deleted_at AS deletedAt FROM tombstones`
  );
  return {
    app: 'bookmarked',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    works,
    libraryItems,
    readingEntries,
    sessions,
    tombstones,
  };
}

async function blockedByTombstone(
  db: SQLiteDatabase,
  entityType: BackupTombstone['entityType'],
  uid: string,
  updatedAt: string
): Promise<boolean> {
  const tombstone = await db.getFirstAsync<{ deleted_at: string }>(
    'SELECT deleted_at FROM tombstones WHERE entity_type = ? AND uid = ?',
    entityType,
    uid
  );
  if (!tombstone) return false;
  if (tombstone.deleted_at >= updatedAt) return true;
  await db.runAsync('DELETE FROM tombstones WHERE entity_type = ? AND uid = ?', entityType, uid);
  return false;
}

async function mergePayload(db: SQLiteDatabase, payload: BackupV3): Promise<ImportSummary> {
  let changed = 0;
  let skipped = 0;
  for (const tombstone of payload.tombstones) {
    await db.runAsync(
      `INSERT INTO tombstones (entity_type, uid, deleted_at) VALUES (?, ?, ?)
       ON CONFLICT(entity_type, uid) DO UPDATE SET deleted_at = excluded.deleted_at
       WHERE excluded.deleted_at > tombstones.deleted_at`,
      tombstone.entityType,
      tombstone.uid,
      tombstone.deletedAt
    );
  }
  for (const work of payload.works) {
    if (await blockedByTombstone(db, 'work', work.uid, work.updatedAt)) {
      skipped += 1;
      continue;
    }
    const result = await db.runAsync(
      `INSERT INTO works (uid, ol_key, title, author, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         ol_key = excluded.ol_key, title = excluded.title, author = excluded.author,
         description = excluded.description, created_at = excluded.created_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at > works.updated_at`,
      work.uid,
      work.olKey,
      work.title,
      work.author,
      work.description,
      work.createdAt,
      work.updatedAt
    );
    result.changes > 0 ? changed++ : skipped++;
  }
  for (const item of payload.libraryItems) {
    if (await blockedByTombstone(db, 'library_item', item.uid, item.updatedAt)) {
      skipped += 1;
      continue;
    }
    const work = await db.getFirstAsync<{ id: number }>('SELECT id FROM works WHERE uid = ?', item.workUid);
    if (!work) {
      skipped += 1;
      continue;
    }
    const result = await db.runAsync(
      `INSERT INTO library_items
         (uid, work_id, title, ownership, edition_key, isbn, publisher, publish_date,
          language, cover_url, total_pages, notes, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         work_id = excluded.work_id, title = excluded.title,
         ownership = excluded.ownership, edition_key = excluded.edition_key,
         isbn = excluded.isbn, publisher = excluded.publisher,
         publish_date = excluded.publish_date, language = excluded.language,
         cover_url = excluded.cover_url,
         total_pages = excluded.total_pages, notes = excluded.notes,
         added_at = excluded.added_at, updated_at = excluded.updated_at
       WHERE excluded.updated_at > library_items.updated_at`,
      item.uid,
      work.id,
      item.title,
      item.ownership,
      item.editionKey,
      item.isbn,
      item.publisher,
      item.publishDate,
      item.language,
      item.coverUrl,
      item.totalPages,
      item.notes,
      item.addedAt,
      item.updatedAt
    );
    result.changes > 0 ? changed++ : skipped++;
  }
  for (const reading of payload.readingEntries) {
    if (await blockedByTombstone(db, 'reading_entry', reading.uid, reading.updatedAt)) {
      skipped += 1;
      continue;
    }
    const item = await db.getFirstAsync<{ id: number }>('SELECT id FROM library_items WHERE uid = ?', reading.libraryItemUid);
    if (!item) {
      skipped += 1;
      continue;
    }
    const result = await db.runAsync(
      `INSERT INTO reading_entries
         (uid, library_item_id, sequence, status, current_page, rating, review,
          started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         library_item_id = excluded.library_item_id, sequence = excluded.sequence,
         status = excluded.status, current_page = excluded.current_page,
         rating = excluded.rating, review = excluded.review,
         started_at = excluded.started_at, finished_at = excluded.finished_at,
         created_at = excluded.created_at, updated_at = excluded.updated_at
       WHERE excluded.updated_at > reading_entries.updated_at`,
      reading.uid,
      item.id,
      reading.sequence,
      reading.status,
      reading.currentPage,
      reading.rating,
      reading.review,
      reading.startedAt,
      reading.finishedAt,
      reading.createdAt,
      reading.updatedAt
    );
    result.changes > 0 ? changed++ : skipped++;
  }
  for (const session of payload.sessions) {
    if (await blockedByTombstone(db, 'session', session.uid, session.updatedAt)) {
      skipped += 1;
      continue;
    }
    const reading = await db.getFirstAsync<{ id: number }>('SELECT id FROM reading_entries WHERE uid = ?', session.readingEntryUid);
    if (!reading) {
      skipped += 1;
      continue;
    }
    const result = await db.runAsync(
      `INSERT INTO sessions
         (uid, reading_entry_id, logged_at, from_page, to_page, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         reading_entry_id = excluded.reading_entry_id, logged_at = excluded.logged_at,
         from_page = excluded.from_page, to_page = excluded.to_page,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at > sessions.updated_at`,
      session.uid,
      reading.id,
      session.loggedAt,
      session.fromPage,
      session.toPage,
      session.updatedAt
    );
    result.changes > 0 ? changed++ : skipped++;
  }

  await db.execAsync(`
    DELETE FROM tombstones WHERE entity_type = 'work' AND EXISTS (
      SELECT 1 FROM works
      WHERE works.uid = tombstones.uid AND works.updated_at > tombstones.deleted_at
    );
    DELETE FROM tombstones WHERE entity_type = 'library_item' AND EXISTS (
      SELECT 1 FROM library_items
      WHERE library_items.uid = tombstones.uid
        AND library_items.updated_at > tombstones.deleted_at
    );
    DELETE FROM tombstones WHERE entity_type = 'reading_entry' AND EXISTS (
      SELECT 1 FROM reading_entries
      WHERE reading_entries.uid = tombstones.uid
        AND reading_entries.updated_at > tombstones.deleted_at
    );
    DELETE FROM tombstones WHERE entity_type = 'session' AND EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.uid = tombstones.uid AND sessions.updated_at > tombstones.deleted_at
    );
    DELETE FROM sessions WHERE EXISTS (
      SELECT 1 FROM tombstones
      WHERE entity_type = 'session' AND tombstones.uid = sessions.uid
        AND tombstones.deleted_at >= sessions.updated_at
    );
    DELETE FROM reading_entries WHERE EXISTS (
      SELECT 1 FROM tombstones
      WHERE entity_type = 'reading_entry' AND tombstones.uid = reading_entries.uid
        AND tombstones.deleted_at >= reading_entries.updated_at
    );
    DELETE FROM library_items WHERE EXISTS (
      SELECT 1 FROM tombstones
      WHERE entity_type = 'library_item' AND tombstones.uid = library_items.uid
        AND tombstones.deleted_at >= library_items.updated_at
    );
    DELETE FROM works WHERE EXISTS (
      SELECT 1 FROM tombstones
      WHERE entity_type = 'work' AND tombstones.uid = works.uid
        AND tombstones.deleted_at >= works.updated_at
    );
  `);
  const foreignKeyFailure = await db.getFirstAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (foreignKeyFailure) throw new Error('Backup import created an orphaned row');
  return { changed, skipped };
}

export async function importBackupPayload(db: SQLiteDatabase, value: unknown): Promise<ImportSummary> {
  // Parse and validate the complete payload before opening the transaction.
  const payload = parseBackupPayload(value);
  let summary: ImportSummary = { changed: 0, skipped: 0 };
  await db.withTransactionAsync(async () => {
    summary = await mergePayload(db, payload);
  });
  return summary;
}
