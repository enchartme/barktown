import { parseTimeToMinutes } from './utils.js';

/** Shared diary palette for daylight and nighttime backgrounds. */
export const DIARY_DAY_COLOR = '#fffde6';
export const DIARY_NIGHT_COLOR = '#dce8f8';

/**
 * Parse a sunrise/sunset ISO datetime and return minutes since midnight in the
 * browser's local timezone. This matches the diary timeline's time basis.
 *
 * @param {string | null | undefined} isoString
 * @returns {number | null}
 */
export function sunTimeToLocalMinutes(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Return true when a recording starts before sunrise or after sunset. Missing
 * sun data leaves the recording unmarked.
 *
 * @param {string} time HH:MM
 * @param {{sunrise?: string | null, sunset?: string | null} | null | undefined} sunEntry
 */
export function isNighttimeRecording(time, sunEntry) {
  const sunrise = sunTimeToLocalMinutes(sunEntry?.sunrise);
  const sunset = sunTimeToLocalMinutes(sunEntry?.sunset);
  if (sunrise === null || sunset === null) return false;

  const recordingTime = parseTimeToMinutes(time);
  return recordingTime < sunrise || recordingTime > sunset;
}
