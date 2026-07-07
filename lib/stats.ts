import type { ReadingSession } from './types';

function sessionPages(s: ReadingSession): number {
  // A backward slide (correcting a mistake) isn't "reading" pages.
  return Math.max(0, s.toPage - s.fromPage);
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pages actually logged in the given calendar year — this is what "Pages
// read" means everywhere in the app. In-progress books contribute here as
// soon as their pages are logged, unlike the old totalPages-of-finished-
// books sum, which credited nothing until a book was marked read.
export function pagesInYear(sessions: ReadingSession[], year: number): number {
  return sessions
    .filter((s) => new Date(s.loggedAt).getFullYear() === year)
    .reduce((sum, s) => sum + sessionPages(s), 0);
}

export function pagesInLastDays(sessions: ReadingSession[], days: number): number {
  const cutoff = Date.now() - days * 86400000;
  return sessions
    .filter((s) => new Date(s.loggedAt).getTime() >= cutoff)
    .reduce((sum, s) => sum + sessionPages(s), 0);
}

// Pages per calendar month (index 0 = January) for the given year — the
// activity story behind the existing "By quarter" chart, which counts books
// FINISHED per quarter (a different metric, not replaced by this).
export function pagesByMonth(sessions: ReadingSession[], year: number): number[] {
  const months = Array(12).fill(0);
  for (const s of sessions) {
    const d = new Date(s.loggedAt);
    if (d.getFullYear() === year) {
      months[d.getMonth()] += sessionPages(s);
    }
  }
  return months;
}

// Pages per calendar day for the given year, keyed by dateKey — the raw
// material for a GitHub-style reading heatmap.
export function dailyPagesInYear(
  sessions: ReadingSession[],
  year: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of sessions) {
    const d = new Date(s.loggedAt);
    if (d.getFullYear() === year) {
      const key = dateKey(d);
      result[key] = (result[key] ?? 0) + sessionPages(s);
    }
  }
  return result;
}

// Consecutive calendar days, ending today or yesterday, with at least one
// logged session. Multiple sessions on the same day count once.
export function currentStreakDays(sessions: ReadingSession[]): number {
  const days = new Set(sessions.map((s) => dateKey(new Date(s.loggedAt))));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dateKey(cursor))) {
    // Nothing logged yet today — the streak can still be alive through yesterday.
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
