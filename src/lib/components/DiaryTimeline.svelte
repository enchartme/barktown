<script>
  import DayRow from './DayRow.svelte';

  /**
   * @type {{
   *   days: { date: string, entries: import('$lib/types').Entry[] }[];
   *   pixelsPerHour: number;
   *   selectedId: string | null;
   *   onselect: (entry: import('$lib/types').Entry) => void;
   *   sunByDate: Record<string, { date: string, sunrise: string|null, sunset: string|null }>;
   * }}
   */
  let { days, pixelsPerHour, selectedId, onselect, sunByDate = {} } = $props();
</script>

<div class="timeline">
  {#each days as day (day.date)}
    <DayRow
      date={day.date}
      entries={day.entries}
      {pixelsPerHour}
      {selectedId}
      {onselect}
      sunEntry={sunByDate[day.date] ?? null}
    />
  {/each}

  {#if days.length === 0}
    <p class="empty">No recordings found in index.json.</p>
  {/if}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
  }

  .empty {
    padding: 3rem 1.5rem;
    color: #999;
    text-align: center;
  }
</style>
