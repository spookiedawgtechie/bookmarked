---
name: roadmap
description: Bookmarked's product decisions, deferred features with design sketches, and the owner's working style. Use when planning new features or deciding what to build next.
---

# Roadmap and product context

## The owner and how to work with him

Tanish Hire — engineer (PLM/CAD automation, React/Next.js background, pursuing M.Tech in AI). Communication style he expects: **blunt, mentor-like, no hollow encouragement**. Challenge weak ideas with reasons; teach concepts he's newer to (deep ML, native mobile) from first principles; flag when he's avoiding important-but-boring work. He reviews plans before implementation for larger changes — plan first, wait for approval, then build. Small fixes: just do them, verify, commit.

## Locked product decisions (do not relitigate)

- Personal, local-first, single-user. **No accounts, no server, no social features, no sync.** The SQLite file on each device is the entire backend.
- 10-point rating scale, half steps (REAL 0.5–10).
- Page-number slider for progress (he reads ~90% physical books); percentage is derived, never entered.
- AMOLED pure-black theme is the identity. A light theme was considered and consciously deferred indefinitely.
- Dense 4-column grids.
- Distribution: sideloaded APK (Android) + PWA on Vercel (iOS/desktop). No app stores, no paid Apple Developer account.

## Deferred features, in the order previously agreed

1. ~~**Reading sessions & streaks**~~ — **shipped.** `sessions` table, `logProgress` as the single write path, one-time backfill for pre-existing progress, `lib/stats.ts` for pace/streak/pagesInYear, streak+weekly-pace on the Shelf header, backup export/import extended. See the `database` skill for the full shape. Not yet built from this unlock: a GitHub-style reading heatmap — left for recap upgrades (item 2 below) since it's a visualization, not a data-model change.
2. ~~**Recap upgrades**~~ — **shipped (2026-07-07).** `lib/share.ts` (new, extracted from `exportLibrary`'s inline platform-branch — centralizes captureRef/Blob/`Sharing.shareAsync`/`navigator.share` for any future "share a file" need); `react-native-view-shot` confirmed Expo-Go-safe on SDK 57 and device-verified by the owner. Recap screen: shareable "{year} recap" image card (brand label + year + 2×2 stat grid + three highlights — Top rated/Fastest read/Longest read — wrapped in a `collapsable={false}` ref'd View), a "By month" pages strip, and a GitHub-style reading heatmap (`lib/stats.ts`'s `pagesByMonth`/`dailyPagesInYear`), all reusing existing bar-chart styles or a single-hue opacity ramp per the app's dataviz conventions. Month-strip/heatmap render whenever the year has any sessions, independent of whether anything's finished — see the `database` skill's sessions section for why. Not shipped: a shareable-card visual redesign beyond reusing on-screen elements (kept intentionally simple).
3. **Discover tab (recommendations)** — **claimed by the owner as his own project (2026-07-06); do not build or modify `lib/recommend.ts` / a Discover tab unless he explicitly asks.** This is intentionally his hands-on M.Tech-adjacent work, not a delegated task. Design context kept here for reference only, in case he asks for review or a second opinion: prerequisite `subjects` column (JSON array fetched with the description from the work JSON — same request, extra field, plus lazy backfill). Taste profile = rating-weighted subject counts from read/reading books. Candidates from `/subjects/<top-subjects>.json`, minus owned `ol_key`s, scored by weighted subject overlap. Three tiers: "More of the same" (same author or top-band overlap), "Similar territory" (moderate overlap, new authors), "A step forward" (fewer shared subjects + rarer/older/canonical works). Heuristics first, embeddings later.
4. Quality of life: sort/filter on list screens, separate notes field, vector icons for tabs.

## Phase review implementation (2026-07-18)

- Phase 5A: slider flush, filters/metrics/accessibility were owner-verified; Android Notes now uses keyboard-height spacing plus post-animation scrolling. Review keeps its already-working behavior.
- Phase 5B: Search prefers English-ranked edition metadata (`lang=en`) while keeping Work IDs and non-English discoverability; differing Work titles appear as secondary context; users can manually edit stored titles.
- Phase 6: PWA gets a generated offline app shell and blocks a second tab before SQLite initializes, with a clear retry screen.
- Phase 7 custom/user-supplied covers remains deferred as a separate large, portable-storage update. Do not add gallery/compression/ZIP-backup work until the owner reopens it.

## Explicitly rejected

- Social/accounts (personal app), barcode scanning (search is fast enough; camera lib risk in Expo Go), generic state-management libraries (DB-on-focus pattern is the architecture), `updateBook(fields)`-style generic setters.

## Operational facts

- Repo has a GitHub remote (`github.com/spookiedawgtechie/bookmarked`, pushed 2026-07-06) — but still commit often; push isn't automatic.
- EAS free tier ~30 builds/month — batch changes before rebuilding when practical. **Standing rule (owner, 2026-07-07): NEVER queue an EAS build or deploy to Vercel unless he explicitly asks in that conversation.** He reviews changes via Expo Go; code + commit + push is the default definition of done.
- Owner's real library lives in the installed APK; Expo Go and each browser hold separate databases; JSON export/import (Stats) is the migration path between any two.
