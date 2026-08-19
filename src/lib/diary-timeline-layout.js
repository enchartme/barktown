const HOURS_PER_DAY = 24;

/**
 * Size a complete 24-hour diary track so the selected hour range fills the
 * viewport beside the fixed date column. The returned scroll position aligns
 * the selected start hour with the left edge of the visible track.
 */
export function diaryTimelineLayout(viewportWidth, dateColumnWidth, startHour, endHour) {
  const trackViewportWidth = Math.max(0, viewportWidth - dateColumnWidth);
  const visibleHours = Math.max(1, endHour - startHour);
  const trackWidth = trackViewportWidth * (HOURS_PER_DAY / visibleHours);

  return {
    contentWidth: dateColumnWidth + trackWidth,
    trackWidth,
    scrollLeft: trackWidth * (startHour / HOURS_PER_DAY),
  };
}
