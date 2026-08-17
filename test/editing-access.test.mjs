import test from 'node:test';
import assert from 'node:assert/strict';

import { probeEditingAccess } from '../src/lib/editing-access.js';

test('editing access is enabled when the private API is reachable', async () => {
  let requestedUrl = '';
  const available = await probeEditingAccess({
    privateApiBase: 'https://private.example',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true };
    },
  });

  assert.equal(requestedUrl, 'https://private.example/health');
  assert.equal(available, true);
});

test('editing access is disabled for failed responses and unreachable APIs', async () => {
  assert.equal(await probeEditingAccess({
    fetchImpl: async () => ({ ok: false }),
  }), false);
  assert.equal(await probeEditingAccess({
    fetchImpl: async () => { throw new Error('not on tailnet'); },
  }), false);
});
