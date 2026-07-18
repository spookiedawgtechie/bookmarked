---
name: openlibrary
description: How Bookmarked uses the Open Library API — search, covers, descriptions, alternate covers. Use when changing lib/openlibrary.ts, adding metadata features, or debugging missing covers/descriptions.
---

# Open Library API

All calls live in `lib/openlibrary.ts`. Free, no API key, no auth. The app only hits the network for search and metadata — everything else is offline against SQLite.

## Endpoints in use

1. **Search** — `https://openlibrary.org/search.json?q=<query>&lang=en&fields=...editions...&limit=25`
   - `key` is a work key like `/works/OL45883W` → stored as `ol_key`, the book's identity.
   - `number_of_pages_median` is often missing → `totalPages` null → the UI asks the user for a page count. This is normal, not a bug.
   - The Search screen debounces 500 ms after the last keystroke and requires ≥3 characters. Do not remove the debounce.
   - `lang=en` prefers an English edition without excluding non-English matches. The nested edition title is displayed/stored when available, while the Work title is shown as secondary search context when it differs. Identity remains the Work `key`.
   - The selected edition's cover/page count are preferred, then Work-level `cover_i` / `number_of_pages_median` are used as fallbacks. Open Library currently returns one relevance-ranked nested edition.

2. **Covers** — `https://covers.openlibrary.org/b/id/<cover_i>-<S|M|L>.jpg` (helper `coverUrl(id, size)`).
   - We store the `M` URL; the detail screen upgrades to `L` via `.replace('-M.jpg', '-L.jpg')`.
   - Covers are never downloaded by us — `expo-image` fetches and disk-caches them on first render, so they work offline afterwards.

3. **Work JSON** — `https://openlibrary.org<ol_key>.json` serves two features:
   - `description`: **either a plain string or `{ value: string }`** depending on the record — `fetchDescription` normalizes this. Fetched lazily the first time a book's detail screen opens, then cached in the `description` column (`''` = fetched-but-none sentinel; never refetch when non-null).
   - `covers`: an array of cover IDs from all editions → powers the "tap cover to change it" picker (`fetchCoverIds`, capped at 30, filters out negative placeholder ids).

## Conventions

- Keep every fetch inside `lib/openlibrary.ts` and every function returning clean typed objects — screens must not parse API responses.
- Fail soft: network errors show a friendly message (search) or silently skip (description/covers). The app must remain fully usable offline.
- Stored titles are user-editable on the detail screen via `setTitle`; manual corrections naturally survive JSON backup because `title` is an existing books-table field.
- If Open Library ever becomes inadequate, the swap target is Google Books — and only this one file should need changing. Preserve that property.
- Be a polite client: no polling, no bulk scraping; the subject endpoints (`/subjects/<name>.json`, planned for recommendations) are slow — cache results if you build on them.
