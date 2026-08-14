import test from 'node:test';
import assert from 'node:assert/strict';

import { reportBounds } from '../src/lib/report-range.js';

test('Report2 defaults to one ISO week', () => {
  assert.deepEqual(reportBounds('2026-08-10'), {
    startDate: '2026-08-10',
    endDate: '2026-08-16',
  });
});

test('Report2 can include the selected week and the preceding week', () => {
  assert.deepEqual(reportBounds('2026-08-10', 2), {
    startDate: '2026-08-03',
    endDate: '2026-08-16',
  });
});
