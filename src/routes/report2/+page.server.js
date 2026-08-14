// Load optional sunrise/sunset data and public recording context.

import { ASSET_BASE, PUBLIC_API_BASE } from '$lib/utils.js';

// The print query parameter controls the initial server-rendered layout.
export const prerender = false;

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, url }) {
  /** @type {Record<string, { date: string, sunrise: string|null, sunset: string|null }>} */
  const sunByDate = {};
  let recordingContext = {
    album: '',
    location: '',
    direction: '',
    copyright: '',
  };

  try {
    const response = await fetch(`${ASSET_BASE}/sun.json`);
    if (response.ok) {
      const entries = await response.json();
      for (const entry of entries) {
        if (entry?.date) sunByDate[entry.date] = entry;
      }
    }
  } catch {
    // Sun data is an optional visual enhancement.
  }

  try {
    const response = await fetch(`${PUBLIC_API_BASE}/api/recording-context`);
    if (response.ok) recordingContext = await response.json();
  } catch {
    // Keep the report available if its optional descriptive context is offline.
  }

  return {
    sunByDate,
    initialPrintMode: url.searchParams.get('print') === '1',
    recordingContext,
  };
}
