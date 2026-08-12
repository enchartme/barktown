import { writable } from 'svelte/store';
import { API_BASE } from './utils.js';

/**
 * @typedef {{
 *   clipId: string,
 *   date: string | null,
 *   timestamps: number[],
 *   confidences: number[],
 *   loudnesses: number[],
 *   paddingS: number,
 *   windowS: number,
 *   modelTrainedAt: string | null,
 *   analysisSettings: Record<string, unknown>,
 *   analysisTrigger: 'automatic' | 'manual',
 *   createdAt: string
 * }} HitMetadata
 */

/** Shared reactive cache populated page-by-page by the bulk endpoint. */
export const hitMetadataById = writable(/** @type {Map<string, HitMetadata>} */ (new Map()));

/** Merge records into the cache while preserving already loaded pages. */
function mergeHitMetadata(items) {
  hitMetadataById.update((current) => {
    const next = new Map(current);
    for (const item of items) {
      if (item?.clipId) next.set(item.clipId, item);
    }
    return next;
  });
}

/** Update one cached record after re-analysis. */
export function setHitMetadata(id, metadata) {
  if (!id || !metadata) return;
  mergeHitMetadata([{ ...metadata, clipId: metadata.clipId ?? id }]);
}

/**
 * Load all pages of bulk hit metadata, following the API's advertised next
 * link rather than constructing subsequent page numbers in the client.
 * Each page is merged immediately so the UI can progressively enhance while
 * later pages are still loading.
 *
 * @param {{
 *   startDate?: string,
 *   endDate?: string,
 *   pageSize?: number,
 *   fetchImpl?: typeof fetch
 * }} [options]
 */
export async function loadHitMetadata({
  startDate,
  endDate,
  pageSize = 1000,
  fetchImpl = fetch,
} = {}) {
  const firstUrl = new URL('/api/hit-metadata', API_BASE);
  firstUrl.searchParams.set('page', '1');
  firstUrl.searchParams.set('pageSize', String(pageSize));
  if (startDate) firstUrl.searchParams.set('startDate', startDate);
  if (endDate) firstUrl.searchParams.set('endDate', endDate);

  let nextUrl = firstUrl.toString();
  let pagesLoaded = 0;
  let recordsLoaded = 0;
  const visited = new Set();

  while (nextUrl) {
    if (visited.has(nextUrl)) throw new Error(`Hit metadata pagination cycle at ${nextUrl}`);
    visited.add(nextUrl);

    const res = await fetchImpl(nextUrl);
    if (!res.ok) throw new Error(`Hit metadata request failed: ${res.status} ${res.statusText}`);

    const body = await res.json();
    if (!Array.isArray(body?.items) || typeof body?.pagination !== 'object') {
      throw new Error('Hit metadata response has an invalid shape');
    }

    mergeHitMetadata(body.items);
    pagesLoaded += 1;
    recordsLoaded += body.items.length;

    const advertisedNext = body.links?.next;
    if (body.pagination.hasNextPage && !advertisedNext) {
      throw new Error('Hit metadata response indicates another page but provides no next link');
    }
    nextUrl = advertisedNext ? new URL(advertisedNext, API_BASE).toString() : '';
  }

  return { pagesLoaded, recordsLoaded };
}
