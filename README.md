# Bookmarked

A personal, local-first book tracker — a Letterboxd for books. Search Open Library, track what you're reading, log progress page by page, rate and review, and get a proper year-in-review recap. No accounts, no server, no ads: your library lives in a SQLite database on your own device.

**Live:** [bookmarked-psi.vercel.app](https://bookmarked-psi.vercel.app) (also installable as an Android APK — see [Releases](#releases))

## Features

- **Search & add** books via the [Open Library](https://openlibrary.org) API — covers, authors, page counts, descriptions
- **Shelf** — Want to Read / Currently Reading / Read, with a hero card for the book in progress
- **Progress tracking** — a page-number slider (not percentage) drives status automatically; sliding to the last page marks a book finished
- **Reading sessions** — every page logged is timestamped, powering a streak counter, weekly pace, and accurate "pages read" stats that count in-progress reading, not just finished books
- **Ratings & reviews** — a 10-point scale with half-point steps
- **Yearly recaps** — books finished, pages read, top rated, fastest read, longest read, a month-by-month pages chart, and a GitHub-style reading heatmap — plus a one-tap shareable recap image
- **Alternate covers** — pick the edition cover that matches your physical copy
- **Backdating** — log books you read years ago with a real finish date, so your history stays honest
- **Backup & restore** — full library export/import as JSON, portable between devices
- **Dark, dense, AMOLED-black UI** — built for one thing: tracking books, not chasing engagement

## Stack

- [Expo](https://expo.dev) SDK 57 (React Native 0.86, React 19) with [expo-router](https://docs.expo.dev/router/introduction/) for file-based navigation
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) — on-device SQLite, including in the browser via WebAssembly
- TypeScript, strict mode, no state-management library — screens re-query SQLite directly
- Ships to two channels from one codebase: a sideloaded Android APK ([EAS Build](https://docs.expo.dev/build/introduction/)) and a PWA ([Vercel](https://vercel.com))

## Getting started

```bash
npm install
npm start
```

Scan the QR code with [Expo Go](https://expo.dev/go) on your phone, or press `w` for web. See `.claude/skills/dev-loop/SKILL.md` for known Expo Go quirks (native-module compatibility, `.npmrc` requirements) if something won't run.

## Project structure

```
app/            expo-router screens (file-based routing)
lib/            all data access (SQLite) and business logic — screens never touch SQL directly
assets/         app icons
public/         PWA manifest, icons, Open Graph image
scripts/        icon generation, web postbuild (PWA meta tag injection)
.claude/skills/ living documentation — architecture, conventions, release process, troubleshooting
```

The one-sentence architecture: a React app whose backend is a SQLite file sitting next to it on each device, with the internet involved only for Open Library search/metadata. Backup/restore (JSON export-import) is the bridge between the Android app and the web version, since each keeps its own independent database by design.

## Releases

- **Android** — built via `eas build --profile preview`, distributed as a direct-install APK (no Play Store). See `.claude/skills/release-android/SKILL.md`.
- **Web** — `vercel --prod`, deployed from `.claude/skills/release-pwa/SKILL.md`'s process. Works as an installable PWA (Add to Home Screen on iOS/Android).

## Documentation

This repo is developed with an AI coding agent, and the accumulated project knowledge (schema, conventions, every known failure mode and its fix, product decisions, roadmap) is kept in `.claude/skills/` as living documentation rather than left to rot in chat history. Start at [`.claude/skills/README.md`](.claude/skills/README.md) if you're picking up this codebase.

## License

See [LICENSE](LICENSE).
