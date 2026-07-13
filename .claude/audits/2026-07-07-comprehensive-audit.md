# Comprehensive audit — 2026-07-07

Full security / reliability / concurrency / accessibility / UI-consistency audit, performed at commit `89f1fa3` (post recap-upgrades, README added, repo public). No code was changed during the audit. Statuses below should be updated in place as findings are fixed.

## Scope reality

Local-first, single-user app: no server, no auth, no sessions, no payments, no tenants. Those audit categories are absent surfaces, not passes. Real trust boundaries: (1) Open Library API responses, (2) user-imported backup JSON, (3) browser storage / multi-tab environment, (4) share-sheet exports.

## Verified positives

- All SQL parameterized (`lib/db.ts`, `lib/backup.ts`) — no injection path.
- Untrusted API text renders only via RN `Text` / RNW text nodes — no XSS vector exists today.
- No secrets/keys in repo (verified before going public); no source maps in `dist/`.
- All theme text colors pass WCAG AA contrast on their real backgrounds (textDim/card ≈ 6.3:1, green/black ≈ 11.8:1, orange/card ≈ 7.2:1).

## Findings

| ID | Sev | Category | Location | Summary | Status |
|---|---|---|---|---|---|
| H1 | High | Accessibility | `index.tsx` CoverThumb, `list/[status].tsx` | Cover-only grids: image-only Pressables, no accessibilityLabel/alt — shelves unusable with screen readers | OPEN |
| H2 | High | Accessibility | app-wide | No accessible names anywhere: +/✓/✕ buttons, unlabeled sliders (bare `input[type=range]` on web), heatmap = ~370 empty views, no disabled-state conveyance | OPEN |
| M1 | Med | Race | `search.tsx:34-52` | Debounce cleanup clears timer only; in-flight fetch not aborted → stale out-of-order results overwrite newer | FIXED (cancelled-flag guard; block 3) |
| M2 | Med | Race/Data | `index.tsx` saveLog | Double-tap Save = duplicate session rows (UNIQUE includes ms timestamp) → inflated page stats/streaks. **Fix before next release** | FIXED (saving guard + disabled btn; 8c229d5) |
| M3 | Med | Security/Reliability | `backup.ts` importLibrary | Only ol_key/title type-checked; bad `status` → book vanishes from all shelves; string `rating` → string-concat avg; bad `total_pages` → NaN slider. **Fix before next release** | FIXED (per-field validators; 8c229d5) |
| M4 | Med | Reliability | stats.tsx export onPress, search onAdd, all [id].tsx write handlers, `share.ts` | Unhandled rejections; canceling web share ALWAYS rejects with AbortError (unhandled); recap handleShare reports user-cancel as "Share failed" | FIXED (AbortError swallow + notify() on all writes; 8fc47fd) |
| M5 | Med | Reliability | importLibrary, deleteBook | No transactions — partial import / orphaned state on interruption; slow row-by-row import | FIXED (withTransactionAsync; 8c229d5) |
| M6 | Med | Reliability | web/OPFS | Multi-tab PWA behavior undefined on alpha sqlite-wasm; test two tabs writing before adding guards | NEEDS VERIFICATION |
| M7 | Med | Reliability | web startup | `navigator.storage.persist()` never called — eviction risk higher than necessary; one-line fix | OPEN |
| M8 | Med | Reliability | `openlibrary.ts` ×3 | No fetch timeouts → infinite spinners on dead networks (search/description/covers) | FIXED (fetchWithTimeout 10s; block 3) |
| L1 | Low | Reliability | `[id].tsx` desc effect | Transient OL 5xx caches `''` sentinel permanently (fetchDescription returns null on any !ok; should 404-only) | FIXED (404-only null, else throw; block 3) |
| L2 | Low | Race | `[id].tsx` timers | Debounce timers not cleaned on unmount; write lands after back-nav → stale Shelf until next focus. Fix = flush-on-unmount, not cancel | OPEN |
| L3 | Low | Copy | recap fastest note | "1 days" — missing pluralization (year strip does it right) | OPEN |
| L4 | Low | Consistency | `[id].tsx:deleteBtnText` + 5 files | Hardcoded hex outside theme: `#E5534B`, `#000`-on-green, rgba overlays → add danger/onAccent/overlay tokens | OPEN |
| L5 | Low | Visual/A11y | `(tabs)/_layout.tsx` | Tab emoji renders doubled on web ("📚 📚 Shelf"); SRs announce twice | OPEN |
| L6 | Low | Consistency | recap list vs detail | Date formats: "07-07" (MM-DD) vs "YYYY-MM-DD"; no locale; add one formatDate helper | OPEN |
| L7 | Low | Visual | `index.tsx:24`, `list/[status].tsx:13` | `Dimensions.get` at module scope — stale on web resize (native safe: portrait-locked). Use `useWindowDimensions` | OPEN |
| L8 | Low | Visual | `[id].tsx` author | No numberOfLines — multi-author books wrap unbounded | OPEN |
| L9 | Low | Reliability | recap/[year], book/[id] | `/recap/abc` → "NaN in books"; `/book/999` → permanent blank (no not-found state) | OPEN |
| L10 | Low | Accessibility | 11px text sites | Legibility + font-scaling may clip fixed-height bars/cards; test at 1.3× scale | OPEN |
| L11 | Low | Reliability/UX | stats.tsx import | No confirm before import's documented blind overwrite; `confirmDialog` already exists — use it | FIXED (confirmDialog gate; 8fc47fd) |
| L12 | Low | Security | vercel.json | No CSP/XCTO/Referrer-Policy (only COOP/COEP, verified live). Defense-in-depth only — CSP needs `wasm-unsafe-eval` + OL hosts, verify on preview first | OPEN |
| I1 | Info | Accessibility | web Modals | Focus trap/Escape/restore untested on RNW | NEEDS VERIFICATION |
| I2 | Info | Consistency | stats vs recap | Two definitions of "Avg rating" (all rated books vs year's finished) | OPEN |
| I3 | Info | Content | descriptions | OL blurbs can embed spam/piracy markdown links; rendered inert (safe); consider stripping | OPEN |
| I4 | Info | Performance | data layer | Full-table loads on focus: fine at personal scale, deliberate — no action | CLOSED |
| I5 | Info | Correctness | dates | Local-time bucketing over UTC timestamps: safe for IST; only ±12h TZs could edge-shift | CLOSED |
| I6 | Info | Performance | import | Main-thread JSON.parse of huge files — personal-scale non-issue | CLOSED |
| I7 | Info | Legal | LICENSE | Still Expo's template MIT; owner decision pending | OPEN |
| I8 | Info | Reliability | APK | predictiveBackGestureEnabled set but reported non-functional; check device dev-toggle first | OPEN |

## Agreed sequencing

1. Data integrity trio: M2, M3, M5 — gate for the next APK/PWA release.
2. Failure-handling sweep: M4, L1, L11 (one commit).
3. Network robustness: M8 + M1 (one commit).
4. Web hardening: M7 now; M6 experiment; L12 last (verify CSP against wasm on a preview deploy).
5. Accessibility pass: H1, H2, L5, L10, I1 — own session, must verify with TalkBack on device.
6. Polish batch: L3, L4, L6, L7, L8, L9.

Quick wins (<~15 lines each): M2 guard, M7 persist(), M8 timeouts, AbortError swallow, L1, L3, L8, L9, L11.

## Remediation log

- 2026-07-07, blocks 1–3 (commits 8c229d5, 8fc47fd, +block-3 commit): M1–M5, M8, L1, L11 all fixed and verified (tsc, android bundle, web smoke test incl. live confirm-dialog and search-flow checks). **Both release gates cleared** — next APK/PWA ship is unblocked whenever the owner asks (standing rule: never build/deploy unless explicitly requested). Remaining open: H1/H2 a11y pass, M6/M7/L12 web hardening, polish batch (L2–L10), I-items.

## Release verdict at audit time

Safe to ship for current audience. No Critical findings — no path to another person's data exists; worst outcomes are self-inflicted stats corruption (M2/M3), which gate the next release. H1/H2 define the gap between "my app" and "an app I share" — prioritize if the public ambition is real.
