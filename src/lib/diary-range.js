import { addDays, groupByDate, isIsoDate } from './utils.js';

export const DIARY_HISTORY_START = '2021-01-01';
export const RECENT_DIARY_DAY_COUNT = 14;

/**
 * Inclusive API bounds for the latest calendar-day window. Empty dates are
 * intentionally not replaced with older record dates.
 */
export function recentDiaryBounds(latestDate, calendarDayCount = RECENT_DIARY_DAY_COUNT) {
  if (!isIsoDate(latestDate)) throw new Error('latestDate must be a valid ISO date');
  if (!Number.isInteger(calendarDayCount) || calendarDayCount < 1) {
    throw new Error('calendarDayCount must be a positive integer');
  }
  return {
    startDate: addDays(latestDate, -(calendarDayCount - 1)),
    endDate: latestDate,
  };
}

/** Select the non-empty diary days present in the loaded API response. */
export function selectDiaryDays(entries, { historyStart = DIARY_HISTORY_START } = {}) {
  const eligibleEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.date >= historyStart);
  return groupByDate(eligibleEntries);
}

/** Entries represented by the selected day rows, for the overview chart. */
export function diaryEntriesForDays(days) {
  return (Array.isArray(days) ? days : []).flatMap((day) => day.entries);
}
