<script>
  import { assignLanes, parseTimeToMinutes, formatDate } from '$lib/utils.js';
  import DiaryEntry from './DiaryEntry.svelte';

  /**
   * @type {{
   *   date: string;
   *   entries: import('$lib/types').Entry[];
   *   pixelsPerHour: number;
   *   selectedId: string | null;
   *   onselect: (entry: import('$lib/types').Entry) => void;
   * }}
   */
  // pixelsPerHour is accepted but not used for layout (track fills viewport).
  // It is kept in the prop signature so the parent doesn't need to change.
  let { date, entries, pixelsPerHour: _pph, selectedId, onselect } = $props();

  // ── Layout constants ───────────────────────────────────────────────────────
  const RULER_HEIGHT     = 22;  // px – the hour-tick ruler row
  // All entries are now flag/pins – vertical collision step is just the tag
  // height (~18 px) so colliding pins stack tightly without wasting space.
  const FLAG_LANE_HEIGHT = 18;  // px – vertical step between colliding pin lanes
  // Slot display minimum (keeps pins clickable), separate from collision span.
  const MIN_SLOT_MINS    = 5;   // minutes
  const MIN_WIDTH_PCT    = (MIN_SLOT_MINS / 1440) * 100;
  // Estimated visual width of a pin tag in pixels (time chip + typical label).
  const TAG_PX           = 80;

  // ── Track width measurement (for responsive collision span) ───────────────
  let trackWidth = $state(0);  // bound below with bind:clientWidth

  // How many minutes does one TAG_PX span on the current screen?
  // Falls back to 60 min until the track has been measured.
  const labelSpanMins = $derived(
    trackWidth > 0 ? Math.ceil((TAG_PX / trackWidth) * 1440) : 60
  );

  // ── Lane assignment ────────────────────────────────────────────────────────
  // Uses labelSpanMins so that two pins whose tags would visually overlap
  // are always pushed into separate lanes, regardless of viewport width.
  const laned            = $derived(assignLanes(entries, labelSpanMins));
  const entriesWithLanes = $derived(laned.entriesWithLanes);
  const laneCount        = $derived(laned.laneCount);

  // Track height grows with lane count – use the pin step size since all
  // entries are now pins.  Add a little padding at the bottom.
  const trackHeight = $derived(RULER_HEIGHT + laneCount * FLAG_LANE_HEIGHT + 6);

  // ── Ruler ticks ────────────────────────────────────────────────────────────
  // Every 2 hours – at viewport scale every 1 h would be too cramped on mobile.
  const ticks = Array.from({ length: 13 }, (_, i) => i * 2); // 0,2,4…24

  // ── Position helpers (all in %) ──────────────────────────────────────────

  /**
   * Left offset as a % of the 24-hour track (0–100).
   * left = (minutesSinceMidnight / 1440) * 100
   */
  function entryLeftPct(entry) {
    return (parseTimeToMinutes(entry.time) / 1440) * 100;
  }

  /**
   * Width as a % of the 24-hour track, min-clamped to MIN_WIDTH_PCT.
   * width = (durationSec / 86400) * 100
   */
  function entryWidthPct(entry) {
    return Math.max(MIN_WIDTH_PCT, ((entry.durationSec ?? 0) / 86400) * 100);
  }

  /**
   * Top offset (px) for an entry based on its assigned lane.
   * All entries are now pins so we use the compact FLAG_LANE_HEIGHT step.
   */
  function entryTop(laneIndex) {
    return RULER_HEIGHT + laneIndex * FLAG_LANE_HEIGHT;
  }

  // Formatted date label
  const dateLabel = $derived(formatDate(date));
</script>

<div class="day-row">
  <!-- Date label column (fixed width, sticky on mobile) -->
  <div class="date-label" title={date}>
    <span class="date-weekday">{dateLabel.split(',')[0]}</span>
    <span class="date-rest">{dateLabel.split(',').slice(1).join(',').trim()}</span>
  </div>

  <!-- Track: fills remaining row width, no horizontal scroll -->
  <div
    class="track"
    style="height: {trackHeight}px;"
    bind:clientWidth={trackWidth}
  >

    <!-- Hour tick lines (% positioned) -->
    {#each ticks as hour (hour)}
      <div
        class="tick"
        class:tick-midnight={hour === 0}
        style="left: {(hour / 24) * 100}%; height: {trackHeight}px;"
      >
        {#if hour < 24}
          <span class="tick-label">{String(hour).padStart(2, '0')}:00</span>
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
    border-bottom: 1px solid #e8e8e4;
    background: #fff;
  }
  .day-row:hover { background: #fafaf8; }

  /* ── Date label ── */
  .date-label {
    flex-shrink: 0;
    width: 108px;
    padding: 6px 10px 6px 14px;
    border-right: 1px solid #e8e8e4;
    display: flex;
    flex-direction: column;
    gap: 1px;
    /* Keep it aligned to the top of the row */
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

  /* ── Track ── */
  .track {
    /* Fill all remaining row width */
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: visible;
  }

  /* ── Hour tick lines ── */
  .tick {
    position: absolute;
    top: 0;
    width: 1px;
    background: #e8e8e4;
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
    .day-row     { flex-direction: column; }
    .date-label  {
      width: 100%;
      flex-direction: row;
      gap: 0.5rem;
      align-items: baseline;
      border-right: none;
      border-bottom: 1px solid #e8e8e4;
      padding: 4px 10px;
    }
    .date-weekday { padding-top: 0; }
    /* On mobile the track is still 100% of the row width */
    .track { width: 100%; }
  }
</style>
