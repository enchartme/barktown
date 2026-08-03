<script module>
  import { ASSET_BASE } from '$lib/utils.js';

  const CSV_PATH = 'training-set-projection.csv';
  const GRID_SIZE = 12;
  const HIT_RADIUS = 8;
  const POINT_RADIUS = 2;

  /** @type {any[] | null} */
  let cachedPoints = null;
  /** @type {Promise<any[]> | null} */
  let pointsRequest = null;

  function assetUrl(path) {
    return `${ASSET_BASE}/${String(path ?? '').split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Resolve hover bounds against an exact parent-audio path. */
  function previewSource(point, resolvedAudioPath) {
    if (!resolvedAudioPath) return null;

    if (Number.isFinite(point.annotationStart) && Number.isFinite(point.annotationEnd)) {
      return {
        path: resolvedAudioPath,
        start: point.annotationStart,
        end: point.annotationEnd,
      };
    }

    // Legacy fallback for projections without explicit annotation bounds.
    const match = /_(\d+)-(\d+)(\.[^./]+)$/.exec(point.sourceFragment ?? '');
    if (!match) {
      return {
        path: resolvedAudioPath,
        start: point.recordingStart,
        end: point.recordingEnd,
      };
    }
    return {
      path: resolvedAudioPath,
      start: Number(match[1]) / 1000,
      end: Number(match[2]) / 1000,
    };
  }

  /** Parse one RFC 4180-style row without adding a CSV dependency. */
  function parseCsvLine(line) {
    const cells = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        cells.push(value);
        value = '';
      } else {
        value += char;
      }
    }
    cells.push(value);
    return cells;
  }

  function optionalNumber(value) {
    if (value == null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function loadProjectionPoints() {
    if (cachedPoints) return cachedPoints;
    if (pointsRequest) return pointsRequest;

    pointsRequest = fetch(`${ASSET_BASE}/${CSV_PATH}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const lines = text.split(/\r?\n/);
        const headers = parseCsvLine(lines.shift() ?? '');
        const column = Object.fromEntries(headers.map((name, index) => [name, index]));
        const required = [
          'embedding_id', 'source_fragment', 'original_30s_recording',
          'original_recording_audio', 'window_start_s', 'window_end_s',
          'recording_window_start_s', 'recording_window_end_s', 'label',
          'umap_x', 'umap_y',
        ];
        const missing = required.filter((name) => column[name] == null);
        if (missing.length) throw new Error(`Missing CSV column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);

        const points = [];
        for (const line of lines) {
          if (!line) continue;
          const row = parseCsvLine(line);
          const x = Number(row[column.umap_x]);
          const y = Number(row[column.umap_y]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          points.push({
            embeddingId: row[column.embedding_id],
            sourceFragment: row[column.source_fragment],
            originalRecording: row[column.original_30s_recording],
            originalAudio: row[column.original_recording_audio],
            windowStart: Number(row[column.window_start_s]),
            windowEnd: Number(row[column.window_end_s]),
            recordingStart: Number(row[column.recording_window_start_s]),
            recordingEnd: Number(row[column.recording_window_end_s]),
            annotationStart: optionalNumber(row[column.annotation_start_s]),
            annotationEnd: optionalNumber(row[column.annotation_end_s]),
            label: row[column.label],
            trainOrValidation: row[column.train_or_validation],
            classifierScore: optionalNumber(row[column.classifier_score]),
            classifierError: optionalNumber(row[column.classifier_error]),
            knnLabelDisagreement: optionalNumber(row[column.knn_label_disagreement]),
            knnBinaryDisagreement: optionalNumber(row[column.knn_binary_disagreement]),
            knnMeanDistance: optionalNumber(row[column.knn_mean_distance]),
            labelCentroidDistance: optionalNumber(row[column.label_centroid_distance]),
            nearestDistance: optionalNumber(row[column.nearest_distance]),
            suspicionScore: optionalNumber(row[column.suspicion_score]),
            suspicionRank: optionalNumber(row[column.suspicion_rank]),
            x,
            y,
          });
        }
        if (!points.length) throw new Error('The CSV contains no plottable UMAP coordinates.');
        cachedPoints = points;
        return points;
      })
      .catch((error) => {
        pointsRequest = null;
        throw error;
      });

    return pointsRequest;
  }
</script>

<script>
  import { onMount } from 'svelte';
  import { sampleLabelColor } from '$lib/sample-labels.js';

  /** @type {{ samples?: any[], activeLabel?: string|null, onopen?: (point: any) => Promise<string | void> | string | void, onwindowcounts?: (counts: Map<string, number>) => void }} */
  let { samples = [], activeLabel = null, onopen = () => {}, onwindowcounts = () => {} } = $props();

  /** @type {HTMLCanvasElement | null} */
  let canvas = $state(null);
  /** @type {HTMLDivElement | null} */
  let plotWrap = $state(null);
  /** @type {any[]} */
  let points = $state([]);
  let loading = $state(true);
  let error = $state('');
  let interactionError = $state('');
  /** @type {any | null} */
  let hovered = $state(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let plotWidth = 0;
  let plotHeight = 0;

  /** @type {Map<string, any[]>} */
  let hitGrid = new Map();
  /** @type {HTMLAudioElement | null} */
  let previewAudio = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewDelay = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewStop = null;
  let previewToken = 0;

  const sampleAudioById = $derived.by(() => new Map(
    samples.map((sample) => [sample.id, sample.audioPath]),
  ));

  $effect(() => {
    const node = plotWrap;
    if (!node) return;
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    requestAnimationFrame(draw);
    return () => observer.disconnect();
  });

  $effect(() => {
    // Redraw only when the hovered identity changes; pointer movement within
    // the same dot merely repositions the HTML tooltip. Table-row focus also
    // redraws without changing the projection domain or point positions.
    const hoverId = hovered?.embeddingId;
    const filterLabel = activeLabel;
    if (!plotWrap || !points.length) return;
    const frame = requestAnimationFrame(() => {
      void hoverId;
      void filterLabel;
      draw();
    });
    return () => cancelAnimationFrame(frame);
  });

  function stopPreview() {
    previewToken++;
    if (previewDelay) clearTimeout(previewDelay);
    if (previewStop) clearTimeout(previewStop);
    previewDelay = null;
    previewStop = null;
    if (previewAudio) previewAudio.pause();
  }

  function schedulePreview(point) {
    stopPreview();
    if (!point?.sourceFragment) return;
    const token = previewToken;
    previewDelay = setTimeout(() => playPreview(point, token), 120);
  }

  function playPreview(point, token) {
    if (!previewAudio || token !== previewToken || hovered?.embeddingId !== point.embeddingId) return;
    const audioPath = point.originalAudio || sampleAudioById.get(point.originalRecording);
    const preview = previewSource(point, audioPath);
    if (!preview || !Number.isFinite(preview.start) || !Number.isFinite(preview.end)) return;
    const src = assetUrl(preview.path);

    const seekAndPlay = async () => {
      if (!previewAudio || token !== previewToken || hovered?.embeddingId !== point.embeddingId) return;
      const start = Math.max(0, preview.start);
      const end = Math.max(start, preview.end);
      previewAudio.currentTime = Math.min(start, previewAudio.duration || start);
      try {
        await previewAudio.play();
        previewStop = setTimeout(() => {
          if (token === previewToken) previewAudio?.pause();
        }, Math.max(80, (end - start) * 1000));
      } catch {
        // Browsers can require one click before allowing hover-initiated audio.
      }
    };

    if (previewAudio.src !== src) {
      previewAudio.src = src;
      previewAudio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      previewAudio.load();
    } else if (previewAudio.readyState >= 1) {
      seekAndPlay();
    } else {
      previewAudio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
    }
  }

  function gridKey(x, y) {
    return `${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`;
  }

  function draw() {
    if (!canvas || !plotWrap || !points.length) return;
    const rect = plotWrap.getBoundingClientRect();
    plotWidth = Math.max(1, rect.width);
    plotHeight = Math.max(1, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(plotWidth * dpr);
    canvas.height = Math.round(plotHeight * dpr);
    canvas.style.width = `${plotWidth}px`;
    canvas.style.height = `${plotHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, plotWidth, plotHeight);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const xPad = Math.max((maxX - minX) * 0.025, 0.01);
    const yPad = Math.max((maxY - minY) * 0.025, 0.01);
    minX -= xPad; maxX += xPad; minY -= yPad; maxY += yPad;
    const innerPad = 8;
    const innerW = Math.max(1, plotWidth - innerPad * 2);
    const innerH = Math.max(1, plotHeight - innerPad * 2);

    hitGrid = new Map();
    for (const point of points) {
      const sx = innerPad + ((point.x - minX) / (maxX - minX || 1)) * innerW;
      const sy = innerPad + (1 - (point.y - minY) / (maxY - minY || 1)) * innerH;
      point.sx = sx;
      point.sy = sy;
      const key = gridKey(sx, sy);
      const bucket = hitGrid.get(key) ?? [];
      bucket.push(point);
      hitGrid.set(key, bucket);

      ctx.beginPath();
      ctx.arc(sx, sy, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = sampleLabelColor(point.label);
      ctx.globalAlpha = activeLabel && point.label !== activeLabel ? 0.16 : 1;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hovered) {
      // Paint the active dot again, last, so it rises above dense neighbours.
      ctx.beginPath();
      ctx.arc(hovered.sx, hovered.sy, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hovered.sx, hovered.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = sampleLabelColor(hovered.label);
      ctx.globalAlpha = activeLabel && hovered.label !== activeLabel ? 0.35 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function metric(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
  }

  function percentage(value) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
  }

  function nearestPoint(x, y) {
    const gx = Math.floor(x / GRID_SIZE);
    const gy = Math.floor(y / GRID_SIZE);
    let nearest = null;
    let nearestDistanceSq = HIT_RADIUS * HIT_RADIUS;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const point of hitGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const distanceSq = (point.sx - x) ** 2 + (point.sy - y) ** 2;
          if (distanceSq <= nearestDistanceSq) {
            nearest = point;
            nearestDistanceSq = distanceSq;
          }
        }
      }
    }
    return nearest;
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerMove(event) {
    if (!canvas) return;
    const { x, y } = pointerPosition(event);
    const next = nearestPoint(x, y);
    tooltipX = Math.min(Math.max(8, x + 12), Math.max(8, plotWidth - 304));
    tooltipY = Math.min(Math.max(8, y + 12), Math.max(8, plotHeight - 180));
    if (next?.embeddingId === hovered?.embeddingId) return;
    hovered = next;
    interactionError = '';
    if (next) schedulePreview(next);
    else stopPreview();
  }

  function handlePointerLeave() {
    hovered = null;
    stopPreview();
  }

  async function handleClick(event) {
    if (!canvas) return;
    const { x, y } = pointerPosition(event);
    const point = nearestPoint(x, y);
    if (!point) return;
    stopPreview();
    const result = await onopen(point);
    if (typeof result === 'string') interactionError = result;
  }

  onMount(() => {
    previewAudio = new Audio();
    previewAudio.preload = 'metadata';

    loadProjectionPoints()
      .then((loaded) => {
        points = loaded;
        const counts = new Map();
        for (const point of loaded) counts.set(point.label, (counts.get(point.label) ?? 0) + 1);
        onwindowcounts(counts);
        loading = false;
        requestAnimationFrame(draw);
      })
      .catch((cause) => {
        error = cause?.message ?? 'Failed to load projection CSV.';
        loading = false;
      });

    return () => {
      stopPreview();
      if (previewAudio) {
        previewAudio.removeAttribute('src');
        previewAudio.load();
      }
      previewAudio = null;
    };
  });
</script>

<section class="projection" aria-label="Embedding projection">
  <div class="projection-heading">
    <p>UMAP view of the exported embedding windows. Hover a window to hear its labelled audio; click to open the parent recording at that moment.</p>
    {#if points.length}<span class="point-count">{points.length.toLocaleString()} windows</span>{/if}
  </div>

  {#if loading}
    <div class="plot-message">Loading projection…</div>
  {:else if error}
    <div class="plot-message plot-error">Could not load the projection: {error}</div>
  {:else}
    <div class="plot-wrap" bind:this={plotWrap}>
      <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
      <canvas
        bind:this={canvas}
        onpointermove={handlePointerMove}
        onpointerleave={handlePointerLeave}
        onclick={handleClick}
        role="img"
        aria-label={`UMAP scatterplot with ${points.length} embedding windows, coloured by label`}
      ></canvas>
      {#if hovered}
        <div class="plot-tooltip" style:left={`${tooltipX}px`} style:top={`${tooltipY}px`}>
          <span class="tooltip-label" style:background={sampleLabelColor(hovered.label)}>{hovered.label}</span>
          <strong>{hovered.originalRecording}</strong>
          <span>{hovered.recordingStart.toFixed(2)}–{hovered.recordingEnd.toFixed(2)} s in parent</span>
          <div class="quality-grid">
            <span class="quality-title">Quality criteria</span>
            <span><small>Split</small><b>{hovered.trainOrValidation || '—'}</b></span>
            <span><small>Classifier score</small><b>{metric(hovered.classifierScore)}</b></span>
            <span><small>Classifier error</small><b>{metric(hovered.classifierError)}</b></span>
            <span><small>KNN label mismatch</small><b>{percentage(hovered.knnLabelDisagreement)}</b></span>
            <span><small>KNN binary mismatch</small><b>{percentage(hovered.knnBinaryDisagreement)}</b></span>
            <span><small>KNN mean distance</small><b>{metric(hovered.knnMeanDistance, 4)}</b></span>
            <span><small>Centroid distance</small><b>{metric(hovered.labelCentroidDistance, 4)}</b></span>
            <span><small>Nearest distance</small><b>{metric(hovered.nearestDistance, 4)}</b></span>
            <span><small>Suspicion score</small><b>{metric(hovered.suspicionScore)}</b></span>
            <span><small>Suspicion rank</small><b>{Number.isFinite(hovered.suspicionRank) ? `#${hovered.suspicionRank}` : '—'}</b></span>
          </div>
        </div>
      {/if}
    </div>

    {#if interactionError}<div class="plot-message plot-error">{interactionError}</div>{/if}
  {/if}
</section>

<style>
  .projection {
    margin-top: 0.75rem;
  }
  .projection-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.7rem;
  }
  .projection-heading p { margin: 0; color: #777; font-size: 0.78rem; line-height: 1.45; }
  .point-count { color: #999; font-size: 0.72rem; white-space: nowrap; padding-top: 0.15rem; }
  .plot-wrap {
    position: relative;
    width: 100%;
    height: clamp(360px, 58vh, 620px);
    overflow: hidden;
    border: 1px solid #deded8;
    border-radius: 6px;
    background: #fff;
  }
  canvas {
    display: block;
    cursor: crosshair;
    touch-action: manipulation;
  }
  .plot-tooltip {
    position: absolute;
    z-index: 2;
    width: 292px;
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid rgba(0, 0, 0, 0.16);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    pointer-events: none;
    font-size: 0.7rem;
  }
  .plot-tooltip strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.72rem; }
  .tooltip-label {
    align-self: flex-start;
    padding: 0.08rem 0.38rem;
    border-radius: 8px;
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.58rem;
  }
  .quality-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 0.65rem;
    margin-top: 0.25rem;
    padding-top: 0.4rem;
    border-top: 1px solid #e8e8e3;
  }
  .quality-grid span { display: flex; align-items: baseline; justify-content: space-between; gap: 0.35rem; min-width: 0; }
  .quality-grid .quality-title {
    grid-column: 1 / -1;
    display: block;
    color: #777;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .quality-grid small { color: #888; font-size: 0.6rem; white-space: nowrap; }
  .quality-grid b { font-size: 0.64rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .plot-message {
    min-height: 180px;
    display: grid;
    place-items: center;
    border: 1px solid #e0e0dc;
    border-radius: 6px;
    color: #999;
    background: #fff;
    font-size: 0.8rem;
  }
  .plot-error { color: #c0392b; min-height: auto; padding: 0.8rem; margin-top: 0.6rem; }

  @media (max-width: 760px) {
    .projection-heading { flex-direction: column; gap: 0.25rem; }
    .plot-wrap { height: 420px; }
  }
</style>
