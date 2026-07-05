import Slider from '@expo/ui/community/slider';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteBook,
  getBook,
  setCoverUrl,
  setDescription,
  setFinishedDate,
  setProgress,
  setRating,
  setReview,
  setStatus,
  setTotalPages,
} from '../../lib/db';
import { coverUrl, fetchCoverIds, fetchDescription } from '../../lib/openlibrary';
import { colors } from '../../lib/theme';
import type { Book, BookStatus } from '../../lib/types';

const STATUSES: { value: BookStatus; label: string; accent: string }[] = [
  { value: 'want', label: 'Want to Read', accent: colors.blue },
  { value: 'reading', label: 'Reading', accent: colors.green },
  { value: 'read', label: 'Read', accent: colors.orange },
];

export default function BookDetail() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const [book, setBook] = useState<Book | null>(null);
  const [pagesInput, setPagesInput] = useState('');
  const [reviewDraft, setReviewDraft] = useState('');
  const [page, setPage] = useState(0);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [descLoading, setDescLoading] = useState(false);
  const [finishedInput, setFinishedInput] = useState('');
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [altCovers, setAltCovers] = useState<number[] | null>(null);
  const [coversLoading, setCoversLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  // @expo/ui's slider has no onSlidingComplete, so persistence is debounced
  // behind onValueChange instead.
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const b = await getBook(db, bookId);
    setBook(b);
    if (b) {
      setPage(b.currentPage);
      setReviewDraft(b.review ?? '');
      setRatingDraft(b.rating ?? 0);
    }
  }, [db, bookId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Fetch the blurb once per book, then cache it in SQLite ('' = none exists).
  useEffect(() => {
    if (!book || book.description !== null) return;
    let cancelled = false;
    setDescLoading(true);
    fetchDescription(book.olKey)
      .then(async (d) => {
        await setDescription(db, bookId, d ?? '');
        if (!cancelled) await reload();
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDescLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db, bookId, book, reload]);

  if (!book) return <View style={styles.screen} />;

  const pct =
    book.totalPages && book.totalPages > 0
      ? Math.round((page / book.totalPages) * 100)
      : null;

  async function onStatus(status: BookStatus) {
    await setStatus(db, bookId, status);
    reload();
  }

  async function onSavePages() {
    const n = parseInt(pagesInput, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    await setTotalPages(db, bookId, n);
    setPagesInput('');
    reload();
  }

  function onProgressChange(value: number) {
    const v = Math.round(value);
    setPage(v);
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(async () => {
      await setProgress(db, bookId, v);
      if (book && book.totalPages && v >= book.totalPages) {
        await setStatus(db, bookId, 'read');
        reload();
      }
    }, 600);
  }

  function onRatingChange(value: number) {
    setRatingDraft(value);
    if (ratingTimer.current) clearTimeout(ratingTimer.current);
    ratingTimer.current = setTimeout(async () => {
      await setRating(db, bookId, value === 0 ? null : value);
      reload();
    }, 600);
  }

  function openCoverPicker() {
    setCoverPickerOpen(true);
    if (altCovers === null && book) {
      setCoversLoading(true);
      fetchCoverIds(book.olKey)
        .then(setAltCovers)
        .catch(() => setAltCovers([]))
        .finally(() => setCoversLoading(false));
    }
  }

  async function onPickCover(coverId: number) {
    await setCoverUrl(db, bookId, coverUrl(coverId, 'M'));
    setCoverPickerOpen(false);
    reload();
  }

  async function onSaveFinished() {
    const v = finishedInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      Alert.alert('Invalid date', 'Use the format YYYY-MM-DD, e.g. 2023-11-04');
      return;
    }
    const d = new Date(`${v}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      Alert.alert('Invalid date', 'That date does not exist or is in the future.');
      return;
    }
    await setFinishedDate(db, bookId, d.toISOString());
    setFinishedInput('');
    reload();
  }

  async function onSaveReview() {
    await setReview(db, bookId, reviewDraft.trim());
    reload();
  }

  function onDelete() {
    Alert.alert('Remove book', `Remove "${book!.title}" from your shelf?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteBook(db, bookId);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={openCoverPicker}>
            {book.coverUrl ? (
              <Image
                source={{ uri: book.coverUrl.replace('-M.jpg', '-L.jpg') }}
                style={styles.cover}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Text style={{ fontSize: 40 }}>📖</Text>
              </View>
            )}
            <Text style={styles.coverHint}>Tap to change</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.author}>{book.author}</Text>
            {book.totalPages && <Text style={styles.meta}>{book.totalPages} pages</Text>}
          </View>
        </View>

        <View style={styles.statusRow}>
          {STATUSES.map((s) => {
            const active = book.status === s.value;
            return (
              <Pressable
                key={s.value}
                style={[styles.statusBtn, active && { backgroundColor: s.accent }]}
                onPress={() => onStatus(s.value)}
              >
                <Text style={[styles.statusBtnText, active && { color: '#000' }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {(descLoading || (book.description ?? '') !== '') && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>About</Text>
            {descLoading ? (
              <ActivityIndicator color={colors.green} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Text style={styles.descText}>{book.description}</Text>
            )}
          </View>
        )}

        {!book.totalPages && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Total pages</Text>
            <Text style={styles.hint}>
              Open Library didn't have a page count for this edition — enter yours to track
              progress.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                keyboardType="number-pad"
                placeholder="e.g. 320"
                placeholderTextColor={colors.textDim}
                value={pagesInput}
                onChangeText={setPagesInput}
              />
              <Pressable style={styles.saveBtn} onPress={onSavePages}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        )}

        {book.status === 'reading' && book.totalPages != null && book.totalPages > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Progress</Text>
            <Text style={styles.progressText}>
              Page {page} of {book.totalPages}
              {pct !== null ? ` · ${pct}%` : ''}
            </Text>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={book.totalPages}
              step={1}
              value={page}
              onValueChange={onProgressChange}
              minimumTrackTintColor={colors.green}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.green}
            />
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Rating</Text>
          <Text style={styles.progressText}>
            {ratingDraft > 0 ? `★ ${ratingDraft} / 10` : 'Not rated'}
          </Text>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={0}
            maximumValue={10}
            step={0.5}
            value={ratingDraft}
            onValueChange={onRatingChange}
            minimumTrackTintColor={colors.orange}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.orange}
          />
        </View>

        {book.status === 'read' && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Finished on</Text>
            <Text style={styles.progressText}>
              {book.finishedAt ? book.finishedAt.slice(0, 10) : 'Unknown'}
            </Text>
            <Text style={styles.hint}>
              Read this one years ago? Enter the real date — recaps and stats use it.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textDim}
                value={finishedInput}
                onChangeText={setFinishedInput}
                autoCorrect={false}
              />
              <Pressable style={styles.saveBtn} onPress={onSaveFinished}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Review</Text>
          <TextInput
            style={[styles.input, styles.reviewInput]}
            multiline
            placeholder="What did you think?"
            placeholderTextColor={colors.textDim}
            value={reviewDraft}
            onChangeText={setReviewDraft}
            onFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
            }
          />
          <Pressable style={styles.saveBtn} onPress={onSaveReview}>
            <Text style={styles.saveBtnText}>Save review</Text>
          </Pressable>
        </View>

        <Pressable style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>Remove from shelf</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={coverPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCoverPickerOpen(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setCoverPickerOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Pick a cover</Text>
            <Text style={styles.hint}>
              Covers from other editions — choose the one matching your copy.
            </Text>
            {coversLoading && <ActivityIndicator color={colors.green} />}
            {!coversLoading && altCovers !== null && altCovers.length === 0 && (
              <Text style={styles.hint}>No alternate covers found for this book.</Text>
            )}
            <ScrollView style={{ maxHeight: 420 }}>
              <View style={styles.pickerGrid}>
                {(altCovers ?? []).map((id) => (
                  <Pressable key={id} onPress={() => onPickCover(id)}>
                    <Image
                      source={{ uri: coverUrl(id, 'M') }}
                      style={styles.pickerCover}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', marginBottom: 20 },
  cover: { width: 100, height: 150, borderRadius: 8, backgroundColor: colors.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverHint: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
  },
  pickerTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 8,
  },
  pickerCover: {
    width: 90,
    height: 135,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  headerText: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  author: { color: colors.textDim, fontSize: 15, marginTop: 4 },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 8 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statusBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBtnText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  block: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  blockLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  hint: { color: colors.textDim, fontSize: 13, marginBottom: 10 },
  descText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  progressText: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewInput: { minHeight: 100, textAlignVertical: 'top', marginBottom: 10 },
  saveBtn: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 28, alignItems: 'center' },
  deleteBtnText: { color: '#E5534B', fontSize: 14, fontWeight: '600' },
});
