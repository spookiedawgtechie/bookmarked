import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { notify } from '../lib/alert';
import { getAppSetting, setAppSetting } from '../lib/db';
import {
  PALETTES,
  useTheme,
  useThemedStyles,
  type PaletteId,
  type ThemeColors,
  type ThemeMode,
} from '../lib/theme';

export const RECAP_NAME_KEY = 'recap_name';

const MODES: readonly { value: ThemeMode; label: string; detail: string }[] = [
  { value: 'system', label: 'System', detail: 'Follow this device' },
  { value: 'light', label: 'Light', detail: 'Bright surfaces' },
  { value: 'dark', label: 'Dark', detail: 'Tinted surfaces' },
  { value: 'amoled', label: 'AMOLED', detail: 'Pure black' },
];

function normalizeRecapName(value: string): string {
  return value.trim().replace(/^@+/, '').slice(0, 24);
}

export function PersonalizationSettings({ refreshToken = 0 }: { refreshToken?: number }) {
  const db = useSQLiteContext();
  const { colors, palette, mode, setPalette, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [recapName, setRecapName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    let active = true;
    getAppSetting(db, RECAP_NAME_KEY)
      .then((value) => {
        if (!active) return;
        const normalized = normalizeRecapName(value ?? '');
        setRecapName(normalized);
        setSavedName(normalized);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [db, refreshToken]);

  async function choosePalette(next: PaletteId) {
    if (savingTheme || next === palette) return;
    setSavingTheme(true);
    try {
      await setPalette(next);
    } catch {
      notify('Theme not saved', 'Your previous palette is still active.');
    } finally {
      setSavingTheme(false);
    }
  }

  async function chooseMode(next: ThemeMode) {
    if (savingTheme || next === mode) return;
    setSavingTheme(true);
    try {
      await setMode(next);
    } catch {
      notify('Theme not saved', 'Your previous appearance is still active.');
    } finally {
      setSavingTheme(false);
    }
  }

  async function saveName() {
    if (savingName) return;
    const normalized = normalizeRecapName(recapName);
    setRecapName(normalized);
    setSavingName(true);
    try {
      await setAppSetting(db, RECAP_NAME_KEY, normalized);
      setSavedName(normalized);
      notify('Recap name saved', normalized ? `Recaps will show @${normalized}.` : 'Recaps will not show a name.');
    } catch {
      notify('Name not saved', 'Please try again.');
    } finally {
      setSavingName(false);
    }
  }

  return (
    <>
      <Text style={styles.label}>Colour palette</Text>
      <View style={styles.paletteGrid}>
        {PALETTES.map((option) => {
          const selected = option.id === palette;
          return (
            <Pressable
              key={option.id}
              style={[styles.paletteChip, selected && styles.selectedChip]}
              onPress={() => void choosePalette(option.id)}
              disabled={savingTheme}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: savingTheme }}
              accessibilityLabel={`${option.label} colour palette`}
            >
              <View style={[styles.swatch, { backgroundColor: option.seed }]} />
              <Text style={[styles.chipText, selected && styles.selectedText]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Appearance</Text>
      <View style={styles.modeGrid}>
        {MODES.map((option) => {
          const selected = option.value === mode;
          return (
            <Pressable
              key={option.value}
              style={[styles.modeChip, selected && styles.selectedChip]}
              onPress={() => void chooseMode(option.value)}
              disabled={savingTheme}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: savingTheme }}
              accessibilityLabel={`${option.label}: ${option.detail}`}
            >
              <Text style={[styles.modeTitle, selected && styles.selectedText]}>
                {option.label}
              </Text>
              <Text style={styles.modeDetail}>{option.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Recap name</Text>
      <Text style={styles.help}>
        Optional and private. It appears as @name on recap posters and travels with backups.
      </Text>
      <View style={styles.nameRow}>
        <View style={styles.inputShell}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={recapName}
            onChangeText={setRecapName}
            placeholder="yourname"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void saveName()}
            accessibilityLabel="Recap name"
          />
        </View>
        <Pressable
          style={[
            styles.saveButton,
            (savingName || normalizeRecapName(recapName) === savedName) && styles.disabled,
          ]}
          onPress={() => void saveName()}
          disabled={savingName || normalizeRecapName(recapName) === savedName}
          accessibilityRole="button"
          accessibilityLabel="Save recap name"
        >
          <Text style={styles.saveText}>{savingName ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors) => ({
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 9,
    marginTop: 4,
  },
  paletteGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 18 },
  paletteChip: {
    minHeight: 44,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  selectedChip: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' as const },
  selectedText: { color: colors.primary },
  modeGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 18 },
  modeChip: {
    minWidth: 118,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' as const },
  modeDetail: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  help: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: -3, marginBottom: 9 },
  nameRow: { flexDirection: 'row' as const, gap: 8, alignItems: 'stretch' as const },
  inputShell: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  at: { color: colors.textDim, fontSize: 15, fontWeight: '700' as const },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 4, paddingVertical: 10 },
  saveButton: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 14,
  },
  saveText: { color: colors.onAccent, fontSize: 14, fontWeight: '800' as const },
  disabled: { opacity: 0.5 },
});
