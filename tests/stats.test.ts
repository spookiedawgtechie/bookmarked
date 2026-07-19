import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentStreakDays,
  dailyPagesInYear,
  pagesByMonth,
  pagesInLastDays,
  pagesInYear,
} from '../lib/stats';
import type { ReadingSession } from '../lib/types';

function session(id: number, date: Date, fromPage: number, toPage: number): ReadingSession {
  return { id, bookId: 1, loggedAt: date.toISOString(), fromPage, toPage };
}

test('year and month totals count positive page deltas only', () => {
  const year = new Date().getFullYear();
  const sessions = [
    session(1, new Date(year, 0, 10, 12), 0, 40),
    session(2, new Date(year, 0, 11, 12), 40, 25),
    session(3, new Date(year, 5, 1, 12), 25, 75),
    session(4, new Date(year - 1, 11, 31, 12), 0, 100),
  ];

  assert.equal(pagesInYear(sessions, year), 90);
  assert.deepEqual(pagesByMonth(sessions, year), [40, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0]);
});

test('daily totals combine multiple sessions logged on the same date', () => {
  const year = new Date().getFullYear();
  const date = new Date(year, 2, 15, 12);
  const totals = dailyPagesInYear(
    [session(1, date, 0, 20), session(2, date, 20, 55)],
    year
  );

  assert.deepEqual(Object.values(totals), [55]);
});

test('recent pages and streak tolerate an empty today', () => {
  const yesterday = new Date();
  yesterday.setHours(12, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(yesterday);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
  const fourDaysAgo = new Date(yesterday);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 3);
  const sessions = [
    session(1, yesterday, 0, 10),
    session(2, twoDaysAgo, 10, 30),
    session(3, fourDaysAgo, 30, 100),
  ];

  assert.equal(currentStreakDays(sessions), 2);
  assert.equal(pagesInLastDays(sessions, 7), 100);
});
