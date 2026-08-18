import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchDiarySummary } from '../src/lib/diary-summary.js';

test('diary summary requests an inclusive public date period', async () => {
  let requestedUrl;
  const body = {
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    days: [],
    totals: { records: 0, disturbedTimeSec: 0, barks: 0 },
  };

  const result = await fetchDiarySummary({
    startDate: body.startDate,
    endDate: body.endDate,
    apiBase: 'https://public.example.test',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => body };
    },
  });

  assert.equal(
    requestedUrl.toString(),
    'https://public.example.test/api/diary-summary?startDate=2026-08-03&endDate=2026-08-09',
  );
  assert.equal(result, body);
});

test('diary summary rejects malformed responses', async () => {
  await assert.rejects(
    fetchDiarySummary({
      startDate: '2026-08-03',
      endDate: '2026-08-09',
      fetchImpl: async () => ({ ok: true, json: async () => ({ days: null }) }),
    }),
    /invalid shape/,
  );
});
