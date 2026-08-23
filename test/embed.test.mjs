import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmbeddedLayout } from '../src/lib/embed.js';

test('embedded layout follows the public Embed=true URL contract', () => {
  assert.equal(isEmbeddedLayout(new URLSearchParams('Embed=true')), true);
  assert.equal(isEmbeddedLayout(new URLSearchParams('Embed=TRUE')), true);
});

test('embedded layout accepts lowercase embed but not other values', () => {
  assert.equal(isEmbeddedLayout(new URLSearchParams('embed=true')), true);
  assert.equal(isEmbeddedLayout(new URLSearchParams('Embed=false')), false);
  assert.equal(isEmbeddedLayout(new URLSearchParams()), false);
});
