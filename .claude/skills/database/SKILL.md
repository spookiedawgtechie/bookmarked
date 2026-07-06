---
name: database
description: Bookmarked's SQLite schema, data-layer conventions, and how to add columns or queries safely. Use when changing lib/db.ts, adding features that store data, or debugging wrong stats/status behavior.
---

# Database

Single SQLite database `bookmarked.db`, opened by `SQLiteProvider` in `app/_layout.tsx`, which runs `migrate()` from `lib/db.ts` on every launch. **All SQL lives in `lib/db.ts`** — screens call named functions and never touch SQL or `fetch` directly. Keep it that way.

## books table

| column | type | meaning |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | internal id, used in routes `/book/[id]` |
| ol_key | TEXT UNIQUE | Open Library work key, e.g. `/works/OL45883W`; the dedupe + import-merge identity |
| title, author | TEXT | copied from search at add-time |
| cover_url | TEXT nullable | full URL; user can replace via cover picker |
| total_pages | INTEGER nullable | null = unknown; UI asks the user to type it |
| status | TEXT | `'want' | 'reading' | 'read'` — vocabulary enforced by the TS type `BookStatus`, not the DB |
| current_page | INTEGER default 0 | |
| rating | REAL nullable | 0.5–10 in half steps (10-point scale is a product decision) |
| review | TEXT nullable | |
| added_at | TEXT | ISO-8601 string (SQLite has no date type; ISO strings sort correctly) |
| started_at | TEXT nullable | write-once (see lifecycle) |
| finished_at | TEXT nullable | **drives all stats/recaps** (grouped by year/quarter) |
| description | TEXT nullable | `null` = never fetched from Open Library; `''` = fetched, none exists (sentinel prevents refetch loops) |
| updated_at | TEXT nullable | stamped by logProgress/setStatus; sorts Currently Reading |

## sessions table

One row per progress edit (page delta). `id, book_id, logged_at TEXT, from_page INTEGER, to_page INTEGER`, `UNIQUE(book_id, logged_at, from_page, to_page)` to make repeated writes/imports idempotent. **This is the only source of truth for "how many pages did I read and when"** — `books.current_page` is just the current position, not history.

- **`logProgress(db, id, fromPage, toPage)`** in `lib/db.ts` is the single write path for progress — it inserts a session row (skipped if `fromPage === toPage`) AND updates `books.current_page`/`updated_at` in one call. **There is no `setProgress` anymore** — screens must never write `current_page` directly, or session history silently stops matching reality. Both call sites (`app/(tabs)/index.tsx` log-progress modal, `app/book/[id].tsx` slider) pass the last-known persisted page as `fromPage` — the detail screen keeps this in a `persistedPageRef` (not `book.currentPage`) so multiple debounced writes in one visit each produce an accurate delta, not one big delta from stale state.
- **One-time backfill in `migrate()`**: for any book with `current_page > 0` and zero existing sessions, inserts a single historical session `0 → current_page` dated `finished_at ?? started_at ?? added_at`. Runs every launch but is a no-op once a book has any real session (idempotent via the `id NOT IN (SELECT book_id FROM sessions)` guard) — this is what keeps pre-sessions libraries from losing stats history.
- `deleteBook` deletes the book's sessions first (no FK/cascade is declared — deliberately explicit for portability across the native/wasm SQLite builds).
- Backup: `exportLibrary` joins sessions to `books.ol_key` (not the local numeric id, which is meaningless on another device) so `importLibrary` can re-link them to the right local book by key. Old (schemaVersion 1) backups simply have no `sessions` field — import treats that as zero sessions, not an error.
- Pure computation over fetched sessions (`pagesInYear`, `pagesInLastDays`, `currentStreakDays`) lives in **`lib/stats.ts`**, not `lib/db.ts` — same "raw access vs. derived computation" split as screens doing their own `.filter`/`.reduce` over `getAllBooks()` results.

## Lifecycle invariants (encoded in `setStatus`)

- → `reading`: `started_at = COALESCE(started_at, now)` — start date is written once, never clobbered by status toggling. Clears `finished_at`.
- → `read`: same COALESCE for `started_at` (covers marking read directly), stamps `finished_at = now`, snaps `current_page = COALESCE(total_pages, current_page)`.
- → `want`: clears `finished_at` (a wishlisted book is by definition not finished — keeps stats honest).
- `setProgress`/`setStatus` also stamp `updated_at = now`.
- Backdating: the detail screen writes user-entered `YYYY-MM-DD` as `<date>T12:00:00.000Z` via `setFinishedDate` (noon UTC avoids timezone date-shifts).
- Sliding the progress slider to the last page auto-marks the book `read` (logic in `app/book/[id].tsx`).

## Stats math (what the numbers mean)

- **"Pages read" (Stats tab, home year-strip, recaps) = `pagesInYear(sessions, year)`** from `lib/stats.ts` — the sum of `max(0, to_page - from_page)` over every session logged in that calendar year, regardless of whether the book has been finished yet. This was previously `SUM(total_pages)` over finished books only (a real gap: in-progress reading counted for nothing); fixed once sessions shipped. Every screen showing "pages" must use this function, not a books-table sum, or the numbers will disagree with each other.
- "Books finished" / quarterly-by-book-count charts still group by `finished_at` — that's a different, valid metric (how many books, not how many pages) and wasn't part of the gap; not changed.
- Average rating averages all non-null ratings across all books, not scoped to the year (matches existing behavior, not part of this fix).
- Streak (`currentStreakDays`) and weekly pace (`pagesInLastDays(sessions, 7)`) shown on the Shelf header are also sessions-derived; a streak counts distinct calendar days with ≥1 session, and stays "alive" through today even if nothing's logged yet today (only breaks once a full day is skipped).

## How to add a column

1. Add it to the `CREATE TABLE` statement in `migrate()` (for fresh installs), **and** add an `ALTER TABLE books ADD COLUMN ...` line to the try/catch loop below it (for existing databases — the ALTER throws harmlessly once the column exists). Both places, always.
2. Add the field to the `Book` interface in `lib/types.ts` and to `rowToBook()` (snake_case → camelCase, `?? null` for nullables).
3. If the column should survive backup/restore, add it to both the INSERT column list and the `ON CONFLICT(ol_key) DO UPDATE SET` list in `importLibrary()` (`lib/backup.ts`). `exportLibrary` needs **no** change — it does `SELECT * FROM books`, so new columns export automatically; only import's explicit lists need updating.
4. Write a small single-purpose setter (`setX(db, id, value)`) — do not build a generic `updateBook(fields)`.

## Conventions

- Always parameterized queries (`?` placeholders) — never string-concatenate SQL.
- `addBook` uses `INSERT OR IGNORE` — the UNIQUE constraint on `ol_key` makes double-adding a silent no-op; the UI shows ✓ based on a separate owned-keys query.
- Import merges with `INSERT ... ON CONFLICT(ol_key) DO UPDATE SET ...` — existing rows overwritten, new inserted, never duplicated. **The overwrite is unconditional — there is no timestamp/last-write-wins comparison.** Importing an *older* backup over newer on-device data silently reverts those books to the backup's state. This is accepted behavior for now; if a user reports "wrong data after import", check backup age first.
- No caching layer anywhere: screens re-query on focus via `useFocusEffect` (see `ui-conventions`). At personal-library scale a query costs ~1ms; do not add state management.
- `PRAGMA journal_mode = WAL` is set in migrate; leave it.
