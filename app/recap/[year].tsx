import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { BookCover } from '../../components/BookCover';
import { RECAP_NAME_KEY } from '../../components/PersonalizationSettings';
import { notify } from '../../lib/alert';
import { getAllReadingHistory, getAllSessions, getAppSetting } from '../../lib/db';
import { formatDateShort, plural } from '../../lib/format';
import { readableContentStyle } from '../../lib/layout';
import { shareFile } from '../../lib/share';
import {
  bestReadingDays,
  dailyPagesInYear,
  dateKey,
  pagesByMonth,
  pagesInYear,
} from '../../lib/stats';
import { useTheme, useThemedStyles, type ThemeColors } from '../../lib/theme';
import type { Book, ReadingSession } from '../../lib/types';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const HEATMAP_OPACITIES = [0.24, 0.42, 0.6, 0.78, 1];
const FINISHED_GAP = 10;
const SHARE_COVER_LIMIT = 12;

type HeatmapCell = { key: string; pages: number } | null;

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function buildHeatmapWeeks(year: number, dailyPages: Record<string, number>): HeatmapCell[][] {
  const dec31 = new Date(year, 11, 31);
  const cursor = new Date(year, 0, 1);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const weeks: HeatmapCell[][] = [];
  while (cursor <= dec31) {
    const week: HeatmapCell[] = [];
    for (let day = 0; day < 7; day++) {
      week.push(
        cursor.getFullYear() === year
          ? { key: dateKey(cursor), pages: dailyPages[dateKey(cursor)] ?? 0 }
          : null
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function recapCoverMetrics(windowWidth: number) {
  const canvas = Math.min(windowWidth, 900);
  const columns = windowWidth >= 760 ? 5 : 3;
  const width = Math.floor((canvas - 32 - FINISHED_GAP * (columns - 1)) / columns);
  return { columns, width, height: Math.floor(width * 1.5) };
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.metric, compact && styles.metricCompact]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FinishedTile({ book, width, height }: { book: Book; width: number; height: number }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable
        style={{ width }}
        accessibilityRole="button"
        accessibilityLabel={`${book.title}, finished ${formatDateShort(book.finishedAt!)}${
          book.rating !== null ? `, rated ${book.rating} out of 10` : ''
        }`}
        accessibilityHint="Opens book details"
      >
        <BookCover
          uri={book.coverUrl}
          title={book.title}
          style={[styles.finishedCover, { width, height }]}
          showTitleFallback
          fallbackTextStyle={styles.coverFallback}
        />
        <Text style={styles.finishedTitle} numberOfLines={2}>{book.title}</Text>
        <View style={styles.finishedMetaRow}>
          <Text style={styles.finishedDate}>{formatDateShort(book.finishedAt!)}</Text>
          {book.rating !== null && <Text style={styles.finishedRating}>★ {book.rating}</Text>}
        </View>
      </Pressable>
    </Link>
  );
}

function HighlightCard({
  label,
  book,
  note,
}: {
  label: string;
  book: Book;
  note: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: String(book.id) } }} asChild>
      <Pressable
        style={styles.highlight}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${book.title}, ${note}`}
        accessibilityHint="Opens book details"
      >
        <BookCover uri={book.coverUrl} title={book.title} style={styles.highlightCover} />
        <Text style={styles.highlightLabel}>{label}</Text>
        <Text style={styles.highlightTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.highlightNote}>{note}</Text>
      </Pressable>
    </Link>
  );
}

export default function Recap() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width: windowWidth } = useWindowDimensions();
  const { year } = useLocalSearchParams<{ year: string }>();
  const selectedYear = Number(year);
  const [books, setBooks] = useState<Book[]>([]);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [recapName, setRecapName] = useState('');
  const [settledShareCovers, setSettledShareCovers] = useState<Set<number>>(new Set());
  const shareCardRef = useRef<View>(null);
  const heatmapScrollRef = useRef<ScrollView>(null);
  const coverMetrics = recapCoverMetrics(windowWidth);
  const markShareCoverSettled = useCallback((readingId: number) => {
    setSettledShareCovers((current) => {
      if (current.has(readingId)) return current;
      const next = new Set(current);
      next.add(readingId);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAllReadingHistory(db),
      getAllSessions(db),
      getAppSetting(db, RECAP_NAME_KEY),
    ]).then(([history, allSessions, name]) => {
      if (!active) return;
      setBooks(
        history
          .filter(
            (book) =>
              book.status === 'read' &&
              book.finishedAt &&
              new Date(book.finishedAt).getFullYear() === selectedYear
          )
          .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
      );
      setSessions(allSessions);
      setRecapName(name?.trim() ?? '');
    });
    return () => {
      active = false;
    };
  }, [db, selectedYear]);

  if (!Number.isFinite(selectedYear)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Recap' }} />
        <View style={styles.screen}>
          <Text style={styles.emptyText}>That&apos;s not a year I recognize.</Text>
        </View>
      </>
    );
  }

  const pages = pagesInYear(sessions, selectedYear);
  const rated = books.filter((book) => book.rating !== null);
  const averageRating =
    rated.length > 0
      ? (rated.reduce((sum, book) => sum + (book.rating ?? 0), 0) / rated.length).toFixed(1)
      : '–';
  const timed = books.filter((book) => book.startedAt && book.finishedAt);
  const averageDays =
    timed.length > 0
      ? Math.round(
          timed.reduce(
            (sum, book) => sum + daysBetween(book.startedAt!, book.finishedAt!),
            0
          ) / timed.length
        )
      : null;
  const paged = books.filter((book) => book.totalPages !== null);
  const averageLength =
    paged.length > 0
      ? Math.round(paged.reduce((sum, book) => sum + (book.totalPages ?? 0), 0) / paged.length)
      : null;
  const topRated =
    rated.length > 0
      ? rated.reduce((best, book) => ((book.rating ?? 0) > (best.rating ?? 0) ? book : best))
      : null;
  const fastest =
    timed.length > 0
      ? timed.reduce((best, book) =>
          daysBetween(book.startedAt!, book.finishedAt!) <
          daysBetween(best.startedAt!, best.finishedAt!)
            ? book
            : best
        )
      : null;
  const longest =
    paged.length > 0
      ? paged.reduce((best, book) => ((book.totalPages ?? 0) > (best.totalPages ?? 0) ? book : best))
      : null;

  const months = pagesByMonth(sessions, selectedYear);
  const maxMonth = Math.max(...months, 1);
  const dailyPages = dailyPagesInYear(sessions, selectedYear);
  const dailyEntries = Object.entries(dailyPages).filter(([, count]) => count > 0);
  const bestReading = bestReadingDays(dailyPages);
  const bestDay = bestReading ? [bestReading.dates[0], bestReading.pages] as const : null;
  const activeDays = dailyEntries.length;
  const maxDaily = Math.max(...dailyEntries.map(([, count]) => count), 1);
  const heatmapWeeks = buildHeatmapWeeks(selectedYear, dailyPages);
  const quarters = [0, 0, 0, 0];
  for (const book of books) quarters[Math.floor(new Date(book.finishedAt!).getMonth() / 3)] += 1;
  const maxQuarter = Math.max(...quarters, 1);
  const hasSessions = sessions.some(
    (session) => new Date(session.loggedAt).getFullYear() === selectedYear
  );

  const bestDayText = bestDay
    ? `${formatDateShort(`${bestDay[0]}T12:00:00.000Z`)} · ${plural(bestDay[1], 'page')}${
        (bestReading?.dates.length ?? 0) > 1
          ? ` · tied across ${bestReading!.dates.length} days`
          : ''
      }`
    : 'No page sessions logged';
  const shareBooks = books.slice(-SHARE_COVER_LIMIT);
  const extraShareBooks = Math.max(0, books.length - shareBooks.length);
  const shareCoversReady = shareBooks.every((book) =>
    settledShareCovers.has(book.readingId)
  );

  async function handleShare() {
    if (!shareCoversReady) {
      notify('Poster is still preparing', 'Wait a moment for the book covers to finish loading.');
      return;
    }
    try {
      await new Promise((resolve) =>
        setTimeout(resolve, Platform.OS === 'web' ? 150 : 300)
      );
      const capture = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'base64' : 'tmpfile',
      });
      const filename = `bookmarked-${selectedYear}-recap.png`;
      await shareFile(
        Platform.OS === 'web'
          ? {
              base64: capture,
              filename,
              mimeType: 'image/png',
              dialogTitle: `Share ${selectedYear} recap`,
            }
          : {
              uri: capture,
              filename,
              mimeType: 'image/png',
              dialogTitle: `Share ${selectedYear} recap`,
            }
      );
    } catch {
      notify('Share failed', 'Could not create the recap image.');
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: `${selectedYear} in books` }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[readableContentStyle, styles.pageContent]}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            {recapName ? `@${recapName}'s reading year` : 'Your reading year'}
          </Text>
          <Text style={styles.yearHeading}>{selectedYear} in books</Text>
          <View style={styles.metricRow}>
            <Metric label="Books" value={String(books.length)} />
            <Metric label="Pages" value={String(pages)} />
            <Metric label="Avg rating" value={averageRating} />
          </View>
        </View>

        {books.length === 0 && !hasSessions && (
          <Text style={styles.emptyText}>Nothing tracked in {selectedYear} yet.</Text>
        )}

        {books.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Everything you finished</Text>
            <Text style={styles.sectionIntro}>
              Every completed reading is here, including rereads.
            </Text>
            <View style={styles.finishedGrid}>
              {books.map((book) => (
                <FinishedTile
                  key={book.readingId}
                  book={book}
                  width={coverMetrics.width}
                  height={coverMetrics.height}
                />
              ))}
            </View>
          </>
        )}

        {hasSessions && (
          <>
            <Text style={styles.sectionHeading}>Your reading activity</Text>
            <View
              style={styles.bestDayCard}
              accessible
              accessibilityLabel={`Biggest reading day: ${bestDayText}`}
            >
              <Text style={styles.bestDayLabel}>Biggest reading day</Text>
              <Text style={styles.bestDayValue}>
                {bestDay ? plural(bestDay[1], 'page') : 'No pages yet'}
              </Text>
              <Text style={styles.bestDayDate}>
                {bestDay
                  ? `${formatDateShort(`${bestDay[0]}T12:00:00.000Z`)}${
                      (bestReading?.dates.length ?? 0) > 1
                        ? ` · ${bestReading!.dates.length}-day tie`
                        : ''
                    }`
                  : 'Start logging progress to build this story.'}
              </Text>
            </View>

            <View style={styles.insightRow}>
              <Metric label="Active days" value={String(activeDays)} compact />
              <Metric
                label="Avg length"
                value={averageLength !== null ? `${averageLength}p` : '–'}
                compact
              />
              <Metric
                label="Avg finish"
                value={averageDays !== null ? `${averageDays}d` : '–'}
                compact
              />
            </View>

            <Text style={styles.chartTitle}>Pages by month</Text>
            <Text style={styles.chartSummary}>
              {months.map((count, index) => `${MONTH_LABELS[index]} ${count}`).join(' · ')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.months}>
                {months.map((count, index) => (
                  <View key={MONTH_LABELS[index]} style={styles.monthColumn}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.monthBar,
                          {
                            height: `${Math.max(
                              (count / maxMonth) * 100,
                              count > 0 ? 7 : 0
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barCount}>{count}</Text>
                    <Text style={styles.barLabel}>{MONTH_LABELS[index]}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.chartTitle}>Reading heatmap</Text>
            <Text style={styles.chartSummary}>
              {activeDays} active {activeDays === 1 ? 'day' : 'days'} · {bestDayText}
            </Text>
            <ScrollView
              ref={heatmapScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() =>
                heatmapScrollRef.current?.scrollToEnd({ animated: false })
              }
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.heatmapGrid}>
                {heatmapWeeks.map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.heatmapWeek}>
                    {week.map((cell, dayIndex) => {
                      if (!cell) {
                        return <View key={dayIndex} style={[styles.heatmapCell, styles.padCell]} />;
                      }
                      if (cell.pages === 0) {
                        return (
                          <View
                            key={cell.key}
                            style={[styles.heatmapCell, { backgroundColor: colors.border }]}
                          />
                        );
                      }
                      const bucket = Math.min(4, Math.floor((cell.pages / maxDaily) * 5));
                      return (
                        <View
                          key={cell.key}
                          style={[
                            styles.heatmapCell,
                            {
                              backgroundColor: colors.primary,
                              opacity: HEATMAP_OPACITIES[bucket],
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.chartTitle}>Finishes by quarter</Text>
            <View
              style={styles.quarters}
              accessible
              accessibilityLabel={`Books finished by quarter: ${quarters
                .map((count, index) => `Q${index + 1}, ${count}`)
                .join('; ')}`}
            >
              {quarters.map((count, index) => (
                <View key={index} style={styles.quarterColumn}>
                  <View style={styles.quarterTrack}>
                    <View
                      style={[
                        styles.quarterBar,
                        {
                          height: `${Math.max(
                            (count / maxQuarter) * 100,
                            count > 0 ? 8 : 0
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barCount}>{count}</Text>
                  <Text style={styles.barLabel}>Q{index + 1}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {(topRated || fastest || longest) && (
          <>
            <Text style={styles.sectionHeading}>Reading highlights</Text>
            <Text style={styles.sectionIntro}>
              A few memorable edges of the year—not the whole story.
            </Text>
            <View style={styles.highlightGrid}>
              {topRated && (
                <HighlightCard
                  label="Top rated"
                  book={topRated}
                  note={`★ ${topRated.rating}/10`}
                />
              )}
              {fastest && (
                <HighlightCard
                  label="Fastest"
                  book={fastest}
                  note={plural(daysBetween(fastest.startedAt!, fastest.finishedAt!), 'day')}
                />
              )}
              {longest && (
                <HighlightCard
                  label="Longest"
                  book={longest}
                  note={plural(longest.totalPages ?? 0, 'page')}
                />
              )}
            </View>
          </>
        )}

        {books.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Share your year</Text>
            <Text style={styles.sectionIntro}>
              A celebratory poster built from this recap.
            </Text>
            <View
              ref={shareCardRef}
              collapsable={false}
              style={styles.sharePoster}
            >
              <View style={styles.posterGlowOne} />
              <View style={styles.posterGlowTwo} />
              <Text style={styles.posterBrand}>BOOKMARKED</Text>
              <Text style={styles.posterName}>
                {recapName ? `@${recapName}` : 'MY READING YEAR'}
              </Text>
              <Text style={styles.posterYear}>{selectedYear}</Text>
              <View style={styles.posterMetricRow}>
                <Metric label="Books" value={String(books.length)} compact />
                <Metric label="Pages" value={String(pages)} compact />
                <Metric label="Avg rating" value={averageRating} compact />
              </View>
              <View style={styles.posterCovers}>
                {shareBooks.map((book) => (
                  <BookCover
                    key={book.readingId}
                    uri={book.coverUrl}
                    title={book.title}
                    style={styles.posterCover}
                    showTitleFallback
                    fallbackTextStyle={styles.posterFallback}
                    onSettled={() => markShareCoverSettled(book.readingId)}
                  />
                ))}
              </View>
              {extraShareBooks > 0 && (
                <Text style={styles.moreBooks}>+{extraShareBooks} more finished</Text>
              )}
              <View style={styles.posterBest}>
                <Text style={styles.posterBestLabel}>BIGGEST READING DAY</Text>
                <Text style={styles.posterBestValue}>
                  {bestDay
                    ? formatDateShort(`${bestDay[0]}T12:00:00.000Z`)
                    : 'No page sessions logged'}
                </Text>
                {bestDay && (
                  <Text style={styles.posterBestPages}>
                    {plural(bestDay[1], 'page')} read
                  </Text>
                )}
                {(bestReading?.dates.length ?? 0) > 1 && (
                  <Text style={styles.posterBestTie}>
                    Tied across {bestReading!.dates.length} days
                  </Text>
                )}
              </View>
              {(topRated || fastest) && (
                <View style={styles.posterHighlights}>
                  {topRated && (
                    <View style={styles.posterHighlight}>
                      <Text style={styles.posterHighlightLabel}>HIGHEST RATED</Text>
                      <Text style={styles.posterHighlightTitle} numberOfLines={2}>
                        {topRated.title}
                      </Text>
                      <Text style={styles.posterHighlightNote}>
                        ★ {topRated.rating}/10
                      </Text>
                    </View>
                  )}
                  {fastest && (
                    <View style={styles.posterHighlight}>
                      <Text style={styles.posterHighlightLabel}>FASTEST READ</Text>
                      <Text style={styles.posterHighlightTitle} numberOfLines={2}>
                        {fastest.title}
                      </Text>
                      <Text style={styles.posterHighlightNote}>
                        {plural(
                          daysBetween(fastest.startedAt!, fastest.finishedAt!),
                          'day'
                        )}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={styles.posterFooter}>A year kept in books.</Text>
            </View>
            <Pressable
              style={[styles.shareButton, !shareCoversReady && styles.shareButtonDisabled]}
              onPress={handleShare}
              disabled={!shareCoversReady}
              accessibilityRole="button"
              accessibilityLabel={`Share ${selectedYear} reading recap as an image`}
              accessibilityState={{ disabled: !shareCoversReady }}
            >
              <Text style={styles.shareButtonText}>
                {shareCoversReady ? `Share ${selectedYear} poster` : 'Preparing covers…'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

const createStyles = (colors: ThemeColors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  pageContent: { padding: 16, paddingBottom: 64 },
  hero: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden' as const,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  yearHeading: { color: colors.text, fontSize: 32, fontWeight: '800' as const, marginTop: 5 },
  metricRow: { flexDirection: 'row' as const, gap: 9, marginTop: 18 },
  metric: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  metricCompact: { paddingVertical: 10 },
  metricValue: { color: colors.primary, fontSize: 22, fontWeight: '800' as const },
  metricValueCompact: { fontSize: 18 },
  metricLabel: { color: colors.textDim, fontSize: 11, marginTop: 3, textAlign: 'center' as const },
  sectionHeading: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800' as const,
    marginTop: 30,
  },
  sectionIntro: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 13 },
  finishedGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: FINISHED_GAP },
  finishedCover: { borderRadius: 8, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  coverFallback: { fontSize: 12 },
  finishedTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700' as const, marginTop: 7 },
  finishedMetaRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 4, marginTop: 3 },
  finishedDate: { color: colors.textDim, fontSize: 10, flexShrink: 1 },
  finishedRating: { color: colors.tertiary, fontSize: 10, fontWeight: '800' as const },
  bestDayCard: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  bestDayLabel: { color: colors.primary, fontSize: 12, fontWeight: '800' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
  bestDayValue: { color: colors.text, fontSize: 30, fontWeight: '800' as const, marginTop: 6 },
  bestDayDate: { color: colors.textDim, fontSize: 14, marginTop: 3 },
  insightRow: { flexDirection: 'row' as const, gap: 9, marginTop: 10 },
  chartTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const, marginTop: 22, marginBottom: 5 },
  chartSummary: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  months: { flexDirection: 'row' as const, backgroundColor: colors.card, borderRadius: 14, borderColor: colors.border, borderWidth: 1, padding: 14, gap: 13 },
  monthColumn: { width: 30, alignItems: 'center' as const },
  barTrack: { height: 96, width: 22, borderRadius: 7, backgroundColor: colors.border, justifyContent: 'flex-end' as const, overflow: 'hidden' as const },
  monthBar: { width: '100%' as const, backgroundColor: colors.primary, borderRadius: 7 },
  barCount: { color: colors.text, fontSize: 12, fontWeight: '700' as const, marginTop: 7 },
  barLabel: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  heatmapGrid: { flexDirection: 'row' as const, gap: 3, backgroundColor: colors.card, borderRadius: 14, borderColor: colors.border, borderWidth: 1, padding: 14 },
  heatmapWeek: { gap: 3 },
  heatmapCell: { width: 11, height: 11, borderRadius: 2 },
  padCell: { backgroundColor: 'transparent' },
  quarters: { flexDirection: 'row' as const, backgroundColor: colors.card, borderRadius: 14, borderColor: colors.border, borderWidth: 1, padding: 16, gap: 16 },
  quarterColumn: { flex: 1, alignItems: 'center' as const },
  quarterTrack: { height: 86, width: 22, borderRadius: 7, backgroundColor: colors.border, justifyContent: 'flex-end' as const, overflow: 'hidden' as const },
  quarterBar: { width: '100%' as const, backgroundColor: colors.secondary, borderRadius: 7 },
  highlightGrid: { flexDirection: 'row' as const, gap: 9 },
  highlight: { flex: 1, minWidth: 0, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 9 },
  highlightCover: { width: '100%' as const, aspectRatio: 2 / 3, borderRadius: 7, backgroundColor: colors.border },
  highlightLabel: { color: colors.primary, fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 8 },
  highlightTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700' as const, marginTop: 3 },
  highlightNote: { color: colors.tertiary, fontSize: 11, fontWeight: '700' as const, marginTop: 4 },
  sharePoster: {
    position: 'relative' as const,
    backgroundColor: colors.cardAlt,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden' as const,
  },
  posterGlowOne: { position: 'absolute' as const, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primaryContainer, top: -70, right: -50 },
  posterGlowTwo: { position: 'absolute' as const, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.primaryContainer, bottom: -60, left: -40 },
  posterBrand: { color: colors.primary, fontSize: 10, fontWeight: '800' as const, letterSpacing: 2 },
  posterName: { color: colors.textDim, fontSize: 12, fontWeight: '700' as const, marginTop: 20 },
  posterYear: { color: colors.text, fontSize: 46, lineHeight: 50, fontWeight: '900' as const },
  posterMetricRow: { flexDirection: 'row' as const, gap: 8, marginTop: 13 },
  posterCovers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 15 },
  posterCover: { width: '23.5%' as const, aspectRatio: 2 / 3, borderRadius: 5, backgroundColor: colors.border },
  posterFallback: { fontSize: 9 },
  moreBooks: { color: colors.primary, fontSize: 12, fontWeight: '800' as const, marginTop: 8, textAlign: 'right' as const },
  posterBest: { backgroundColor: colors.primaryContainer, borderRadius: 12, padding: 12, marginTop: 14 },
  posterBestLabel: { color: colors.primary, fontSize: 9, fontWeight: '800' as const, letterSpacing: 1 },
  posterBestValue: { color: colors.text, fontSize: 13, fontWeight: '700' as const, marginTop: 3 },
  posterBestPages: { color: colors.primary, fontSize: 17, fontWeight: '900' as const, marginTop: 3 },
  posterBestTie: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  posterHighlights: { flexDirection: 'row' as const, gap: 8, marginTop: 9 },
  posterHighlight: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
  },
  posterHighlightLabel: { color: colors.primary, fontSize: 8, fontWeight: '800' as const, letterSpacing: 0.8 },
  posterHighlightTitle: { color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '700' as const, marginTop: 4 },
  posterHighlightNote: { color: colors.tertiary, fontSize: 10, fontWeight: '800' as const, marginTop: 4 },
  posterFooter: { color: colors.textDim, fontSize: 11, marginTop: 13 },
  shareButton: { minHeight: 50, backgroundColor: colors.primary, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 12 },
  shareButtonDisabled: { opacity: 0.55 },
  shareButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' as const },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' as const, marginTop: 48 },
});
