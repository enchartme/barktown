<script>
  import { onMount }       from 'svelte';
  import { formatDuration, formatDate, downsampleWaveform, waveformNorm } from '$lib/utils.js';
  import { fly }           from 'svelte/transition';

  /**
   * @type {{
   *   entry: import('$lib/types').Entry;
   *   onclose: () => void;
   * }}
   */
  let { entry, onclose, onclosed } = $props();

  // ── Audio element reference ────────────────────────────────────────────────
  /** @type {HTMLAudioElement | null} */
  let audioEl = $state(null);

  // ── Playback state ─────────────────────────────────────────────────────────
  let isPlaying   = $state(false);
  let currentTime = $state(0);
  let duration    = $state(0);

  // ── Waveform data ──────────────────────────────────────────────────────────
  // Module-level cache shared with WaveformPreview (avoids second fetch when
  // the user opens the panel for an already-previewed entry).
  /** @type {Map<string, { mins: number[], maxs: number[], norm: number, rawLength: number } | 'error'>} */
  const waveformCache = new Map();

  /** @type {{ mins: number[], maxs: number[], norm: number, rawLength: number } | null} */
  let waveData   = $state(null);
  let wfLoading  = $state(false);

  // Virtual waveform SVG dimensions (viewBox units, not pixels).
  // Using a viewBox lets the SVG scale to any container width.
  const VW = 1000; // virtual width
  const VH = 80;   // virtual height

  // Number of bars to render in the player waveform.
  const PLAYER_BARS = 500;

  // ── Derived waveform bars ─────────────────────────────────────────────────
  const bars = $derived(() => {
    if (!waveData) return [];
    const { mins, maxs, norm } = waveData;
    const count   = mins.length;
    if (!count)    return [];

    const barW    = VW / count;
    const centerY = VH / 2;

    return mins.map((lo, i) => {
      const hi      = maxs[i];
      const yTop    = centerY - (hi / norm) * centerY;
      const yBottom = centerY - (lo / norm) * centerY;
      return {
        x: i * barW,
        y: yTop,
        w: Math.max(0.5, barW - 0.5),
        h: Math.max(1, yBottom - yTop),
      };
    });
  });

  // Playhead x position in virtual SVG units.
  const playheadX = $derived(
    duration > 0 ? (currentTime / duration) * VW : 0
  );

  // ── Fetch waveform when entry changes ────────────────────────────────────
  $effect(() => {
    const path = entry.waveformPath;
    if (!path) { waveData = null; return; }

    const cached = waveformCache.get(path);
    if (cached && cached !== 'error') {
      waveData = cached;
      return;
    }
    if (cached === 'error') return;

    wfLoading = true;
    fetch('/' + path)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const norm   = waveformNorm(json.bits ?? 8);
        const ds     = downsampleWaveform(json.data, PLAYER_BARS);
        const result = { mins: ds.mins, maxs: ds.maxs, norm, rawLength: json.length };
        waveformCache.set(path, result);
        if (entry.waveformPath === path) waveData = result;
      })
      .catch(() => waveformCache.set(path, 'error'))
      .finally(() => { wfLoading = false; });
  });

  // ── Reset player state when entry changes ────────────────────────────────
  $effect(() => {
    // Reading `entry` makes this re-run on entry change.
    void entry.id;
    currentTime = 0;
    duration    = 0;
    isPlaying   = false;
  });

  // ── Audio control helpers ─────────────────────────────────────────────────

  function togglePlay() {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
    } else {
      audioEl.play().catch(() => {}); // ignore AbortError on rapid toggling
    }
  }

  // Pause playback when close is triggered so audio doesn't continue in the background.
  function handleClose() {
    if (audioEl && isPlaying) audioEl.pause();
    onclose();
  }

  function handlePlay()  { isPlaying = true; }
  function handlePause() { isPlaying = false; }
  function handleEnded() { isPlaying = false; currentTime = 0; }

  function handleTimeUpdate() {
    if (audioEl) currentTime = audioEl.currentTime;
  }
  function handleLoadedMetadata() {
    if (audioEl) duration = audioEl.duration || entry.durationSec;
  }

  // ── Waveform click-to-seek ────────────────────────────────────────────────

  /** @param {MouseEvent & { currentTarget: SVGSVGElement }} e */
  function handleWaveformClick(e) {
    if (!audioEl || !duration) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
  }

  /** @param {KeyboardEvent & { currentTarget: SVGSVGElement }} e */
  function handleWaveformKeydown(e) {
    if (!audioEl || !duration) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); audioEl.currentTime = Math.min(duration, currentTime + 5); }
    if (e.key === 'ArrowLeft' ) { e.preventDefault(); audioEl.currentTime = Math.max(0,        currentTime - 5); }
    // Prevent browsers from firing a synthetic click on the SVG when space is
    // pressed while the waveform has focus.  That synthetic click would call
    // handleWaveformClick with clientX=0, seeking playback to position 0.
    // The global keydown handler takes care of the actual play/pause toggle.
    if (e.key === ' ')          { e.preventDefault(); }
  }

  // ── Close on Escape ───────────────────────────────────────────────────────
  function handleGlobalKeydown(e) {
    if (e.key === 'Escape') { handleClose(); return; }
    if (e.key === ' ') {
      const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
      // Don't hijack space when the user is typing in a text field, or when
      // a <button> has focus (the button handles space natively via onclick;
      // firing togglePlay here too would double-toggle immediately).
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') {
        e.preventDefault(); // prevent page scroll
        togglePlay();
      }
    }
  }
  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formattedDate  = $derived(formatDate(entry.date));
  const formattedDur   = $derived(formatDuration(entry.durationSec));
  const formattedCur   = $derived(formatDuration(currentTime));
  const displayLabel   = $derived(entry.label || entry.time);
  const audioSrc       = $derived('/' + entry.audioPath);
</script>

<!-- Slide up from bottom -->
<div
  class="panel-backdrop"
  onclick={handleClose}
  onkeydown={(e) => e.key === 'Enter' && handleClose()}
  role="button"
  tabindex="-1"
  aria-label="Close player"
>
</div>

<div
  class="player-panel"
  role="dialog"
  aria-label="Audio player: {displayLabel}"
  aria-modal="true"
  transition:fly={{ y: 200, duration: 220 }}
  onoutroend={onclosed}
>
  <!-- ── Panel header ── -->
  <div class="panel-header">
    <div class="panel-meta">
      <span class="panel-kind panel-kind--{entry.kind}">{entry.kind}</span>
      <span class="panel-datetime">{entry.date} · {entry.time}</span>
      <span class="panel-dur">{formattedDur}</span>
    </div>
    <h2 class="panel-title">{displayLabel}</h2>
    <button class="close-btn" onclick={handleClose} aria-label="Close player">✕</button>
  </div>

  <!-- ── Waveform area ── -->
  <div class="waveform-area">
    {#if entry.waveformPath && !wfLoading && waveData}
      <!-- SVG waveform with playhead overlay -->
      <!-- Clicking the SVG seeks to the clicked position -->
      <svg
        class="player-waveform"
        viewBox="0 0 {VW} {VH}"
        preserveAspectRatio="none"
        role="slider"
        tabindex="0"
        aria-label="Seek waveform. Current position: {formattedCur}"
        aria-valuemin="0"
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onclick={handleWaveformClick}
        onkeydown={handleWaveformKeydown}
      >
        <!-- Invisible hit-area rectangle covering the full viewbox.
             SVG's default pointer-events is "painted" so clicks in the
             gaps between bars are dead zones in Chrome.  A transparent rect
             (fill="transparent" counts as painted, unlike fill="none")
             ensures every pixel inside the SVG fires the seek handler. -->
        <rect x="0" y="0" width={VW} height={VH} fill="transparent" />

        <!-- Bars: rendered in two passes to colour played vs unplayed -->
        {#each bars() as bar, i}
          <rect
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            fill={bar.x <= playheadX ? '#2255bb' : '#a0b8e8'}
          />
        {/each}

        <!-- Playhead line -->
        {#if duration > 0}
          <line
            x1={playheadX} y1="0"
            x2={playheadX} y2={VH}
            stroke="#1a1a1a"
            stroke-width="1.5"
            pointer-events="none"
          />
          <!-- Playhead knob -->
          <circle
            cx={playheadX}
            cy={VH / 2}
            r="4"
            fill="#1a1a1a"
            pointer-events="none"
          />
        {/if}
      </svg>
    {:else if entry.waveformPath && wfLoading}
      <div class="waveform-loading">Loading waveform…</div>
    {:else}
      <!-- No waveform available: progress bar fallback -->
      <div class="waveform-fallback">
        <div
          class="progress-bar-fill"
          style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
        ></div>
      </div>
    {/if}

    <!-- Time display -->
    <div class="time-display">
      <span>{formattedCur}</span>
      <span class="time-sep">/</span>
      <span>{formattedDur}</span>
    </div>
  </div>

  <!-- ── Playback controls ── -->
  <div class="controls">
    <button
      class="play-btn"
      onclick={togglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      disabled={!audioEl}
    >
      {#if isPlaying}
        <!-- Pause icon -->
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
          <rect x="5" y="3" width="4" height="18" rx="1"/>
          <rect x="15" y="3" width="4" height="18" rx="1"/>
        </svg>
      {:else}
        <!-- Play icon -->
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      {/if}
    </button>
  </div>

  <!-- Native audio element (hidden, drives playback) -->
  <audio
    bind:this={audioEl}
    src={audioSrc}
    preload="metadata"
    onplay={handlePlay}
    onpause={handlePause}
    onended={handleEnded}
    ontimeupdate={handleTimeUpdate}
    onloadedmetadata={handleLoadedMetadata}
  ></audio>
</div>

<style>
  /* ── Backdrop ── */
  .panel-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.25);
    z-index: 200;
  }

  /* ── Panel ── */
  .player-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 201;
    background: #fff;
    border-top: 1px solid #d0d0cc;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
    padding: 1rem 1.25rem 1.5rem;
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ── Header ── */
  .panel-header {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    position: relative;
  }

  .panel-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .panel-kind {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .panel-kind--audio { background: #dce8ff; color: #2255bb; }
  .panel-kind--note  { background: #fff3cd; color: #7a6000; }
  .panel-kind--empty { background: #ebebeb; color: #666; }

  .panel-datetime {
    font-size: 0.8rem;
    color: #666;
  }

  .panel-dur {
    font-size: 0.8rem;
    color: #999;
  }

  .panel-title {
    position: absolute;
    left: 0;
    right: 2.5rem;
    top: 1.5rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-btn {
    margin-left: auto;
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: 1rem;
    color: #888;
    cursor: pointer;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { background: #f0f0ec; color: #333; }

  /* ── Waveform area ── */
  .waveform-area {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-top: 1.5rem; /* accommodate absolutely-placed title */
  }

  .player-waveform {
    width: 100%;
    height: 80px;
    display: block;
    cursor: pointer;
    border-radius: 4px;
    background: #f4f6fb;
  }
  .player-waveform:focus { outline: 2px solid #4a7cdc; }

  .waveform-loading {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    color: #aaa;
    background: #f4f6fb;
    border-radius: 4px;
  }

  .waveform-fallback {
    height: 6px;
    background: #e8e8e4;
    border-radius: 3px;
    overflow: hidden;
    margin-top: 2rem;
    margin-bottom: 1rem;
  }
  .progress-bar-fill {
    height: 100%;
    background: #4a7cdc;
    border-radius: 3px;
    transition: width 0.2s linear;
  }

  .time-display {
    display: flex;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #888;
    font-variant-numeric: tabular-nums;
  }
  .time-sep { color: #ccc; }

  /* ── Controls ── */
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #1a1a1a;
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, transform 0.1s;
  }
  .play-btn:hover   { background: #333; }
  .play-btn:active  { transform: scale(0.94); }
  .play-btn:disabled { background: #ccc; cursor: default; }
</style>
