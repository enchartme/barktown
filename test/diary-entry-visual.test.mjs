import { test } from 'node:test';
import assert from 'node:assert/strict';

import { durationAreaRadius } from '../src/lib/diary-entry-visual.js';

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('diary circle area grows proportionally with recording duration', () => {
  const minRadius = 13;
  const maxRadius = 40;
  const maxDuration = 570;
  const minAreaFactor = minRadius ** 2;
  const areaRange = maxRadius ** 2 - minAreaFactor;

  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const radius = durationAreaRadius(
      maxDuration * fraction,
      minRadius,
      maxRadius,
      maxDuration,
    );
    assertClose((radius ** 2 - minAreaFactor) / areaRange, fraction);
  }
});

test('diary circle radius remains clamped to its visual range', () => {
  assert.equal(durationAreaRadius(-1, 13, 50, 570), 13);
  assert.equal(durationAreaRadius(571, 13, 50, 570), 50);
  assert.equal(durationAreaRadius(Number.NaN, 13, 50, 570), 13);
});
