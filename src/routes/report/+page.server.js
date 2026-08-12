// Server-side load — runs during prerender, bypassing browser CORS enforcement.
// Diary entries remain live; only optional sunrise/sunset data is prerendered.

import { ASSET_BASE } from '$lib/utils.js';

export const prerender = true;

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  /** @type {Record<string, { date: string, sunrise: string|null, sunset: string|null }>} */
  let sunByDate = {};
  try {
    const sunRes = await fetch(`${ASSET_BASE}/sun.json`);
    if (sunRes.ok) {
      const sunArr = await sunRes.json();
      for (const entry of sunArr) {
        if (entry?.date) sunByDate[entry.date] = entry;
      }
    }
  } catch { /* sun data is optional */ }

  return { sunByDate };
}
