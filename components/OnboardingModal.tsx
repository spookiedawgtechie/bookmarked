import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useThemedStyles, type ThemeColors } from '../lib/theme';

type OnboardingModalProps = {
  visible: boolean;
  onStart: () => void;
  onSkip: () => void;
  saving?: boolean;
  error?: string | null;
};

export const ONBOARDING_COMPLETE_KEY = 'onboarding_completed';

const STEPS = [
  {
    number: '01',
    title: 'Find your physical edition',
    detail: 'Search by title or ISBN, compare copies, then save the edition and cover you actually own.',
  },
  {
    number: '02',
    title: 'Track the reading itself',
    detail: 'Log pages, finish dates, ratings, reviews, private notes and future rereads.',
  },
  {
    number: '03',
    title: 'Keep your library yours',
    detail: 'Bookmarked is local-first. Export a JSON backup occasionally so your history can move safely between devices.',
  },
] as const;

export function OnboardingModal({
  visible,
  onStart,
  onSkip,
  saving = false,
  error = null,
}: OnboardingModalProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onSkip}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={styles.card}
          accessibilityViewIsModal
          accessibilityLabel="Welcome to Bookmarked"
        >
          <Text style={styles.eyebrow}>Your private reading shelf</Text>
          <Text style={styles.title} accessibilityRole="header">
            Welcome to Bookmarked
          </Text>
          <Text style={styles.intro}>
            Build a personal record of the physical books you own and the life you spend reading them.
          </Text>

          <ScrollView
            style={styles.steps}
            contentContainerStyle={styles.stepsContent}
            showsVerticalScrollIndicator={false}
          >
            {STEPS.map((step) => (
              <View key={step.number} style={styles.step}>
                <Text style={styles.number}>{step.number}</Text>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[styles.startButton, saving && styles.disabled]}
            onPress={onStart}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Start by finding a book"
          >
            <Text style={styles.startText}>{saving ? 'Opening…' : 'Find my first book'}</Text>
          </Pressable>
          <Pressable
            style={styles.skipButton}
            onPress={onSkip}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
          >
            <Text style={styles.skipText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => ({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  card: {
    width: '100%' as const,
    maxWidth: 580,
    maxHeight: '90%' as const,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
  },
  title: { color: colors.text, fontSize: 29, fontWeight: '800' as const, marginTop: 7 },
  intro: { color: colors.textDim, fontSize: 15, lineHeight: 22, marginTop: 8 },
  steps: { marginTop: 20, flexShrink: 1 },
  stepsContent: { gap: 14, paddingBottom: 4 },
  step: {
    flexDirection: 'row' as const,
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  number: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 1,
    width: 34,
  },
  stepBody: { flex: 1 },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
  stepDetail: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 14 },
  startButton: {
    minHeight: 50,
    backgroundColor: colors.primary,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 20,
  },
  startText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' as const },
  skipButton: {
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 4,
  },
  skipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' as const },
  disabled: { opacity: 0.6 },
});
