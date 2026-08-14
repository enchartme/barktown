import { addDays } from './utils.js';

/**
 * Return the inclusive date bounds for a Report2 window ending with the
 * selected ISO week. Unsupported values fall back to the one-week default.
 *
 * @param {string} weekStart Monday in YYYY-MM-DD form
 * @param {number} [weeks]
 */
export function reportBounds(weekStart, weeks = 1) {
  const weekCount = weeks === 2 ? 2 : 1;
  return {
    startDate: addDays(weekStart, -(weekCount - 1) * 7),
    endDate: addDays(weekStart, 6),
  };
}
