---
name: database
description: Bookmarked's versioned SQLite v3 schema, migration, rereads, ownership, sessions, and backup merge invariants. Use for every persisted-data change or wrong stats/status/import issue.
---

# Database

`SQLiteProvider` opens `bookmarked.db` in `app/_layout.tsx` and calls `migrate()` from `lib/db.ts`. The app is local-first: there is no server database, account, or sync layer. Screens call named functions; normal app SQL belongs in `lib/db.ts`, while portable backup SQL/validation belongs in `lib/backup.ts`.

## Versioning and migration

- Current `PRAGMA user_version` is **3** (`DATABASE_VERSION`). Never return to ad hoc ALTER-only migrations.
- A v1/v2 install has `books` plus page-delta `sessions`. Migration first completes the old additive columns/backfill, then performs all renames, v3 table creation, copies, integrity counts, `foreign_key_check`, and `user_version` update in **one transaction**.
- Old tables remain as `legacy_books_v1` and `legacy_sessions_v2`, an emergency read-only snapshot. They are not queried by the running app.
- Migrated identities are deterministic across APK/PWA: `work:<ol_key>`, `item:<ol_key>:1`, `reading:<ol_key>:1`, and a session UID derived from work/date/pages. Random IDs here would duplicate the same migrated copy during cross-device import.
- Migration must preserve Work count = item count = reading count and old/new session count. Any mismatch throws and rolls the whole transaction back; tests use real in-memory SQLite and deliberately inject a mid-migration failure.
- Do not raise `DATABASE_VERSION` without a new explicit version step and upgrade fixture. A newer unknown database version must fail closed.

## v3 ownership model

```
Work (literary identity)
  └── Library item (physical edition/copy)
        └── Reading entry #1, #2, ... (rereads)
              └── Sessions (page deltas)
```

### works

Portable `uid`, unique Open Library Work `ol_key`, canonical title/author/description, created/updated timestamps. Description's sentinel remains: `null` = never fetched; `''` = fetched and none exists.

### library_items

One physical copy/edition: portable `uid`, Work FK, editable display title, ownership (`owned | wishlist | borrowed`), Open Library edition key, ISBN, publisher, publication date, language, cover, total pages, private copy notes, added/updated timestamps. Physical-only is intentional—do not add audiobook/format fields unless the owner reverses that product decision.

Legacy mapping: `want → wishlist`; `reading/read → owned`. The detail screen lets the owner correct this after migration.

### reading_entries

One attempt/reread: portable `uid`, item FK, positive sequence, status, current page, rating, review, start/finish/create/update timestamps. `(library_item_id, sequence)` is unique; a partial unique index permits only one `reading` entry per copy.

`startReread()` only accepts a finished latest entry and atomically creates the next deterministic `reading:<item-uid>:<sequence>` entry at page 0. The previous rating/review/dates remain visible in detail history and count independently in recaps.

### sessions

Immutable page-delta history: portable `uid`, reading-entry FK, logged/update timestamp, from/to page. Positive deltas power pages, pace, heatmaps, and streaks. `books.current_page` no longer exists; the latest reading entry stores current position.

### tombstones and app_settings

Deleting a physical copy writes a `library_item` tombstone and cascades its readings/sessions. Tombstones travel in backup v3 so importing an older backup cannot resurrect deleted data. `app_settings` reserves versioned local settings.

## Compatibility query rules

- `getAllBooks()` / `getBook()` return one `Book` per physical item using its latest reading entry—use for Shelf, search ownership, and list/current detail UI.
- `getAllReadingHistory()` returns every attempt—use for stats and recaps so rereads count independently.
- `latestCompletedByBook()` collapses history back to one completed row per physical copy for the Read shelf while a newer reread may be active.
- `getAllSessions()` spans every reading entry and maps back to the physical `bookId` for existing stats helpers.
- `Book.id` remains the local library-item route id. `Book.readingId` and `readingSequence` identify a particular attempt; never use numeric IDs in backups.

## Write invariants

- `logProgress()` is the only page-write path. One transaction inserts the session, updates current page, and marks the entry read at the last page. It returns whether completion occurred.
- Direct `setStatus(..., 'read')` does not fabricate a session: old books may be backdated, and crediting all pages to today corrupts yearly stats.
- Rating/review/status/progress/finish date update `reading_entries.updated_at`.
- Title/edition/copy metadata/ownership/cover/pages/notes update `library_items.updated_at`.
- Description updates `works.updated_at`. Complete timestamps are required for backup keep-newer semantics.
- `addBook()` is transactional. Search has an immediate ref-backed repeated-tap guard; it intentionally prevents a second item for the same Work until a dedicated multi-copy/edition picker is added.
- Always parameterize values. Never interpolate user/API/backup data into SQL.

## Stats semantics

- Pages = sum of `max(0, to_page - from_page)` from sessions in the selected year.
- Finished counts/quarters/ratings/duration = completed reading entries; rereads count separately.
- Shelf/library grids = physical items, not reading entries; no duplicate cover for a reread.
- Streak/weekly pace/month/heatmap = session dates.
- Library total = tracked physical items (including wishlist/borrowed under the current label).

## Backup v3

- `lib/backup.ts` is platform-free validation/export/merge logic; `lib/backup-file.ts` owns DocumentPicker/FileSystem/share behavior.
- Export includes Works, items, readings, sessions, and tombstones with portable UIDs—never local numeric IDs.
- `parseBackupPayload()` validates the complete graph before a write and accepts old schema 1/2 backups by normalizing them to deterministic v3 records.
- Import is one transaction and has one mode: **merge and keep newer**. ISO dates are canonicalized before lexicographic comparison. Older/equal records are skipped; newer records replace that entity; newer tombstones beat older entities.
- There is deliberately no destructive replace mode. `.txt` and `.json` files are both accepted.

## Test requirements

Every schema/backup change must extend `tests/migration.test.ts` or `tests/backup.test.ts`. Required coverage includes success, idempotent rerun, injected rollback, legacy normalization, round-trip relationships, older-local conflict, tombstone non-resurrection, malformed graph prevalidation, import rollback, and reread preservation.
