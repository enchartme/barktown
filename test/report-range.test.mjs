import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  groupByDateRange,
  isIsoDate,
  startOfIsoWeek,
} from '../src/lib/utils.js';

test('report weeks are Monday-aligned across month and year boundaries', () => {
  assert.equal(startOfIsoWeek('2026-08-12'), '2026-08-10');
  assert.equal(startOfIsoWeek('2026-01-01'), '2025-12-29');
  assert.equal(addDays('2025-12-29', 13), '2026-01-11');
});

test('report ranges include empty dates and remain newest first', () => {
  const entries = [
    { id: 'older', date: '2026-08-10', datetimeLocal: '2026-08-10T09:00:00' },
    { id: 'newer', date: '2026-08-12', datetimeLocal: '2026-08-12T11:00:00' },
  ];

  const days = groupByDateRange(entries, '2026-08-10', '2026-08-13');
  assert.deepEqual(days.map(day => day.date), [
    '2026-08-13',
    '2026-08-12',
    '2026-08-11',
    '2026-08-10',
  ]);
  assert.deepEqual(days.map(day => day.entries.map(entry => entry.id)), [
    [],
    ['newer'],
    [],
    ['older'],
  ]);
});

test('ISO date validation rejects impossible calendar dates', () => {
  assert.equal(isIsoDate('2026-08-12'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('12-08-2026'), false);
});
