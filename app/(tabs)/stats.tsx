import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportLibrary } from '../../lib/backup';
import { getAllBooks } from '../../lib/db';
import { colors } from '../../lib/theme';
import type { Book } from '../../lib/types';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

export default function Stats() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAllBooks(db).then(setBooks);
    }, [db])
  );

  const year = new Date().getFullYear();
  const finished = books.filter((b) => b.status === 'read' && b.finishedAt);
  const finishedThisYear = finished.filter(
    (b) => new Date(b.finishedAt!).getFullYear() === year
  );
  const pagesThisYear = finishedThisYear.reduce((sum, b) => sum + (b.totalPages ?? 0), 0);
  const rated = books.filter((b) => b.rating !== null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((sum, b) => sum + (b.rating ?? 0), 0) / rated.length).toFixed(1)
      : '–';

  const quarters = [0, 0, 0, 0];
  for (const b of finishedThisYear) {
    const q = Math.floor(new Date(b.finishedAt!).getMonth() / 3);
    quarters[q] += 1;
  }
  const maxQ = Math.max(...quarters, 1);

  const recapYears = [...new Set(finished.map((b) => new Date(b.finishedAt!).getFullYear()))]
    .sort((a, b) => b - a);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={styles.heading}>{year}</Text>
      <View style={styles.cardRow}>
        <StatCard label="Books finished" value={String(finishedThisYear.length)} />
        <StatCard label="Pages read" value={String(pagesThisYear)} />
      </View>
      <View style={styles.cardRow}>
        <StatCard label="Avg rating" value={String(avgRating)} />
        <StatCard label="All-time read" value={String(finished.length)} />
      </View>

      <Text style={styles.subheading}>By quarter</Text>
      <View style={styles.quarters}>
        {quarters.map((count, i) => (
          <View key={i} style={styles.quarterCol}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { height: `${Math.max((count / maxQ) * 100, count > 0 ? 8 : 0)}%` },
                ]}
              />
            </View>
            <Text style={styles.quarterCount}>{count}</Text>
            <Text style={styles.quarterLabel}>Q{i + 1}</Text>
          </View>
        ))}
      </View>

      {recapYears.length > 0 && (
        <>
          <Text style={styles.subheading}>Recaps</Text>
          {recapYears.map((y) => (
            <Pressable
              key={y}
              style={styles.recapRow}
              onPress={() => router.push(`/recap/${y}`)}
            >
              <Text style={styles.recapRowText}>{y} in books</Text>
              <Text style={styles.recapRowArrow}>→</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.subheading}>Backup</Text>
      <Pressable style={styles.recapRow} onPress={() => exportLibrary(db)}>
        <Text style={styles.recapRowText}>Export library as JSON</Text>
        <Text style={styles.recapRowArrow}>↓</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 16 },
  subheading: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cardValue: { color: colors.green, fontSize: 26, fontWeight: '800' },
  cardLabel: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  quarters: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  quarterCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    height: 100,
    width: 22,
    borderRadius: 6,
    backgroundColor: colors.border,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', backgroundColor: colors.blue, borderRadius: 6 },
  quarterCount: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  quarterLabel: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  recapRowText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  recapRowArrow: { color: colors.textDim, fontSize: 16 },
});
