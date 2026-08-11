import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { hitMetadataById, loadHitMetadata } from '../src/lib/hit-metadata.js';

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
