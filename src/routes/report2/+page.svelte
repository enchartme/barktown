<script>
  import { onMount } from 'svelte';
  import AudioPlayerPanel from '$lib/components/AudioPlayerPanel.svelte';
  import GoblinPiStatus from '$lib/components/GoblinPiStatus.svelte';
  import ReportBarcode from '$lib/components/ReportBarcode.svelte';
  import { hitMetadataById, loadHitMetadata } from '$lib/hit-metadata.js';
  import { groupReportNoteLabels, reportSentenceNeedsPeriod } from '$lib/report-annotations.js';
  import { formatDisturbedTime, summarizeEntries } from '$lib/report-summary.js';
  import { DIARY_NIGHT_COLOR, isNighttimeRecording } from '$lib/sun-time.js';
  import {
    addDays,
    API_BASE,
    formatDate,
    groupByDateRange,
    isIsoDate,
    startOfIsoWeek,
  } from '$lib/utils.js';

  let { data } = $props();

  /** @type {import('$lib/types').Entry[]} */
  let entries = $state([]);
  /** Whole-recording note labels keyed by the linked training sample ID. */
  /** @type {Map<string, string[]>} */
  let noteLabelsBySampleId = $state(new Map());
  let loading = $state(true);
  /** @type {string | null} */
  let loadError = $state(null);
  /** Monday of the newer week in the rolling two-week window. */
  /** @type {string | null} */
  let reportWeekStart = $state(null);
  let reportRequestId = 0;

  let dayOrder = $state('asc');
  let recordingOrder = $state('asc');

  /** @type {import('$lib/types').Entry | null} */
  let panelEntry = $state(null);
  let showPanel = $state(false);

  const reportStartDate = $derived(reportWeekStart ? addDays(reportWeekStart, -7) : null);
  const reportEndDate = $derived(reportWeekStart ? addDays(reportWeekStart, 6) : null);
  const sunByDate = $derived(data.sunByDate ?? {});

  const days = $derived.by(() => {
    if (!reportStartDate || !reportEndDate) return [];

    let grouped = groupByDateRange(
      entries.filter((entry) => entry.kind === 'audio'),
      reportStartDate,
      reportEndDate,
    );
    if (dayOrder === 'asc') grouped = [...grouped].reverse();

    return grouped.map((day) => {
      const orderedEntries = recordingOrder === 'asc'
        ? day.entries
        : [...day.entries].reverse();
      return {
        ...day,
        entries: orderedEntries,
        summary: summarizeEntries(orderedEntries, $hitMetadataById),
      };
    });
  });

  function todayInStockholm() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function reportBounds(weekStart) {
    return { startDate: addDays(weekStart, -7), endDate: addDays(weekStart, 6) };
  }

  function formatRangeDate(dateStr, includeYear = false) {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
    });
  }

  const reportRangeLabel = $derived(
    reportStartDate && reportEndDate
      ? `${formatRangeDate(reportStartDate)} – ${formatRangeDate(reportEndDate, true)}`
      : '',
  );

  function updateReportUrl() {
    if (!reportWeekStart) return;
    const url = new URL(window.location.href);
    url.searchParams.set('week', reportWeekStart);
    url.searchParams.set('days', dayOrder);
    url.searchParams.set('recordings', recordingOrder);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function fetchDiary(bounds) {
    const url = new URL('/api/diary', API_BASE);
    url.searchParams.set('startDate', bounds.startDate);
    url.searchParams.set('endDate', bounds.endDate);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  async function fetchLatestDiaryDate() {
    const response = await fetch(`${API_BASE}/api/diary/latest-date`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const body = await response.json();
    return isIsoDate(body?.date) ? body.date : null;
  }

  async function fetchAnnotations() {
    const response = await fetch(`${API_BASE}/api/annotations`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('Annotations response has an invalid shape');
    return body;
  }

  async function loadReport(weekStart) {
    const bounds = reportBounds(weekStart);
    const requestId = ++reportRequestId;
    loading = true;
    loadError = null;

    try {
      const [nextEntries, annotations] = await Promise.all([
        fetchDiary(bounds),
        fetchAnnotations(),
      ]);
      if (requestId !== reportRequestId) return;
      entries = nextEntries;
      const displayedSampleIds = new Set(
        nextEntries
          .filter((entry) => entry.kind === 'audio' && entry.sampleId)
          .map((entry) => entry.sampleId),
      );
      noteLabelsBySampleId = groupReportNoteLabels(annotations, displayedSampleIds);
      void loadHitMetadata(bounds).catch((error) => {
        console.error('Failed to load hit metadata:', error);
      });
    } catch (error) {
      if (requestId === reportRequestId) {
        loadError = error?.message ?? 'Failed to load report';
      }
    } finally {
      if (requestId === reportRequestId) loading = false;
    }
  }

  async function changeReportWeek(deltaWeeks) {
    if (!reportWeekStart || loading) return;
    closePanel();
    reportWeekStart = addDays(reportWeekStart, deltaWeeks * 7);
    updateReportUrl();
    await loadReport(reportWeekStart);
  }

  function changeDayOrder(event) {
    dayOrder = event.currentTarget.value;
    updateReportUrl();
  }

  function changeRecordingOrder(event) {
    recordingOrder = event.currentTarget.value;
    updateReportUrl();
  }

  function selectEntry(entry) {
    panelEntry = entry;
    showPanel = true;
    const url = new URL(window.location.href);
    url.hash = entry.id;
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function closePanel() {
    showPanel = false;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = '';
      history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }

  function handlePanelClosed() {
    panelEntry = null;
  }

  function countLabel(count, singular, plural = `${singular}s`) {
    return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
  }

  onMount(async () => {
    const url = new URL(window.location.href);
    dayOrder = url.searchParams.get('days') === 'desc' ? 'desc' : 'asc';
    recordingOrder = url.searchParams.get('recordings') === 'desc' ? 'desc' : 'asc';

    const requestedWeek = url.searchParams.get('week');
    if (requestedWeek && isIsoDate(requestedWeek)) {
      reportWeekStart = startOfIsoWeek(requestedWeek);
    } else {
      try {
        const latestDate = await fetchLatestDiaryDate();
        reportWeekStart = startOfIsoWeek(latestDate || todayInStockholm());
      } catch (error) {
        loadError = error?.message ?? 'Failed to find the latest diary date';
        loading = false;
        return;
      }
    }

    updateReportUrl();
    await loadReport(reportWeekStart);

    const selectedId = window.location.hash.slice(1);
    const selected = entries.find((entry) => entry.id === selectedId && entry.kind === 'audio');
    if (selected) {
      panelEntry = selected;
      showPanel = true;
    }
  });
</script>

<svelte:head>
  <title>Report2 · Barktown</title>
  <meta name="description" content="Read two weeks of Barktown recordings as flowing text." />
</svelte:head>

<div class="app" style={`--diary-night: ${DIARY_NIGHT_COLOR}`}>
  <header class="site-header">
    <a class="brand" href="/">🐕 Barktown</a>
    <nav aria-label="Barktown views">
      <a href="/diary">Diary</a>
      <a href="/report">Report</a>
      <a class="current" aria-current="page" href="/report2">Report2</a>
      <a href="/training">Samples</a>
      <a href="/method">Method</a>
    </nav>
    <GoblinPiStatus />
  </header>

  <main>
    <header class="report-heading">
      <div>
        <p class="eyebrow">Sounds as text</p>
        <h1>Report2</h1>
      </div>

      {#if reportWeekStart}
        <div class="range-controls" aria-label="Report dates">
          <button disabled={loading} onclick={() => changeReportWeek(-1)}>← Earlier</button>
          <strong>{reportRangeLabel}</strong>
          <button disabled={loading} onclick={() => changeReportWeek(1)}>Later →</button>
        </div>
      {/if}
    </header>

    <div class="ordering-controls" aria-label="Report ordering controls">
      <label>
        Days
        <select value={dayOrder} onchange={changeDayOrder}>
          <option value="asc">Earlier → later</option>
          <option value="desc">Later → earlier</option>
        </select>
      </label>
      <label>
        Recordings
        <select value={recordingOrder} onchange={changeRecordingOrder}>
          <option value="asc">Earlier → later</option>
          <option value="desc">Later → earlier</option>
        </select>
      </label>
    </div>

    {#if loading}
      <p class="status">Loading recordings…</p>
    {:else if loadError}
      <p class="status error">Could not load diary data: {loadError}</p>
    {:else}
      <div class="report-days">
        {#each days as day (day.date)}
          <section class="day-section">
            <h2>
              <span>{formatDate(day.date)}</span>
              <small>
                {countLabel(day.summary.disturbances, 'disturbance')}
                <span aria-hidden="true">·</span>
                {formatDisturbedTime(day.summary.totalDurationSec)} disturbed
                <span aria-hidden="true">·</span>
                {countLabel(day.summary.barks, 'bark')}
              </small>
            </h2>

            {#if day.entries.length}
              <p class="recordings">
                {#each day.entries as entry (entry.id)}
                  {@const noteLabels = entry.sampleId
                    ? (noteLabelsBySampleId.get(entry.sampleId) ?? [])
                    : []}
                  <span
                    class="recording-sentence"
                    class:nighttime={isNighttimeRecording(entry.time, sunByDate[day.date])}
                  >
                    <span class="recording-lead">
                      <button
                        class="play-button"
                        onclick={() => selectEntry(entry)}
                        aria-label={`Play recording from ${formatDate(entry.date)} at ${entry.time}`}
                        title="Open recording"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                          <circle cx="8" cy="8" r="7.5" />
                          <polygon points="6,4.5 12,8 6,11.5" />
                        </svg>
                      </button>
                      <time datetime={entry.datetimeLocal}>{entry.time}</time>
                      <ReportBarcode
                        durationSec={entry.durationSec}
                        metadata={$hitMetadataById.get(entry.id) ?? null}
                      />
                    </span>
                    {#each noteLabels as label}
                      <span class="annotation-label">{label}</span>
                    {/each}
                    {#if reportSentenceNeedsPeriod(noteLabels)}
                      <span class="period" aria-hidden="true">.</span>
                    {/if}
                  </span>{' '}
                {/each}
              </p>
            {:else}
              <p class="no-recordings">No recordings.</p>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </main>
</div>

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

  .app { min-height: 100dvh; }

  .site-header {
    position: sticky;
    top: 0;
    z-index: 1000;
    min-height: 48px;
    padding: 0.6rem 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid #e0e0dc;
    background: #fff;
  }

  .brand {
    color: inherit;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-decoration: none;
    white-space: nowrap;
  }

  nav {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  nav a {
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    color: #555;
    font-size: 0.78rem;
    text-decoration: none;
    white-space: nowrap;
  }

  nav a:hover,
  nav a.current { background: #f0f0ec; color: #1a1a1a; }
  nav a.current { font-weight: 650; }

  main {
    width: min(1180px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 2.1rem 0 5rem;
  }

  .report-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #8a3d20;
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(2.4rem, 7vw, 4.8rem);
    font-weight: 500;
    letter-spacing: -0.055em;
    line-height: 0.95;
  }

  .range-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #555;
    font-size: 0.82rem;
  }

  .range-controls strong {
    min-width: 154px;
    color: #333;
    text-align: center;
  }

  .range-controls button,
  select {
    border: 1px solid #d0d0cc;
    border-radius: 4px;
    background: #fff;
    color: #555;
    font: inherit;
  }

  .range-controls button {
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }

  .range-controls button:hover:not(:disabled) { background: #f0f0ec; color: #1a1a1a; }
  .range-controls button:disabled { cursor: wait; opacity: 0.5; }

  .ordering-controls {
    margin: 2rem 0 1.1rem;
    padding-block: 0.75rem;
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    border-block: 1px solid #dededa;
  }

  .ordering-controls label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: #777;
    font-size: 0.75rem;
    font-weight: 650;
  }

  select {
    padding: 0.25rem 1.8rem 0.25rem 0.45rem;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .report-days {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .day-section {
    padding: 1.2rem 1.35rem 1.3rem;
    border: 1px solid #dededa;
    border-radius: 8px;
    background: #fff;
  }

  h2 {
    margin: 0 0 0.75rem;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem 1.5rem;
    border-bottom: 1px solid #ecece8;
    padding-bottom: 0.55rem;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.12rem;
    font-weight: 600;
  }

  h2 small {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
    color: #777;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 0.72rem;
    font-weight: 500;
  }

  .recordings,
  .no-recordings {
    margin: 0;
    color: #2d2d2a;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1rem;
    line-height: 2;
  }

  .recording-sentence {
    display: inline;
    margin-right: 0.55rem;
  }

  .recording-sentence.nighttime {
    padding: 0.08em 0.3em;
    border-radius: 4px;
    background: var(--diary-night);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .recording-lead {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    vertical-align: middle;
  }

  .play-button {
    width: 16px;
    height: 16px;
    padding: 0;
    flex: 0 0 auto;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    line-height: 0;
    vertical-align: -0.18em;
  }

  .play-button circle { fill: #6f5145; stroke: #6f5145; }
  .play-button polygon { fill: #fff; }
  .play-button:hover circle { fill: #8a3d20; stroke: #8a3d20; }
  .play-button:focus-visible { outline: 2px solid #4a7cdc; outline-offset: 2px; }

  time {
    margin-inline: 0.2rem;
    color: #5d514c;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .annotation-label { margin-left: 0.25rem; }
  .period { margin-left: -0.12rem; }
  .no-recordings { color: #aaa; font-style: italic; }

  .status {
    padding: 5rem 1rem;
    color: #999;
    text-align: center;
  }
  .status.error { color: #c0392b; }

  @media (max-width: 760px) {
    .site-header { align-items: flex-start; flex-wrap: wrap; gap: 0.45rem 0.8rem; }
    nav { width: 100%; order: 3; overflow-x: auto; margin-left: 0; }
    .report-heading { align-items: flex-start; flex-direction: column; }
    .range-controls { width: 100%; justify-content: space-between; }
    .ordering-controls { justify-content: flex-start; flex-wrap: wrap; }
    h2 { align-items: flex-start; flex-direction: column; }
    h2 small { justify-content: flex-start; }
  }

  @media (max-width: 440px) {
    main { width: min(100% - 1rem, 1180px); padding-top: 1.4rem; }
    .day-section { padding-inline: 0.75rem; }
    .range-controls { flex-wrap: wrap; }
    .range-controls strong { order: -1; width: 100%; }
  }
</style>
