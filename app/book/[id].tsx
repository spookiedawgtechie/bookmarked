import Slider from '@expo/ui/community/slider';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  logProgress,
  setCoverUrl,
  setDescription,
  setFinishedDate,
  setNotes,
  setRating,
  setReview,
  setStatus,
  setTotalPages,
} from '../../lib/db';
import { confirmDialog, notify } from '../../lib/alert';
import { formatDate } from '../../lib/format';
import { coverUrl, fetchCoverIds, fetchDescription, sanitizeDescription } from '../../lib/openlibrary';
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
  const [notFound, setNotFound] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const [reviewDraft, setReviewDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
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
  // Last page actually written to the DB — the "from" side of the next
  // session delta. Multiple debounced writes in one visit each need their
  // own accurate from/to, not just the value at screen-load time.
  const persistedPageRef = useRef(0);
  const pendingPageRef = useRef<number | null>(null);
  const pendingRatingRef = useRef<number | null>(null);
  const totalPagesRef = useRef<number | null>(null);
  const progressWriteRef = useRef<Promise<void>>(Promise.resolve());
  const ratingWriteRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    const b = await getBook(db, bookId);
    setBook(b);
    setNotFound(b === null);
    if (b) {
      setPage(b.currentPage);
      persistedPageRef.current = b.currentPage;
      setReviewDraft(b.review ?? '');
      setNotesDraft(b.notes ?? '');
      setRatingDraft(b.rating ?? 0);
      totalPagesRef.current = b.totalPages;
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
        await setDescription(db, bookId, d ? sanitizeDescription(d) : '');
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

  // If the user navigates away before the 600 ms debounce completes, flush
  // the final values instead of silently losing the last slider movement.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      if (ratingTimer.current) clearTimeout(ratingTimer.current);
      const pendingPage = pendingPageRef.current;
      const pendingRating = pendingRatingRef.current;
      if (pendingPage !== null) queueProgressWrite(pendingPage, false);
      if (pendingRating !== null) queueRatingWrite(pendingRating, false);
    };
  }, [db, bookId]);

  if (!book) {
    // Distinguish "still loading" (blank) from "no such book" (bad deep
    // link / deleted id) — previously both were a permanent blank screen.
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        {notFound && <Text style={styles.notFoundText}>Book not found.</Text>}
      </View>
    );
  }

  const pct =
    book.totalPages && book.totalPages > 0
      ? Math.round((page / book.totalPages) * 100)
      : null;

  async function onStatus(status: BookStatus) {
    try {
      await setStatus(db, bookId, status);
      reload();
    } catch {
      notify('Save failed', 'Could not update the status. Try again.');
    }
  }

  async function onSavePages() {
    const n = parseInt(pagesInput, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await setTotalPages(db, bookId, n);
      setPagesInput('');
      reload();
    } catch {
      notify('Save failed', 'Could not save the page count. Try again.');
    }
  }

  function queueProgressWrite(value: number, reportError = true) {
    if (pendingPageRef.current === value) pendingPageRef.current = null;
    progressWriteRef.current = progressWriteRef.current
      .then(async () => {
        const from = persistedPageRef.current;
        await logProgress(db, bookId, from, value);
        persistedPageRef.current = value;
        if (totalPagesRef.current && value >= totalPagesRef.current) {
          await setStatus(db, bookId, 'read');
          if (mountedRef.current) await reload();
        }
      })
      .catch(() => {
        if (reportError && mountedRef.current) {
          notify('Save failed', 'Your progress was not saved. Try again.');
        }
      });
  }

  function queueRatingWrite(value: number, reportError = true) {
    if (pendingRatingRef.current === value) pendingRatingRef.current = null;
    ratingWriteRef.current = ratingWriteRef.current
      .then(() => setRating(db, bookId, value === 0 ? null : value))
      .catch(() => {
        if (reportError && mountedRef.current) {
          notify('Save failed', 'Your rating was not saved. Try again.');
        }
      });
  }

  function onProgressChange(value: number) {
    const v = Math.round(value);
    setPage(v);
    pendingPageRef.current = v;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => queueProgressWrite(v), 600);
  }

  function onRatingChange(value: number) {
    setRatingDraft(value);
    pendingRatingRef.current = value;
    if (ratingTimer.current) clearTimeout(ratingTimer.current);
    ratingTimer.current = setTimeout(() => queueRatingWrite(value), 600);
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
    try {
      await setCoverUrl(db, bookId, coverUrl(coverId, 'M'));
      setCoverPickerOpen(false);
      reload();
    } catch {
      notify('Save failed', 'Could not change the cover. Try again.');
    }
  }

  async function onSaveFinished() {
    const v = finishedInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      notify('Invalid date', 'Use the format YYYY-MM-DD, e.g. 2023-11-04');
      return;
    }
    const d = new Date(`${v}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      notify('Invalid date', 'That date does not exist or is in the future.');
      return;
    }
    try {
      await setFinishedDate(db, bookId, d.toISOString());
      setFinishedInput('');
      reload();
    } catch {
      notify('Save failed', 'Could not save the date. Try again.');
    }
  }

  async function onSaveReview() {
    try {
      await setReview(db, bookId, reviewDraft.trim());
      reload();
    } catch {
      notify('Save failed', 'Your review was not saved. Try again.');
    }
  }

  async function onSaveNotes() {
    try {
      await setNotes(db, bookId, notesDraft.trim());
      reload();
    } catch {
      notify('Save failed', 'Your notes were not saved. Try again.');
    }
  }

  function onDelete() {
    confirmDialog('Remove book', `Remove "${book!.title}" from your shelf?`, 'Remove', async () => {
      try {
        await deleteBook(db, bookId);
        router.back();
      } catch {
        notify('Remove failed', 'Could not remove the book. Try again.');
      }
    });
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
          <Pressable
            onPress={openCoverPicker}
            accessibilityRole="button"
            accessibilityLabel={`Change cover for ${book.title}`}
            accessibilityHint="Opens alternate covers from Open Library"
          >
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
            <Text style={styles.author} numberOfLines={2}>
              {book.author}
            </Text>
            {book.totalPages && <Text style={styles.meta}>{book.totalPages} pages</Text>}
          </View>
        </View>

        <View style={styles.statusRow} accessibilityRole="radiogroup" accessibilityLabel="Reading status">
          {STATUSES.map((s) => {
            const active = book.status === s.value;
            return (
              <Pressable
                key={s.value}
                style={[styles.statusBtn, active && { backgroundColor: s.accent }]}
                onPress={() => onStatus(s.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={s.label}
              >
                <Text style={[styles.statusBtnText, active && { color: colors.onAccent }]}>
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
              <Text style={styles.descText}>{sanitizeDescription(book.description ?? '')}</Text>
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
                accessibilityLabel="Total number of pages"
              />
              <Pressable
                style={styles.saveBtn}
                onPress={onSavePages}
                accessibilityRole="button"
                accessibilityLabel="Save total pages"
              >
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
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Reading progress in pages"
              accessibilityValue={{ min: 0, max: book.totalPages, now: page, text: `${pct ?? 0} percent` }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                onProgressChange(
                  Math.max(
                    0,
                    Math.min(
                      book.totalPages!,
                      page + (event.nativeEvent.actionName === 'increment' ? 1 : -1)
                    )
                  )
                )
              }
            >
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
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Rating</Text>
          <Text style={styles.progressText}>
            {ratingDraft > 0 ? `★ ${ratingDraft} / 10` : 'Not rated'}
          </Text>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Book rating"
            accessibilityValue={{ min: 0, max: 10, now: ratingDraft, text: ratingDraft > 0 ? `${ratingDraft} out of 10` : 'Not rated' }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) =>
              onRatingChange(
                Math.max(
                  0,
                  Math.min(
                    10,
                    ratingDraft + (event.nativeEvent.actionName === 'increment' ? 0.5 : -0.5)
                  )
                )
              )
            }
          >
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
        </View>

        {book.status === 'read' && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Finished on</Text>
            <Text style={styles.progressText}>
              {book.finishedAt ? formatDate(book.finishedAt) : 'Unknown'}
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
                accessibilityLabel="Finished date"
                accessibilityHint="Enter date as year, month, day"
              />
              <Pressable
                style={styles.saveBtn}
                onPress={onSaveFinished}
                accessibilityRole="button"
                accessibilityLabel="Save finished date"
              >
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
            accessibilityLabel="Book review"
            onFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
            }
          />
          <Pressable
            style={styles.saveBtn}
            onPress={onSaveReview}
            accessibilityRole="button"
            accessibilityLabel="Save review"
          >
            <Text style={styles.saveBtnText}>Save review</Text>
          </Pressable>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Private notes</Text>
          <Text style={styles.hint}>Keep quotes, reminders, and personal thoughts separate from your review.</Text>
          <TextInput
            style={[styles.input, styles.reviewInput]}
            multiline
            placeholder="Notes only for you"
            placeholderTextColor={colors.textDim}
            value={notesDraft}
            onChangeText={setNotesDraft}
            accessibilityLabel="Private notes"
            onFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
            }
          />
          <Pressable
            style={styles.saveBtn}
            onPress={onSaveNotes}
            accessibilityRole="button"
            accessibilityLabel="Save private notes"
          >
            <Text style={styles.saveBtnText}>Save notes</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.deleteBtn}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${book.title} from shelf`}
        >
          <Text style={styles.deleteBtnText}>Remove from shelf</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={coverPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCoverPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setCoverPickerOpen(false)}
          accessible={false}
        >
          <Pressable
            style={styles.pickerCard}
            onPress={() => {}}
            accessibilityViewIsModal
            accessibilityLabel="Alternate cover picker"
          >
            <Text style={styles.pickerTitle}>Pick a cover</Text>
            <Pressable
              style={styles.pickerClose}
              onPress={() => setCoverPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close cover picker"
            >
              <Text style={styles.pickerCloseText}>Close</Text>
            </Pressable>
            <Text style={styles.hint}>
              Covers from other editions — choose the one matching your copy.
            </Text>
            {coversLoading && <ActivityIndicator color={colors.green} />}
            {!coversLoading && altCovers !== null && altCovers.length === 0 && (
              <Text style={styles.hint}>No alternate covers found for this book.</Text>
            )}
            <ScrollView style={{ maxHeight: 420 }}>
              <View style={styles.pickerGrid}>
                {(altCovers ?? []).map((id, index) => (
                  <Pressable
                    key={id}
                    onPress={() => onPickCover(id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use alternate cover ${index + 1}`}
                  >
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
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
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
  pickerClose: {
    position: 'absolute',
    right: 14,
    top: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  pickerCloseText: { color: colors.green, fontSize: 14, fontWeight: '700' },
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
  saveBtnText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 28, alignItems: 'center' },
  deleteBtnText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  notFoundText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 60 },
});
