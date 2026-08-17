import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPrintReportRange, reportBounds } from '../src/lib/report-range.js';

test('Report defaults to one ISO week', () => {
  assert.deepEqual(reportBounds('2026-08-10'), {
    startDate: '2026-08-10',
    endDate: '2026-08-16',
  });
});

test('Report can include the selected week and the preceding week', () => {
  assert.deepEqual(reportBounds('2026-08-10', 2), {
    startDate: '2026-08-03',
    endDate: '2026-08-16',
  });
});

test('print report ranges use the requested compact heading format', () => {
  assert.equal(
    formatPrintReportRange('2026-08-03', '2026-08-09'),
    'for aug 3 — aug 9 2026',
  );
});
