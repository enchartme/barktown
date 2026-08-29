export const DEFAULT_GOBLIN_BASE_URL = 'https://gawblen.tail523149.ts.net';

/**
 * Resolve the Goblin status/control endpoint from public build configuration.
 *
 * @param {string | undefined} configuredBaseUrl
 * @returns {string}
 */
export function resolveGoblinBaseUrl(configuredBaseUrl) {
  const candidate = configuredBaseUrl?.trim() || DEFAULT_GOBLIN_BASE_URL;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('PUBLIC_GOBLIN_BASE_URL must be an absolute HTTP(S) URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_GOBLIN_BASE_URL must be an absolute HTTP(S) URL');
  }

  if (url.search || url.hash) {
    throw new Error('PUBLIC_GOBLIN_BASE_URL must not include a query string or fragment');
  }

  return url.toString().replace(/\/$/, '');
}

/**
 * Return the configured machine name used in compact UI labels.
 *
 * @param {string} baseUrl
 * @returns {string}
 */
export function goblinHostLabel(baseUrl) {
  return new URL(baseUrl).hostname.split('.')[0];
}
