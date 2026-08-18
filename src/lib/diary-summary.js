import { PUBLIC_API_BASE } from './utils.js';

/**
 * Fetch additive diary metrics for one inclusive calendar period.
 *
 * @param {{
 *   startDate: string,
 *   endDate: string,
 *   apiBase?: string,
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal
 * }} options
 */
export async function fetchDiarySummary({
  startDate,
  endDate,
  apiBase = PUBLIC_API_BASE,
  fetchImpl = fetch,
  signal,
}) {
  const url = new URL('/api/diary-summary', apiBase);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);

  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    throw new Error(`Diary summary request failed: ${response.status} ${response.statusText}`);
  }

  const summary = await response.json();
  if (!Array.isArray(summary?.days) || typeof summary?.totals !== 'object' || summary.totals === null) {
    throw new Error('Diary summary response has an invalid shape');
  }
  return summary;
}
