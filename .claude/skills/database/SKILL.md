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
| updated_at | TEXT nullable | stamped by setProgress/setStatus; sorts Currently Reading |

## Lifecycle invariants (encoded in `setStatus`)

- → `reading`: `started_at = COALESCE(started_at, now)` — start date is written once, never clobbered by status toggling. Clears `finished_at`.
- → `read`: same COALESCE for `started_at` (covers marking read directly), stamps `finished_at = now`, snaps `current_page = COALESCE(total_pages, current_page)`.
- → `want`: clears `finished_at` (a wishlisted book is by definition not finished — keeps stats honest).
- `setProgress`/`setStatus` also stamp `updated_at = now`.
- Backdating: the detail screen writes user-entered `YYYY-MM-DD` as `<date>T12:00:00.000Z` via `setFinishedDate` (noon UTC avoids timezone date-shifts).
- Sliding the progress slider to the last page auto-marks the book `read` (logic in `app/book/[id].tsx`).

## Stats math (what the numbers mean)

- "Pages read" (Stats tab and recaps) = `SUM(total_pages)` over books with `status='read'` and `finished_at` in the relevant calendar year — computed in `app/(tabs)/stats.tsx` and `app/recap/[year].tsx`. **In-progress `current_page` never contributes to any stat**; a book's full page count lands the day it's marked read. Known product gap — the fix is roadmap item 1 (reading sessions), not a hack here.
- Quarterly buckets group by `finished_at` month ÷ 3; average rating averages all non-null ratings.

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
