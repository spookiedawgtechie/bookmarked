# Changelog

All notable user-facing changes to Bookmarked are recorded here.

## Unreleased

### Personal themes

- Replaced the fixed neon palette with Sage, Ink, Ocean, Plum, and Ember.
- Added System, Light, tinted Dark, and pure-black AMOLED appearance choices.
- Kept theme preferences device-local so APK and PWA can suit their own displays.

### Recap redesign

- Made every completed reading—including rereads—the primary cover gallery.
- Promoted the biggest reading day, with tied days preserved, and reorganized monthly, quarterly, heatmap, and pace analytics.
- Moved Top rated, Fastest, and Longest into compact secondary highlights.
- Added an optional Recap name and a dedicated celebratory share poster capped at 12 covers plus a remaining count.
- Included the Recap name in backup keep-newer merging without exporting visual preferences.

### First-run guide

- Added an empty-library introduction covering exact editions, reading history, and local backups.
- Prevented onboarding and release notes from stacking, and made the guide reopenable from Stats.

### Multiple physical copies

- Added a physical-copy manager when a searched Work is already in the library.
- Added support for tracking multiple editions or duplicate copies of one Work, each with independent metadata, ownership, notes, reading history, ratings, and reviews.
- Exact ISBN results can now update a specifically selected existing copy instead of silently targeting an arbitrary copy.

## 2.0.1 — 2026-07-30

### Physical editions

- Added automatic ISBN-10 and ISBN-13 detection, checksum validation, and exact-edition Open Library search.
- Added a safe “Use edition” action for books already in the library.
- Preserved edited titles, manual page counts, notes, progress, ratings, reviews, and reading dates when updating edition metadata.

### Cover reliability

- Allowed Open Library’s Archive.org cover redirects in local and production PWA security policies.
- Added a shared cover renderer with explicit missing-cover requests and readable fallbacks when an image fails.
- Applied consistent cover handling across Shelf, Search, lists, details, alternate covers, and recap highlights.

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
