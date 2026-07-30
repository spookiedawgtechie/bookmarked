import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coverRequestUrl,
  looksLikeIsbn,
  mapOpenLibraryDoc,
  normalizeIsbn,
  sanitizeDescription,
} from '../lib/openlibrary';

test('English edition metadata is preferred while preserving the work title', () => {
  const result = mapOpenLibraryDoc({
    key: '/works/OL123W',
    title: 'Prestupleniye i nakazaniye',
    author_name: ['Fyodor Dostoevsky'],
    cover_i: 10,
    number_of_pages_median: 430,
    first_publish_year: 1866,
    editions: {
      docs: [{
        key: '/books/OL1M',
        title: 'Crime and Punishment',
        cover_i: 20,
        number_of_pages: 671,
        isbn: ['9780140449136'],
        publisher: ['Penguin Classics'],
        publish_date: ['2003'],
        language: ['eng'],
      }],
    },
  });

  assert.deepEqual(result, {
    key: '/works/OL123W',
    title: 'Crime and Punishment',
    originalTitle: 'Prestupleniye i nakazaniye',
    author: 'Fyodor Dostoevsky',
    exactIsbnMatch: false,
    editionKey: '/books/OL1M',
    isbn: '9780140449136',
    publisher: 'Penguin Classics',
    publishDate: '2003',
    language: 'eng',
    coverUrl: 'https://covers.openlibrary.org/b/id/20-M.jpg?default=false',
    pages: 671,
    year: 1866,
  });
});

test('work metadata remains a safe fallback when edition data is absent', () => {
  const result = mapOpenLibraryDoc({ key: '/works/OL1W', title: 'The Odyssey', cover_i: 7 });

  assert.equal(result.title, 'The Odyssey');
  assert.equal(result.originalTitle, null);
  assert.equal(result.author, 'Unknown author');
  assert.equal(result.editionKey, null);
  assert.equal(result.pages, null);
});

test('description sanitizer keeps link labels without destinations', () => {
  assert.equal(sanitizeDescription('Read [this edition](https://example.com).'), 'Read this edition.');
});

test('ISBN input is normalized and checksum validated', () => {
  assert.equal(normalizeIsbn('ISBN 978-1-5011-3915-4'), '9781501139154');
  assert.equal(normalizeIsbn('0-306-40615-2'), '0306406152');
  assert.equal(normalizeIsbn('0-8044-2957-X'), '080442957X');
  assert.equal(normalizeIsbn('9781501139155'), null);
  assert.equal(looksLikeIsbn('978-1-5011-3915-5'), true);
  assert.equal(looksLikeIsbn('The Odyssey'), false);
});

test('exact ISBN mapping selects the matching physical edition', () => {
  const result = mapOpenLibraryDoc(
    {
      key: '/works/OL17802920W',
      title: 'Leonardo da Vinci',
      author_name: ['Walter Isaacson'],
      cover_i: 1,
      editions: {
        docs: [
          {
            key: '/books/WRONG',
            title: 'Leonardo da Vinci',
            isbn: ['1111111111'],
            cover_i: 2,
          },
          {
            key: '/books/OL27102596M',
            title: 'Leonardo da Vinci',
            isbn: ['9781501139154', '1501139150'],
            publisher: ['Simon & Schuster'],
            language: ['eng'],
            cover_i: 8740542,
          },
        ],
      },
    },
    '9781501139154'
  );

  assert.equal(result.exactIsbnMatch, true);
  assert.equal(result.editionKey, '/books/OL27102596M');
  assert.equal(result.isbn, '9781501139154');
  assert.equal(result.publisher, 'Simon & Schuster');
  assert.equal(result.coverUrl, 'https://covers.openlibrary.org/b/id/8740542-M.jpg?default=false');
});

test('stored Open Library cover URLs request an explicit missing-cover error', () => {
  assert.equal(
    coverRequestUrl('https://covers.openlibrary.org/b/id/20-M.jpg'),
    'https://covers.openlibrary.org/b/id/20-M.jpg?default=false'
  );
  assert.equal(
    coverRequestUrl('https://covers.openlibrary.org/b/id/20-M.jpg?default=false'),
    'https://covers.openlibrary.org/b/id/20-M.jpg?default=false'
  );
});
