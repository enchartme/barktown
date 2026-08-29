import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dailyDataQuality,
  dataQualityReasons,
  fetchDataQuality,
  summarizeDataQuality,
} from '../src/lib/data-quality.js';

const rows = [
  {
    recordId: 'b', recordingStartedAt: '2026-08-28T11:00:00Z', xrunCount: 2,
    inputOverflowCount: 2, inputUnderflowCount: 0,
    outputOverflowCount: 0, outputUnderflowCount: 0, otherXrunCount: 0,
  },
  {
    recordId: 'a', recordingStartedAt: '2026-08-28T10:00:00Z', xrunCount: 0,
    inputOverflowCount: 0, inputUnderflowCount: 0,
    outputOverflowCount: 0, outputUnderflowCount: 0, otherXrunCount: 0,
  },
  {
    recordId: 'c', recordingStartedAt: '2026-08-29T10:00:00Z', xrunCount: 1,
    inputOverflowCount: 0, inputUnderflowCount: 1,
    outputOverflowCount: 0, outputUnderflowCount: 0, otherXrunCount: 0,
  },
];

test('data-quality summaries distinguish clean recordings and XRUN incidents', () => {
  assert.deepEqual(summarizeDataQuality(rows), {
    recordings: 3,
    clean: 1,
    affected: 2,
    totalXruns: 3,
    cleanRate: 1 / 3,
  });
  assert.deepEqual(dailyDataQuality(rows), [
    { date: '2026-08-28', recordings: 2, clean: 1, affected: 1, xruns: 2 },
    { date: '2026-08-29', recordings: 1, clean: 0, affected: 1, xruns: 1 },
  ]);
  assert.deepEqual(dataQualityReasons(rows).map(({ label, count }) => [label, count]), [
    ['Input overflow', 2],
    ['Input underflow', 1],
    ['Output overflow', 0],
    ['Output underflow', 0],
    ['Other', 0],
  ]);
});

test('data-quality loader follows public pagination', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url.toString());
    const page = Number(url.searchParams.get('page'));
    return {
      ok: true,
      async json() {
        return page === 1
          ? { items: [rows[0]], pagination: { hasNextPage: true, nextPage: 2 } }
          : { items: [rows[1]], pagination: { hasNextPage: false, nextPage: null } };
      },
    };
  };
  const result = await fetchDataQuality({
    apiBase: 'https://public.example.test',
    startDate: '2026-08-01',
    endDate: '2026-08-29',
    fetchImpl,
  });

  assert.deepEqual(result.map((row) => row.recordId), ['b', 'a']);
  assert.match(urls[0], /startDate=2026-08-01/);
  assert.match(urls[1], /page=2/);
});
