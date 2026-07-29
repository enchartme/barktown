<script>
  import { ASSET_BASE, downsampleWaveform, waveformNorm, formatDuration, formatSampleDatetime } from '$lib/utils.js';

  // The barktown-ingest CRUD API, reached directly over Tailscale — same
  // no-auth trust model as GoblinPiStatus.svelte. Audio/waveform bytes are
  // still served from the public S3 bucket (ASSET_BASE); only sample/
  // annotation metadata goes through this API.
  //
  // masmopi (Pi 5, ingestion + API host), NOT goblinpi (Pi 3B+, mic capture
  // only — goblinpi just uploads to masmopi and has no ingest API of its own).
  const API_BASE = 'https://masmopi.tail523149.ts.net';

  const LABELS     = ['bark', 'yap', 'background', 'wind', 'homestead', 'traffic', 'gunshot', 'wrongdog'];
  const ALL_LABELS = ['all', ...LABELS, 'unmarked'];
  const LABEL_COLORS = {
    bark: '#e74c3c', yap: '#e67e22', background: '#27ae60', wind: '#2980b9',
    homestead: '#8e44ad', gunshot: '#333333', traffic: '#7f8c8d', wrongdog: '#8a8c00'
  };
  const NOTE_COLOR = '#f1c40f';

  // Clip guidelines from barktown-goblin/docs/training-data.md -- kept in
  // sync manually, shown alongside the counts in the corpus summary.
  const LABEL_GUIDELINES = {
    bark:       { duration: '1\u20133 s', occupancy: '50\u201380 %' },
    yap:        { duration: '1\u20133 s', occupancy: '50\u201380 %' },
    wrongdog:   { duration: '1\u20133 s', occupancy: '50\u201380 %' },
    gunshot:    { duration: '1\u20133 s', occupancy: '50\u201380 %' },
    background: { duration: '3\u20135 s', occupancy: 'n/a' },
    wind:       { duration: '3\u20135 s', occupancy: 'n/a' },
    traffic:    { duration: '3\u20135 s', occupancy: 'n/a' },
    homestead:  { duration: '3\u20135 s', occupancy: 'n/a' }
  };

  // Virtual SVG dimensions for the waveform editor (viewBox units).
  const VW = 1000;
  const VH = 140;
  const BARS = 500;
  // Drags shorter than this (in seconds) are treated as a plain seek click
  // rather than a fragment brush-selection.
  const BRUSH_MIN_SEC = 0.05;

  function fragmentColor(label) {
    return LABEL_COLORS[label] ?? '#4a7cdc';
  }

  // ── Sample list state ──────────────────────────────────────────────────────
  /** @type {any[]} */
  let samples        = $state([]);
  let samplesLoading  = $state(false);
  let samplesError    = $state('');
  let filterLabel     = $state('all');

  const filteredSamples = $derived(
    filterLabel === 'all'      ? samples :
    filterLabel === 'unmarked' ? samples.filter(s => (sampleFragments.get(s.id) ?? []).length === 0) :
    samples.filter(s => s.label === filterLabel)
  );

  // Corpus-wide counts per label, for the summary shown when nothing is
  // selected -- lets you check progress against the benchmarks in
  // docs/training-data.md (30–50 min viable, 100+ better, per class).
  const sampleCountsByLabel = $derived.by(() => {
    const counts = new Map();
    for (const s of samples) counts.set(s.label, (counts.get(s.label) ?? 0) + 1);
    return counts;
  });
  const fragmentCountsByLabel = $derived.by(() => {
    const counts = new Map();
    for (const list of sampleFragments.values()) {
      for (const f of list) counts.set(f.label, (counts.get(f.label) ?? 0) + 1);
    }
    return counts;
  });

  // Fragment-duration histogram per label, binned in 0.5s buckets from 0s up
  // to 5s, plus an overflow bucket for anything longer. Shown as a tiny bar
  // chart (Datatype font) next to each label's counts.
  const DURATION_BIN_SIZE  = 0.5;
  const DURATION_BIN_COUNT = 10; // 0-0.5, 0.5-1, ... 4.5-5
  function durationBinIndex(durationSec) {
    if (durationSec >= DURATION_BIN_COUNT * DURATION_BIN_SIZE) return DURATION_BIN_COUNT;
    return Math.max(0, Math.floor(durationSec / DURATION_BIN_SIZE));
  }
  const fragmentDurationBinsByLabel = $derived.by(() => {
    const bins = new Map();
    for (const list of sampleFragments.values()) {
      for (const f of list) {
        const arr = bins.get(f.label) ?? new Array(DURATION_BIN_COUNT + 1).fill(0);
        arr[durationBinIndex(f.durationSec)]++;
        bins.set(f.label, arr);
      }
    }
    return bins;
  });
  // Shared domain across every label's chart: 0 to the largest bin count
  // seen anywhere, so bar heights are comparable row to row.
  const fragmentDurationGlobalMax = $derived.by(() => {
    let max = 0;
    for (const arr of fragmentDurationBinsByLabel.values()) {
      for (const v of arr) if (v > max) max = v;
    }
    return max;
  });
  function fragmentDurationChart(lbl) {
    const bins = fragmentDurationBinsByLabel.get(lbl) ?? new Array(DURATION_BIN_COUNT + 1).fill(0);
    const max  = fragmentDurationGlobalMax;
    const scaled = max > 0 ? bins.map(v => Math.round((v / max) * 100)) : bins.map(() => 0);
    return `{b:${scaled.join(',')}}`;
  }
  function fragmentDurationTitle(lbl) {
    const bins = fragmentDurationBinsByLabel.get(lbl) ?? new Array(DURATION_BIN_COUNT + 1).fill(0);
    return bins
      .map((count, i) => {
        const label = i < DURATION_BIN_COUNT ? `${(i * DURATION_BIN_SIZE).toFixed(1)}-${((i + 1) * DURATION_BIN_SIZE).toFixed(1)}s` : '>5s';
        return `${label}: ${count}`;
      })
      .join('\n');
  }

  async function fetchSamples() {
    samplesLoading = true;
    samplesError   = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      samples = [...data].sort((a, b) => b.datetimeLocal.localeCompare(a.datetimeLocal));
    } catch (e) {
      samplesError = e?.name === 'TimeoutError' ? 'Timed out — on Tailscale?' : (e?.message ?? 'Failed to load');
    } finally {
      samplesLoading = false;
    }
  }

  /** Best-effort bulk snapshot for sidebar decorations: each sample's
   * sample-wide note text, and its fragment-coverage strip (start/end as
   * fractions of the sample's duration). Refreshed on load / reload and kept
   * current via local mutation syncs (setSampleNotePreview /
   * syncSampleFragmentsFromAnnotations) so the sidebar doesn't go stale while
   * you work on the currently selected sample. */
  async function fetchSidebarAnnotationSummary() {
    try {
      const res = await fetch(`${API_BASE}/api/annotations`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const rows = await res.json();
      const notes = new Map();
      const frags = new Map();
      for (const r of rows) {
        if (r.source === 'note') {
          if (r.startSec === 0 && r.endSec === 0) notes.set(r.sampleId, r.label);
          continue;
        }
        const dur = r.sampleDurationSec;
        if (!dur) continue;
        const list = frags.get(r.sampleId) ?? [];
        list.push({ startFrac: r.startSec / dur, endFrac: r.endSec / dur, durationSec: r.endSec - r.startSec, label: r.label });
        frags.set(r.sampleId, list);
      }
      sampleNotes     = notes;
      sampleFragments = frags;
    } catch (_e) {
      // non-critical — sidebar decorations just won't show until the next reload
    }
  }

  function reloadSidebar() {
    fetchSamples();
    fetchSidebarAnnotationSummary();
  }

  /** Keep the sidebar's bulk-fetched note-preview map in sync with local
   * create/edit/delete, so a sample's preview doesn't go stale or vanish
   * once you navigate away from it (without needing a manual reload). */
  function setSampleNotePreview(sampleId, label) {
    const map = new Map(sampleNotes);
    if (label == null) map.delete(sampleId);
    else map.set(sampleId, label);
    sampleNotes = map;
  }

  /** Keep the sidebar's fragment-coverage strip for the currently selected
   * sample in sync with local fragment mutations, same idea as
   * setSampleNotePreview. */
  function syncSampleFragmentsFromAnnotations() {
    if (!selected?.durationSec) return;
    const dur = selected.durationSec;
    const frags = annotations
      .filter(a => a.source !== 'note')
      .map(a => ({ startFrac: a.startSec / dur, endFrac: a.endSec / dur, durationSec: a.endSec - a.startSec, label: a.label }));
    const map = new Map(sampleFragments);
    map.set(selected.id, frags);
    sampleFragments = map;
  }

  // ── Player / selection state ───────────────────────────────────────────────
  /** @type {any} */
  let selected       = $state(null);
  /** @type {HTMLAudioElement|null} */
  let audioEl        = $state(null);
  let isPlaying       = $state(false);
  let currentTime     = $state(0);
  let duration        = $state(0);
  /** @type {{ mins: number[], maxs: number[], norm: number }|null} */
  let waveData        = $state(null);
  let waveLoading      = $state(false);
  /** @type {Map<string, any>} */
  const waveCache      = new Map();
  /** @type {SVGSVGElement|null} */
  let waveSvgEl        = $state(null);

  // ── Annotations (fragments + time-coded notes) ─────────────────────────────
  /** @type {any[]} */
  let annotations         = $state([]);
  let annotationsLoading  = $state(false);
  let annotationsError    = $state('');
  /** @type {number|null} */
  let selectedAnnId       = $state(null);
  let editLabel           = $state(''); // buffer for inline-editing a note's text
  let editingNoteId       = $state(/** @type {number|null} */ (null)); // note row currently in edit mode
  let addingSampleNote    = $state(false); // drafting a new sample-wide note (unsaved)
  let newSampleNoteText   = $state('');
  let mutationError       = $state('');

  // sampleId -> sample-wide note text, for the sidebar preview. Best-effort
  // snapshot from GET /api/annotations; the currently selected sample's own
  // note is instead read live from `annotations` (see selectedSampleWideNote).
  /** @type {Map<string, string>} */
  let sampleNotes = $state(new Map());

  // sampleId -> fragment list ({startFrac, endFrac, label}), for the sidebar's
  // mini coverage strip. Same bulk-snapshot-plus-local-sync approach as
  // sampleNotes above.
  /** @type {Map<string, Array<{startFrac:number, endFrac:number, label:string}>>} */
  let sampleFragments = $state(new Map());

  // ── Brush / drag state ─────────────────────────────────────────────────────
  /** @type {'brush'|'resize-start'|'resize-end'|'move'|null} */
  let dragMode        = $state(null);
  let dragAnnId       = $state(/** @type {number|null} */ (null));
  let dragStartSec    = $state(0);
  let dragCurrentSec  = $state(0);
  let dragOrigStart   = $state(0);
  let dragOrigEnd     = $state(0);
  /** @type {{ startSec: number, endSec: number }|null} */
  let pending         = $state(null);
  let pendingLabel    = $state(LABELS[0]);
  let pendingNoteText = $state('');

  // ── Sample-level mutation state ────────────────────────────────────────────
  let deleteConfirm = $state(false);
  let deleteBusy    = $state(false);
  let renameBusy    = $state(false);
  let renameError   = $state('');

  const playheadX = $derived(duration > 0 ? (currentTime / duration) * VW : 0);

  function secToX(sec) {
    return duration > 0 ? (sec / duration) * VW : 0;
  }

  const bars = $derived(() => {
    if (!waveData) return [];
    const { mins, maxs, norm } = waveData;
    const count = mins.length;
    if (!count) return [];
    const barW = VW / count;
    const cy   = VH / 2;
    let visualPeak = 0;
    for (let i = 0; i < count; i++) {
      const v = maxs[i] / norm;
      if (v > visualPeak) visualPeak = v;
    }
    const yScale = visualPeak > 0 ? 1 / visualPeak : 1;
    return mins.map((lo, i) => {
      const hi     = maxs[i];
      const yTop   = cy - (hi / norm) * yScale * cy;
      const yBot   = cy - (lo / norm) * yScale * cy;
      const barSec = (i / count) * duration;
      return {
        x: i * barW, y: yTop, w: Math.max(0.5, barW - 0.5), h: Math.max(1, yBot - yTop),
        played: barSec <= currentTime,
      };
    });
  });

  /** Live preview of an annotation's bounds while it's being dragged. */
  function previewBounds(ann) {
    if (!(dragMode && dragAnnId === ann.id)) return { startSec: ann.startSec, endSec: ann.endSec };
    let s = ann.startSec, en = ann.endSec;
    if (dragMode === 'resize-start') s  = Math.min(dragCurrentSec, ann.endSec - 0.02);
    if (dragMode === 'resize-end')   en = Math.max(dragCurrentSec, ann.startSec + 0.02);
    if (dragMode === 'move') {
      const delta = dragCurrentSec - dragStartSec;
      const span  = dragOrigEnd - dragOrigStart;
      s  = Math.max(0, Math.min(Math.max(0, duration - span), dragOrigStart + delta));
      en = s + span;
    }
    return { startSec: Math.max(0, s), endSec: Math.min(duration, en) };
  }

  const renderFragments = $derived(
    annotations.filter(a => a.source !== 'note').map(a => ({ ...a, ...previewBounds(a) }))
  );
  // Sample-wide notes (startSec === endSec === 0) have no meaningful position
  // on the timeline, so they're only shown in the Notes panel, not marked here.
  const renderNotes = $derived(annotations.filter(a => a.source === 'note' && !isSampleWideNote(a)));

  // A note is "sample-wide" if its time code is 0ms — no separate flag in
  // the data model, just a convention enforced client-side.
  function isSampleWideNote(a) {
    return a.source === 'note' && a.startSec === 0 && a.endSec === 0;
  }
  const sortedNotes = $derived(
    annotations.filter(a => a.source === 'note').slice().sort((a, b) => a.startSec - b.startSec)
  );
  const hasSampleWideNote = $derived(annotations.some(isSampleWideNote));
  const selectedSampleWideNote = $derived(annotations.find(isSampleWideNote) ?? null);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadWaveform(path) {
    if (!path) { waveData = null; return; }
    const cached = waveCache.get(path);
    if (cached === 'error') { waveData = null; return; }
    if (cached) { waveData = cached; return; }
    waveLoading = true;
    try {
      const res = await fetch(`${ASSET_BASE}/${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error();
      const json  = await res.json();
      const norm  = waveformNorm(json.bits ?? 8);
      const ds    = downsampleWaveform(json.data, BARS);
      const result = { mins: ds.mins, maxs: ds.maxs, norm };
      waveCache.set(path, result);
      waveData = result;
    } catch (_e) {
      waveCache.set(path, 'error');
      waveData = null;
    } finally {
      waveLoading = false;
    }
  }

  async function fetchAnnotations(sampleId) {
    annotationsLoading = true;
    annotationsError   = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(sampleId)}/annotations`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      annotations = await res.json();
      syncSampleFragmentsFromAnnotations();
    } catch (e) {
      annotationsError = e?.message ?? 'Failed to load annotations';
      annotations = [];
    } finally {
      annotationsLoading = false;
    }
  }

  async function selectSample(sample) {
    if (audioEl && isPlaying) audioEl.pause();
    isPlaying      = false;
    currentTime    = 0;
    duration       = sample.durationSec || 0;
    selected       = sample;
    selectedAnnId  = null;
    editingNoteId  = null;
    addingSampleNote = false;
    pending        = null;
    dragMode       = null;
    mutationError  = '';
    waveData       = null;
    // Clear immediately, not just on fetch completion -- otherwise
    // selectedSampleWideNote briefly reflects the *previous* sample's
    // annotations (fetchAnnotations hasn't resolved yet) while `selected`
    // already points at the new one, flashing the wrong note in the sidebar.
    annotations    = [];
    await Promise.all([loadWaveform(sample.waveformPath), fetchAnnotations(sample.id)]);
  }

  /** Clicking the already-selected sample's row deselects it (back to the
   * corpus summary), rather than doing nothing. */
  function toggleSample(sample) {
    if (selected?.id === sample.id) deselectSample();
    else selectSample(sample);
  }

  function deselectSample() {
    if (audioEl && isPlaying) audioEl.pause();
    isPlaying        = false;
    currentTime      = 0;
    duration         = 0;
    selected         = null;
    selectedAnnId    = null;
    editingNoteId    = null;
    addingSampleNote = false;
    pending          = null;
    dragMode         = null;
    mutationError    = '';
    waveData         = null;
    annotations      = [];
  }

  /** Arrow up/down: move selection to the previous/next item in the
   * (possibly filtered) sidebar list. Reuses selectSample, which already
   * discards any unsaved pending fragment / in-progress note edit as part
   * of its normal cleanup. No wraparound past either end of the list. */
  function selectAdjacentSample(delta) {
    const list = filteredSamples;
    if (!list.length) return;
    if (!selected) {
      selectSample(delta > 0 ? list[0] : list[list.length - 1]);
      return;
    }
    const idx = list.findIndex(s => s.id === selected.id);
    if (idx === -1) {
      selectSample(delta > 0 ? list[0] : list[list.length - 1]);
      return;
    }
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    selectSample(list[nextIdx]);
  }

  function audioSrc(sample) {
    return `${ASSET_BASE}/${encodeURIComponent(sample.audioPath).replace(/%2F/g, '/')}`;
  }

  async function togglePlay() {
    if (!audioEl) return;
    if (isPlaying) audioEl.pause();
    else await audioEl.play().catch(() => {});
  }

  // ── Waveform pointer interaction ───────────────────────────────────────────

  function svgFraction(clientX) {
    if (!waveSvgEl) return 0;
    const rect = waveSvgEl.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function onWaveMouseDown(e) {
    if (!selected || !duration) return;
    const sec  = svgFraction(e.clientX) * duration;
    const role = e.target?.dataset?.role;
    const annId = e.target?.dataset?.annId ? Number(e.target.dataset.annId) : null;

    if ((role === 'handle-start' || role === 'handle-end') && annId != null) {
      const ann = annotations.find(a => a.id === annId);
      if (!ann) return;
      dragMode      = role === 'handle-start' ? 'resize-start' : 'resize-end';
      dragAnnId     = annId;
      dragOrigStart = ann.startSec;
      dragOrigEnd   = ann.endSec;
      dragCurrentSec = sec;
      selectedAnnId = annId;
    } else if (role === 'fragment-body' && annId != null) {
      const ann = annotations.find(a => a.id === annId);
      if (!ann) return;
      if (selectedAnnId === annId) {
        dragMode       = 'move';
        dragAnnId      = annId;
        dragOrigStart  = ann.startSec;
        dragOrigEnd    = ann.endSec;
        dragStartSec   = sec;
        dragCurrentSec = sec;
      } else {
        selectedAnnId = annId;
      }
    } else if (role === 'note-marker' && annId != null) {
      const ann = annotations.find(a => a.id === annId);
      if (ann) startEditNote(ann);
    } else {
      dragMode       = 'brush';
      dragStartSec   = sec;
      dragCurrentSec = sec;
      selectedAnnId  = null;
      pending        = null;
    }
  }

  function onWindowMouseMove(e) {
    if (!dragMode || !duration) return;
    dragCurrentSec = svgFraction(e.clientX) * duration;
  }

  function onWindowMouseUp() {
    if (!dragMode) return;
    const mode = dragMode;

    if (mode === 'brush') {
      const a = Math.min(dragStartSec, dragCurrentSec);
      const b = Math.max(dragStartSec, dragCurrentSec);
      dragMode = null;
      if (b - a < BRUSH_MIN_SEC) {
        if (audioEl) audioEl.currentTime = a;
      } else {
        pending         = { startSec: a, endSec: b };
        pendingLabel    = selected?.label ?? LABELS[0];
        pendingNoteText = '';
      }
      return;
    }

    // Compute the final bounds while dragMode is still set — previewBounds()
    // returns the *unchanged* original bounds once dragMode is cleared.
    const ann = annotations.find(a => a.id === dragAnnId);
    const bounds = ann ? previewBounds(ann) : null;
    dragMode = null;
    if (!ann || !bounds) return;
    commitAnnotationBounds(ann, bounds.startSec, bounds.endSec);
  }

  // ── Annotation mutations ────────────────────────────────────────────────────

  async function commitAnnotationBounds(ann, startSec, endSec) {
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/annotations/${ann.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startSec, endSec }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = annotations.map(a => a.id === ann.id ? data : a).sort((a, b) => a.startSec - b.startSec);
      syncSampleFragmentsFromAnnotations();
    } catch (e) {
      mutationError = e?.message ?? 'Failed to update annotation';
    }
  }

  async function commitFragment() {
    if (!pending || !selected) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(selected.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startSec: pending.startSec, endSec: pending.endSec, label: pendingLabel, source: 'manual' }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = [...annotations, data].sort((a, b) => a.startSec - b.startSec);
      syncSampleFragmentsFromAnnotations();
      pending = null;
    } catch (e) {
      mutationError = e?.message ?? 'Failed to add fragment';
    }
  }

  async function commitNote() {
    if (!pending || !selected || !pendingNoteText.trim()) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(selected.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSec: pending.startSec, endSec: pending.startSec,
          label: pendingNoteText.trim(), source: 'note',
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = [...annotations, data].sort((a, b) => a.startSec - b.startSec);
      pending         = null;
      pendingNoteText = '';
    } catch (e) {
      mutationError = e?.message ?? 'Failed to add note';
    }
  }

  function cancelPending() {
    pending         = null;
    pendingNoteText = '';
  }

  /** Svelte action: focus an input as soon as it's mounted (e.g. a freshly opened inline edit field). */
  function autofocusAction(node) {
    node.focus();
  }

  async function relabelSelected(newLabel) {
    const ann = annotations.find(a => a.id === selectedAnnId);
    if (!ann) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/annotations/${ann.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = annotations.map(a => a.id === ann.id ? data : a);
      syncSampleFragmentsFromAnnotations();
    } catch (e) {
      mutationError = e?.message ?? 'Failed to update annotation';
    }
  }

  // ── Note editing (inline, in the notes panel) ──────────────────────────────

  function startEditNote(ann) {
    selectedAnnId = ann.id;
    editingNoteId = ann.id;
    editLabel     = ann.label;
  }

  async function saveNoteLabel(annId, text) {
    const ann     = annotations.find(a => a.id === annId);
    editingNoteId = null;
    const trimmed = text.trim();
    if (!ann || !trimmed || trimmed === ann.label) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/annotations/${annId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: trimmed }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = annotations.map(a => a.id === annId ? data : a);
      if (isSampleWideNote(data)) setSampleNotePreview(data.sampleId, data.label);
    } catch (e) {
      mutationError = e?.message ?? 'Failed to update note';
    }
  }

  // ── Sample-wide note (time code 0ms) — no fragment/selection needed ───────

  function startSampleWideNote() {
    if (hasSampleWideNote || addingSampleNote || !selected) return;
    addingSampleNote  = true;
    newSampleNoteText = '';
  }

  function cancelSampleWideNoteDraft() {
    addingSampleNote  = false;
    newSampleNoteText = '';
  }

  async function commitSampleWideNote() {
    if (!addingSampleNote) return;
    const text = newSampleNoteText.trim();
    addingSampleNote = false;
    if (!text || !selected) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(selected.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startSec: 0, endSec: 0, label: text, source: 'note' }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      annotations = [...annotations, data].sort((a, b) => a.startSec - b.startSec);
      setSampleNotePreview(data.sampleId, data.label);
    } catch (e) {
      mutationError = e?.message ?? 'Failed to add sample note';
    }
  }

  // ── Deletion (any annotation, by id) ───────────────────────────────────────

  async function deleteAnnotationById(annId) {
    const ann = annotations.find(a => a.id === annId);
    if (!ann) return;
    mutationError = '';
    try {
      const res = await fetch(`${API_BASE}/api/annotations/${ann.id}`, {
        method: 'DELETE', signal: AbortSignal.timeout(8000),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      annotations = annotations.filter(a => a.id !== ann.id);
      if (selectedAnnId === ann.id) selectedAnnId = null;
      if (editingNoteId === ann.id) editingNoteId = null;
      if (isSampleWideNote(ann)) setSampleNotePreview(ann.sampleId, null);
      else syncSampleFragmentsFromAnnotations();
    } catch (e) {
      mutationError = e?.message ?? 'Failed to delete annotation';
    }
  }

  async function deleteSelectedAnnotation() {
    if (selectedAnnId != null) await deleteAnnotationById(selectedAnnId);
  }

  // ── Sample-level mutations ─────────────────────────────────────────────────

  async function confirmDeleteSample() {
    if (!selected) return;
    deleteBusy = true;
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(selected.id)}`, {
        method: 'DELETE', signal: AbortSignal.timeout(15000),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      samples       = samples.filter(s => s.id !== selected.id);
      selected      = null;
      deleteConfirm = false;
    } catch (e) {
      mutationError = e?.message ?? 'Failed to delete sample';
    } finally {
      deleteBusy = false;
    }
  }

  async function changeCategory(newLabel) {
    if (!selected || newLabel === selected.label) return;
    renameBusy  = true;
    renameError = '';
    try {
      const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      samples = samples.map(s => s.id === selected.id ? data : s);
      if (audioEl && isPlaying) audioEl.pause();
      isPlaying   = false;
      currentTime = 0;
      selected    = data;
      waveData    = null;
      await Promise.all([loadWaveform(data.waveformPath), fetchAnnotations(data.id)]);
    } catch (e) {
      renameError = e?.message ?? 'Failed to change category';
    } finally {
      renameBusy = false;
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  function handleKeydown(e) {
    const inField = e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || e.target?.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      if (pending) { pending = null; return; }
      if (selectedAnnId != null) { selectedAnnId = null; return; }
    }
    if (!inField && (e.key === 'Delete' || e.key === 'Backspace') && selectedAnnId != null) {
      e.preventDefault();
      deleteSelectedAnnotation();
    }
    if (!inField && e.key === 'Enter' && pending) {
      e.preventDefault();
      commitFragment();
    }
    if (!inField && e.key === ' ') {
      e.preventDefault();
      togglePlay();
    }
    if (!inField && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      selectAdjacentSample(e.key === 'ArrowDown' ? 1 : -1);
    }
    if (!inField && audioEl && duration) {
      if (e.key === 'ArrowRight') { e.preventDefault(); audioEl.currentTime = Math.min(duration, currentTime + 2); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); audioEl.currentTime = Math.max(0, currentTime - 2); }
    }
  }

  fetchSamples();
  fetchSidebarAnnotationSummary();
</script>

<svelte:head>
  <title>Barktown · Training samples</title>
</svelte:head>

<svelte:window onmousemove={onWindowMouseMove} onmouseup={onWindowMouseUp} onkeydown={handleKeydown} />

<div class="app">
  <header class="site-header">
    <h1>🐕 Training samples</h1>
    <a class="back-link" href="/">‹ Back to the diary</a>
  </header>

  <div class="training-body">
    <aside class="samples-pane">
      <div class="samples-filter">
        {#each ALL_LABELS as lbl}
          <button class="filter-pill" class:active={filterLabel === lbl} onclick={() => (filterLabel = lbl)}>{lbl}</button>
        {/each}
        <button class="filter-pill reload-pill" onclick={reloadSidebar} title="Reload">
          {samplesLoading ? '…' : '↺'}
        </button>
      </div>

      {#if samplesError}
        <div class="samples-msg samples-err">{samplesError}</div>
      {:else if samplesLoading && samples.length === 0}
        <div class="samples-msg">Loading…</div>
      {:else if filteredSamples.length === 0}
        <div class="samples-msg">No samples{filterLabel !== 'all' ? ` for "${filterLabel}"` : ''}.</div>
      {:else}
        <div class="samples-list">
          {#each filteredSamples as sample, i (sample.id)}
            {@const notePreview = selected?.id === sample.id ? selectedSampleWideNote?.label : sampleNotes.get(sample.id)}
            {@const fragBlocks = sampleFragments.get(sample.id) ?? []}
            {@const sampleDay = formatSampleDatetime(sample.datetimeLocal).slice(0, 10)}
            {@const prevDay = i > 0 ? formatSampleDatetime(filteredSamples[i - 1].datetimeLocal).slice(0, 10) : null}
            <button
              class="sample-row"
              class:playing={selected?.id === sample.id}
              class:day-start={i > 0 && sampleDay !== prevDay}
              onclick={() => toggleSample(sample)}
            >
              <span class="sample-label-pill sample-label--{sample.label}" title={sample.label}>{sample.label.slice(0, 3)}</span>
              <span class="sample-name">
                <span class="sample-name-main">{formatSampleDatetime(sample.datetimeLocal)}</span>
                {#if notePreview}<span class="sample-note-preview">{notePreview}</span>{/if}
              </span>
              <span class="sample-dur">{formatDuration(sample.durationSec)}</span>
              {#if fragBlocks.length}
                <span class="sample-frag-strip">
                  {#each fragBlocks as frag, i (i)}
                    <span
                      class="sample-frag-block"
                      style="left:{(frag.startFrac * 100).toFixed(2)}%; width:{Math.max(0.6, (frag.endFrac - frag.startFrac) * 100).toFixed(2)}%; background:{fragmentColor(frag.label)}"
                    ></span>
                  {/each}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </aside>

    <main class="editor-pane">
      {#if !selected}
        <div class="corpus-summary">
          <p class="corpus-summary-hint">Select a sample on the left to play, annotate, or edit it.</p>
          <h2 class="corpus-summary-title">Corpus summary</h2>
          <table class="corpus-table">
            <thead>
              <tr><th>Label</th><th>Duration</th><th>Occupancy</th><th>Samples</th><th>Fragments</th><th>Durations</th></tr>
            </thead>
            <tbody>
              {#each LABELS as lbl}
                {@const fragCount = fragmentCountsByLabel.get(lbl) ?? 0}
                {@const guide = LABEL_GUIDELINES[lbl]}
                <tr>
                  <td><span class="sample-label-pill sample-label--{lbl}">{lbl}</span></td>
                  <td class="corpus-guideline">{guide?.duration ?? '\u2014'}</td>
                  <td class="corpus-guideline">{guide?.occupancy ?? '\u2014'}</td>
                  <td>{sampleCountsByLabel.get(lbl) ?? 0}</td>
                  <td
                    class="corpus-frag-count"
                    class:corpus-low={fragCount < 30}
                    class:corpus-mid={fragCount >= 30 && fragCount < 100}
                    class:corpus-good={fragCount >= 100}
                  >{fragCount}</td>
                  <td class="corpus-chart-cell" title={fragmentDurationTitle(lbl)}>
                    <span class="chart">{fragmentDurationChart(lbl)}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="corpus-summary-legend">
            Fragments target (per docs/training-data.md): <span class="corpus-low">&lt;30 low</span> ·
            <span class="corpus-mid">30–99 viable</span> · <span class="corpus-good">100+ good</span>
          </p>
          <p class="corpus-summary-legend">
            Durations: 0–0.5s bins up to 5s, then one &gt;5s bucket — hover a chart for exact counts.
          </p>
        </div>
      {:else}
        <div class="editor-header">
          <span class="sample-label-pill sample-label--{selected.label}">{selected.label}</span>
          <span class="editor-title">{formatSampleDatetime(selected.datetimeLocal, { seconds: true })}</span>
          <span class="editor-dur">{formatDuration(selected.durationSec)}</span>

          <label class="category-control">
            <span>Category</span>
            <select value={selected.label} disabled={renameBusy} onchange={(e) => changeCategory(e.currentTarget.value)}>
              {#each LABELS as lbl}
                <option value={lbl}>{lbl}</option>
              {/each}
            </select>
          </label>

          <button class="danger-btn" onclick={() => (deleteConfirm = true)}>Delete sample</button>
        </div>

        {#if renameError}<div class="error-msg">{renameError}</div>{/if}

        {#if deleteConfirm}
          <div class="confirm-bar">
            <span>Delete this sample and its annotations? This cannot be undone.</span>
            <button class="danger-btn" disabled={deleteBusy} onclick={confirmDeleteSample}>
              {deleteBusy ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button class="action-btn" onclick={() => (deleteConfirm = false)}>Cancel</button>
          </div>
        {/if}

        <!-- svelte-ignore a11y_media_has_caption -->
        <audio
          bind:this={audioEl}
          src={audioSrc(selected)}
          onplay={() => (isPlaying = true)}
          onpause={() => (isPlaying = false)}
          onended={() => (isPlaying = false)}
          ontimeupdate={() => { if (audioEl) currentTime = audioEl.currentTime; }}
          onloadedmetadata={() => { if (audioEl) duration = audioEl.duration || selected.durationSec; }}
        ></audio>

        <div class="player-controls">
          <button class="play-pause-btn" onclick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
          <span class="mini-time">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
          <span class="hint">Drag on the waveform to select a fragment · click a fragment to edit it · Delete removes the selection</span>
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <svg
          class="wave-editor"
          viewBox="0 0 {VW} {VH}"
          preserveAspectRatio="none"
          bind:this={waveSvgEl}
          onmousedown={onWaveMouseDown}
          role="img"
          aria-label="Waveform editor — drag to select a fragment"
        >
          {#if waveData}
            {#each bars() as bar}
              <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={bar.played ? '#2255bb' : '#a0b8e8'} />
            {/each}
          {:else}
            <line x1="0" y1={VH / 2} x2={VW} y2={VH / 2} stroke={waveLoading ? '#c0d0f0' : '#e0e0e0'} stroke-width="1" />
          {/if}

          {#each renderFragments as ann (ann.id)}
            {@const x = secToX(ann.startSec)}
            {@const w = Math.max(2, secToX(ann.endSec) - x)}
            <rect
              class="fragment-band"
              x={x} y="0" width={w} height={VH}
              fill={fragmentColor(ann.label)}
              opacity={selectedAnnId === ann.id ? 0.45 : 0.28}
              data-role="fragment-body"
              data-ann-id={ann.id}
            ></rect>
            <text x={x + 3} y="12" class="fragment-label" data-role="fragment-body" data-ann-id={ann.id}>{ann.label}</text>
            {#if selectedAnnId === ann.id}
              <rect class="frag-handle" x={x - 3} y="0" width="6" height={VH} data-role="handle-start" data-ann-id={ann.id}></rect>
              <rect class="frag-handle" x={x + w - 3} y="0" width="6" height={VH} data-role="handle-end" data-ann-id={ann.id}></rect>
            {/if}
          {/each}

          {#each renderNotes as ann (ann.id)}
            {@const x = secToX(ann.startSec)}
            <line x1={x} y1="0" x2={x} y2={VH} stroke={NOTE_COLOR} stroke-width={selectedAnnId === ann.id ? 3 : 2} data-role="note-marker" data-ann-id={ann.id}></line>
            <circle cx={x} cy="7" r="5" fill={NOTE_COLOR} data-role="note-marker" data-ann-id={ann.id}></circle>
          {/each}

          {#if pending}
            {@const x = secToX(pending.startSec)}
            {@const w = Math.max(1, secToX(pending.endSec) - x)}
            <rect x={x} y="0" width={w} height={VH} fill="#1a1a1a" opacity="0.15"></rect>
          {/if}
          {#if dragMode === 'brush'}
            {@const x = secToX(Math.min(dragStartSec, dragCurrentSec))}
            {@const w = Math.max(1, secToX(Math.max(dragStartSec, dragCurrentSec)) - x)}
            <rect x={x} y="0" width={w} height={VH} fill="#1a1a1a" opacity="0.12"></rect>
          {/if}

          <line x1={playheadX} y1="0" x2={playheadX} y2={VH} stroke="#1a1a1a" stroke-width="1.5"></line>
        </svg>

        {#if mutationError}<div class="error-msg">{mutationError}</div>{/if}

        <div class="notes-panel">
          <div class="notes-panel-header">
            <span class="notes-panel-title">Notes</span>
            <button
              class="action-btn"
              disabled={hasSampleWideNote || addingSampleNote}
              onclick={startSampleWideNote}
              title={hasSampleWideNote ? 'This sample already has a sample-wide note' : ''}
            >
              + Add a note
            </button>
          </div>

          {#if addingSampleNote}
            <div class="note-row-item">
              <span class="note-time">Sample-wide</span>
              <input
                class="note-input"
                placeholder="Note for the whole sample…"
                bind:value={newSampleNoteText}
                use:autofocusAction
                onkeydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelSampleWideNoteDraft(); e.currentTarget.blur(); }
                }}
                onblur={commitSampleWideNote}
              />
            </div>
          {/if}

          {#each sortedNotes as note (note.id)}
            <div class="note-row-item" class:selected={selectedAnnId === note.id}>
              <span class="note-time">{isSampleWideNote(note) ? 'Sample-wide' : formatDuration(note.startSec)}</span>
              {#if editingNoteId === note.id}
                <input
                  class="note-input"
                  bind:value={editLabel}
                  use:autofocusAction
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                    if (e.key === 'Escape') { e.preventDefault(); editingNoteId = null; e.currentTarget.blur(); }
                  }}
                  onblur={() => { if (editingNoteId === note.id) saveNoteLabel(note.id, editLabel); }}
                />
              {:else}
                <button class="note-text-btn" onclick={() => startEditNote(note)}>{note.label}</button>
              {/if}
              <button class="note-delete-btn" title="Delete note" onclick={() => deleteAnnotationById(note.id)}>×</button>
            </div>
          {/each}

          {#if !addingSampleNote && sortedNotes.length === 0}
            <div class="notes-empty">No notes yet.</div>
          {/if}
        </div>

        {#if pending}
          <div class="pending-toolbar">
            <span class="pending-range">{formatDuration(pending.startSec)} – {formatDuration(pending.endSec)} selected</span>
            <div class="pending-labels">
              {#each LABELS as lbl}
                <button class="filter-pill" class:active={pendingLabel === lbl} onclick={() => (pendingLabel = lbl)}>{lbl}</button>
              {/each}
            </div>
            <button class="action-btn" onclick={commitFragment}>Save fragment (↵)</button>
            <div class="note-row">
              <input class="note-input" placeholder="…or add a time-coded note" bind:value={pendingNoteText} />
              <button class="action-btn" disabled={!pendingNoteText.trim()} onclick={commitNote}>Add note</button>
            </div>
            <button class="action-btn" onclick={cancelPending}>Cancel</button>
          </div>
        {/if}

        {#if selectedAnnId != null}
          {@const ann = annotations.find(a => a.id === selectedAnnId)}
          {#if ann && ann.source !== 'note'}
            <div class="selection-toolbar">
              <span class="ann-range">{formatDuration(ann.startSec)} – {formatDuration(ann.endSec)}</span>
              <div class="pending-labels">
                {#each LABELS as lbl}
                  <button class="filter-pill" class:active={ann.label === lbl} onclick={() => relabelSelected(lbl)}>{lbl}</button>
                {/each}
              </div>
              <button class="danger-btn" onclick={deleteSelectedAnnotation}>Delete</button>
              <button class="action-btn" onclick={() => (selectedAnnId = null)}>Close</button>
            </div>
          {/if}
        {/if}

        {#if annotationsError}<div class="error-msg">{annotationsError}</div>{/if}
      {/if}
    </main>
  </div>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f7f7f5;
    color: #1a1a1a;
  }

  .app { min-height: 100dvh; }

  /* ── Header ── */
  .site-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #fff;
    border-bottom: 1px solid #e0e0dc;
    padding: 0.6rem 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .site-header h1 { margin: 0; font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
  .back-link {
    font-size: 0.78rem;
    color: #555;
    text-decoration: none;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }
  .back-link:hover { background: #f0f0ec; color: #1a1a1a; }

  /* ── Layout ── */
  .training-body {
    display: flex;
    align-items: flex-start;
    min-height: calc(100dvh - 49px);
  }

  .samples-pane {
    width: 320px;
    flex-shrink: 0;
    border-right: 1px solid #e0e0dc;
    background: #fff;
    max-height: calc(100dvh - 49px);
    overflow-y: auto;
    position: sticky;
    top: 49px;
  }

  .editor-pane {
    flex: 1;
    min-width: 0;
    padding: 1rem 1.2rem 2rem;
  }

  @media (max-width: 760px) {
    .training-body { flex-direction: column; }
    .samples-pane { width: 100%; position: static; max-height: 40vh; border-right: none; border-bottom: 1px solid #e0e0dc; }
  }

  .corpus-summary { padding: 2rem 1.5rem; max-width: 34rem; }
  .corpus-summary-hint { color: #999; font-size: 0.9rem; margin: 0 0 1.5rem; }
  .corpus-summary-title { font-size: 1rem; margin: 0 0 0.75rem; }

  .corpus-table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  .corpus-table th {
    text-align: left;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #999;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid #e0e0dc;
  }
  .corpus-table td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #f0f0ec;
    font-variant-numeric: tabular-nums;
  }
  .corpus-table th:not(:first-child), .corpus-table td:not(:first-child) { text-align: right; }

  .corpus-guideline { color: #999; white-space: nowrap; }
  .corpus-frag-count { font-weight: 700; }
  .corpus-low  { color: #c0392b; }
  .corpus-mid  { color: #b8860b; }
  .corpus-good { color: #27ae60; }

  .corpus-summary-legend { font-size: 0.72rem; color: #999; margin-top: 1rem; }

  /* ── Duration histogram sparkline (Datatype font bar-chart ligatures) ── */
  @font-face {
    font-family: 'Datatype';
    src: url('/Datatype.woff2') format('woff2');
    font-display: swap;
  }
  .corpus-chart-cell { white-space: nowrap; }
  .chart {
    font-family: 'Datatype', sans-serif;
    font-variation-settings: 'wdth' 15;
    font-weight: 400;
    font-size: 1.4rem;
    line-height: 1;
    color: #4a7cdc;
  }

  /* ── Filter pills / list (shared look with GoblinPiStatus samples tab) ── */
  .samples-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid #f0f0ec;
    position: sticky;
    top: 0;
    background: #fff;
  }

  .filter-pill {
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.55rem;
    border: 1px solid #d8d8d4;
    border-radius: 10px;
    background: #f5f5f2;
    color: #666;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .filter-pill:hover { background: #eaeae6; color: #333; }
  .filter-pill.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  .reload-pill { border-style: dashed; }

  .samples-msg { padding: 1rem 0.9rem; font-size: 0.78rem; color: #999; }
  .samples-err { color: #c0392b; }

  .samples-list { padding-bottom: 0.5rem; }

  .sample-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.9rem;
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
    border-bottom: 1px solid #f4f4f0;
    text-align: left;
    transition: background 0.1s;
    position: relative;
  }
  .sample-row:hover { background: #f7f7f4; }
  .sample-row.playing { background: #eef3fc; }
  /* Visual gap between days -- roughly one row's height. */
  .sample-row.day-start { margin-top: 2.4rem; }

  .sample-frag-strip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
  }
  .sample-frag-block {
    position: absolute;
    top: 0;
    bottom: 0;
    opacity: 0.85;
  }

  .sample-label-pill {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem;
    border-radius: 8px;
    flex-shrink: 0;
    color: #fff;
  }
  /* Sidebar list rows show only a 3-letter abbreviation (see template) --
     monospace keeps every pill the same width without forcing a fixed
     width/padding that looked ragged with proportional fonts. */
  .sample-row .sample-label-pill {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  }
  .sample-label--bark       { background: #e74c3c; }
  .sample-label--yap        { background: #e67e22; }
  .sample-label--wrongdog   { background: #8a8c00; }
  .sample-label--background { background: #27ae60; }
  .sample-label--wind       { background: #2980b9; }
  .sample-label--homestead  { background: #8e44ad; }
  .sample-label--gunshot    { background: #333333; }
  .sample-label--traffic    { background: #7f8c8d; }

  .sample-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  .sample-name-main {
    font-size: 0.76rem;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .sample-note-preview {
    font-size: 0.64rem;
    color: #a8860a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sample-dur { font-size: 0.68rem; color: #aaa; flex-shrink: 0; font-variant-numeric: tabular-nums; }

  /* ── Editor header ── */
  .editor-header {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
    margin-bottom: 0.6rem;
  }
  .editor-title { font-size: 0.85rem; font-weight: 600; }
  .editor-dur { font-size: 0.78rem; color: #888; font-variant-numeric: tabular-nums; }

  .category-control {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.74rem;
    color: #666;
    margin-left: auto;
  }
  .category-control select {
    font-family: inherit;
    font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid #d0d0cc;
    border-radius: 4px;
    background: #fff;
  }

  .danger-btn {
    background: #e74c3c;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.32rem 0.75rem;
    font-size: 0.76rem;
    font-family: inherit;
    cursor: pointer;
  }
  .danger-btn:hover { opacity: 0.85; }

  .action-btn {
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.32rem 0.75rem;
    font-size: 0.76rem;
    font-family: inherit;
    cursor: pointer;
  }
  .action-btn:hover:not(:disabled) { opacity: 0.8; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }

  .confirm-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: #fdecea;
    border: 1px solid #f5c6c0;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    font-size: 0.78rem;
    margin-bottom: 0.7rem;
    flex-wrap: wrap;
  }

  .error-msg {
    color: #c0392b;
    font-size: 0.78rem;
    margin: 0.4rem 0;
  }

  /* ── Player ── */
  .player-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
  }
  .play-pause-btn {
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .play-pause-btn:hover { opacity: 0.8; }
  .mini-time { font-size: 0.74rem; color: #666; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .hint { font-size: 0.7rem; color: #aaa; }

  .wave-editor {
    width: 100%;
    height: 160px;
    display: block;
    background: #f4f6fb;
    border-radius: 4px;
    cursor: crosshair;
    user-select: none;
  }

  .fragment-band { cursor: pointer; }
  .fragment-label { font-size: 9px; fill: #1a1a1a; pointer-events: none; }
  .frag-handle { fill: #1a1a1a; opacity: 0.35; cursor: ew-resize; }

  /* ── Toolbars ── */
  .pending-toolbar,
  .selection-toolbar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    background: #fafaf8;
    border: 1px solid #e8e8e4;
    border-radius: 6px;
    padding: 0.6rem 0.8rem;
    margin-top: 0.6rem;
    font-size: 0.78rem;
  }

  .pending-range, .ann-range { color: #666; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pending-labels { display: flex; gap: 0.3rem; flex-wrap: wrap; }

  .note-row { display: flex; align-items: center; gap: 0.4rem; }
  .note-input {
    font-family: inherit;
    font-size: 0.78rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid #d0d0cc;
    border-radius: 4px;
    min-width: 200px;
  }

  /* ── Notes panel ── */
  .notes-panel {
    margin-top: 0.6rem;
    background: #fffef8;
    border: 1px solid #e8e8e4;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
  }
  .notes-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.35rem;
  }
  .notes-panel-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #999;
  }
  .note-row-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid #f4f4ee;
  }
  .note-row-item:last-child { border-bottom: none; }
  .note-row-item.selected { background: #fdf6d8; }
  .note-row-item .note-input { flex: 1; min-width: 0; }
  .note-time {
    font-size: 0.68rem;
    color: #a8860a;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    min-width: 5rem;
  }
  .note-text-btn {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.8rem;
    color: #1a1a1a;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-text-btn:hover { background: #f4f4ee; }
  .note-delete-btn {
    background: none;
    border: none;
    color: #c0392b;
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    flex-shrink: 0;
  }
  .note-delete-btn:hover { opacity: 0.7; }
  .notes-empty { font-size: 0.74rem; color: #aaa; padding: 0.2rem 0; }
</style>
