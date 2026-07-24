---
name: release-android
description: Build and ship the Android APK via EAS cloud builds. Use when releasing an update to the installed app, changing icons/native config, or an EAS build fails.
---

# Android release (EAS APK)

The app is distributed as a sideloaded APK — no Play Store. EAS project: `spookiedawgtechie/bookmarked` (owner's Expo account; `eas whoami` should show `spookiedawgtechie`). Signing keystore lives on Expo's servers — never needs local handling.

## When a new APK is needed

**Every change needs a new APK** — there is no OTA update mechanism (`expo-updates` is NOT configured). JS-only changes, icon changes, `app.json` android settings: all require a rebuild + reinstall. Installing over the top preserves the user's database; only uninstalling deletes data.

## Build

```
cd "C:\Users\Tanish Hire\Documents\Programming ALL\mobile-apps\bookmarked"
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
```

- `preview` profile in `eas.json` sets `"buildType": "apk"` (installable file) and `"autoIncrement": true` so every sideloaded update gets a higher remote Android `versionCode`. The default/production profile would produce an .aab (Play Store format) — not what we want.
- Builds take ~10–20 min in the cloud and finish even if the PC shuts down.
- Status: `npx eas-cli build:list --platform android --limit 1 --non-interactive`
- Details/logs of a specific build: `npx eas-cli build:view <build-id>` (the signed log URLs it returns expire in ~15 minutes — fetch promptly).
- Builds page (download/QR install): https://expo.dev/accounts/spookiedawgtechie/projects/bookmarked/builds — note builds appear under the *project*, not the account profile page.

## Known failure modes

- **Fails in "Install dependencies" phase within seconds** → npm peer-dependency conflict. The fix that already exists: `.npmrc` with `legacy-peer-deps=true` is committed at the project root. If this failure returns, check `.npmrc` still exists and is committed (EAS builds from the uploaded project snapshot — uncommitted files DO upload, but the file must be present).
- **`versionCode`**: managed remotely (`appVersionSource: "remote"` in eas.json) and auto-incremented by the preview profile. `expo.version` is the user-facing version name and must match `lib/releases.ts`; `tests/releases.test.ts` guards the app/package values. If Android ever refuses to install an update ("app not installed"), inspect the remote versionCode and signing identity rather than repeatedly rebuilding.
- Icons: `assets/icon.png` + `android-icon-*` layers (adaptive foreground/background/monochrome) bake into the APK at build time. They were generated as pure-black + green bookmark ribbon by `scripts/gen-icons.ps1` (PowerShell + GDI+, no external tools) — rerun it to regenerate all sizes, including the PWA icons in `public/`.

## Checklist before queueing a build

1. Run the `verify` skill workflow (typecheck + Android bundle + web check if UI changed).
2. Commit everything (builds record the git hash; keep it meaningful).
3. Queue the build; tell the owner to install from the builds page when finished.
4. If the change also affects the PWA (any JS change does), deploy web too — see `release-pwa`.
