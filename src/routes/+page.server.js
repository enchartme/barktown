// src/routes/+page.server.js
// Server-side load — runs in Node during prerender, bypassing browser CORS enforcement.
// Only sun.json is prerendered; index.json is fetched live by the client.

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
