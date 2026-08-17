import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diaryEntriesForDays,
  recentDiaryBounds,
  selectDiaryDays,
} from '../src/lib/diary-range.js';

function entry(date, suffix = '') {
  return {
    id: `${date}${suffix}`,
    date,
    datetimeLocal: `${date}T12:00:00`,
  };
}

test('Diary requests fourteen calendar days ending on the latest record date', () => {
  assert.deepEqual(recentDiaryBounds('2026-08-17'), {
    startDate: '2026-08-04',
    endDate: '2026-08-17',
  });
  assert.deepEqual(recentDiaryBounds('2026-01-05'), {
    startDate: '2025-12-23',
    endDate: '2026-01-05',
  });
});

test('Diary displays only non-empty days returned by the bounded request', () => {
  const days = selectDiaryDays([
    entry('2026-08-17'),
    entry('2026-08-17', '-second'),
    entry('2026-08-09'),
    entry('2026-08-04'),
  ]);

  assert.deepEqual(days.map((day) => day.date), ['2026-08-17', '2026-08-09', '2026-08-04']);
  assert.equal(days[0].entries.length, 2);
});

test('Diary all-history mode includes every record day starting from 2021', () => {
  const days = selectDiaryDays([
    entry('2020-12-31'),
    entry('2021-01-01'),
    entry('2025-12-31'),
    entry('2026-01-01'),
  ]);

  assert.deepEqual(days.map((day) => day.date), [
    '2026-01-01',
    '2025-12-31',
    '2021-01-01',
  ]);
  assert.deepEqual(diaryEntriesForDays(days).map((item) => item.id), [
    '2026-01-01',
    '2025-12-31',
    '2021-01-01',
  ]);
});
