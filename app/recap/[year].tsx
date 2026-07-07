import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { notify } from '../../lib/alert';
import { getAllBooks, getAllSessions } from '../../lib/db';
import { shareFile } from '../../lib/share';
import { dailyPagesInYear, dateKey, pagesByMonth, pagesInYear } from '../../lib/stats';
import { colors } from '../../lib/theme';
import type { Book, ReadingSession } from '../../lib/types';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const HEATMAP_OPACITIES = [0.25, 0.45, 0.65, 0.85, 1.0];

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

type HeatmapCell = { key: string; pages: number } | null;

// One entry per week (Sun-Sat) from the Sunday on/before Jan 1 through the
// week containing Dec 31. Cells from the adjacent year are null padding,
// matching GitHub's own contribution-graph layout.
function buildHeatmapWeeks(year: number, dailyPages: Record<string, number>): HeatmapCell[][] {
  const dec31 = new Date(year, 11, 31);
  const cursor = new Date(year, 0, 1);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const weeks: HeatmapCell[][] = [];
  while (cursor <= dec31) {
    const week: HeatmapCell[] = [];
    for (let i = 0; i < 7; i++) {
      if (cursor.getFullYear() === year) {
        const key = dateKey(cursor);
        week.push({ key, pages: dailyPages[key] ?? 0 });
      } else {
        week.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
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
  const shareCardRef = useRef<View>(null);
  const heatmapScrollRef = useRef<ScrollView>(null);

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

  const withPages = books.filter((b) => b.totalPages !== null);
  const longest =
    withPages.length > 0
      ? withPages.reduce((best, b) => (b.totalPages! > best.totalPages! ? b : best))
      : null;
  const avgDaysPerBook =
    timed.length > 0
      ? Math.round(
          timed.reduce((sum, b) => sum + daysBetween(b.startedAt!, b.finishedAt!), 0) /
            timed.length
        )
      : null;

  const hasSessionsThisYear = sessions.some((s) => new Date(s.loggedAt).getFullYear() === y);
  const months = pagesByMonth(sessions, y);
  const maxMonth = Math.max(...months, 1);
  const dailyPages = dailyPagesInYear(sessions, y);
  const maxDaily = Math.max(...Object.values(dailyPages), 1);
  const heatmapWeeks = buildHeatmapWeeks(y, dailyPages);

  async function handleShare() {
    try {
      const capture = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'base64' : 'tmpfile',
      });
      const filename = `bookmarked-${y}-recap.png`;
      if (Platform.OS === 'web') {
        await shareFile({ base64: capture, filename, mimeType: 'image/png', dialogTitle: `Share ${y} recap` });
      } else {
        await shareFile({ uri: capture, filename, mimeType: 'image/png', dialogTitle: `Share ${y} recap` });
      }
    } catch {
      notify('Share failed', 'Could not create the recap image.');
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: `${y} in books` }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        {books.length === 0 && !hasSessionsThisYear && (
          <Text style={styles.emptyText}>Nothing tracked in {y} yet.</Text>
        )}

        {books.length > 0 && (
          <>
            <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
              <Text style={styles.brandLabel}>BOOKMARKED</Text>
              <Text style={styles.yearHeading}>{y}</Text>

              <View style={styles.cardRow}>
                <StatCard label="Books finished" value={String(books.length)} />
                <StatCard label="Pages read" value={String(pages)} />
              </View>
              <View style={styles.cardRow}>
                <StatCard label="Avg rating" value={String(avgRating)} />
                <StatCard
                  label="Avg days/book"
                  value={avgDaysPerBook !== null ? String(avgDaysPerBook) : '–'}
                />
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
              {longest && (
                <HighlightRow
                  label="Longest read"
                  book={longest}
                  note={`${longest.totalPages} pages`}
                />
              )}
            </View>

            <Pressable style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>Share {y} recap</Text>
            </Pressable>

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
          </>
        )}

        {hasSessionsThisYear && (
          <>
            <Text style={styles.subheading}>By month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.months}>
                {months.map((count, i) => (
                  <View key={i} style={styles.monthCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${Math.max((count / maxMonth) * 100, count > 0 ? 8 : 0)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.quarterCount}>{count}</Text>
                    <Text style={styles.quarterLabel}>{MONTH_LABELS[i]}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.subheading}>Reading heatmap</Text>
            <ScrollView
              ref={heatmapScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => heatmapScrollRef.current?.scrollToEnd({ animated: false })}
            >
              <View style={styles.heatmapGrid}>
                {heatmapWeeks.map((week, wi) => (
                  <View key={wi} style={styles.heatmapWeekCol}>
                    {week.map((cell, di) => {
                      if (cell === null) {
                        return <View key={di} style={[styles.heatmapCell, styles.heatmapCellPad]} />;
                      }
                      if (cell.pages === 0) {
                        return (
                          <View
                            key={di}
                            style={[styles.heatmapCell, { backgroundColor: colors.border }]}
                          />
                        );
                      }
                      const bucket = Math.min(4, Math.floor((cell.pages / maxDaily) * 5));
                      return (
                        <View
                          key={di}
                          style={[
                            styles.heatmapCell,
                            { backgroundColor: colors.green, opacity: HEATMAP_OPACITIES[bucket] },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            <View style={styles.legendRow}>
              <Text style={styles.legendText}>Less</Text>
              <View style={[styles.legendSwatch, { backgroundColor: colors.border }]} />
              {HEATMAP_OPACITIES.map((op, i) => (
                <View
                  key={i}
                  style={[styles.legendSwatch, { backgroundColor: colors.green, opacity: op }]}
                />
              ))}
              <Text style={styles.legendText}>More</Text>
            </View>
          </>
        )}

        {books.length > 0 && (
          <>
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
  shareCard: { backgroundColor: colors.bg, paddingVertical: 8 },
  brandLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
  },
  yearHeading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  months: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 14 },
  monthCol: { width: 30, alignItems: 'center' },
  heatmapGrid: { flexDirection: 'row', gap: 3, backgroundColor: colors.card, borderRadius: 12, padding: 16 },
  heatmapWeekCol: { flexDirection: 'column', gap: 3 },
  heatmapCell: { width: 11, height: 11, borderRadius: 2 },
  heatmapCellPad: { backgroundColor: 'transparent' },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
  },
  legendText: { color: colors.textDim, fontSize: 11 },
  legendSwatch: { width: 11, height: 11, borderRadius: 2 },
  shareBtn: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  shareBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
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
