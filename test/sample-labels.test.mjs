import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FRAGMENT_LABELS,
  SAMPLE_LABELS,
  sampleLabelColor,
  sampleMoveForShortcut,
} from '../src/lib/sample-labels.js';

test('review is a yellow fragment-only label', () => {
  assert.ok(FRAGMENT_LABELS.includes('review'));
  assert.ok(!SAMPLE_LABELS.includes('review'));
  assert.equal(sampleLabelColor('review'), '#f1c40f');
});

test('sample label shortcuts preserve or remove the diary entry with Shift', () => {
  assert.deepEqual(sampleMoveForShortcut('b'), { label: 'bark', keepInDiary: true });
  assert.deepEqual(sampleMoveForShortcut('B', true), { label: 'bark', keepInDiary: false });
  assert.deepEqual(sampleMoveForShortcut('r'), { label: 'wrongdog', keepInDiary: true });
  assert.equal(sampleMoveForShortcut('v'), null, 'review is not a whole-sample label');
  assert.equal(sampleMoveForShortcut('q'), null);
});
