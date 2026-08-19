import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRAGMENT_LABELS, SAMPLE_LABELS, sampleLabelColor } from '../src/lib/sample-labels.js';

test('review is a yellow fragment-only label', () => {
  assert.ok(FRAGMENT_LABELS.includes('review'));
  assert.ok(!SAMPLE_LABELS.includes('review'));
  assert.equal(sampleLabelColor('review'), '#f1c40f');
});
