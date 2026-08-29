import { PUBLIC_API_BASE } from './utils.js';

const REASONS = [
  ['inputOverflowCount', 'Input overflow'],
  ['inputUnderflowCount', 'Input underflow'],
  ['outputOverflowCount', 'Output overflow'],
  ['outputUnderflowCount', 'Output underflow'],
  ['otherXrunCount', 'Other'],
];

export async function fetchDataQuality({
  startDate,
  endDate,
  apiBase = PUBLIC_API_BASE,
  fetchImpl = globalThis.fetch,
  pageSize = 1000,
  signal,
} = {}) {
  const items = [];
  let page = 1;
  while (true) {
    const url = new URL('/api/data-quality', apiBase);
    if (startDate) url.searchParams.set('startDate', startDate);
    if (endDate) url.searchParams.set('endDate', endDate);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pageSize', String(pageSize));
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.items) || typeof body?.pagination !== 'object') {
      throw new Error('Malformed data-quality response');
    }
    items.push(...body.items);
    if (!body.pagination.hasNextPage) return items;
    if (!Number.isSafeInteger(body.pagination.nextPage) || body.pagination.nextPage <= page) {
      throw new Error('Malformed data-quality pagination');
    }
    page = body.pagination.nextPage;
  }
}

export function summarizeDataQuality(rows) {
  const affected = rows.filter((row) => row.xrunCount > 0).length;
  const totalXruns = rows.reduce((sum, row) => sum + row.xrunCount, 0);
  return {
    recordings: rows.length,
    clean: rows.length - affected,
    affected,
    totalXruns,
    cleanRate: rows.length ? (rows.length - affected) / rows.length : null,
  };
}

export function dailyDataQuality(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const date = row.recordingStartedAt?.slice(0, 10);
    if (!date) continue;
    const day = byDate.get(date) ?? { date, recordings: 0, clean: 0, affected: 0, xruns: 0 };
    day.recordings += 1;
    day.xruns += row.xrunCount;
    if (row.xrunCount > 0) day.affected += 1;
    else day.clean += 1;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function dataQualityReasons(rows) {
  return REASONS.map(([field, label]) => ({
    field,
    label,
    count: rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0),
  }));
}
