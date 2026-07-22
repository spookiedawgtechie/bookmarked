import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constrainedLibraryWidth,
  gridCoverWidth,
  libraryGridColumns,
} from '../lib/layout';

test('library columns scale from phone to tablet to desktop', () => {
  assert.equal(libraryGridColumns(390), 4);
  assert.equal(libraryGridColumns(800), 5);
  assert.equal(libraryGridColumns(2560), 6);
});

test('desktop library width and covers stop growing on wide monitors', () => {
  assert.equal(constrainedLibraryWidth(2560), 1200);
  assert.equal(gridCoverWidth(2560, 6, 56, 10), 182);
  assert.equal(gridCoverWidth(2560, 6, 32, 10), 186);
});

test('phone cover sizing preserves the dense four-column layout', () => {
  assert.equal(constrainedLibraryWidth(390), 390);
  assert.equal(gridCoverWidth(390, 4, 56, 10), 76);
  assert.equal(gridCoverWidth(390, 4, 32, 10), 82);
});
