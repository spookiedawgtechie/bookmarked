import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAllBooks, getAllSessions } from '../../lib/db';
import { pagesInYear } from '../../lib/stats';
import { colors } from '../../lib/theme';
import type { Book, ReadingSession } from '../../lib/types';

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function HighlightRow({ label, book, note }: { label: string; book: Book; note: string }) {
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable style={styles.highlight}>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.highlightCover} contentFit="cover" />
        ) : (
          <View style={[styles.highlightCover, styles.placeholder]}>
            <Text style={styles.placeholderText}>📖</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
          <Text style={styles.highlightLabel}>{label}</Text>
          <Text style={styles.highlightTitle} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={styles.highlightNote}>{note}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function Recap() {
  const db = useSQLiteContext();
  const { year } = useLocalSearchParams<{ year: string }>();
  const y = Number(year);
  const [books, setBooks] = useState<Book[]>([]);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);

  useEffect(() => {
    getAllBooks(db).then((all) =>
      setBooks(
        all
          .filter(
            (b) =>
              b.status === 'read' &&
              b.finishedAt &&
              new Date(b.finishedAt).getFullYear() === y
          )
          .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
      )
    );
    getAllSessions(db).then(setSessions);
  }, [db, y]);

  const pages = pagesInYear(sessions, y);
  const rated = books.filter((b) => b.rating !== null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length).toFixed(1)
      : '–';

  const topRated =
    rated.length > 0
      ? rated.reduce((best, b) => ((b.rating ?? 0) > (best.rating ?? 0) ? b : best))
      : null;

  const timed = books.filter((b) => b.startedAt && b.finishedAt);
  const fastest =
    timed.length > 0
      ? timed.reduce((best, b) =>
          daysBetween(b.startedAt!, b.finishedAt!) < daysBetween(best.startedAt!, best.finishedAt!)
            ? b
            : best
        )
      : null;

  const quarters = [0, 0, 0, 0];
  for (const b of books) {
    quarters[Math.floor(new Date(b.finishedAt!).getMonth() / 3)] += 1;
  }
  const maxQ = Math.max(...quarters, 1);

  return (
    <>
      <Stack.Screen options={{ title: `${y} in books` }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        {books.length === 0 ? (
          <Text style={styles.emptyText}>No books finished in {y} yet.</Text>
        ) : (
          <>
            <View style={styles.cardRow}>
              <StatCard label="Books finished" value={String(books.length)} />
              <StatCard label="Pages read" value={String(pages)} />
              <StatCard label="Avg rating" value={String(avgRating)} />
            </View>

            {topRated && (
              <HighlightRow
                label="Top rated"
                book={topRated}
                note={`★ ${topRated.rating}/10`}
              />
            )}
            {fastest && (
              <HighlightRow
                label="Fastest read"
                book={fastest}
                note={`${daysBetween(fastest.startedAt!, fastest.finishedAt!)} days`}
              />
            )}

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

            <Text style={styles.subheading}>Everything you finished</Text>
            {books.map((b) => (
              <Link
                key={b.id}
                href={{ pathname: '/book/[id]', params: { id: String(b.id) } }}
                asChild
              >
                <Pressable style={styles.bookRow}>
                  <Text style={styles.bookRowDate}>{b.finishedAt!.slice(5, 10)}</Text>
                  <Text style={styles.bookRowTitle} numberOfLines={1}>
                    {b.title}
                  </Text>
                  {b.rating !== null && (
                    <Text style={styles.bookRowRating}>★ {b.rating}</Text>
                  )}
                </Pressable>
              </Link>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cardValue: { color: colors.green, fontSize: 22, fontWeight: '800' },
  cardLabel: { color: colors.textDim, fontSize: 11, marginTop: 4, textAlign: 'center' },
  highlight: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  highlightCover: { width: 56, height: 84, borderRadius: 6, backgroundColor: colors.border },
  highlightLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  highlightTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  highlightNote: { color: colors.orange, fontSize: 13, fontWeight: '600', marginTop: 4 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 20 },
  subheading: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 12,
  },
  quarters: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  quarterCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    height: 90,
    width: 22,
    borderRadius: 6,
    backgroundColor: colors.border,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', backgroundColor: colors.blue, borderRadius: 6 },
  quarterCount: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  quarterLabel: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  bookRowDate: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  bookRowTitle: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  bookRowRating: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 60 },
});
