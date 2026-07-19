import assert from 'node:assert/strict';
import test from 'node:test';
import { mapOpenLibraryDoc, sanitizeDescription } from '../lib/openlibrary';

test('English edition metadata is preferred while preserving the work title', () => {
  const result = mapOpenLibraryDoc({
    key: '/works/OL123W',
    title: 'Prestupleniye i nakazaniye',
    author_name: ['Fyodor Dostoevsky'],
    cover_i: 10,
    number_of_pages_median: 430,
    first_publish_year: 1866,
    editions: { docs: [{ title: 'Crime and Punishment', cover_i: 20, number_of_pages: 671 }] },
  });

  assert.deepEqual(result, {
    key: '/works/OL123W',
    title: 'Crime and Punishment',
    originalTitle: 'Prestupleniye i nakazaniye',
    author: 'Fyodor Dostoevsky',
    coverUrl: 'https://covers.openlibrary.org/b/id/20-M.jpg',
    pages: 671,
    year: 1866,
  });
});

test('work metadata remains a safe fallback when edition data is absent', () => {
  const result = mapOpenLibraryDoc({ key: '/works/OL1W', title: 'The Odyssey', cover_i: 7 });

  assert.equal(result.title, 'The Odyssey');
  assert.equal(result.originalTitle, null);
  assert.equal(result.author, 'Unknown author');
  assert.equal(result.pages, null);
});

test('description sanitizer keeps link labels without destinations', () => {
  assert.equal(sanitizeDescription('Read [this edition](https://example.com).'), 'Read this edition.');
});
