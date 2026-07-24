# Changelog

All notable user-facing changes to Bookmarked are recorded here.

## 2.0.0 — 2026-07-24

### Library and reading history

- Introduced a versioned Work → physical copy → reading/reread → session data model.
- Added ownership states and physical-edition metadata, with editable stored titles and alternate Open Library covers.
- Preserved previous ratings, reviews, dates, and recap entries when starting a reread.
- Protected completed readings from accidental status changes that silently erase completion history.

### Progress, stats, and recaps

- Made progress logging atomic so page position, sessions, and final-page completion stay consistent.
- Added streaks, weekly pace, monthly pages, quarter summaries, heatmaps, fastest reads, and longest reads.
- Added shareable yearly recap images.
- Added total-library and currently-reading metrics.

### Backup and reliability

- Added portable backup identities, keep-newer merge behavior, deletion tombstones, and transactional rollback.
- Preserved compatibility with legacy APK backups, `.json` files, and backups saved as `.txt`.
- Hardened network errors, loading states, persistent PWA storage, and single-tab SQLite ownership.
- Aligned the project with the current Expo SDK 57 patch versions.

### Experience

- Added private notes separately from public-style reviews.
- Added sorting and filtering to library lists.
- Improved keyboard handling, accessibility labels, touch targets, and screen-reader behavior.
- Added responsive 4/5/6-column shelves and centered desktop layouts for the PWA.
- Added this once-per-release “What’s new” dialog, available again from Stats.
- Ensured sideloaded APK updates automatically receive a higher Android version code.
