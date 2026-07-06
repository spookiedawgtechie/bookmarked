---
name: ui-conventions
description: Bookmarked's UI patterns — AMOLED theme, layout math, cross-platform pitfalls (web Alert no-op, slider API, keyboard). Use when building or modifying any screen or component.
---

# UI conventions

## Design system

- **AMOLED dark is the identity**: background pure `#000000`, cards `#141414`, Letterboxd accents — green `#00E054` (reading/primary actions), blue `#40BCF4` (want to read), orange `#FF8000` (read/ratings). All colors come from `lib/theme.ts` — never hardcode a color in a screen.
- Plain `StyleSheet.create` — no NativeWind/styled-components. Match the existing style: section labels are 13px uppercase with letterSpacing, cards use borderRadius 10–14.
- Tab icons are emoji (vector icons were never installed). If upgrading, `@expo/vector-icons` is Expo Go-safe but is NOT currently a dependency — `npx expo install @expo/vector-icons` first.
- Owner preference: dense grids — home rows and list screens use **4 columns** (`GRID_COLS = 4`).

## Layout math (home screen)

Home rows sit inside cards: screen padding 16/side + card padding `CARD_PAD = 12`/side. Thumb width is computed to fill the card interior exactly:
`COVER_W = floor((windowWidth - 32 - 2*CARD_PAD - (GRID_COLS-1)*GRID_GAP) / GRID_COLS)`, height = `1.5 × width` (book aspect). The full-grid list screens (`app/list/[status].tsx`) have no card, so they omit the `CARD_PAD` term. If you change padding anywhere, keep these formulas in sync or covers will overflow/underfill.

## Cross-platform pitfalls (the app ships to Android APK AND web PWA)

- **`Alert.alert` is a silent no-op on react-native-web.** Never import Alert directly — use `notify()` / `confirmDialog()` from `lib/alert.ts` (they fall back to `window.alert`/`window.confirm` on web). This bug shipped once (broken delete on PWA); don't reintroduce it.
- **Slider**: use `@expo/ui/community/slider` — NOT `@react-native-community/slider` (its native module is absent from Expo Go 57 → silent startup crash). The @expo/ui slider has **no `onSlidingComplete`**; persist via debounced `onValueChange` (existing pattern: 600 ms setTimeout stored in a useRef, cleared on each change). `maximumTrackTintColor`/`thumbTintColor` work on Android only.
- **Keyboard over inputs**: the detail screen scrolls the review box into view with `onFocus` → `setTimeout(() => scrollRef.current?.scrollToEnd(), 250)` (delay lets the keyboard animation finish). Reuse this pattern for new bottom-of-screen inputs; `KeyboardAvoidingView` `behavior="padding"` is iOS-only.
- **File APIs**: `expo-file-system/legacy` for `readAsStringAsync` (the new File API is not used here); `expo-sharing` to share files on native; on web prefer `navigator.share({ files })` when `navigator.canShare` allows, else anchor-download (pattern in `lib/backup.ts`).

## Navigation & data-flow patterns

- expo-router file routing: `app/(tabs)/` = tab screens; dynamic routes `app/book/[id].tsx`, `app/list/[status].tsx`, `app/recap/[year].tsx`. New screens = new files; set titles with `<Stack.Screen options={{ title }} />` inside the file.
- Screens get the DB with `useSQLiteContext()` and re-query on every focus: `useFocusEffect(useCallback(() => { getAllBooks(db).then(setBooks); }, [db]))`. **No caching, no global state** — the DB is the single source of truth; this is deliberate.
- **Fixed-choice (enum) fields**: the canonical pattern is the status button row in `app/book/[id].tsx` — a `STATUSES` array of `{ value, label, accent }` mapped to flex-1 Pressables, active one filled with its accent color and black text. Reuse this for any new enum field (e.g. a physical/ebook/audiobook format picker); don't invent segmented controls or tap-to-cycle.
- Bottom sheets are plain `<Modal transparent animationType="slide">` with an overlay Pressable to dismiss (patterns: log-progress modal in `app/(tabs)/index.tsx`, cover picker in `app/book/[id].tsx`). No bottom-sheet libraries.
- Sorting: Currently Reading by `updatedAt ?? startedAt` desc (latest logged first; the fallback covers imported/never-logged books); Read by `finishedAt` desc; Want by `addedAt` desc (natural query order).
