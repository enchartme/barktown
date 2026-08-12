import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDisturbedTime, summarizeEntries } from '../src/lib/report-summary.js';

test('report summaries aggregate disturbances, duration, hits, and worst density', () => {
  const entries = [
    { id: 'clip-a', durationSec: 120 },
    { id: 'clip-b', durationSec: 30 },
    { id: 'note', durationSec: 0 },
  ];
  const metadata = new Map([
    ['clip-a', { timestamps: [1, 2, 3] }],
    ['clip-b', { timestamps: Array.from({ length: 10 }, (_, i) => i) }],
  ]);

  assert.deepEqual(summarizeEntries(entries, metadata), {
    disturbances: 3,
    totalDurationSec: 150,
    barks: 13,
    worstDensityBpm: 20,
  });
});

test('disturbed time truncates seconds and uses hour/minute units', () => {
  assert.equal(formatDisturbedTime((3 * 60 * 60) + (45 * 60) + 59), '3 h 45 min');
  assert.equal(formatDisturbedTime(59 * 60 + 59), '59 min');
  assert.equal(formatDisturbedTime(0), '0 min');
});
