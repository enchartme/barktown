<script>
  import { onMount } from 'svelte';
  import DiaryTimeline    from '$lib/components/DiaryTimeline.svelte';
  import AudioPlayerPanel from '$lib/components/AudioPlayerPanel.svelte';
  import OverviewPanel    from '$lib/components/OverviewPanel.svelte';
  import { groupByDate, ASSET_BASE } from '$lib/utils.js';

  // Svelte 5 runes
  let { data } = $props();

  /** Entries fetched live from S3 on every page load. */
  /** @type {import('$lib/types').Entry[]} */
  let entries   = $state([]);
  let loading   = $state(true);
  /** @type {string | null} */
  let loadError = $state(null);

  const days      = $derived(groupByDate(entries));
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

  /** Toggle the overview bar-chart panel. */
  let showOverview = $state(false);

  /** Visible time domain (hours). Controls which slice of the 24h track is shown. */
  let domain = $state({ startHour: 9, endHour: 20 });

  const ZOOM_LEVELS = [
    { label: '24h',       startHour: 0,  endHour: 24 },
    { label: '6 to 22',  startHour: 6,  endHour: 22 },
    { label: '9 to 20', startHour: 9,  endHour: 20 },
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

  // On mount: fetch index.json live from S3, then handle deep-link hash.
  onMount(async () => {
    try {
      const res = await fetch(`${ASSET_BASE}/index.json`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      entries = await res.json();
    } catch (e) {
      loadError = e.message;
    } finally {
      loading = false;
    }

    const hash = window.location.hash.slice(1);
    if (hash) {
      const entry = entries.find((e) => e.id === hash);
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
    <button
      class="subtitle recordings-toggle"
      class:active={showOverview}
      onclick={() => (showOverview = !showOverview)}
      aria-pressed={showOverview}
      title="Toggle overview chart"
    >{#if loading}Loading…{:else if loadError}Error{:else}{entries.length} recordings{/if}</button>

    <div class="zoom-controls" role="group" aria-label="Zoom level">
      {#each ZOOM_LEVELS as level (level.label)}
        <button
          class="zoom-btn"
          class:active={domain.startHour === level.startHour && domain.endHour === level.endHour}
          onclick={() => (domain = { startHour: level.startHour, endHour: level.endHour })}
          aria-pressed={domain.startHour === level.startHour && domain.endHour === level.endHour}
        >
          {level.label}
        </button>
      {/each}
    </div>
  </header>

  <main class="diary-main">
    {#if showOverview}
      <OverviewPanel {entries} />
    {/if}
    {#if loading}
      <p class="status-msg">Loading recordings…</p>
    {:else if loadError}
      <p class="status-msg error">Could not load index.json: {loadError}</p>
    {:else}
    <DiaryTimeline
      {days}
      startHour={domain.startHour}
      endHour={domain.endHour}
      selectedId={selectedEntry?.id ?? null}
      onselect={selectEntry}
      {sunByDate}
    />
    {/if}
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

  .recordings-toggle {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }
  .recordings-toggle:hover { background: #f0f0ec; border-color: #d0d0cc; color: #555; }
  .recordings-toggle.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

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

  .status-msg {
    padding: 3rem 1.5rem;
    text-align: center;
    color: #999;
    font-size: 0.9rem;
  }
  .status-msg.error { color: #c0392b; }
</style>
