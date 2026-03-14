<script>
  import { downsampleWaveform, waveformNorm, ASSET_BASE } from '$lib/utils.js';

  /**
   * @type {{
   *   waveformPath: string | null;
   *   width: number;
   *   height: number;
   * }}
   */
  let { waveformPath, width, height } = $props();

  // ── Module-level waveform cache ────────────────────────────────────────────
  // Shared across all WaveformPreview instances so we never fetch the same
  // file twice per page session.
  /** @type {Map<string, { mins: number[], maxs: number[], norm: number } | 'error'>} */
  const waveformCache = new Map();

  // ── Local state ────────────────────────────────────────────────────────────
  let waveData = $state(/** @type {{ mins: number[], maxs: number[], norm: number } | null} */ (null));
  let loading  = $state(false);

  // ── Fetch waveform when path changes ──────────────────────────────────────
  $effect(() => {
    if (!waveformPath) return;

    const path = waveformPath; // capture for closure

    // Serve from cache if available
    const cached = waveformCache.get(path);
    if (cached && cached !== 'error') {
      waveData = cached;
      return;
    }
    if (cached === 'error') return;

    loading = true;
    fetch(`${ASSET_BASE}/${path}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const norm   = waveformNorm(json.bits ?? 8);
        const target = Math.floor(width / 2); // one bar per 2px
        const ds     = downsampleWaveform(json.data, Math.max(10, target));
        const result = { mins: ds.mins, maxs: ds.maxs, norm };
        waveformCache.set(path, result);
        // Only apply if still showing the same path
        if (waveformPath === path) waveData = result;
      })
      .catch(() => {
        waveformCache.set(path, 'error');
      })
      .finally(() => {
        loading = false;
      });
  });

  // ── Build SVG bar descriptors ─────────────────────────────────────────────
  // Recalculated whenever waveData or dimensions change.
  const bars = $derived(() => {
    if (!waveData) return [];
    const { mins, maxs, norm } = waveData;
    const count   = mins.length;
    if (count === 0) return [];

    const barW    = width / count;
    const centerY = height / 2;

    return mins.map((lo, i) => {
      const hi       = maxs[i];
      // Normalise to [-1, 1] then map to pixels
      const yTop     = centerY - (hi / norm) * centerY;
      const yBottom  = centerY - (lo / norm) * centerY;    // lo is negative → goes below center
      const barH     = Math.max(1, yBottom - yTop);
      return {
        x: i * barW,
        y: yTop,
        w: Math.max(1, barW - 0.5),
        h: barH,
      };
    });
  });
</script>

<svg
  class="waveform-preview"
  {width}
  {height}
  aria-hidden="true"
  style="display: block; overflow: visible;"
>
  {#if !waveData && loading}
    <!-- Loading placeholder: flat centre line -->
    <line
      x1="0"    y1={height / 2}
      x2={width} y2={height / 2}
      stroke="#aac4f0"
      stroke-width="1"
    />
  {:else if waveData}
    {#each bars() as bar}
      <rect
        x={bar.x}
        y={bar.y}
        width={bar.w}
        height={bar.h}
        fill="#4a7cdc"
        opacity="0.7"
      />
    {/each}
  {/if}
</svg>

<style>
  .waveform-preview {
    flex-shrink: 0;
  }
</style>
