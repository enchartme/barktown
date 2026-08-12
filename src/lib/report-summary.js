/**
 * Summarize diary entries using the same hit-density calculation shown on
 * individual auto-detected recordings.
 *
 * @param {Array<{id: string, durationSec?: number}>} entries
 * @param {Map<string, {timestamps?: number[]}>} metadataById
 */
export function summarizeEntries(entries, metadataById = new Map()) {
  let totalDurationSec = 0;
  let barks = 0;
  let worstDensityBpm = 0;

  for (const entry of entries) {
    const durationSec = Number.isFinite(entry.durationSec) && entry.durationSec > 0
      ? entry.durationSec
      : 0;
    const metadata = metadataById.get(entry.id);
    const hitCount = Array.isArray(metadata?.timestamps) ? metadata.timestamps.length : 0;
    const densityBpm = durationSec > 0 ? Math.round((hitCount / durationSec) * 60) : 0;

    totalDurationSec += durationSec;
    barks += hitCount;
    worstDensityBpm = Math.max(worstDensityBpm, densityBpm);
  }

  return {
    disturbances: entries.length,
    totalDurationSec,
    barks,
    worstDensityBpm,
  };
}

/** Format a duration without seconds, truncating incomplete minutes. */
export function formatDisturbedTime(totalDurationSec) {
  const totalMinutes = Math.floor(Math.max(0, totalDurationSec) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
