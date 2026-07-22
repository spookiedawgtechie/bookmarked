import Slider from '@expo/ui/community/slider';
import { Image } from 'expo-image';
import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { notify } from '../../lib/alert';
import { getAllBooks, getAllReadingHistory, getAllSessions, logProgress } from '../../lib/db';
import { latestCompletedByBook } from '../../lib/readings';
import {
  gridCoverWidth,
  isDesktopWidth,
  libraryContentStyle,
  libraryGridColumns,
} from '../../lib/layout';
import { currentStreakDays, pagesInLastDays, pagesInYear } from '../../lib/stats';
import { colors } from '../../lib/theme';
import type { Book, ReadingSession } from '../../lib/types';

const GRID_GAP = 10;
// Home rows sit inside cards (screen padding 16 + card padding 12 per side),
// so thumbs are sized to fill the card interior exactly. Sizes come from
// useWindowDimensions (not module-scope Dimensions.get) so web resizes and
// orientation changes recompute the grid.
const CARD_PAD = 12;

function coverMetrics(windowWidth: number) {
  const columns = libraryGridColumns(windowWidth);
  const coverW = gridCoverWidth(
    windowWidth,
    columns,
    32 + CARD_PAD * 2,
    GRID_GAP
  );
  return {
    columns,
    coverSize: { width: coverW, height: Math.floor(coverW * 1.5) },
  };
}

function progressPct(book: Book): number | null {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.round((book.currentPage / book.totalPages) * 100);
}

function CoverThumb({
  book,
  coverSize,
  showRating,
}: {
  book: Book;
  coverSize: { width: number; height: number };
  showRating?: boolean;
}) {
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${book.title} by ${book.author || 'unknown author'}${
          showRating && book.rating !== null ? `, rated ${book.rating} out of 10` : ''
        }`}
        accessibilityHint="Opens book details"
      >
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={[styles.thumb, coverSize]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, coverSize]}>
            <Text style={styles.thumbPlaceholderText} numberOfLines={4}>
              {book.title}
            </Text>
          </View>
        )}
        {showRating && book.rating !== null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{book.rating}</Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

function HeroCard({
  book,
  desktop,
  onLog,
}: {
  book: Book;
  desktop: boolean;
  onLog: (b: Book) => void;
}) {
  const pct = progressPct(book);
  return (
    <Pressable
      style={[styles.hero, desktop && styles.heroDesktop]}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author || 'unknown author'}${
        pct !== null ? `, page ${book.currentPage} of ${book.totalPages}, ${pct} percent` : ''
      }`}
      accessibilityHint="Opens book details"
    >
      {book.coverUrl ? (
        <Image source={{ uri: book.coverUrl }} style={styles.heroCover} contentFit="cover" />
      ) : (
        <View style={[styles.heroCover, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText} numberOfLines={5}>
            {book.title}
          </Text>
        </View>
      )}
      <View style={styles.heroBody}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.heroAuthor} numberOfLines={1}>
          {book.author}
        </Text>
        {pct !== null && (
          <>
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.heroMeta}>
              Page {book.currentPage} of {book.totalPages} · {pct}%
            </Text>
          </>
        )}
        {book.totalPages ? (
          <Pressable
            style={styles.logBtn}
            onPress={(event) => {
              event.stopPropagation();
              onLog(book);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Log progress for ${book.title}`}
          >
            <Text style={styles.logBtnText}>Log progress</Text>
          </Pressable>
        ) : (
          <Text style={styles.heroMeta}>Tap to set the page count</Text>
        )}
      </View>
    </Pressable>
  );
}

function RowHeader({ label, accent, href }: { label: string; accent: string; href?: string }) {
  return (
    <View style={styles.rowHeader}>
      <Text style={[styles.sectionLabel, { color: accent }]}>{label}</Text>
      {href && (
        <Link href={href} asChild>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`See all ${label}`}>
            <Text style={styles.seeAll}>See all →</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

export default function Shelf() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const { columns, coverSize } = coverMetrics(width);
  const desktop = isDesktopWidth(width);
  const [books, setBooks] = useState<Book[]>([]);
  const [readingHistory, setReadingHistory] = useState<Book[]>([]);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [logBook, setLogBook] = useState<Book | null>(null);
  const [logPage, setLogPage] = useState(0);
  // Guards double-tap on Save: a second logProgress with the same stale
  // fromPage would insert a duplicate session row and inflate page stats.
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    getAllBooks(db).then(setBooks);
    getAllReadingHistory(db).then(setReadingHistory);
    getAllSessions(db).then(setSessions);
  }, [db]);

  useFocusEffect(refresh);

  const reading = books
    .filter((b) => b.status === 'reading')
    .sort((a, b) =>
      (b.updatedAt ?? b.startedAt ?? '').localeCompare(a.updatedAt ?? a.startedAt ?? '')
    );
  const want = books.filter((b) => b.status === 'want');
  const completedReadings = readingHistory.filter((book) => book.status === 'read' && book.finishedAt);
  const read = latestCompletedByBook(completedReadings)
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));

  const year = new Date().getFullYear();
  const finishedThisYear = completedReadings.filter(
    (b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  );
  const pagesThisYear = pagesInYear(sessions, year);
  const streak = currentStreakDays(sessions);
  const weekPages = pagesInLastDays(sessions, 7);

  function openLog(book: Book) {
    setLogBook(book);
    setLogPage(book.currentPage);
  }

  async function saveLog() {
    if (!logBook || saving) return;
    setSaving(true);
    try {
      await logProgress(db, logBook.id, logBook.currentPage, logPage);
      setLogBook(null);
      refresh();
    } catch {
      notify('Save failed', 'Your progress was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[libraryContentStyle, styles.pageContent]}
    >
      {books.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your shelf is empty</Text>
          <Text style={styles.emptyText}>Head to the Search tab and add your first book.</Text>
        </View>
      )}

      {sessions.length > 0 && (
        <View style={styles.paceRow}>
          <Text style={styles.paceText}>
            {streak > 0 ? `🔥 ${streak} day${streak === 1 ? '' : 's'}` : 'No streak yet'}
          </Text>
          <Text style={styles.paceText}>{weekPages} pages this week</Text>
        </View>
      )}

      {reading.length > 0 && (
        <View style={styles.section}>
          <RowHeader label="Currently Reading" accent={colors.green} />
          <View style={styles.heroGrid}>
            {reading.map((b) => (
              <HeroCard key={b.id} book={b} desktop={desktop} onLog={openLog} />
            ))}
          </View>
        </View>
      )}

      {books.length > 0 && reading.length === 0 && (
        <View style={styles.section}>
          <RowHeader label="Currently Reading" accent={colors.green} />
          <Text style={styles.emptyText}>
            Nothing in progress — pick something from Up next.
          </Text>
        </View>
      )}

      {want.length > 0 && (
        <View style={styles.section}>
          <RowHeader label="Up next" accent={colors.blue} href="/list/want" />
          <View style={styles.rowCard}>
            {want.slice(0, columns).map((b) => (
              <CoverThumb key={b.id} book={b} coverSize={coverSize} />
            ))}
          </View>
        </View>
      )}

      {read.length > 0 && (
        <View style={styles.section}>
          <RowHeader label="Recently finished" accent={colors.orange} href="/list/read" />
          <View style={styles.rowCard}>
            {read.slice(0, columns).map((b) => (
              <CoverThumb key={b.id} book={b} coverSize={coverSize} showRating />
            ))}
          </View>
        </View>
      )}

      {finishedThisYear.length > 0 && (
        <Pressable
          style={styles.yearStrip}
          onPress={() => router.push(`/recap/${year}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${year} recap, ${finishedThisYear.length} books, ${pagesThisYear} pages`}
        >
          <Text style={styles.yearStripText}>
            {year} · {finishedThisYear.length}{' '}
            {finishedThisYear.length === 1 ? 'book' : 'books'} · {pagesThisYear} pages →
          </Text>
        </Pressable>
      )}

      <Modal
        visible={logBook !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLogBook(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLogBook(null)} accessible={false}>
          <Pressable
            style={styles.modalCard}
            onPress={() => {}}
            accessibilityViewIsModal
            accessibilityLabel={logBook ? `Log progress for ${logBook.title}` : 'Log progress'}
          >
            {logBook && (
              <>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {logBook.title}
                </Text>
                <Text style={styles.modalMeta}>
                  Page {logPage} of {logBook.totalPages}
                  {logBook.totalPages
                    ? ` · ${Math.round((logPage / logBook.totalPages) * 100)}%`
                    : ''}
                </Text>
                <View
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="Current page"
                  accessibilityValue={{ min: 0, max: logBook.totalPages ?? 1, now: logPage }}
                  accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                  onAccessibilityAction={(event) =>
                    setLogPage((current) =>
                      Math.max(
                        0,
                        Math.min(
                          logBook.totalPages ?? 1,
                          current + (event.nativeEvent.actionName === 'increment' ? 1 : -1)
                        )
                      )
                    )
                  }
                >
                  <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={0}
                    maximumValue={logBook.totalPages ?? 1}
                    step={1}
                    value={logPage}
                    onValueChange={(v: number) => setLogPage(Math.round(v))}
                    minimumTrackTintColor={colors.green}
                    maximumTrackTintColor={colors.border}
                    thumbTintColor={colors.green}
                  />
                </View>
                <View style={styles.modalBtnRow}>
                  <Pressable
                    style={styles.modalCancel}
                    onPress={() => setLogBook(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel progress update"
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalSave, saving && { opacity: 0.5 }]}
                    disabled={saving}
                    onPress={saveLog}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving, busy: saving }}
                    accessibilityLabel={saving ? 'Saving progress' : 'Save progress'}
                  >
                    <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pageContent: { paddingBottom: 96 },
  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  paceText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  section: { marginTop: 20, paddingHorizontal: 16 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  seeAll: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  hero: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: CARD_PAD,
  },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  heroDesktop: { width: '49%', marginBottom: 0 },
  heroCover: { width: 96, height: 144, borderRadius: 8, backgroundColor: colors.border },
  heroBody: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  heroTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  heroAuthor: { color: colors.textDim, fontSize: 14, marginTop: 2 },
  heroTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: 12,
  },
  heroFill: { height: 6, borderRadius: 3, backgroundColor: colors.green },
  heroMeta: { color: colors.textDim, fontSize: 12, marginTop: 6 },
  logBtn: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 10,
  },
  logBtnText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  rowCard: {
    flexDirection: 'row',
    gap: GRID_GAP,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: CARD_PAD,
  },
  thumb: {
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPlaceholderText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.badgeBg,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: { color: colors.orange, fontSize: 12, fontWeight: '700' },
  yearStrip: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  yearStripText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 120, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: 14, marginTop: 8, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  modalMeta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalSave: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSaveText: { color: colors.onAccent, fontWeight: '700' },
});
