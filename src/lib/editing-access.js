import { PRIVATE_API_BASE } from './utils.js';

/**
 * Editing is available only when the browser can reach Barktown's Tailnet
 * mutation API. Public visitors keep the playback/download experience without
 * being offered controls that cannot succeed.
 */
export async function probeEditingAccess({
  privateApiBase = PRIVATE_API_BASE,
  fetchImpl = globalThis.fetch,
  signal = AbortSignal.timeout(5000),
} = {}) {
  try {
    const response = await fetchImpl(`${privateApiBase}/health`, { signal });
    return response.ok;
  } catch {
    return false;
  }
}
