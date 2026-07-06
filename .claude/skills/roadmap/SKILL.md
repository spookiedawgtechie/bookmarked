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

1. **Reading sessions & streaks** (next in line; also fixes a known stats gap: pages of in-progress books count for nothing until finished). Sketch: a `sessions` table (`id, book_id FK, logged_at TEXT, from_page INT, to_page INT`); every "Log progress" write also inserts a session delta. Unlocks: pages/day pace on the home header, streak counter, per-period page stats that credit reading when it happened, GitHub-style reading heatmap in recaps. Needs no new logging discipline from the owner.
2. **Recap upgrades**: shareable Wrapped-style image card (render a view to image → share sheet), month strip, longest book, avg days-per-book.
3. **Discover tab (recommendations)** — deliberately parked; considered a big overhaul. Agreed design: prerequisite `subjects` column (JSON array fetched with the description from the work JSON — same request, extra field, plus lazy backfill). Taste profile = rating-weighted subject counts from read/reading books. Candidates from `/subjects/<top-subjects>.json`, minus owned `ol_key`s, scored by weighted subject overlap. Three tiers: "More of the same" (same author or top-band overlap), "Similar territory" (moderate overlap, new authors), "A step forward" (fewer shared subjects + rarer/older/canonical works). All scoring in a new pure `lib/recommend.ts`; results cached in a table, recomputed on shelf change or pull-to-refresh; every card shows "because you read X". This is also the owner's intended M.Tech-adjacent project — v2 would swap heuristics for embeddings; keep the scoring file swappable.
4. Quality of life: sort/filter on list screens, separate notes field, vector icons for tabs.

## Explicitly rejected

- Social/accounts (personal app), barcode scanning (search is fast enough; camera lib risk in Expo Go), generic state-management libraries (DB-on-focus pattern is the architecture), `updateBook(fields)`-style generic setters.

## Operational facts

- Repo is local-only (no GitHub remote) — commits are the only safety net; commit often.
- EAS free tier ~30 builds/month — batch changes before rebuilding when practical.
- Owner's real library lives in the installed APK; Expo Go and each browser hold separate databases; JSON export/import (Stats) is the migration path between any two.
