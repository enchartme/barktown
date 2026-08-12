import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  formatAutoDetectionLabel,
  formatDiaryEntryTitle,
  formatHitMetadataStats,
  hitMetadataById,
  loadHitMetadata,
} from '../src/lib/hit-metadata.js';

function response(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  };
}

test('bulk loader follows advertised pagination and merges every page', async () => {
  const requestedUrls = [];
  const pages = [
    {
      items: [
        { clipId: 'clip-a', timestamps: [1] },
        { clipId: 'clip-b', timestamps: [2] },
      ],
      pagination: { hasNextPage: true, isLastPage: false },
      links: { next: '/api/hit-metadata?page=2&pageSize=1000' },
    },
    {
      items: [{ clipId: 'clip-c', timestamps: [3] }],
      pagination: { hasNextPage: false, isLastPage: true },
      links: { next: null },
    },
  ];

  const result = await loadHitMetadata({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return response(pages.shift());
    },
  });

  assert.deepEqual(result, { pagesLoaded: 2, recordsLoaded: 3 });
  assert.match(requestedUrls[0], /\/api\/hit-metadata\?page=1&pageSize=1000$/);
  assert.match(requestedUrls[1], /\/api\/hit-metadata\?page=2&pageSize=1000$/);
  assert.deepEqual([...get(hitMetadataById).keys()], ['clip-a', 'clip-b', 'clip-c']);
});

test('auto-detection label is rebuilt from current hit metadata', () => {
  const metadata = {
    timestamps: [1, 3, 5],
    confidences: [0.91, 0.98, 0.94],
    loudnesses: [4.2, 1.4, 2.2],
    windowS: 9,
  };

  assert.equal(
    formatAutoDetectionLabel('-A- C1 D6 W94 La11.0 Lm1.9', metadata, 10),
    '-A- C0.98 D18 W3 La4.2 Lm2.2',
  );
});

test('hit metadata stats can be formatted independently of the stored label', () => {
  assert.equal(
    formatHitMetadataStats({
      timestamps: [1, 3, 5],
      confidences: [0.91, 0.98, 0.94],
      loudnesses: [4.2, 1.4, 2.2],
    }, 10),
    'C0.98 D18 W3 La4.2 Lm2.2',
  );
});

test('sample diary titles preserve SAMPLE and the comment before current stats', () => {
  assert.equal(
    formatDiaryEntryTitle({
      id: '2026-07-23_18-43-58_SAMPLE_bark',
      label: 'bark',
      durationSec: 10,
    }, {
      timestamps: [1, 3, 5],
      confidences: [0.91, 0.98, 0.94],
      loudnesses: [4.2, 1.4, 2.2],
    }),
    'SAMPLE bark C0.98 D18 W3 La4.2 Lm2.2',
  );
});

test('diary titles retain their descriptor without metadata and refresh auto stats', () => {
  assert.equal(
    formatDiaryEntryTitle({
      id: '2026-07-23_18-43-58_SAMPLE_bark',
      label: 'bark',
    }, null),
    'SAMPLE bark',
  );
  assert.equal(
    formatDiaryEntryTitle({
      id: 'auto',
      label: '-A- stale stats',
      durationSec: 10,
    }, {
      timestamps: [1],
      confidences: [1],
      loudnesses: [2],
    }),
    '-A- C1 D6 W1 La2.0 Lm2.0',
  );
});

test('auto-detection label handles maximum confidence, even median, and no hits', () => {
  assert.equal(
    formatAutoDetectionLabel('-A- old values', {
      timestamps: [1, 2, 3, 4],
      confidences: [0.91, 1, 0.95, 0.93],
      loudnesses: [4, 1, 3, 2],
    }, 12),
    '-A- C1 D20 W4 La4.0 Lm2.5',
  );
  assert.equal(
    formatAutoDetectionLabel('-A- old values', {
      timestamps: [],
      confidences: [],
      loudnesses: [],
    }, 12),
    '-A- C0.00 D0 W0 La0.0 Lm0.0',
  );
});

test('stored label remains the fallback for non-auto or unloaded metadata', () => {
  assert.equal(formatAutoDetectionLabel('barking', null, 10), 'barking');
  assert.equal(formatAutoDetectionLabel('-A- stored values', null, 10), '-A- stored values');
  assert.equal(formatAutoDetectionLabel('manual C1', {
    timestamps: [1],
    confidences: [1],
    loudnesses: [2],
  }, 10), 'manual C1');
});
