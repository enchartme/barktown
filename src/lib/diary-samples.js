/** Attach the sample identity returned by move-to-samples to a diary entry. */
export function withLinkedTrainingSample(entry, moveResult) {
  if (!entry || typeof moveResult?.sampleId !== 'string' || !moveResult.sampleId) return entry;
  return {
    ...entry,
    sampleId: moveResult.sampleId,
    sampleAudioPath: moveResult.audioPath ?? entry.sampleAudioPath ?? null,
  };
}
