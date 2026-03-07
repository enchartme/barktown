// src/routes/+page.js
// Runs at prerender / SSR time. Loads index.json once for the whole page.

export const prerender = true;

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
  const [entriesRes, sunRes] = await Promise.all([
    fetch('/index.json'),
    fetch('/sun.json'),
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
