#!/usr/bin/env node
/**
 * fetch-sun-data.mjs
 *
 * Downloads sunrise / sunset times from api.met.no for every day of a given
 * year and writes the result to a JSON file.
 *
 * Features:
 *   - Idempotent: loads any existing output file and skips dates already present.
 *   - Throttled: at most 5 requests per second (200 ms gap between fetches).
 *   - Merged output: new results are merged with existing data, keyed by date.
 *   - Sorted: output is always written in chronological order.
 *
 * Usage:
 *   node scripts/fetch-sun-data.mjs
 *   node scripts/fetch-sun-data.mjs --year 2025
 *   node scripts/fetch-sun-data.mjs --year 2026 --lat 58.96 --lon 17.14
 *   node scripts/fetch-sun-data.mjs --out ./static/sun.json
 *
 * Output schema (one object per day):
 *   { "date": "2026-03-07", "sunrise": "2026-03-07T05:28+00:00", "sunset": "2026-03-07T16:30+00:00" }
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// ─── CLI arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argValue(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined) return args[idx + 1];
  return defaultValue;
}

if (args.includes('--help')) {
  console.log(`
Usage: node scripts/fetch-sun-data.mjs [options]

Options:
  --year  YYYY   Year to fetch data for           (default: current year)
  --lat   N      Latitude of the location          (default: 58.9649776)
  --lon   N      Longitude of the location         (default: 17.1394923)
  --out   PATH   Output JSON file path             (default: ./static/sun.json)
  --help         Show this help message
`);
  process.exit(0);
}

const YEAR   = parseInt(argValue('--year', String(new Date().getFullYear())), 10);
const LAT    = parseFloat(argValue('--lat',  '58.9649776'));
const LON    = parseFloat(argValue('--lon',  '17.1394923'));
const OUTPUT = argValue('--out', './static/sun.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Zero-pad a number to 2 digits. */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Generate every calendar date string YYYY-MM-DD for the given year.
 * @param {number} year
 * @returns {string[]}
 */
function datesForYear(year) {
  const dates = [];
  const d = new Date(year, 0, 1); // Jan 1
  while (d.getFullYear() === year) {
    dates.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * Fetch sunrise + sunset for one date from api.met.no.
 * Returns null if the request fails or the data is missing.
 *
 * @param {string} date  YYYY-MM-DD
 * @returns {Promise<{ date: string, sunrise: string, sunset: string } | null>}
 */
async function fetchDay(date) {
  const url = `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${LAT}&lon=${LON}&date=${date}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        // api.met.no terms require a descriptive User-Agent.
        'User-Agent': 'barktown-sun-fetcher/1.0 github.com/enchartme/barktown',
      },
    });
  } catch (err) {
    console.error(`  ✗ Network error for ${date}: ${err.message}`);
    return null;
  }

  if (!response.ok) {
    console.error(`  ✗ HTTP ${response.status} for ${date}`);
    return null;
  }

  let json;
  try {
    json = await response.json();
  } catch {
    console.error(`  ✗ Invalid JSON for ${date}`);
    return null;
  }

  const sunrise = json?.properties?.sunrise?.time ?? null;
  const sunset  = json?.properties?.sunset?.time  ?? null;

  if (!sunrise || !sunset) {
    // Polar day/night: sun never rises or sets on this date.
    console.warn(`  ⚠ No sunrise/sunset data for ${date} (polar day/night?)`);
    return { date, sunrise: null, sunset: null };
  }

  return { date, sunrise, sunset };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nbarktown sun-data fetcher`);
  console.log(`  year : ${YEAR}`);
  console.log(`  loc  : ${LAT}, ${LON}`);
  console.log(`  out  : ${OUTPUT}\n`);

  // Load existing data so we can skip already-fetched dates.
  /** @type {Map<string, { date: string, sunrise: string|null, sunset: string|null }>} */
  const existing = new Map();

  if (existsSync(OUTPUT)) {
    try {
      const raw = JSON.parse(readFileSync(OUTPUT, 'utf8'));
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry?.date) existing.set(entry.date, entry);
        }
        console.log(`  Loaded ${existing.size} existing entries from ${OUTPUT}`);
      }
    } catch {
      console.warn(`  ! Could not parse existing ${OUTPUT} – starting fresh`);
    }
  }

  const allDates = datesForYear(YEAR);
  const toFetch  = allDates.filter((d) => !existing.has(d));

  if (toFetch.length === 0) {
    console.log(`  All ${allDates.length} dates already present – nothing to do.\n`);
  } else {
    console.log(`  ${toFetch.length} of ${allDates.length} dates to fetch (skipping ${allDates.length - toFetch.length} cached)\n`);

    // Throttle: ≤5 req/s → wait 200 ms between each request.
    const DELAY_MS = 200;

    for (let i = 0; i < toFetch.length; i++) {
      const date = toFetch[i];
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${toFetch.length}] ${date} … `);

      const result = await fetchDay(date);

      if (result) {
        existing.set(date, result);
        process.stdout.write(`☀ ${result.sunrise ?? '—'}  🌙 ${result.sunset ?? '—'}\n`);
      } else {
        process.stdout.write(`(skipped)\n`);
      }

      // Throttle – skip delay after the last request.
      if (i < toFetch.length - 1) await sleep(DELAY_MS);
    }
  }

  // Merge all entries (including other years already in the file), sort by date.
  const output = Array.from(existing.values())
    .sort((a, b) => a.date.localeCompare(b.date));

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\n  Wrote ${output.length} entries to ${OUTPUT}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
