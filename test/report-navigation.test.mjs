import test from 'node:test';
import assert from 'node:assert/strict';

import { adjacentReportEntry } from '../src/lib/report-navigation.js';

const entries = [
  { id: 'monday-1' },
  { id: 'monday-2' },
  { id: 'tuesday-1' },
];

test('report navigation follows the current display order', () => {
  assert.equal(adjacentReportEntry(entries, 'monday-2', -1)?.id, 'monday-1');
  assert.equal(adjacentReportEntry(entries, 'monday-2', 1)?.id, 'tuesday-1');
});

test('report navigation stops at the ends and for an unknown entry', () => {
  assert.equal(adjacentReportEntry(entries, 'monday-1', -1), null);
  assert.equal(adjacentReportEntry(entries, 'tuesday-1', 1), null);
  assert.equal(adjacentReportEntry(entries, 'missing', 1), null);
});
