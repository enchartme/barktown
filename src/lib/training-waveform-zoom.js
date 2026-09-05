export const WAVEFORM_ZOOM_LEVELS = Object.freeze([1, 2, 4, 8, 16, 32]);

/** Return the next supported horizontal waveform zoom level. */
export function stepWaveformZoom(currentZoom, direction) {
  if (direction === 0) return currentZoom;

  if (direction > 0) {
    return WAVEFORM_ZOOM_LEVELS.find((level) => level > currentZoom)
      ?? WAVEFORM_ZOOM_LEVELS.at(-1);
  }

  return WAVEFORM_ZOOM_LEVELS.findLast((level) => level < currentZoom)
    ?? WAVEFORM_ZOOM_LEVELS[0];
}

/**
 * Keep the same point in the timeline at the centre of the viewport after
 * its scrollable content changes width.
 */
export function centeredWaveformScrollLeft(scrollLeft, viewportWidth, oldContentWidth, newContentWidth) {
  if (viewportWidth <= 0 || oldContentWidth <= 0 || newContentWidth <= viewportWidth) return 0;

  const centreFraction = (scrollLeft + viewportWidth / 2) / oldContentWidth;
  const nextScrollLeft = centreFraction * newContentWidth - viewportWidth / 2;
  return Math.max(0, Math.min(newContentWidth - viewportWidth, nextScrollLeft));
}
