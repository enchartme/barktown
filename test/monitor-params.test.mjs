import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monitorParamValuesMatch,
  parseMonitorParamInput,
  saveMonitorParamAndRefresh,
} from '../src/lib/monitor-params.js';

const candidateRow = {
  paramId: 'candidate_threshold',
  minValue: 0,
  maxValue: 1,
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('monitor parameter input enforces numeric bounds and integer confirmation hits', () => {
  assert.deepEqual(parseMonitorParamInput(candidateRow, '0.72'), { value: 0.72, error: '' });
  assert.equal(parseMonitorParamInput(candidateRow, '').error, 'Enter a value');
  assert.equal(parseMonitorParamInput(candidateRow, '1.2').error, 'Maximum is 1');
  assert.equal(
    parseMonitorParamInput({ paramId: 'confirmation_hits', minValue: 1, maxValue: 20 }, '2.5').error,
    'Must be a whole number'
  );
});

test('DB and Goblin values compare numerically with a small float tolerance', () => {
  assert.equal(monitorParamValuesMatch(0.3, 0.3000000001), true);
  assert.equal(monitorParamValuesMatch(0.3, 0.31), false);
  assert.equal(monitorParamValuesMatch(0, null), false);
});

test('save orchestration PATCHes the DB before requesting a Goblin refresh', async () => {
  const calls = [];
  const updatedRow = { ...candidateRow, currentValue: 0.72 };
  const goblinParams = {
    values: { candidate_threshold: 0.72 },
    source: 'api',
    refresh: { status: 'ok', request_id: 'refresh-1' },
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return calls.length === 1
      ? jsonResponse(200, updatedRow)
      : jsonResponse(200, goblinParams);
  };

  const result = await saveMonitorParamAndRefresh({
    apiBase: 'https://api.example',
    goblinBase: 'https://goblin.example',
    paramId: 'candidate_threshold',
    value: 0.72,
    fetchImpl,
  });

  assert.deepEqual(result, { updatedRow, goblinParams });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.example/api/monitor-params/candidate_threshold');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body), { value: 0.72 });
  assert.equal(calls[1].url, 'https://goblin.example/monitor-params/fetch');
  assert.equal(calls[1].options.method, 'POST');
});

test('a Goblin refresh failure retains the successfully updated DB row', async () => {
  const updatedRow = { ...candidateRow, currentValue: 0.8 };
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse(200, updatedRow)
      : jsonResponse(409, { error: 'bark-monitor.service is not running' });
  };

  await assert.rejects(
    saveMonitorParamAndRefresh({
      apiBase: 'https://api.example',
      goblinBase: 'https://goblin.example',
      paramId: 'candidate_threshold',
      value: 0.8,
      fetchImpl,
    }),
    (error) => {
      assert.equal(error.message, 'bark-monitor.service is not running');
      assert.deepEqual(error.updatedRow, updatedRow);
      return true;
    }
  );
  assert.equal(callCount, 2);
});
