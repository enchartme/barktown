import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDisturbedTime } from '../src/lib/report-summary.js';

test('disturbed time truncates seconds and uses hour/minute units', () => {
  assert.equal(formatDisturbedTime((3 * 60 * 60) + (45 * 60) + 59), '3 h 45 min');
  assert.equal(formatDisturbedTime(59 * 60 + 59), '59 min');
  assert.equal(formatDisturbedTime(0), '0 min');
});
