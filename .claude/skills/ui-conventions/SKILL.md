---
name: ui-conventions
description: Bookmarked's UI patterns — AMOLED theme, layout math, cross-platform pitfalls (web Alert no-op, slider API, keyboard). Use when building or modifying any screen or component.
---

# UI conventions

## Design system

- **AMOLED dark is the identity**: background pure `#000000`, cards `#141414`, Letterboxd accents — green `#00E054` (reading/primary actions), blue `#40BCF4` (want to read), orange `#FF8000` (read/ratings). All colors come from `lib/theme.ts` — never hardcode a color in a screen.
- Plain `StyleSheet.create` — no NativeWind/styled-components. Match the existing style: section labels are 13px uppercase with letterSpacing, cards use borderRadius 10–14.
- Tab icons are emoji (vector icons were never installed). If upgrading, `@expo/vector-icons` is Expo Go-safe but is NOT currently a dependency — `npx expo install @expo/vector-icons` first.
- Owner preference: dense grids. Use the shared helpers in `lib/layout.ts`: **4 columns** below 700px, **5 columns** from 700px, and **6 columns** from 1100px. Library surfaces stop growing at 1200px; reading/detail surfaces stop at 900px.

## Layout math (home screen)

Home rows sit inside cards: screen padding 16/side + card padding `CARD_PAD = 12`/side. `gridCoverWidth()` first constrains the viewport to `LIBRARY_MAX_WIDTH`, then fills the selected column count exactly; height remains `1.5 × width` (book aspect). The full-grid list screens (`app/list/[status].tsx`) omit the card-padding inset. Never duplicate this math in a screen—change `lib/layout.ts` and its `tests/layout.test.ts` expectations together.

On desktop, the Shelf uses the 1200px library canvas and wraps Currently Reading cards into two columns. Search, Stats, detail, and recap use the centered 900px readable canvas. The web tab bar is compact and centered; Android keeps the native full-width tab bar. Preserve phone spacing and behavior when adjusting desktop styles.

## Cross-platform pitfalls (the app ships to Android APK AND web PWA)

- **`Alert.alert` is a silent no-op on react-native-web.** Never import Alert directly — use `notify()` / `confirmDialog()` from `lib/alert.ts` (they fall back to `window.alert`/`window.confirm` on web). This bug shipped once (broken delete on PWA); don't reintroduce it.
- **Slider**: use `@expo/ui/community/slider` — NOT `@react-native-community/slider` (its native module is absent from Expo Go 57 → silent startup crash). The @expo/ui slider has **no `onSlidingComplete`**; persist via debounced `onValueChange` (existing pattern: 600 ms setTimeout stored in a useRef, cleared on each change). `maximumTrackTintColor`/`thumbTintColor` work on Android only.
- **Keyboard over inputs**: Review keeps the simple delayed `scrollToEnd` behavior. Notes is the last Android field and needs more: `keyboardDidShow` records the actual keyboard height, a temporary bottom spacer creates scroll room, and Notes scrolls at 100 ms and 400 ms around the keyboard animation. Reuse the stronger pattern for any future bottom-most multiline input; `KeyboardAvoidingView` `behavior="padding"` is iOS-only.
- **File APIs**: `expo-file-system/legacy` for `readAsStringAsync` (the new File API is not used here); `expo-sharing` to share files on native; on web prefer `navigator.share({ files })` when `navigator.canShare` allows, else anchor-download (pattern in `lib/backup.ts`).

## Navigation & data-flow patterns

- expo-router file routing: `app/(tabs)/` = tab screens; dynamic routes `app/book/[id].tsx`, `app/list/[status].tsx`, `app/recap/[year].tsx`. New screens = new files; set titles with `<Stack.Screen options={{ title }} />` inside the file.
- Screens get the DB with `useSQLiteContext()` and re-query on every focus: `useFocusEffect(useCallback(() => { getAllBooks(db).then(setBooks); }, [db]))`. **No caching, no global state** — the DB is the single source of truth; this is deliberate.
- **Fixed-choice (enum) fields**: the canonical pattern is the status button row in `app/book/[id].tsx` — a `STATUSES` array of `{ value, label, accent }` mapped to flex-1 Pressables, active one filled with its accent color and black text. Reuse this for any new enum field (e.g. a physical/ebook/audiobook format picker); don't invent segmented controls or tap-to-cycle.
- Bottom sheets are plain `<Modal transparent animationType="slide">` with an overlay Pressable to dismiss (patterns: log-progress modal in `app/(tabs)/index.tsx`, cover picker in `app/book/[id].tsx`). No bottom-sheet libraries.
- Release notes use the shared `components/WhatsNewModal.tsx` centered dialog. Content comes only from `lib/releases.ts`; do not duplicate release text in screens. Startup acknowledgement is stored in `app_settings`, while Stats can reopen the current notes without changing that setting.
- Sorting: Currently Reading by `updatedAt ?? startedAt` desc (latest logged first; the fallback covers imported/never-logged books); Read by `finishedAt` desc; Want by `addedAt` desc (natural query order).
