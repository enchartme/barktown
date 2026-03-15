<script>
  import { onMount }       from 'svelte';
  import { formatDuration, formatDate, downsampleWaveform, waveformNorm, ASSET_BASE } from '$lib/utils.js';
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
    const gc      = _gainCurve; // reactive dep — redraws when curve is set

    // Find the tallest visual amplitude after gain, so we can scale the Y axis
    // to always fill the full height regardless of how flat the gain curve is.
    let visualPeak = 0;
    for (let i = 0; i < count; i++) {
      const v = (maxs[i] / norm) * (gc ? gc[i] : 1);
      if (v > visualPeak) visualPeak = v;
    }
    const yScale = visualPeak > 0 ? 1 / visualPeak : 1;

    return mins.map((lo, i) => {
      const gain    = gc ? gc[i] : 1;
      const hi      = maxs[i];
      const yTop    = centerY - (hi / norm) * gain * yScale * centerY;
      const yBottom = centerY - (lo / norm) * gain * yScale * centerY;
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
    fetch(`${ASSET_BASE}/${path}`)
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

  // ── Volume / gain ──────────────────────────────────────────────────────────
  /** Manual volume in dB. Slider range -30..0. */
  let volumeDb   = $state(0);
  /** When true, per-moment waveform lookahead adjusts gain dynamically. */
  let autoAdjust     = $state(false);
  /** How aggressively to suppress loud sections. 0 = off, 1 = extreme. */
  let suppressLoud   = $state(0);
  /** Amplitude threshold (0..1): only samples above this are suppressed. */
  let suppressCutoff = $state(0);
  /** How much to boost quiet sections toward volume 1. 0 = off, 1 = full makeup. */
  let boostQuiet     = $state(0);
  /** Amplitude threshold (0..1): only samples below this are boosted. */
  let boostCutoff    = $state(1);

  /** dB → linear gain (0..1). */
  function dbToLinear(db) { return Math.pow(10, db / 20); }

  /**
   * Precomputed gain curve: one multiplier per waveform sample.
   * Recomputed whenever waveData changes or autoAdjust is toggled.
   * Reactive so bars() updates when the curve is computed.
   */
  let _gainCurve = /** @type {Float32Array | null} */ ($state(null));

  // Keep audioEl.volume in sync with slider when auto-adjust is off.
  $effect(() => {
    if (audioEl && !autoAdjust) audioEl.volume = dbToLinear(volumeDb);
  });

  // Rebuild gain curve whenever any normalisation param changes.
  $effect(() => {
    if (!autoAdjust || !waveData) { _gainCurve = null; return; }
    const { maxs, norm } = waveData;
    const n = maxs.length;

    // Phase 1 — suppress samples whose peak is above suppressCutoff.
    const suppressTarget = Math.pow(0.0001, suppressLoud);
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const peak = maxs[i] / norm;  // 0..1
      if (peak <= suppressCutoff || suppressLoud === 0) {
        curve[i] = 1; // below cutoff or strength is off: no change
      } else {
        const fullSuppress = peak > 0 ? Math.min(1, suppressTarget / peak) : 1;
        curve[i] = 1 + suppressLoud * (fullSuppress - 1);
      }
    }

    // Phase 2 — boost samples whose peak is below boostCutoff.
    // For each eligible sample, compute the gain that would bring its amplitude
    // up to boostCutoff (i.e. as loud as the quietest "not-quiet" sound).
    // Blend toward that target by boostQuiet.  Capped at 1.0 (audioEl.volume max).
    if (boostQuiet > 0) {
      for (let i = 0; i < n; i++) {
        const peak = maxs[i] / norm;
        if (peak <= 0 || peak >= boostCutoff) continue;
        const targetGain = Math.min(1, boostCutoff / peak);   // gain to reach the cutoff level
        curve[i] = Math.min(1, curve[i] + boostQuiet * (targetGain - curve[i]));
      }
    }

    _gainCurve = curve;
  });

  /** On each timeupdate, look up the precomputed gain for the current position. */
  function applyAutoVolume() {
    if (!audioEl || !_gainCurve) return;
    const dur = audioEl.duration;
    if (!dur) return;
    const idx = Math.min(_gainCurve.length - 1,
      Math.floor((audioEl.currentTime / dur) * _gainCurve.length));
    audioEl.volume = Math.max(0, Math.min(1, dbToLinear(volumeDb) * _gainCurve[idx]));
  }

  const volLabel        = $derived(volumeDb === 0 ? '0 dB' : `${volumeDb.toFixed(1)} dB`);
  const suppressLabel   = $derived(suppressLoud   === 0 ? 'off' : `${Math.round(suppressLoud   * 100)}%`);
  const boostLabel      = $derived(boostQuiet     === 0 ? 'off' : `${Math.round(boostQuiet     * 100)}%`);
  const suppressCutLbl  = $derived(`>${Math.round(suppressCutoff * 100)}%`);
  const boostCutLbl     = $derived(`<${Math.round(boostCutoff    * 100)}%`);
  async function togglePlay() {
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
    if (!audioEl) return;
    currentTime = audioEl.currentTime;
    applyAutoVolume();
  }
  function handleLoadedMetadata() {
    if (audioEl) duration = audioEl.duration || entry.durationSec;
  }

  // ── Waveform click-to-seek ────────────────────────────────────────────────

  /** @param {MouseEvent & { currentTarget: SVGSVGElement }} e */
  async function handleWaveformClick(e) {
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
  const audioSrc       = $derived(`${ASSET_BASE}/${entry.audioPath}`);
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

  <!-- ── Volume control ── -->
  <div class="volume-row">
    <label class="vol-label" for="vol-slider">{volLabel}</label>
    <input
      id="vol-slider"
      class="vol-slider"
      type="range"
      min="-30"
      max="0"
      step="0.5"
      bind:value={volumeDb}
      aria-label="Volume"
    />
    <label class="auto-label">
      <input type="checkbox" bind:checked={autoAdjust} />
      auto
    </label>
    {#if autoAdjust}
      <div class="norm-rows">
        <div class="norm-row">
          <span class="norm-label">suppress {suppressLabel}</span>
          <input class="norm-slider" type="range" min="0" max="1" step="0.01"
            bind:value={suppressLoud} aria-label="Suppress amount" />
          <span class="norm-label cutoff-lbl">{suppressCutLbl}</span>
          <input class="norm-slider cutoff-slider" type="range" min="0" max="1" step="0.01"
            bind:value={suppressCutoff} aria-label="Suppress cutoff" />
        </div>
        <div class="norm-row">
          <span class="norm-label">boost {boostLabel}</span>
          <input class="norm-slider" type="range" min="0" max="1" step="0.01"
            bind:value={boostQuiet} aria-label="Boost amount" />
          <span class="norm-label cutoff-lbl">{boostCutLbl}</span>
          <input class="norm-slider cutoff-slider" type="range" min="0" max="1" step="0.01"
            bind:value={boostCutoff} aria-label="Boost cutoff" />
        </div>
      </div>
    {/if}
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

  /* ── Volume row ── */
  .volume-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .vol-label {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: #555;
    min-width: 5.5ch;
    text-align: right;
    flex-shrink: 0;
  }

  .vol-slider {
    flex: 1;
    accent-color: #1a1a1a;
    cursor: pointer;
    height: 4px;
  }

  .auto-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: #555;
    cursor: pointer;
    flex-shrink: 0;
    user-select: none;
  }
  .auto-label input { cursor: pointer; accent-color: #1a1a1a; }

  .norm-label {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: #555;
    min-width: 7.5ch;
    text-align: right;
    flex-shrink: 0;
  }

  .norm-label.cutoff-lbl {
    min-width: 4ch;
    margin-left: 0.4rem;
  }

  .norm-slider {
    flex: 2;
    accent-color: #1a1a1a;
    cursor: pointer;
    height: 4px;
  }

  .norm-slider.cutoff-slider {
    flex: 1;
  }

  .norm-rows {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
  }

  .norm-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
