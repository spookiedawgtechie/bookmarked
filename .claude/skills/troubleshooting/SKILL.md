---
name: troubleshooting
description: Known failure signatures in Bookmarked and their proven fixes — silent Expo Go crashes, EAS build failures, npm errors, web database breakage. Check here FIRST when something breaks.
---

# Troubleshooting — known failure signatures

Every entry below actually happened during development. Match the signature before debugging from scratch.

## App loads to ~99% in Expo Go, then silently exits to the Expo Go home screen

**No red screen, no Metro error output — that absence IS the signature.** A JS error would show a red box and log to Metro; silence means a **native module crash**: some imported package's native code is not compiled into Expo Go.

Diagnose: diff recently added dependencies against Expo Go compatibility (SDK-57 docs page must say "Included in Expo Go"). Historical instance: `@react-native-community/slider` → replaced with `@expo/ui/community/slider` (which required `legacy-peer-deps`, see below). Fix by replacing with an `expo-*`/`@expo/ui` equivalent, or accept the library and test via APK builds only.

## "Project is incompatible with this version of Expo Go"

Play Store Expo Go lags the project SDK. Sideload the matching APK from https://github.com/expo/expo-go-releases (uninstall the store copy first). Not fixable from code.

## Expo Go bundle hangs/errors after an Expo Go or SDK patch update

If tests/typecheck and `npx expo export --platform android` pass but the live Expo Go bundle hangs or fails, check SDK patch alignment before changing app code:

```powershell
npx expo install --check
npx expo install --fix
npx expo-doctor
```

All native-facing Expo packages must match the versions expected by the installed `expo` patch. `expo-symbols` also requires a direct `expo-font` dependency; Expo Doctor reports this even when Expo Go temporarily masks it. Stop every old Metro process after npm changes and restart with `npm start -- --clear`—a stale process can keep serving the old dependency graph or crash its watcher while `node_modules` is replaced.

## EAS build fails in "Install dependencies" phase within seconds

npm `ERESOLVE` peer conflict — `@expo/ui` → `react-dom@19.2.x` vs Expo-pinned `react`. The standing fix is the committed `.npmrc` (`legacy-peer-deps=true`). If this recurs: confirm `.npmrc` exists at project root and reproduce locally with a clean `npm ci`. Fetch build logs fast — `npx eas-cli build:view <id>` returns signed log URLs that expire in ~15 min.

## npm: `ECONNRESET` / "network connectivity" mid-install

The owner's network flakes against the npm registry. Not a config issue. Retry the identical command; if repeated, `$env:npm_config_fetch_retries="5"; $env:npm_config_fetch_timeout="300000"`.

## `EPERM: operation not permitted` on rename/rmdir during npm/expo commands

Windows file locking. Two known culprits: (1) a shell whose working directory is inside the folder being renamed — `cd` elsewhere; (2) Obsidian watching the folder — projects must live outside the vault. If a directory move is blocked, `robocopy /E /MOVE` succeeds file-by-file where a plain rename fails (may leave an empty locked husk that's deletable after the locking app restarts).

## Web: app loads but data doesn't persist / SQLite worker errors in console

Missing COOP/COEP headers (SQLite wasm needs `SharedArrayBuffer`). Verify:
```powershell
(Invoke-WebRequest -Uri <url> -Method Head -UseBasicParsing).Headers
```
Must contain `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin`. Sources of truth: `vercel.json` (prod), `serve.json` (local). Also remember expo-sqlite web is alpha upstream.

## Web: buttons "do nothing" (delete, dialogs)

`Alert.alert` is a no-op on react-native-web. Any direct `Alert` import is a bug — use `lib/alert.ts` helpers.

## Users asked to log into Vercel when opening the app

They got a deployment-hash URL (`bookmarked-<hash>-tanishhires-projects.vercel.app`) — those are login-protected by design. Share only https://bookmarked-psi.vercel.app.

## "Web Bundling failed … Unable to resolve react-native-web" (historical)

Someone pressed `w` before web support existed — now installed, shouldn't recur; if it does, `npx expo install react-native-web react-dom`.

## android app.json settings "not working"

They don't apply in Expo Go, only in EAS-built APKs (`predictiveBackGestureEnabled`, icons, package). Build an APK to test them.

## Where to see runtime errors

Run the dev server yourself and read the terminal: Metro prints JS errors from the device. `console.log` in app code appears there too. There is no adb/logcat installed on this machine; for a native-level crash in a standalone APK, install platform-tools or reproduce in Expo Go against a dev server you're watching.
