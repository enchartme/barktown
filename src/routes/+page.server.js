// src/routes/+page.server.js
// Server-side load — runs in Node during prerender, bypassing browser CORS enforcement.

import { ASSET_BASE } from '$lib/utils.js';

export const prerender = true;

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  const [entriesRes, sunRes] = await Promise.all([
    fetch(`${ASSET_BASE}/index.json`),
    fetch(`${ASSET_BASE}/sun.json`),
  ]);

  if (!entriesRes.ok) {
    throw new Error(`Failed to load index.json: ${entriesRes.status} ${entriesRes.statusText}`);
  }

  /** @type {import('$lib/types').Entry[]} */
  const entries = await entriesRes.json();

  /** @type {Record<string, { date: string, sunrise: string|null, sunset: string|null }>} */
  let sunByDate = {};
  if (sunRes.ok) {
    const sunArr = await sunRes.json();
    for (const entry of sunArr) {
      if (entry?.date) sunByDate[entry.date] = entry;
    }
  }

  return { entries, sunByDate };
}
