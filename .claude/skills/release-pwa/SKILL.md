---
name: release-pwa
description: Build, verify, and deploy the Bookmarked web app (PWA) to Vercel. Use when shipping web changes, debugging the browser version, or when SQLite-on-web breaks.
---

# PWA release (web on Vercel)

Live URL (public, share this one): **https://bookmarked-psi.vercel.app**
Vercel project: `tanishhires-projects/bookmarked`, deployed from the owner's logged-in Vercel CLI.

## How the web build works

- Same codebase; `react-native-web` renders, **expo-sqlite runs on WebAssembly** (alpha-quality upstream — expect occasional weirdness). `metro.config.js` registers `.wasm` as an asset — do not remove.
- `app.json` web config: `"bundler": "metro", "output": "single"` (SPA; deep links handled by the rewrite in vercel.json).
- **`scripts/postbuild-web.js` must run after every web export.** It copies `public/` (manifest, apple-touch-icon, PWA icons, og-image) into `dist/` and injects the `<head>` tags Expo's single-output HTML lacks: manifest link, apple-touch-icon (required for iOS Add-to-Home-Screen icons), theme-color, and Open Graph tags (link previews). The production URL is hardcoded as `SITE` inside it — update if the domain ever changes.

## The headers that must never disappear

SQLite-on-web needs `SharedArrayBuffer`, which browsers only enable under:

```
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

Configured in `vercel.json` (production) and `serve.json` (local). If the database silently stops working on web (app loads, data never persists / worker errors in console), **check these headers first** — `Invoke-WebRequest -Method Head` against the URL and look for the two `Cross-Origin-*` headers.

## Local verification

```
npx expo export --platform web
node scripts/postbuild-web.js
npx serve . -l 8090     # run from project root; serve.json points it at dist/ with the headers
```

Then in a browser: add a book via Search, reload the page, confirm the book survived (persistence check), and check DevTools console for errors.

## Deploy

```
npx vercel --prod --yes
```

Vercel runs the build itself (`buildCommand` in vercel.json includes the postbuild step) — a local `dist/` is irrelevant to what gets deployed. Two URLs come back: the long hash URL is login-protected (deployment-internal, useful for private preview); only the short `bookmarked-psi.vercel.app` alias is public.

## Platform caveats to remember (and tell users)

- **iOS Safari can evict site storage after weeks of disuse** — iPhone users should occasionally use Stats → Export library as JSON. Import restores/merges by book identity, and **accepts `.txt` files too** (the picker allows `text/plain`) — a backup that got renamed or auto-saved with a .txt extension still restores fine; never tell a user a .txt backup is unusable.
- iOS home-screen icon is snapshotted at add-time: after icon changes, remove and re-add the shortcut.
- Link-preview (OG) changes are cached by messengers for up to ~a day.
- Each browser/device has its own independent database — no sync, by design.
