/**
 * utils.js – shared helpers for the barktown diary UI.
 *
 * All functions are pure; no Svelte or browser globals in here so they can be
 * used both in page load functions (SSR/prerender) and in component logic.
 */

// ─── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Convert "HH:MM" to minutes since midnight (0–1439).
 * @param {string} time  e.g. "17:25"
 * @returns {number}
 */
export function parseTimeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format a duration in seconds as a human-readable string.
 * e.g. 0 → "0s", 75 → "1:15", 3700 → "1:01:40"
 * @param {number} sec
 * @returns {string}
 */
export function formatDuration(sec) {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

/**
 * Format a "YYYY-MM-DD" string for display.
 * Uses noon to sidestep DST edge-cases.
 * @param {string} dateStr
 * @returns {string}  e.g. "Sat, 7 Dec 2025"
 */
export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year:    'numeric',
    month:   'short',
    day:     'numeric',
  });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Group a flat array of entries by their `date` field.
 *
 * @param {import('./types').Entry[]} entries
 * @returns {{ date: string, entries: import('./types').Entry[] }[]}
 *   Sorted chronologically, entries within each day sorted by time.
 */
export function groupByDate(entries) {
  /** @type {Map<string, import('./types').Entry[]>} */
  const map = new Map();

  for (const entry of entries) {
    if (!map.has(entry.date)) map.set(entry.date, []);
    map.get(entry.date).push(entry);
  }

  const groups = [];
  for (const [date, dayEntries] of map) {
    groups.push({
      date,
      entries: [...dayEntries].sort((a, b) =>
        a.datetimeLocal.localeCompare(b.datetimeLocal)
      ),
    });
  }

  groups.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}

// ─── Lane assignment ──────────────────────────────────────────────────────────

/**
 * Assign vertical lanes to a set of entries within one day so that
 * overlapping entries don't visually cover each other.
 *
 * Algorithm (greedy interval scheduling):
 *   1. Sort entries by start time.
 *   2. For each entry, find the lowest-indexed lane whose existing intervals
 *      do not overlap the new entry's interval.
 *   3. If no free lane exists, open a new one.
 *
 * @param {import('./types').Entry[]} entries
 * @param {number} [minWidthMinutes]  minimum occupied span in minutes (default 15)
 * @returns {{ entriesWithLanes: Array<import('./types').Entry & { lane: number }>, laneCount: number }}
 */
export function assignLanes(entries, minWidthMinutes = 15) {
  // Sort chronologically; equal times keep their original order (stable).
  const sorted = [...entries].sort(
    (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
  );

  /**
   * lanes[i] = array of { start, end } intervals already placed in lane i.
   * We use full interval lists (not just the last end) so that a lane that has
   * a gap in the middle can still accept a new entry inside that gap.
   * @type {Array<Array<{start: number, end: number}>>}
   */
  const lanes  = [];
  const result = [];

  for (const entry of sorted) {
    const start      = parseTimeToMinutes(entry.time);
    const durationMin = (entry.durationSec ?? 0) / 60;
    // Effective end: at least minWidthMinutes so even 0-sec pins block space.
    const end        = start + Math.max(durationMin, minWidthMinutes);

    /**
     * An entry fits in a lane when it does not overlap any interval already
     * there.  Two intervals [a,b) and [c,d) overlap iff a < d && c < b.
     */
    const fits = (lane) =>
      lane.every((iv) => start >= iv.end || end <= iv.start);

    // Find the first existing lane that can accommodate this entry.
    let laneIndex = lanes.findIndex(fits);

    if (laneIndex === -1) {
      // No existing lane has room – open a new one.
      laneIndex = lanes.length;
      lanes.push([]);
    }

    lanes[laneIndex].push({ start, end });
    result.push({ ...entry, lane: laneIndex });
  }

  return {
    entriesWithLanes: result,
    laneCount: Math.max(1, lanes.length),
  };
}

// ─── Waveform helpers ─────────────────────────────────────────────────────────

/**
 * Normalisation factor for audiowaveform peak values.
 * bits=8 → 128, bits=16 → 32768
 * @param {number} bits
 * @returns {number}
 */
export function waveformNorm(bits) {
  return Math.pow(2, bits - 1);
}

/**
 * Downsample a waveform `data` array to at most `targetBars` bar columns.
 *
 * The data array is interleaved [min0, max0, min1, max1, …].
 * Downsampling takes the absolute-max pair across each window.
 *
 * @param {number[]} data
 * @param {number}   targetBars
 * @returns {{ mins: number[], maxs: number[] }}
 */
export function downsampleWaveform(data, targetBars) {
  const totalBars = data.length / 2;
  const step      = Math.max(1, Math.floor(totalBars / targetBars));
  const mins = [];
  const maxs = [];

  for (let i = 0; i < totalBars; i += step) {
    let winMin = 0;
    let winMax = 0;
    const end = Math.min(i + step, totalBars);
    for (let j = i; j < end; j++) {
      const lo = data[j * 2];
      const hi = data[j * 2 + 1];
      if (lo < winMin) winMin = lo;
      if (hi > winMax) winMax = hi;
    }
    mins.push(winMin);
    maxs.push(winMax);
  }

  return { mins, maxs };
}
