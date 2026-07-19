import type { Book } from './types';

// Library shelves show one physical copy, even when that copy has been read
// multiple times. Recaps use the full reading history instead.
export function latestCompletedByBook(readings: Book[]): Book[] {
  const latest = new Map<number, Book>();
  for (const reading of readings) {
    if (reading.status !== 'read' || !reading.finishedAt) continue;
    const existing = latest.get(reading.id);
    if (
      !existing ||
      reading.finishedAt > (existing.finishedAt ?? '') ||
      (reading.finishedAt === existing.finishedAt && reading.readingSequence > existing.readingSequence)
    ) {
      latest.set(reading.id, reading);
    }
  }
  return [...latest.values()];
}
