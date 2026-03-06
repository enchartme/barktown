// src/routes/+page.js
// Runs at prerender / SSR time. Loads index.json once for the whole page.

export const prerender = true;

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
  const res = await fetch('/index.json');
  if (!res.ok) {
    throw new Error(`Failed to load index.json: ${res.status} ${res.statusText}`);
  }
  /** @type {import('$lib/types').Entry[]} */
  const entries = await res.json();
  return { entries };
}
