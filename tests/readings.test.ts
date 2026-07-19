import assert from 'node:assert/strict';
import test from 'node:test';
import { latestCompletedByBook } from '../lib/readings';
import type { Book } from '../lib/types';

function reading(id: number, sequence: number, finishedAt: string): Book {
  return {
    id,
    readingId: id * 10 + sequence,
    readingSequence: sequence,
    olKey: `/works/${id}`,
    title: `Book ${id}`,
    author: 'Author',
    ownership: 'owned',
    editionKey: null,
    isbn: null,
    publisher: null,
    publishDate: null,
    language: null,
    coverUrl: null,
    totalPages: 100,
    description: null,
    status: 'read',
    currentPage: 100,
    rating: sequence,
    review: null,
    notes: null,
    addedAt: '2020-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt,
    updatedAt: finishedAt,
  };
}

test('read shelves show the latest completed reread once per physical copy', () => {
  const result = latestCompletedByBook([
    reading(1, 1, '2022-01-01T00:00:00.000Z'),
    reading(1, 2, '2024-01-01T00:00:00.000Z'),
    reading(2, 1, '2023-01-01T00:00:00.000Z'),
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((book) => book.id === 1)?.readingSequence, 2);
});
