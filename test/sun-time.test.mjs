import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIARY_NIGHT_COLOR,
  isNighttimeRecording,
  sunTimeToLocalMinutes,
} from '../src/lib/sun-time.js';

const sunEntry = {
  sunrise: '2026-08-14T06:30:00',
  sunset: '2026-08-14T18:30:00',
};

test('Report2 identifies recordings before sunrise and after sunset', () => {
  assert.equal(isNighttimeRecording('06:29', sunEntry), true);
  assert.equal(isNighttimeRecording('06:30', sunEntry), false);
  assert.equal(isNighttimeRecording('12:00', sunEntry), false);
  assert.equal(isNighttimeRecording('18:30', sunEntry), false);
  assert.equal(isNighttimeRecording('18:31', sunEntry), true);
});

test('missing or invalid sun data leaves recordings unmarked', () => {
  assert.equal(isNighttimeRecording('02:00', null), false);
  assert.equal(isNighttimeRecording('02:00', { sunrise: 'invalid', sunset: null }), false);
  assert.equal(sunTimeToLocalMinutes('invalid'), null);
});

test('Report2 and the diary share the same night-blue color', () => {
  assert.equal(DIARY_NIGHT_COLOR, '#dce8f8');
});
