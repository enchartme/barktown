<script>
  import { barcodeLines, barcodeWidth, hitLoudnessColor } from '$lib/report-barcode.js';
  import { formatDuration } from '$lib/utils.js';

  let { durationSec = 0, metadata = null } = $props();

  /** @type {HTMLCanvasElement | undefined} */
  let canvas = $state();
  const width = $derived(barcodeWidth(durationSec));
  const lines = $derived(barcodeLines(metadata, width));
  const hitCount = $derived(Array.isArray(metadata?.timestamps) ? metadata.timestamps.length : 0);

  $effect(() => {
    const element = canvas;
    const cssWidth = width;
    const currentLines = lines;
    if (!element) return;

    const cssHeight = Math.max(1, element.getBoundingClientRect().height);
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(cssWidth * dpr));
    element.height = Math.max(1, Math.round(cssHeight * dpr));

    const context = element.getContext('2d');
    if (!context) return;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (const line of currentLines) {
      context.fillStyle = hitLoudnessColor(line.loudness);
      context.fillRect(line.x, 0, 1, cssHeight);
    }
  });
</script>

<span
  class="barcode-figure"
  role="img"
  aria-label={`${hitCount} detected ${hitCount === 1 ? 'bark' : 'barks'} over ${formatDuration(durationSec)}`}
>
  <canvas
    bind:this={canvas}
    class="barcode"
    style="width: {width}px"
    aria-hidden="true"
  ></canvas>
</span>

<style>
  .barcode-figure {
    display: inline-block;
    flex: 0 0 auto;
    height: 1em;
    line-height: 0;
    vertical-align: -0.16em;
  }

  .barcode {
    display: block;
    height: 100%;
    border-block: 1px solid rgb(26 26 26 / 8%);
    background: rgb(26 26 26 / 4%);
  }
</style>
