/**
 * Scale a recording duration into a circle radius whose area, between the
 * configured minimum and maximum circle areas, grows linearly with duration.
 */
export function durationAreaRadius(durationSec, minRadius, maxRadius, maxDurationSec) {
  const safeDuration = Number.isFinite(durationSec) ? durationSec : 0;
  const fraction = Math.max(0, Math.min(1, safeDuration / maxDurationSec));
  const minAreaFactor = minRadius ** 2;
  const maxAreaFactor = maxRadius ** 2;
  return Math.sqrt(minAreaFactor + fraction * (maxAreaFactor - minAreaFactor));
}
