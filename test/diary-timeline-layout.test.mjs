import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diaryTimelineLayout } from '../src/lib/diary-timeline-layout.js';

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('24 hours fit the complete timeline viewport', () => {
  const layout = diaryTimelineLayout(1000, 108, 0, 24);

  assert.deepEqual(layout, {
    contentWidth: 1000,
    trackWidth: 892,
    scrollLeft: 0,
  });
});

test('zoom ranges scale a complete day and align the selected start hour', () => {
  const viewportWidth = 1000;
  const dateWidth = 108;
  const trackViewportWidth = viewportWidth - dateWidth;

  for (const [startHour, endHour] of [[6, 22], [9, 20]]) {
    const layout = diaryTimelineLayout(viewportWidth, dateWidth, startHour, endHour);

    assertClose(layout.trackWidth * ((endHour - startHour) / 24), trackViewportWidth);
    assertClose(layout.scrollLeft, layout.trackWidth * (startHour / 24));
    assert.ok(layout.contentWidth > viewportWidth);
  }
});
