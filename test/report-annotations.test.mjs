import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupReportNoteLabels,
  reportSentenceNeedsPeriod,
} from '../src/lib/report-annotations.js';

test('Report keeps only whole-recording note annotations for displayed samples', () => {
  const rows = [
    { sampleId: 'sample-a', source: 'note', startSec: 0, endSec: 0, label: 'First note' },
    { sampleId: 'sample-a', type: 'note', start_sec: 0, end_sec: 0, label: 'Second note!' },
    { sampleId: 'sample-a', source: 'note', startSec: 1, endSec: 1, label: 'Timed note' },
    { sampleId: 'sample-a', source: 'manual', startSec: 0, endSec: 0, label: 'Fragment' },
    { sampleId: 'sample-b', source: 'note', startSec: 0, endSec: 0, label: 'Hidden sample' },
    { sampleId: 'sample-a', source: 'note', startSec: 0, endSec: 0, label: '   ' },
  ];

  assert.deepEqual(
    groupReportNoteLabels(rows, new Set(['sample-a'])),
    new Map([['sample-a', ['First note', 'Second note!']]]),
  );
});

test('Report appends a period only when the last note has no sentence punctuation', () => {
  assert.equal(reportSentenceNeedsPeriod([]), true);
  assert.equal(reportSentenceNeedsPeriod(['Needs punctuation']), true);
  assert.equal(reportSentenceNeedsPeriod(['Already done.']), false);
  assert.equal(reportSentenceNeedsPeriod(['Question?   ']), false);
  assert.equal(reportSentenceNeedsPeriod(['Warning!']), false);
});
