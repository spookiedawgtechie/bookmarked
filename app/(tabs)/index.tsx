import { Link, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAllBooks } from '../../lib/db';
import { colors } from '../../lib/theme';
import type { Book } from '../../lib/types';

const GRID_COLS = 4;
const GRID_GAP = 10;
const COVER_W = Math.floor(
  (Dimensions.get('window').width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS
);
const COVER_H = Math.floor(COVER_W * 1.5);

function progressPct(book: Book): number | null {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.round((book.currentPage / book.totalPages) * 100);
}

function BookRow({ book }: { book: Book }) {
  const pct = progressPct(book);
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable style={styles.row}>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText}>📖</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
          {book.status === 'reading' && pct !== null && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
          )}
          {book.status === 'reading' && (
            <Text style={styles.meta}>
              {pct !== null
                ? `Page ${book.currentPage} of ${book.totalPages} · ${pct}%`
                : `Page ${book.currentPage}`}
            </Text>
          )}
          {book.status === 'read' && book.rating !== null && (
            <Text style={[styles.meta, { color: colors.orange }]}>★ {book.rating}/10</Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

function Section({ label, accent, books }: { label: string; accent: string; books: Book[] }) {
  if (books.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: accent }]}>{label}</Text>
      {books.map((b) => (
        <BookRow key={b.id} book={b} />
      ))}
    </View>
  );
}

function GridCover({ book }: { book: Book }) {
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.gridCover} contentFit="cover" />
        ) : (
          <View style={[styles.gridCover, styles.gridPlaceholder]}>
            <Text style={styles.gridPlaceholderTitle} numberOfLines={4}>
              {book.title}
            </Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

function GridSection({ label, accent, books }: { label: string; accent: string; books: Book[] }) {
  if (books.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: accent }]}>{label}</Text>
      <View style={styles.grid}>
        {books.map((b) => (
          <GridCover key={b.id} book={b} />
        ))}
      </View>
    </View>
  );
}

export default function Shelf() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAllBooks(db).then(setBooks);
    }, [db])
  );

  const reading = books.filter((b) => b.status === 'reading');
  const want = books.filter((b) => b.status === 'want');
  const read = books.filter((b) => b.status === 'read');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {books.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your shelf is empty</Text>
          <Text style={styles.emptyText}>
            Head to the Search tab and add your first book.
          </Text>
        </View>
      )}
      <Section label="Currently Reading" accent={colors.green} books={reading} />
      <GridSection label="Want to Read" accent={colors.blue} books={want} />
      <GridSection label="Read" accent={colors.orange} books={read} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  cover: { width: 52, height: 78, borderRadius: 4, backgroundColor: colors.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { fontSize: 22 },
  rowText: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  author: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 6 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.green },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  gridCover: {
    width: COVER_W,
    height: COVER_H,
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  gridPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridPlaceholderTitle: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  empty: { alignItems: 'center', marginTop: 120, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: 14, marginTop: 8, textAlign: 'center' },
});
