import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GOBLIN_BASE_URL,
  goblinHostLabel,
  resolveGoblinBaseUrl,
} from '../src/lib/goblin-config.js';

test('Goblin endpoint keeps the current host as its default', () => {
  assert.equal(resolveGoblinBaseUrl(), DEFAULT_GOBLIN_BASE_URL);
});

test('Goblin endpoint is configurable and normalized', () => {
  const baseUrl = resolveGoblinBaseUrl('  https://capture.example.test/  ');

  assert.equal(baseUrl, 'https://capture.example.test');
  assert.equal(goblinHostLabel(baseUrl), 'capture');
});

test('Goblin endpoint rejects malformed or unsafe configuration', () => {
  assert.throws(() => resolveGoblinBaseUrl('gawblen.tail523149.ts.net'), /absolute HTTP\(S\) URL/);
  assert.throws(() => resolveGoblinBaseUrl('file:///tmp/goblin'), /absolute HTTP\(S\) URL/);
  assert.throws(() => resolveGoblinBaseUrl('https://gawblen.example/status?raw=1'), /query string/);
});
