/**
 * Helpers for the monitor-parameter editor in GoblinPiStatus.
 *
 * Keeping the request sequence here makes its important partial-success case
 * explicit: a database PATCH may succeed even if Goblin cannot refresh.
 */

/**
 * @param {unknown} dbValue
 * @param {unknown} goblinValue
 * @param {number} [tolerance]
 */
export function monitorParamValuesMatch(dbValue, goblinValue, tolerance = 1e-9) {
  if (dbValue == null || goblinValue == null) return false;
  const dbNumber = Number(dbValue);
  const goblinNumber = Number(goblinValue);
  if (!Number.isFinite(dbNumber) || !Number.isFinite(goblinNumber)) return false;
  return Math.abs(dbNumber - goblinNumber) <= tolerance;
}

/**
 * @param {{paramId: string, minValue?: number|null, maxValue?: number|null}} row
 * @param {unknown} rawValue
 * @returns {{value: number, error: ''}|{value: null, error: string}}
 */
export function parseMonitorParamInput(row, rawValue) {
  if (String(rawValue ?? '').trim() === '') {
    return { value: null, error: 'Enter a value' };
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return { value: null, error: 'Enter a valid number' };
  }
  if (row.paramId === 'confirmation_hits' && !Number.isInteger(value)) {
    return { value: null, error: 'Must be a whole number' };
  }
  if (row.minValue != null && value < Number(row.minValue)) {
    return { value: null, error: `Minimum is ${row.minValue}` };
  }
  if (row.maxValue != null && value > Number(row.maxValue)) {
    return { value: null, error: `Maximum is ${row.maxValue}` };
  }
  return { value, error: '' };
}

/** @param {Response|any} response */
async function readJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
}

/**
 * @param {string} fallback
 * @param {any} body
 */
function responseError(fallback, body) {
  return body?.error || body?.message || fallback;
}

/**
 * @param {string} apiBase
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [options]
 */
export async function fetchMonitorParams(apiBase, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(`${apiBase}/api/monitor-params`, { signal });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(`Database request failed (HTTP ${response.status})`, body));
  }
  if (!Array.isArray(body)) throw new Error('Database returned an invalid parameter list');
  return body;
}

/**
 * @param {string} apiBase
 * @param {string} paramId
 * @param {number} value
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [options]
 */
export async function patchMonitorParam(apiBase, paramId, value, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(`${apiBase}/api/monitor-params/${encodeURIComponent(paramId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
    signal,
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(`Save failed (HTTP ${response.status})`, body));
  }
  return body;
}

/**
 * @param {string} goblinBase
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [options]
 */
export async function refreshGoblinMonitorParams(goblinBase, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(`${goblinBase}/monitor-params/fetch`, {
    method: 'POST',
    signal,
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(`Goblin refresh failed (HTTP ${response.status})`, body));
  }
  return body;
}

/**
 * Persist one value, then ask statusd to make bark-monitor fetch and apply it.
 * When the second request fails, `error.updatedRow` records that the database
 * write did succeed so callers can render the resulting mismatch truthfully.
 *
 * @param {{
 *   apiBase: string,
 *   goblinBase: string,
 *   paramId: string,
 *   value: number,
 *   fetchImpl?: typeof fetch,
 *   patchSignal?: AbortSignal,
 *   refreshSignal?: AbortSignal,
 * }} options
 */
export async function saveMonitorParamAndRefresh({
  apiBase,
  goblinBase,
  paramId,
  value,
  fetchImpl = globalThis.fetch,
  patchSignal,
  refreshSignal,
}) {
  const updatedRow = await patchMonitorParam(apiBase, paramId, value, {
    fetchImpl,
    signal: patchSignal,
  });

  try {
    const goblinParams = await refreshGoblinMonitorParams(goblinBase, {
      fetchImpl,
      signal: refreshSignal,
    });
    return { updatedRow, goblinParams };
  } catch (error) {
    if (error && typeof error === 'object') error.updatedRow = updatedRow;
    throw error;
  }
}
