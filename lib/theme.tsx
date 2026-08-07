import type { SQLiteDatabase } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { getAppSetting, setAppSetting } from './db';

export type PaletteId = 'sage' | 'ink' | 'ocean' | 'plum' | 'ember';
export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type ThemeColors = {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  primary: string;
  primaryContainer: string;
  secondary: string;
  tertiary: string;
  danger: string;
  onAccent: string;
  overlay: string;
  badgeBg: string;
  green: string;
  blue: string;
  orange: string;
};

export type PaletteDefinition = {
  id: PaletteId;
  label: string;
  seed: string;
  light: readonly [string, string, string];
  dark: readonly [string, string, string];
  lightSurface: readonly [string, string, string];
  darkSurface: readonly [string, string, string];
};

export const PALETTES: readonly PaletteDefinition[] = [
  {
    id: 'sage',
    label: 'Sage',
    seed: '#55735B',
    light: ['#356A45', '#49664F', '#59624A'],
    dark: ['#9CD4A7', '#B0CCB2', '#C1C9A6'],
    lightSurface: ['#F7FBF5', '#EFF5ED', '#D8E1D6'],
    darkSurface: ['#171D18', '#202721', '#39413A'],
  },
  {
    id: 'ink',
    label: 'Ink',
    seed: '#5D5F9E',
    light: ['#52569A', '#5E5D72', '#77536D'],
    dark: ['#BEC2FF', '#C7C4DD', '#E7B9D6'],
    lightSurface: ['#FBF8FF', '#F3F0FA', '#DFDDE9'],
    darkSurface: ['#1B1B22', '#24242D', '#3F3E49'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    seed: '#26759A',
    light: ['#00658F', '#3D626F', '#535F7D'],
    dark: ['#82CFFF', '#A5CBD8', '#BBC6EA'],
    lightSurface: ['#F6FAFD', '#EDF4F7', '#D6E1E6'],
    darkSurface: ['#151C20', '#1E272C', '#374148'],
  },
  {
    id: 'plum',
    label: 'Plum',
    seed: '#855A7C',
    light: ['#80516F', '#715765', '#785663'],
    dark: ['#F1B5D5', '#DFC0CE', '#E9B9C7'],
    lightSurface: ['#FFF7FB', '#F8EFF4', '#E8DCE2'],
    darkSurface: ['#21191E', '#2C2228', '#493A42'],
  },
  {
    id: 'ember',
    label: 'Ember',
    seed: '#9A6334',
    light: ['#875018', '#745B42', '#6A5E2E'],
    dark: ['#FFB875', '#E4C1A3', '#D7CA8B'],
    lightSurface: ['#FFF8F3', '#F9F0E9', '#E8DDD4'],
    darkSurface: ['#211A15', '#2D241D', '#4A3D33'],
  },
] as const;

export const THEME_PALETTE_KEY = 'theme_palette';
export const THEME_MODE_KEY = 'theme_mode';

function paletteById(id: PaletteId): PaletteDefinition {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[1];
}

export function themeColors(
  paletteId: PaletteId,
  mode: ResolvedThemeMode
): ThemeColors {
  const palette = paletteById(paletteId);
  const accents = mode === 'light' ? palette.light : palette.dark;
  const surfaces =
    mode === 'amoled'
      ? (['#000000', '#000000', '#282828'] as const)
      : mode === 'light'
        ? palette.lightSurface
        : palette.darkSurface;
  const isLight = mode === 'light';

  return {
    bg: surfaces[0],
    card: surfaces[1],
    cardAlt: isLight ? '#FFFFFF' : mode === 'amoled' ? '#000000' : surfaces[0],
    border: surfaces[2],
    text: isLight ? '#1B1B1F' : '#F2EFF4',
    textDim: isLight ? '#5F6068' : '#B8B5BE',
    primary: accents[0],
    primaryContainer: isLight ? `${accents[0]}1A` : `${accents[0]}26`,
    secondary: accents[1],
    tertiary: accents[2],
    danger: isLight ? '#BA1A1A' : '#FFB4AB',
    onAccent: isLight ? '#FFFFFF' : '#202027',
    overlay: 'rgba(0,0,0,0.68)',
    badgeBg: 'rgba(0,0,0,0.78)',
    // Compatibility aliases while screens move to semantic roles.
    green: accents[0],
    blue: accents[1],
    orange: accents[2],
  };
}

// Safe pre-provider fallback for the web single-tab gate.
export const colors = themeColors('ink', 'amoled');

type ThemeContextValue = {
  colors: ThemeColors;
  palette: PaletteId;
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  ready: boolean;
  setPalette: (palette: PaletteId) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function validPalette(value: string | null): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

function validMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark' || value === 'amoled';
}

export function ThemeProvider({
  db,
  children,
}: {
  db: SQLiteDatabase;
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [palette, setPaletteState] = useState<PaletteId>('ink');
  const [mode, setModeState] = useState<ThemeMode>('amoled');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAppSetting(db, THEME_PALETTE_KEY),
      getAppSetting(db, THEME_MODE_KEY),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM library_items'),
    ])
      .then(([storedPalette, storedMode, library]) => {
        if (!active) return;
        if (validPalette(storedPalette)) {
          setPaletteState(storedPalette);
        } else {
          void setAppSetting(db, THEME_PALETTE_KEY, 'ink').catch(() => {});
        }
        if (validMode(storedMode)) {
          setModeState(storedMode);
        } else {
          const initialMode = (library?.count ?? 0) > 0 ? 'amoled' : 'system';
          setModeState(initialMode);
          void setAppSetting(db, THEME_MODE_KEY, initialMode).catch(() => {});
        }
      })
      .catch(() => {
        // Theme loading must never prevent the local library from opening.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const resolvedMode: ResolvedThemeMode =
    mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
  const activeColors = useMemo(
    () => themeColors(palette, resolvedMode),
    [palette, resolvedMode]
  );

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(activeColors.bg).catch(() => {});
    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = activeColors.bg;
      document.body.style.backgroundColor = activeColors.bg;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', activeColors.bg);
    }
  }, [activeColors.bg]);

  const setPalette = useCallback(
    async (next: PaletteId) => {
      setPaletteState(next);
      try {
        await setAppSetting(db, THEME_PALETTE_KEY, next);
      } catch (error) {
        setPaletteState(palette);
        throw error;
      }
    },
    [db, palette]
  );

  const setMode = useCallback(
    async (next: ThemeMode) => {
      setModeState(next);
      try {
        await setAppSetting(db, THEME_MODE_KEY, next);
      } catch (error) {
        setModeState(mode);
        throw error;
      }
    },
    [db, mode]
  );

  const value = useMemo(
    () => ({
      colors: activeColors,
      palette,
      mode,
      resolvedMode,
      ready,
      setPalette,
      setMode,
    }),
    [activeColors, mode, palette, ready, resolvedMode, setMode, setPalette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useThemedStyles<T>(factory: (theme: ThemeColors) => T): T {
  const { colors: activeColors } = useTheme();
  return useMemo(() => factory(activeColors), [activeColors, factory]);
}
