import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withLinkedTrainingSample } from '../src/lib/diary-samples.js';

test('move responses link diary entries to their training sample immediately', () => {
  const entry = { id: 'diary-a', sampleId: null };
  assert.deepEqual(withLinkedTrainingSample(entry, {
    sampleId: 'sample-a',
    audioPath: 'training-samples/bark/sample-a.wav',
  }), {
    id: 'diary-a',
    sampleId: 'sample-a',
    sampleAudioPath: 'training-samples/bark/sample-a.wav',
  });
});
