import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAllBooks, getAllReadingHistory } from '../../lib/db';
import { latestCompletedByBook } from '../../lib/readings';
import { colors } from '../../lib/theme';
import type { Book } from '../../lib/types';

const GRID_COLS = 4;
const GRID_GAP = 10;

const TITLES: Record<string, string> = {
  want: 'Want to Read',
  read: 'Read',
};

type SortKey = 'recent' | 'oldest' | 'title' | 'author' | 'pages' | 'ratingHigh' | 'ratingLow';

const COMMON_SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'pages', label: 'Pages' },
];

const READ_SORTS: { key: SortKey; label: string }[] = [
  ...COMMON_SORTS,
  { key: 'ratingHigh', label: 'Rating ↓' },
  { key: 'ratingLow', label: 'Rating ↑' },
];

export default function StatusList() {
  const db = useSQLiteContext();
  const { status } = useLocalSearchParams<{ status: string }>();
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  // Computed from live window size (not module-scope Dimensions.get) so
  // web resizes and orientation changes recompute the grid.
  const { width } = useWindowDimensions();
  const coverW = Math.floor((width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
  const coverSize = { width: coverW, height: Math.floor(coverW * 1.5) };

  useFocusEffect(
    useCallback(() => {
      const source = status === 'read' ? getAllReadingHistory(db) : getAllBooks(db);
      source.then((all) => {
        const filtered = all.filter((b) => b.status === status);
        setBooks(status === 'read' ? latestCompletedByBook(filtered) : filtered);
      });
    }, [db, status])
  );

  const sortOptions = status === 'read' ? READ_SORTS : COMMON_SORTS;
  const visibleBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? books.filter((book) =>
          `${book.title} ${book.author}`.toLocaleLowerCase().includes(normalized)
        )
      : [...books];

    const activityDate = (book: Book) =>
      status === 'read' ? book.finishedAt ?? book.updatedAt ?? book.addedAt : book.addedAt;
    filtered.sort((a, b) => {
      if (sortKey === 'recent') return activityDate(b).localeCompare(activityDate(a));
      if (sortKey === 'oldest') return activityDate(a).localeCompare(activityDate(b));
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      if (sortKey === 'author') return a.author.localeCompare(b.author);
      if (sortKey === 'pages') return (b.totalPages ?? -1) - (a.totalPages ?? -1);
      if (sortKey === 'ratingHigh') return (b.rating ?? -1) - (a.rating ?? -1);
      return (a.rating ?? Number.POSITIVE_INFINITY) - (b.rating ?? Number.POSITIVE_INFINITY);
    });
    return filtered;
  }, [books, query, sortKey, status]);

  return (
    <>
      <Stack.Screen options={{ title: TITLES[status ?? ''] ?? 'Books' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Filter by title or author"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Filter books by title or author"
          autoCorrect={false}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Sort books"
        >
          {sortOptions.map((option) => {
            const selected = option.key === sortKey;
            return (
              <Pressable
                key={option.key}
                style={[styles.sortChip, selected && styles.sortChipSelected]}
                onPress={() => setSortKey(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Sort by ${option.label}`}
              >
                <Text style={[styles.sortChipText, selected && styles.sortChipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.resultCount} accessibilityLiveRegion="polite">
          {visibleBooks.length === books.length
            ? `${books.length} ${books.length === 1 ? 'book' : 'books'}`
            : `${visibleBooks.length} of ${books.length} books`}
        </Text>
        <View style={styles.grid}>
          {visibleBooks.map((b) => (
            <Link
              key={b.id}
              href={{ pathname: '/book/[id]', params: { id: String(b.id) } }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${b.title} by ${b.author || 'unknown author'}${
                  b.rating !== null ? `, rated ${b.rating} out of 10` : ''
                }`}
                accessibilityHint="Opens book details"
              >
                {b.coverUrl ? (
                  <Image
                    source={{ uri: b.coverUrl }}
                    style={[styles.cover, coverSize]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.cover, styles.placeholder, coverSize]}>
                    <Text style={styles.placeholderText} numberOfLines={4}>
                      {b.title}
                    </Text>
                  </View>
                )}
                {b.status === 'read' && b.rating !== null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{b.rating}</Text>
                  </View>
                )}
              </Pressable>
            </Link>
          ))}
        </View>
        {books.length === 0 && <Text style={styles.emptyText}>Nothing here yet.</Text>}
        {books.length > 0 && visibleBooks.length === 0 && (
          <Text style={styles.emptyText}>No books match that filter.</Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchInput: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sortRow: { gap: 8, paddingVertical: 12 },
  sortChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortChipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  sortChipText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  sortChipTextSelected: { color: colors.onAccent },
  resultCount: { color: colors.textDim, fontSize: 13, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  cover: {
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholderText: {
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
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 60 },
});
