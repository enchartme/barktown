/**
 * Return whether the current URL requests the stripped-down embedded layout.
 * Keep accepting the lowercase spelling as well as the public `Embed=true`
 * contract so hand-authored iframe URLs are forgiving.
 *
 * @param {URLSearchParams} searchParams
 */
export function isEmbeddedLayout(searchParams) {
  const value = searchParams.get('Embed') ?? searchParams.get('embed');
  return value?.toLowerCase() === 'true';
}
