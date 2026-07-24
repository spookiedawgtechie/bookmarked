import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CURRENT_RELEASE } from '../lib/releases';
import { colors } from '../lib/theme';

type WhatsNewModalProps = {
  visible: boolean;
  onDismiss: () => void;
  saving?: boolean;
  error?: string | null;
};

export function WhatsNewModal({
  visible,
  onDismiss,
  saving = false,
  error = null,
}: WhatsNewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={styles.card}
          accessibilityViewIsModal
          accessibilityLabel={`What's new in ${CURRENT_RELEASE.title}`}
        >
          <Text style={styles.eyebrow}>What&apos;s new</Text>
          <Text style={styles.title} accessibilityRole="header">
            {CURRENT_RELEASE.title}
          </Text>
          <Text style={styles.intro}>
            A major reliability and library-history update for your physical books.
          </Text>

          <ScrollView
            style={styles.notes}
            contentContainerStyle={styles.notesContent}
            showsVerticalScrollIndicator={false}
          >
            {CURRENT_RELEASE.notes.map((note) => (
              <View key={note.title} style={styles.note}>
                <View style={styles.dot} />
                <View style={styles.noteBody}>
                  <Text style={styles.noteTitle}>{note.title}</Text>
                  <Text style={styles.noteDetail}>{note.detail}</Text>
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
            style={({ pressed }) => [
              styles.dismissButton,
              pressed && styles.dismissPressed,
              saving && styles.dismissDisabled,
            ]}
            onPress={onDismiss}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={
              saving ? 'Saving release acknowledgement' : 'Close what is new'
            }
          >
            <Text style={styles.dismissText}>{saving ? 'Saving…' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  intro: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  notes: { marginTop: 18, flexShrink: 1 },
  notesContent: { gap: 16, paddingBottom: 4 },
  note: { flexDirection: 'row' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
    marginTop: 7,
    marginRight: 12,
  },
  noteBody: { flex: 1 },
  noteTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  noteDetail: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  dismissButton: {
    minHeight: 48,
    backgroundColor: colors.green,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  dismissPressed: { opacity: 0.86 },
  dismissDisabled: { opacity: 0.6 },
  dismissText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
});
