import { addDays } from './utils.js';

/**
 * Return the inclusive date bounds for a report window ending with the
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

/**
 * Format the selected range for the printable report heading.
 * Example: "for aug 3 — aug 9 2026".
 *
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 */
export function formatPrintReportRange(startDate, endDate) {
  const parse = (date) => new Date(`${date}T12:00:00`);
  const format = (date, includeYear) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(parse(date)).replace(',', '').toLowerCase();

  return `for ${format(startDate, false)} — ${format(endDate, true)}`;
}
