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

const AUTO_DETECTED_LABEL = /^-A-(?:\s|$)/;
const SECONDS_PER_MINUTE = 60;

/** @param {HitMetadata} metadata @param {number} durationSec */
function hitMetadataStats(metadata, durationSec) {
  const hitCount = Array.isArray(metadata.timestamps) ? metadata.timestamps.length : 0;
  const confidences = Array.isArray(metadata.confidences)
    ? metadata.confidences.filter(Number.isFinite)
    : [];
  const loudnesses = Array.isArray(metadata.loudnesses)
    ? metadata.loudnesses.filter(Number.isFinite).sort((a, b) => a - b)
    : [];

  const maximumConfidence = confidences.length ? Math.max(...confidences) : 0;
  const maximumLoudness = loudnesses.length ? loudnesses[loudnesses.length - 1] : 0;
  const middle = Math.floor(loudnesses.length / 2);
  const medianLoudness = loudnesses.length === 0
    ? 0
    : loudnesses.length % 2
      ? loudnesses[middle]
      : (loudnesses[middle - 1] + loudnesses[middle]) / 2;
  // D is the rounded bark rate per minute.
  const density = Number.isFinite(durationSec) && durationSec > 0
    ? Math.round((hitCount / durationSec) * SECONDS_PER_MINUTE)
    : 0;

  return { hitCount, maximumConfidence, maximumLoudness, medianLoudness, density };
}

/**
 * Build the compact stats string for a hit-metadata row.
 *
 * @param {HitMetadata} metadata
 * @param {number} durationSec
 */
export function formatHitMetadataStats(metadata, durationSec) {
  const { hitCount, maximumConfidence, maximumLoudness, medianLoudness, density } =
    hitMetadataStats(metadata, durationSec);
  const confidenceTag = maximumConfidence >= 0.995
    ? 'C1'
    : `C${maximumConfidence.toFixed(2)}`;

  return `${confidenceTag} D${density} W${hitCount} La${maximumLoudness.toFixed(1)} Lm${medianLoudness.toFixed(1)}`;
}

/** @param {{id?: string, filename?: string, sampleId?: string | null, label?: string, time?: string}} entry */
function diaryEntryDescriptor(entry) {
  const label = (entry.label || entry.time || '').trim();
  const isSample = Boolean(entry.sampleId)
    || /(?:^|_)SAMPLE(?:_|$)/i.test(entry.id ?? '')
    || /(?:^|\s)SAMPLE(?:\s|$)/i.test(entry.filename ?? '');

  if (AUTO_DETECTED_LABEL.test(label)) return '-A-';
  return isSample && !/^SAMPLE(?:\s|$)/i.test(label)
    ? `SAMPLE${label ? ` ${label}` : ''}`
    : label;
}

/**
 * Build a diary-entry title while preserving meaningful entry context.
 * Sample rows keep their SAMPLE marker and comment; current hit stats follow
 * the descriptor whenever metadata is available.
 *
 * @param {{
 *   id?: string,
 *   filename?: string,
 *   sampleId?: string | null,
 *   label?: string,
 *   time?: string,
 *   durationSec?: number
 * }} entry
 * @param {HitMetadata | null | undefined} metadata
 */
export function formatDiaryEntryTitle(entry, metadata) {
  const label = (entry.label || entry.time || '').trim();
  const descriptor = diaryEntryDescriptor(entry);

  if (!metadata) return descriptor;

  const stats = formatHitMetadataStats(metadata, entry.durationSec ?? 0);
  if (AUTO_DETECTED_LABEL.test(label)) return `-A- ${stats}`;
  return `${descriptor}${descriptor ? ' ' : ''}${stats}`;
}

/**
 * Build the expanded, user-facing title shown in the audio player panel.
 * Confidence remains available in compact diagnostic titles but is omitted
 * here in favor of the bark count, rate, and loudness summary.
 *
 * @param {{
 *   id?: string,
 *   filename?: string,
 *   sampleId?: string | null,
 *   label?: string,
 *   time?: string,
 *   durationSec?: number
 * }} entry
 * @param {HitMetadata | null | undefined} metadata
 */
export function formatAudioPanelTitle(entry, metadata) {
  const descriptor = diaryEntryDescriptor(entry);
  if (!metadata) return descriptor;

  const { hitCount, maximumLoudness, medianLoudness, density } =
    hitMetadataStats(metadata, entry.durationSec ?? 0);
  const stats = `Barks: ${hitCount}, Density: ${density} bpm, Loudness Peak: ${maximumLoudness.toFixed(1)}x, Median: ${medianLoudness.toFixed(1)}x`;
  return `${descriptor}${descriptor ? ': ' : ''}${stats}`;
}

/**
 * Build the compact auto-detection label from the current hit-metadata row.
 * Non-auto labels and auto labels whose metadata has not loaded are returned
 * unchanged.
 *
 * @param {string} label
 * @param {HitMetadata | null | undefined} metadata
 * @param {number} durationSec
 */
export function formatAutoDetectionLabel(label, metadata, durationSec) {
  if (!AUTO_DETECTED_LABEL.test((label ?? '').trim()) || !metadata) return label;
  return `-A- ${formatHitMetadataStats(metadata, durationSec)}`;
}

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
