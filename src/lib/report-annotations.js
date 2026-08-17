/**
 * Return the API's annotation type across the current `source` field and the
 * `type` name used by newer/alternate payloads.
 *
 * @param {Record<string, unknown>} annotation
 */
function annotationType(annotation) {
  return annotation.type ?? annotation.source;
}

/**
 * Collect whole-recording note labels by sample ID. Only annotations that are
 * notes at the exact 0..0 range are retained. When provided, `sampleIds`
 * Limits the result to samples linked to entries in the displayed report.
 *
 * @param {Record<string, unknown>[]} annotations
 * @param {Set<string> | null} [sampleIds]
 * @returns {Map<string, string[]>}
 */
export function groupReportNoteLabels(annotations, sampleIds = null) {
  const labelsBySampleId = new Map();

  for (const annotation of annotations) {
    const sampleId = annotation.sampleId ?? annotation.sample_id;
    const startSec = annotation.startSec ?? annotation.start_sec;
    const endSec = annotation.endSec ?? annotation.end_sec;
    const label = typeof annotation.label === 'string' ? annotation.label.trim() : '';

    if (
      annotationType(annotation) !== 'note'
      || Number(startSec) !== 0
      || Number(endSec) !== 0
      || typeof sampleId !== 'string'
      || !label
      || (sampleIds && !sampleIds.has(sampleId))
    ) continue;

    const labels = labelsBySampleId.get(sampleId) ?? [];
    labels.push(label);
    labelsBySampleId.set(sampleId, labels);
  }

  return labelsBySampleId;
}

/**
 * A report recording sentence supplies its own final period unless its last
 * displayed note already ends in sentence punctuation.
 *
 * @param {string[]} noteLabels
 */
export function reportSentenceNeedsPeriod(noteLabels) {
  const lastLabel = noteLabels.at(-1)?.trim() ?? '';
  return !/[!?.]$/.test(lastLabel);
}
