// Load optional sunrise/sunset data during prerender, matching the diary.

import { ASSET_BASE } from '$lib/utils.js';

export const prerender = true;

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  /** @type {Record<string, { date: string, sunrise: string|null, sunset: string|null }>} */
  const sunByDate = {};

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

  return { sunByDate };
}
