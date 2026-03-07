<script>
  import { assignLanes, parseTimeToMinutes, formatDate } from '$lib/utils.js';
  import DiaryEntry from './DiaryEntry.svelte';

  /**
   * @type {{
   *   date: string;
   *   entries: import('$lib/types').Entry[];
   *   startHour: number;
   *   endHour: number;
   *   selectedId: string | null;
   *   onselect: (entry: import('$lib/types').Entry) => void;
   * }}
   */
  let { date, entries, startHour, endHour, selectedId, onselect, sunEntry = null } = $props();

  // ── Layout constants ───────────────────────────────────────────────────────
  const RULER_HEIGHT     = 22;  // px – the hour-tick ruler row
  // All entries are now flag/pins – vertical collision step is just the tag
  // height (~18 px) so colliding pins stack tightly without wasting space.
  const FLAG_LANE_HEIGHT = 18;  // px – vertical step between colliding pin lanes
  // Slot display minimum (keeps pins clickable), separate from collision span.
  const MIN_SLOT_MINS    = 5;   // minutes
  // Estimated visual width of a pin tag in pixels (time chip + typical label).
  const TAG_PX           = 80;
  // Breathing room above the first lane and below the last.
  const LANE_MARGIN      = 4;   // px

  // ── Domain ────────────────────────────────────────────────────────────────
  const domainStartMin  = $derived(startHour * 60);
  const domainEndMin    = $derived(endHour   * 60);
  const domainWidthMin  = $derived(domainEndMin - domainStartMin);

  // Only show entries whose start time falls within the visible domain.
  const visibleEntries  = $derived(
    entries.filter(e => {
      const t = parseTimeToMinutes(e.time);
      return t >= domainStartMin && t < domainEndMin;
    })
  );

  // ── Track width measurement (for responsive collision span) ───────────────
  let trackWidth = $state(0);  // bound below with bind:clientWidth

  // How many minutes does one TAG_PX span across the visible domain?
  const labelSpanMins = $derived(
    trackWidth > 0 ? Math.ceil((TAG_PX / trackWidth) * domainWidthMin) : 60
  );

  // ── Lane assignment ────────────────────────────────────────────────────────
  const laned            = $derived(assignLanes(visibleEntries, labelSpanMins));
  const entriesWithLanes = $derived(laned.entriesWithLanes);
  const laneCount        = $derived(laned.laneCount);

  // Track height grows with lane count.
  const trackHeight = $derived(LANE_MARGIN + Math.max(2, laneCount) * FLAG_LANE_HEIGHT + LANE_MARGIN + 2);

  // ── Ruler ticks ────────────────────────────────────────────────────────────
  // Every 2 hours, filtered to the visible domain.
  const ticks = $derived(
    Array.from({ length: 13 }, (_, i) => i * 2).filter(h => h >= startHour && h <= endHour)
  );

  // ── Position helpers (all in %) ──────────────────────────────────────────

  /**
   * Left offset as a % of the visible domain.
   */
  function entryLeftPct(entry) {
    return ((parseTimeToMinutes(entry.time) - domainStartMin) / domainWidthMin) * 100;
  }

  /**
   * Width as a % of the visible domain, min-clamped to MIN_SLOT_MINS.
   */
  function entryWidthPct(entry) {
    const minPct = (MIN_SLOT_MINS / domainWidthMin) * 100;
    return Math.max(minPct, ((entry.durationSec ?? 0) / 60 / domainWidthMin) * 100);
  }

  /**
   * Top offset (px) for an entry based on its assigned lane.
   * All entries are now pins so we use the compact FLAG_LANE_HEIGHT step.
   */
  function entryTop(laneIndex) {
    const extra = laneCount === 1 ? FLAG_LANE_HEIGHT / 2 : 0;
    return LANE_MARGIN + extra + laneIndex * FLAG_LANE_HEIGHT;
  }

  // Formatted date label (used in title attribute)
  const dateLabel    = $derived(formatDate(date));
  // Four-digit year (for mobile second row)
  const dateYear = $derived(date.slice(0, 4));

  // ── Sunrise / sunset background gradient ────────────────────────────────

  /**
   * Parse an ISO datetime string (e.g. "2026-03-07T05:28+00:00") and return
   * minutes since midnight in the LOCAL timezone of the current environment.
   * Returns null if the string is falsy or unparseable.
   * @param {string|null|undefined} isoStr
   * @returns {number|null}
   */
  function sunTimeToLocalMinutes(isoStr) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d)) return null;
    return d.getHours() * 60 + d.getMinutes();
  }

  // Pastel colours for the day/night gradient.
  const COL_DAY   = '#fffde6'; // warm pastel yellow – daylight
  const COL_NIGHT = '#dce8f8'; // cool pastel blue  – night

  /**
   * CSS linear-gradient string for the track background, or plain white if
   * no sun data is available for this date. Sun times are clamped to the
   * visible domain so the gradient always covers the full track width.
   */
  const trackBackground = $derived(() => {
    const sr = sunTimeToLocalMinutes(sunEntry?.sunrise);
    const ss = sunTimeToLocalMinutes(sunEntry?.sunset);
    if (sr === null || ss === null) return '#fff';
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const srPct = clamp(((sr - domainStartMin) / domainWidthMin) * 100).toFixed(3);
    const ssPct = clamp(((ss - domainStartMin) / domainWidthMin) * 100).toFixed(3);
    return [
      `linear-gradient(to right,`,
      `  ${COL_NIGHT} 0%,`,
      `  ${COL_NIGHT} ${srPct}%,`,
      `  ${COL_DAY}   ${srPct}%,`,
      `  ${COL_DAY}   ${ssPct}%,`,
      `  ${COL_NIGHT} ${ssPct}%,`,
      `  ${COL_NIGHT} 100%)`,
    ].join(' ');
  });
</script>

<div class="day-row">
  <!-- Date label column (fixed width, sticky on mobile) -->
  <div class="date-label" title={date}>
    <span class="date-weekday">{dateLabel.split(',')[0]}</span>
    <span class="date-rest">{dateLabel.split(',').slice(1).join(',').trim()}</span>
    <span class="date-year-mobile">{dateYear}</span>
  </div>

  <!-- Track: fills remaining row width, no horizontal scroll -->
  <div
    class="track"
    style="height: {trackHeight + 1}px; background: {trackBackground()};"
    bind:clientWidth={trackWidth}
  >

    <!-- Hour tick lines (% positioned relative to domain) -->
    {#each ticks as hour (hour)}
      <div
        class="tick"
        class:tick-midnight={hour === 0}
        style="left: {((hour * 60 - domainStartMin) / domainWidthMin) * 100}%; height: {trackHeight}px;"
      >
        {#if hour < 24 && hour !== endHour}
          <span class="tick-label">{String(hour).padStart(2, '0')}</span>
        {/if}
      </div>
    {/each}

    <!-- Entries, absolutely positioned as % -->
    {#each entriesWithLanes as entry (entry.id)}
      <div
        class="entry-slot"
        style="
          left:   {entryLeftPct(entry)}%;
          top:    {entryTop(entry.lane)}px;
          width:  {entryWidthPct(entry)}%;
          height: {FLAG_LANE_HEIGHT + 4}px;
        "
      >
        <DiaryEntry
          {entry}
          height={FLAG_LANE_HEIGHT + 4}
          isSelected={selectedId === entry.id}
          {onselect}
        />
      </div>
    {/each}

  </div>
</div>

<style>
  .day-row {
    display: flex;
    align-items: flex-start;
    border-bottom: 1px solid #ccc;
    background: #fff;
  }
  .day-row:hover { background: #fafaf8; }

  /* ── Date label ── */
  .date-label {
    flex-shrink: 0;
    width: 108px;
    padding: 6px 10px 6px 14px;
    border-right: 1px solid #ccc;
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-self: stretch;
    justify-content: flex-start;
  }

  .date-weekday {
    font-size: 0.8rem;
    font-weight: 700;
    color: #1a1a1a;
    padding-top: 5px;
  }
  .date-rest {
    font-size: 0.7rem;
    color: #777;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .date-year-mobile { display: none; }

  /* ── Track ── */
  .track {
    /* Fill all remaining row width */
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
  }

  /* ── Hour tick lines ── */
  .tick {
    position: absolute;
    top: 0;
    width: 1px;
    background: #ccc;
    pointer-events: none;
    user-select: none;
  }
  .tick-midnight { background: #ccc; }

  .tick-label {
    position: absolute;
    top: 3px;
    left: 3px;
    font-size: 0.6rem;
    color: #aaa;
    white-space: nowrap;
  }

  /* ── Entry slot (positioning wrapper) ── */
  .entry-slot {
    position: absolute;
  }

  /* ── Mobile ── */
  @media (max-width: 520px) {
    .date-label { width: 56px; padding: 6px 4px 6px 6px; }
    .date-rest  { display: none; }
    .date-year-mobile { display: block; font-size: 0.65rem; color: #999; }
  }
</style>
