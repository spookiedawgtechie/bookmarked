# Bookmarked skill library

Institutional knowledge for maintaining this app without its original author. Start here, then open the skill that matches your task. Every claim in these files was true and verified as of 2026-07-06; trust them over training-data intuition about Expo, but verify against the code when they conflict with what you observe.

| Skill | Open it when… |
|---|---|
| `dev-loop` | starting a session, running the dev server, testing on the phone, npm/Node quirks |
| `database` | touching lib/db.ts, adding columns, status lifecycle, stats math |
| `openlibrary` | search/covers/descriptions, anything in lib/openlibrary.ts |
| `ui-conventions` | building/modifying screens; cross-platform (web!) pitfalls |
| `verify` | before declaring anything done — the three gates + commit rules |
| `release-android` | shipping an APK, EAS builds, build failures |
| `release-pwa` | shipping web, Vercel, SQLite-on-web headers |
| `troubleshooting` | anything broke — match the failure signature first |
| `roadmap` | planning features; product decisions and owner context |

The one-sentence architecture: **a React (expo-router) app whose backend is a SQLite file sitting next to it on each device, with the internet involved only for Open Library search/metadata; shipped as a sideloaded APK and a Vercel-hosted PWA, with JSON export/import as the bridge between the two.**

Golden rules that cut across all skills:
1. Screens never touch SQL or fetch — `lib/` owns all data access.
2. Every change ships twice (APK + PWA) — there is no OTA.
3. `.npmrc` (legacy-peer-deps) is load-bearing; so are the COOP/COEP headers in vercel.json/serve.json and `scripts/postbuild-web.js`.
4. Silent Expo Go startup crash = native module not in Expo Go. Always.
5. Read https://docs.expo.dev/versions/v57.0.0/ before using an unfamiliar Expo API.
