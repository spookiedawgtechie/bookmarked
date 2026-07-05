import Slider from '@expo/ui/community/slider';
import { Image } from 'expo-image';
import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getAllBooks, setProgress, setStatus } from '../../lib/db';
import { colors } from '../../lib/theme';
import type { Book } from '../../lib/types';

const GRID_COLS = 4;
const GRID_GAP = 10;
// Home rows sit inside cards (screen padding 16 + card padding 12 per side),
// so thumbs are sized to fill the card interior exactly.
const CARD_PAD = 12;
const COVER_W = Math.floor(
  (Dimensions.get('window').width - 32 - CARD_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) /
    GRID_COLS
);
const COVER_H = Math.floor(COVER_W * 1.5);

function progressPct(book: Book): number | null {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.round((book.currentPage / book.totalPages) * 100);
}

function CoverThumb({ book, showRating }: { book: Book; showRating?: boolean }) {
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
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

function HeroCard({ book, onLog }: { book: Book; onLog: (b: Book) => void }) {
  const pct = progressPct(book);
  return (
    <Pressable
      style={styles.hero}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
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
          <Pressable style={styles.logBtn} onPress={() => onLog(book)}>
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
          <Pressable hitSlop={8}>
            <Text style={styles.seeAll}>See all →</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

export default function Shelf() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);
  const [logBook, setLogBook] = useState<Book | null>(null);
  const [logPage, setLogPage] = useState(0);

  const refresh = useCallback(() => {
    getAllBooks(db).then(setBooks);
  }, [db]);

  useFocusEffect(refresh);

  const reading = books
    .filter((b) => b.status === 'reading')
    .sort((a, b) =>
      (b.updatedAt ?? b.startedAt ?? '').localeCompare(a.updatedAt ?? a.startedAt ?? '')
    );
  const want = books.filter((b) => b.status === 'want');
  const read = books
    .filter((b) => b.status === 'read')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));

  const year = new Date().getFullYear();
  const finishedThisYear = read.filter(
    (b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year
  );
  const pagesThisYear = finishedThisYear.reduce((s, b) => s + (b.totalPages ?? 0), 0);

  function openLog(book: Book) {
    setLogBook(book);
    setLogPage(book.currentPage);
  }

  async function saveLog() {
    if (!logBook) return;
    await setProgress(db, logBook.id, logPage);
    if (logBook.totalPages && logPage >= logBook.totalPages) {
      await setStatus(db, logBook.id, 'read');
    }
    setLogBook(null);
    refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {books.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your shelf is empty</Text>
          <Text style={styles.emptyText}>Head to the Search tab and add your first book.</Text>
        </View>
      )}

      {reading.length > 0 && (
        <View style={styles.section}>
          <RowHeader label="Currently Reading" accent={colors.green} />
          {reading.map((b) => (
            <HeroCard key={b.id} book={b} onLog={openLog} />
          ))}
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
            {want.slice(0, GRID_COLS).map((b) => (
              <CoverThumb key={b.id} book={b} />
            ))}
          </View>
        </View>
      )}

      {read.length > 0 && (
        <View style={styles.section}>
          <RowHeader label="Recently finished" accent={colors.orange} href="/list/read" />
          <View style={styles.rowCard}>
            {read.slice(0, GRID_COLS).map((b) => (
              <CoverThumb key={b.id} book={b} showRating />
            ))}
          </View>
        </View>
      )}

      {finishedThisYear.length > 0 && (
        <Pressable style={styles.yearStrip} onPress={() => router.push(`/recap/${year}`)}>
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
        <Pressable style={styles.modalOverlay} onPress={() => setLogBook(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
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
                <View style={styles.modalBtnRow}>
                  <Pressable style={styles.modalCancel} onPress={() => setLogBook(null)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalSave} onPress={saveLog}>
                    <Text style={styles.modalSaveText}>Save</Text>
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
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: CARD_PAD,
    marginBottom: 12,
  },
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
  logBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  rowCard: {
    flexDirection: 'row',
    gap: GRID_GAP,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: CARD_PAD,
  },
  thumb: {
    width: COVER_W,
    height: COVER_H,
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
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: { color: colors.orange, fontSize: 11, fontWeight: '700' },
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
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
  modalSaveText: { color: '#000', fontWeight: '700' },
});
