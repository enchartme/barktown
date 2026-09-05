import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  centeredWaveformScrollLeft,
  stepWaveformZoom,
  waveformBarBackingWidth,
  zoomInvariantSvgWidth,
} from '../src/lib/training-waveform-zoom.js';

test('waveform zoom steps through the supported levels and stops at its limits', () => {
  assert.equal(stepWaveformZoom(1, 1), 2);
  assert.equal(stepWaveformZoom(4, 1), 8);
  assert.equal(stepWaveformZoom(32, 1), 32);
  assert.equal(stepWaveformZoom(8, -1), 4);
  assert.equal(stepWaveformZoom(1, -1), 1);
});

test('waveform zoom keeps the same timeline point centred', () => {
  assert.equal(centeredWaveformScrollLeft(250, 500, 1000, 2000), 750);
  assert.equal(centeredWaveformScrollLeft(0, 500, 500, 1000), 250);
});

test('waveform zoom scroll position is clamped at the timeline edges', () => {
  assert.equal(centeredWaveformScrollLeft(0, 500, 1000, 2000), 250);
  assert.equal(centeredWaveformScrollLeft(500, 500, 1000, 2000), 1250);
  assert.equal(centeredWaveformScrollLeft(500, 500, 1000, 500), 0);
});

test('waveform primitives retain their visual width while the timeline zooms', () => {
  assert.equal(zoomInvariantSvgWidth(6, 1), 6);
  assert.equal(zoomInvariantSvgWidth(6, 2), 3);
  assert.equal(zoomInvariantSvgWidth(6, 32), 0.1875);
});

test('canvas waveform bars use one CSS pixel or the thinnest backing pixel', () => {
  assert.equal(waveformBarBackingWidth(2000, 1000), 2);
  assert.equal(waveformBarBackingWidth(16000, 32000), 1);
  assert.equal(waveformBarBackingWidth(0, 0), 1);
});
