<script>
  import { onMount } from 'svelte';
  import DiaryTimeline   from '$lib/components/DiaryTimeline.svelte';
  import AudioPlayerPanel from '$lib/components/AudioPlayerPanel.svelte';
  import { groupByDate }  from '$lib/utils.js';

  // Svelte 5 runes
  let { data } = $props();

  // Group entries by date; re-derived if data ever changed (won't in static build,
  // but derived keeps the relationship explicit).
  const days = $derived(groupByDate(data.entries));
  const sunByDate = $derived(data.sunByDate ?? {});

  /** @type {import('$lib/types').Entry | null} */
  let selectedEntry = $state(null);

  /**
   * panelEntry holds the entry data for AudioPlayerPanel.
   * It outlives the close action so the component still has valid props
   * while its fly-out transition is running.
   * showPanel is the boolean that actually triggers the transition.
   */
  /** @type {import('$lib/types').Entry | null} */
  let panelEntry = $state(null);
  let showPanel  = $state(false);

  /** Horizontal pixels per hour – drives the zoom level. */
  let pixelsPerHour = $state(80);

  const ZOOM_LEVELS = [
    { label: '24h', pph: 80  },
    { label: '12h', pph: 160 },
    { label: '6h',  pph: 320 },
  ];

  /** Open the detail panel for a given entry and update the URL hash. */
  function selectEntry(entry) {
    selectedEntry = entry;
    panelEntry    = entry;  // set data first so panel has props before mounting
    showPanel     = true;
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', '#' + entry.id);
    }
  }

  /** Close the detail panel: triggers the fly-out transition. */
  function closePanel() {
    selectedEntry = null;  // clears timeline highlight immediately
    showPanel     = false; // triggers fly-out; panelEntry stays set until transition ends
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  /** Called by AudioPlayerPanel after its exit transition finishes. */
  function handlePanelClosed() {
    panelEntry = null;  // now safe to clear – component is gone from DOM
  }

  // On mount: read URL hash and pre-select the matching entry for deep links.
  onMount(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
        const entry = data.entries.find((e) => e.id === hash);
        if (entry) { selectedEntry = entry; panelEntry = entry; showPanel = true; }
      }
  });
</script>

<svelte:head>
  <title>Barktown</title>
</svelte:head>

<div class="app">
  <header class="site-header">
    <h1>🐕 Barktown</h1>
    <p class="subtitle">{data.entries.length} recordings</p>

    <div class="zoom-controls" role="group" aria-label="Zoom level">
      {#each ZOOM_LEVELS as level (level.pph)}
        <button
          class="zoom-btn"
          class:active={pixelsPerHour === level.pph}
          onclick={() => (pixelsPerHour = level.pph)}
          aria-pressed={pixelsPerHour === level.pph}
        >
          {level.label}
        </button>
      {/each}
    </div>
  </header>

  <main class="diary-main">
    <DiaryTimeline
      {days}
      {pixelsPerHour}
      selectedId={selectedEntry?.id ?? null}
      onselect={selectEntry}
      {sunByDate}
    />
  </main>
</div>

<!-- Slide-up panel: showPanel triggers enter/exit transition;
     panelEntry stays non-null until the exit animation finishes -->
{#if showPanel && panelEntry}
  <AudioPlayerPanel
    entry={panelEntry}
    onclose={closePanel}
    onclosed={handlePanelClosed}
  />
{/if}

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f7f7f5;
    color: #1a1a1a;
  }

  .app {
    min-height: 100dvh;
  }

  /* ── Header ── */
  .site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #fff;
    border-bottom: 1px solid #e0e0dc;
    padding: 0.6rem 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .site-header h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: #888;
    white-space: nowrap;
  }

  .zoom-controls {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .zoom-btn {
    background: none;
    border: 1px solid #d0d0cc;
    border-radius: 4px;
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
    cursor: pointer;
    color: #555;
    transition: background 0.1s, color 0.1s;
  }
  .zoom-btn:hover   { background: #f0f0ec; }
  .zoom-btn.active  { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

  /* ── Main ── */
  .diary-main {
    padding: 0.5rem 0;
  }
</style>
