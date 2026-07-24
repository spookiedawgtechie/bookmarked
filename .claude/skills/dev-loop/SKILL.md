---
name: dev-loop
description: Run and test Bookmarked during development — dev server, Expo Go on the Android phone, hot reload. Use when starting a work session, testing changes on a device, or the app won't load in Expo Go.
---

# Development loop

Project root: `C:\Users\Tanish Hire\Documents\Programming ALL\mobile-apps\bookmarked`
Stack: Expo SDK 57, React Native 0.86, expo-router, TypeScript. Entry is `"main": "expo-router/entry"` in package.json — there is no App.tsx/index.ts; screens live in `app/`.

## Start the dev server

```
cd "C:\Users\Tanish Hire\Documents\Programming ALL\mobile-apps\bookmarked"
npm start
```

On the phone: open **Expo Go** (same Wi-Fi as the PC), scan the QR, or "Enter URL manually" with `exp://<PC-LAN-IP>:8081`. Get the PC IP with:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp','Manual' -and $_.IPAddress -ne '127.0.0.1' }).IPAddress
```

JS edits hot-reload in ~1s. Press `r` in the terminal to force reload, `--clear` flag on start to reset Metro's cache after dependency changes.

After Expo Go or any SDK package updates, run `npx expo install --check` and `npx expo-doctor`. Use `npx expo install --fix` for patch alignment, install any reported native peer directly, stop the existing Metro process, then restart with `npm start -- --clear`. Never run npm installs while relying on the same live Metro watcher; replacing `node_modules` invalidates its file watches.

## Expo Go — critical facts

- **Expo Go on the Play Store lags behind the project SDK.** If the app says "Project is incompatible with this version of Expo Go", sideload the matching version from Expo's official releases: https://github.com/expo/expo-go-releases (e.g. `Expo-Go-57.0.2.apk`). Uninstall the Play Store copy first.
- **Only native modules compiled into Expo Go can run in Expo Go.** Adding any other package with native code causes a *silent crash at startup* — no red screen, no Metro error, straight back to the Expo Go home screen (see the `troubleshooting` skill, this exact signature). Before adding a dependency, confirm its SDK-57 docs page says "Included in Expo Go", or prefer `expo-*` / `@expo/ui` packages.
- **`app.json` `android.*` settings do nothing in Expo Go** (icons, `package`, `predictiveBackGestureEnabled`). They only take effect in an EAS-built APK.
- **Expo Go and the installed APK keep separate databases.** Dev experiments never touch the owner's real library. To move data: Stats tab → Export/Import JSON.

## npm / Node on this machine

- `.npmrc` contains `legacy-peer-deps=true`. This is **required** — `@expo/ui` pulls `react-dom@19.2.x` whose peer range conflicts with the Expo-pinned `react`. Never delete this file; an EAS build without it fails in the Install dependencies phase.
- Node here is v23 (non-LTS): `EBADENGINE` warnings on every install are noise, ignore them. If Node is ever reinstalled, pick 22 LTS.
- This network intermittently drops npm registry connections (`ECONNRESET`). It is not a config problem — retry the same command, optionally with `$env:npm_config_fetch_retries="5"`.
- Never create or move Node projects inside the Obsidian vault (`...\Obsidian Vaults\brain`) — Obsidian's file watcher holds locks that break npm/Expo atomic writes (EPERM).

## Rule from AGENTS.md

Expo's APIs changed significantly around SDK 54–57. Before writing code against any Expo API, read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ — do not trust training-data memory of Expo.
