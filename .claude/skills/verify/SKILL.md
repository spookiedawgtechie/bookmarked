---
name: verify
description: Validation workflow for any Bookmarked change — typecheck, native bundle check, web check, commit conventions. Run before declaring any change done or shipping anything.
---

# Verify a change

Run all gates from the project root. GitHub Actions repeats the automated gates on every push and pull request with Node 22.

## Gate 1 — regression tests (always)

```
npm test
```

The lightweight `node:test` suite runs through `tsx` and covers stats math, Open Library metadata mapping, and transaction rollback/atomic-completion behavior. Add a focused regression test whenever a pure function or database invariant changes.

## Gate 2 — TypeScript (always)

```
npx tsc --noEmit
```

Must exit 0. The codebase is strict-typed; new `any`s are a smell.

## Gate 3 — native bundle (always)

```
npx expo export --platform android
```

This runs the real Metro production bundle (~25s) and catches broken imports, syntax that HMR tolerated, and asset issues that `tsc` cannot see. Must end with `Exported: dist`. Delete `dist/` afterwards (it's a verification artifact; the web deploy builds its own on Vercel):

```powershell
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
```

## Gate 4 — web smoke test (when UI or lib/ changed)

```
npx expo export --platform web
node scripts/postbuild-web.js
npx serve . -l 8090
```

Open the local URL in a browser: app boots to the Shelf, no console errors, and if the change touched data flow — add a book, reload, confirm it persisted. Remember `Alert` is a no-op on web; anything interactive you changed must be poked at here too (see `ui-conventions` for web pitfalls).

## Device check (when behavior/feel changed)

Bundle gates don't measure feel. For slider behavior, keyboard handling, navigation gestures: `npm start` + Expo Go on the phone (see `dev-loop`). The owner cares about polish — "compiles" is not "done".

## Commit

Commit after every verified, coherent change and push it to `origin`; the GitHub CI result is the final automated check.

```
git add -A
git commit -m "<what and why, imperative mood>"
```

If git identity isn't configured in a fresh environment: `git -c user.name="Tanish Hire" -c user.email="tanishhireweb@gmail.com" commit ...`. Multi-line messages: subject line, blank line, bullet points of notable decisions. The LF/CRLF warnings on Windows are noise.

## Definition of done

1. All applicable gates pass.
2. Committed with a message a future session can act on.
3. If it should reach users now: APK rebuilt (`release-android`) and PWA deployed (`release-pwa`) — remember there is no OTA; every change needs explicit shipping on BOTH channels. The two are fully independent (cloud APK build ~10–20 min, Vercel deploy ~1 min); order doesn't matter, just do both.
