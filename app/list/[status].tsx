import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAllBooks } from '../../lib/db';
import { colors } from '../../lib/theme';
import type { Book } from '../../lib/types';

const GRID_COLS = 4;
const GRID_GAP = 10;

const TITLES: Record<string, string> = {
  want: 'Want to Read',
  read: 'Read',
};

export default function StatusList() {
  const db = useSQLiteContext();
  const { status } = useLocalSearchParams<{ status: string }>();
  const [books, setBooks] = useState<Book[]>([]);
  // Computed from live window size (not module-scope Dimensions.get) so
  // web resizes and orientation changes recompute the grid.
  const { width } = useWindowDimensions();
  const coverW = Math.floor((width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
  const coverSize = { width: coverW, height: Math.floor(coverW * 1.5) };

  useFocusEffect(
    useCallback(() => {
      getAllBooks(db).then((all) => {
        const filtered = all.filter((b) => b.status === status);
        if (status === 'read') {
          filtered.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
        }
        setBooks(filtered);
      });
    }, [db, status])
  );

  return (
    <>
      <Stack.Screen options={{ title: TITLES[status ?? ''] ?? 'Books' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <View style={styles.grid}>
          {books.map((b) => (
            <Link
              key={b.id}
              href={{ pathname: '/book/[id]', params: { id: String(b.id) } }}
              asChild
            >
              <Pressable>
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
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
    fontSize: 11,
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
  badgeText: { color: colors.orange, fontSize: 11, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 60 },
});
