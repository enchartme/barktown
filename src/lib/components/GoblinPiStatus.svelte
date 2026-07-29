<script>
  import { onMount, onDestroy } from 'svelte';
  import { ASSET_BASE, formatDuration, formatSampleDatetime } from '$lib/utils.js';

  const BASE_URL       = 'https://goblinpi.tail523149.ts.net';
  const STATUS_URL     = `${BASE_URL}/status`;
  const SAMPLES_INDEX  = `${ASSET_BASE}/training-samples-index.json`;
  const POLL_OPEN_MS   = 1_000;
  const POLL_CLOSED_MS = 10_000;
  const RECENT_SAMPLES_COUNT = 5;

  const LABELS = ['bark', 'yap', 'background', 'wind', 'homestead', 'traffic', 'gunshot', 'wrongdog'];

  /** @type {any} */
  let status      = $state(null);
  let fetchFailed = $state(false);
  let showPopup   = $state(false);
  let activeTab   = $state('status');
  let intervalId;

  // ── Manual tab state ──────────────────────────────────────────────────────
  let recordDuration  = $state(15);
  /** @type {any} */
  let recordStatus    = $state(null);
  let selectedLabel   = $state('');
  let recordMessage   = $state('');
  let confirmAction   = $state(/** @type {'reboot'|'halt'|null} */ (null));
  let controlMessage  = $state('');
  let recordPollId;
  let controlBusy     = $state(false);

  // ── Monitor control state ─────────────────────────────────────────────────
  // bark-monitor.service and the on-demand recorder above both need
  // exclusive access to the same USB mic, so only one can run at a time.
  let monitorBusy     = $state(false);
  let monitorMessage  = $state('');
  const monitorActive = $derived(status?.monitor?.service_active ?? null);

  // ── Recent recordings (shown at the end of the Manual tab's record section) ─
  /** @type {any[]} */
  let samples         = $state([]);
  let samplesLoading  = $state(false);
  let samplesError    = $state('');

  const recentSamples = $derived(samples.slice(0, RECENT_SAMPLES_COUNT));

  async function fetchSamples() {
    samplesLoading = true;
    samplesError   = '';
    try {
      const res = await fetch(SAMPLES_INDEX, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Sort newest first
      samples = [...data].sort((a, b) => b.datetimeLocal.localeCompare(a.datetimeLocal));
    } catch (e) {
      samplesError = e?.message ?? 'Failed to load';
    } finally {
      samplesLoading = false;
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status      = await res.json();
      fetchFailed = false;
    } catch (_e) {
      fetchFailed = true;
      status      = null;
    }
  }

  function restartInterval(ms) {
    clearInterval(intervalId);
    intervalId = setInterval(fetchStatus, ms);
  }

  onMount(() => {
    fetchStatus();
    intervalId = setInterval(fetchStatus, POLL_CLOSED_MS);
  });
  onDestroy(() => {
    clearInterval(intervalId);
    clearInterval(recordPollId);
  });

  $effect(() => {
    restartInterval(showPopup ? POLL_OPEN_MS : POLL_CLOSED_MS);
  });

  $effect(() => {
    clearInterval(recordPollId);
    if (showPopup && activeTab === 'manual') {
      fetchRecordStatus();
      recordPollId = setInterval(fetchRecordStatus, 1500);
      if (samples.length === 0 && !samplesLoading) fetchSamples();
    }
  });

  // ── Dot state ──────────────────────────────────────────────────────────────

  function isRecentInference(s) {
    if (!s?.pipeline?.last_inference_ts) return false;
    return (Date.now() - new Date(s.pipeline.last_inference_ts).getTime()) < 10_000;
  }

  // vcgencmd get_throttled bitmask decoder
  const THROTTLE_BITS = [
    [0x1,     'Under-voltage now'],
    [0x2,     'Freq capped now'],
    [0x4,     'Throttled now'],
    [0x8,     'Soft temp limit now'],
    [0x10000, 'Under-voltage since boot'],
    [0x20000, 'Freq capped since boot'],
    [0x40000, 'Throttled since boot'],
    [0x80000, 'Soft temp limit since boot'],
  ];
  const THROTTLE_NOW_MASK = 0xf; // any of bits 0–3 = active problem right now

  function fmtThrottled(v) {
    if (v == null) return '—';
    const n = typeof v === 'string' ? parseInt(v, 16) : Number(v);
    if (isNaN(n) || n === 0) return 'none';
    return THROTTLE_BITS.filter(([bit]) => n & bit).map(([, label]) => label).join('\n');
  }

  function hasDanger(s) {
    if (!s) return false;
    return (
      (s.cpu?.percent_1s > 80) ||
      (s.cpu?.temp_c > 75) ||
      (s.disk?.sd_free_mb != null && s.disk.sd_free_mb < 500) ||
      (s.ram?.used_mb > 800)
    );
  }

  const dotState = $derived(
    (fetchFailed || !status)                    ? 'unavailable' :
    (!status.alive || !status.audio?.streaming) ? 'inactive'    :
    isRecentInference(status)                   ? 'red'         :
    hasDanger(status)                           ? 'orange'      :
                                                  'green'
  );

  const DOT_TITLES = {
    unavailable: 'goblinpi — unreachable (not on tailnet?)',
    inactive:    'goblinpi — alive but audio stream is off',
    red:         'goblinpi — inference active right now',
    orange:      'goblinpi — hardware warning (CPU / RAM / disk)',
    green:       'goblinpi — all good',
  };

  // ── Threshold helpers ──────────────────────────────────────────────────────

  function levelBg(level) {
    return {
      ok:       '#c8f7c5',
      low:      '#fff9c4',
      high:     '#ffe0b2',
      way_high: '#ffcdd2',
      way_low:  '#e8daef',
    }[level] ?? '';
  }

  function levelLabel(level) {
    return { ok: '', low: 'low', high: 'high', way_high: 'danger', way_low: 'very low' }[level] ?? '';
  }

  function boolLevel(v)  { return v ? 'ok' : 'way_high'; }

  function rangeLevel(v, ranges) {
    for (const r of ranges) if (v < r.max) return r.level;
    return ranges.at(-1).level;
  }

  function getLevel(path, value) {
    if (value == null) return 'neutral';
    switch (path) {
      case 'alive':
      case 'audio.streaming':
      case 'audio.usb_mic_present':
      case 'net.online':
      case 'net.masmopi_ok':
        return boolLevel(value);

      case 'audio.rms_now':
        return rangeLevel(value, [
          {max:0.003,level:'way_low'},{max:0.01,level:'low'},{max:0.08,level:'ok'},
          {max:0.2,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.rms_mean_10s':
        return rangeLevel(value, [
          {max:0.002,level:'way_low'},{max:0.008,level:'low'},{max:0.05,level:'ok'},
          {max:0.12,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.rms_dbfs_now':
        return rangeLevel(value, [
          {max:-50,level:'way_low'},{max:-35,level:'low'},{max:-18,level:'ok'},
          {max:-10,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.rms_dbfs_mean_10s':
        return rangeLevel(value, [
          {max:-55,level:'way_low'},{max:-40,level:'low'},{max:-22,level:'ok'},
          {max:-14,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.peak_now':
        return rangeLevel(value, [
          {max:0.02,level:'way_low'},{max:0.08,level:'low'},{max:0.5,level:'ok'},
          {max:0.85,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.clip_rate_10s':
        return rangeLevel(value, [
          {max:0.00001,level:'ok'},{max:0.001,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'audio.xruns_last_hour':
        return value === 0 ? 'ok' : value <= 5 ? 'high' : 'way_high';
      case 'audio.sample_rate':
        return rangeLevel(value, [
          {max:8001,level:'way_low'},{max:16000,level:'low'},{max:48001,level:'ok'},
          {max:96001,level:'high'},{max:Infinity,level:'way_high'}]);

      case 'cpu.percent_1s':
        return rangeLevel(value, [{max:50,level:'ok'},{max:80,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'cpu.percent_peak_60s':
        return rangeLevel(value, [{max:70,level:'ok'},{max:90,level:'high'},{max:Infinity,level:'way_high'}]);
      case 'cpu.throttled_bits': {
        const n = typeof value === 'string' ? parseInt(value, 16) : Number(value);
        if (isNaN(n) || n === 0) return 'ok';
        return (n & THROTTLE_NOW_MASK) ? 'way_high' : 'high';
      }

      case 'cpu.temp_c':
        return rangeLevel(value, [{max:60,level:'ok'},{max:75,level:'high'},{max:Infinity,level:'way_high'}]);

      case 'ram.used_mb':
      case 'ram.peak_60s_mb':
        return rangeLevel(value, [{max:500,level:'ok'},{max:800,level:'high'},{max:Infinity,level:'way_high'}]);

      case 'disk.sd_free_mb':
        return value > 2000 ? 'ok' : value > 500 ? 'low' : value > 200 ? 'high' : 'way_high';

      case 'pipeline.last_inference_ts': {
        const ageMs = Date.now() - new Date(value).getTime();
        return ageMs < 15_000 ? 'ok' : ageMs < 60_000 ? 'high' : 'way_high';
      }

      case 'counts_24h.uploads_failed':
        return value === 0 ? 'ok' : value < 5 ? 'high' : 'way_high';
      case 'counts_24h.uploads_retried':
        return value === 0 ? 'ok' : 'high';

      default:
        return 'neutral';
    }
  }

  const HINT = {
    'audio.rms_now':              '< 0.003 very low · 0.003–0.01 low · 0.01–0.08 ✓ · 0.08–0.2 high · > 0.2 danger',
    'audio.rms_mean_10s':         '< 0.002 very low · 0.002–0.008 low · 0.008–0.05 ✓ · 0.05–0.12 high · > 0.12 danger',
    'audio.rms_dbfs_now':         '< −50 very low · −50 to −35 low · −35 to −18 ✓ · −18 to −10 high · > −10 danger',
    'audio.rms_dbfs_mean_10s':    '< −55 very low · −55 to −40 low · −40 to −22 ✓ · −22 to −14 high · > −14 danger',
    'audio.peak_now':             '< 0.02 very low · 0.02–0.08 low · 0.08–0.5 ✓ · 0.5–0.85 high · > 0.85 danger',
    'audio.clip_rate_10s':        '0 – 0.00001 ✓ · 0.00001–0.001 high · > 0.001 danger',
    'audio.xruns_last_hour':      '0 ✓ · 1–5 high · > 5 danger',
    'audio.sample_rate':          '< 8 kHz very low · 16–48 kHz ✓ · > 96 kHz danger',
    'audio.streaming':            'false = stream dead · true ✓',
    'audio.usb_mic_present':      'false = mic missing · true ✓',
    'cpu.percent_1s':             '< 50% ✓ · 50–80% high · > 80% danger',
    'cpu.percent_peak_60s':       '< 70% ✓ · 70–90% high · > 90% danger',
    'cpu.temp_c':                 '< 60°C ✓ · 60–75°C high · > 75°C danger',
    'ram.used_mb':                '< 500 MB ✓ · 500–800 MB high · > 800 MB danger',
    'ram.peak_60s_mb':            '< 500 MB ✓ · 500–800 MB high · > 800 MB danger',
    'disk.sd_free_mb':            '> 2 GB ✓ · 0.5–2 GB low · 0.2–0.5 GB high · < 200 MB danger',
    'net.online':                 'false = offline · true ✓',
    'net.masmopi_ok':             'false = upstream unreachable · true ✓',
    'alive':                      'false = process not alive · true ✓',
    'cpu.throttled_bits':          'none ✓ · bits 0–3 active now (red) · bits 16–19 since boot (amber)',
    'pipeline.last_inference_ts': '< 15 s ✓ · 15–60 s notable · > 60 s stalled',
    'counts_24h.uploads_failed':  '0 ✓ · any > 0 is notable',
    'counts_24h.uploads_retried': '0 ✓ · any > 0 is notable',
  };

  const SECTIONS = [
    { title: 'System', rows: [
      { path: 'alive',         label: 'Alive',       fmt: v => v ? 'yes' : 'no' },
      { path: 'now',           label: 'Server time', fmt: v => new Date(v).toLocaleTimeString() },
      { path: 'boot_time',     label: 'Boot time',   fmt: v => new Date(v).toLocaleString() },
      { path: 'uptime_s',      label: 'Uptime',      fmt: v => `${Math.floor(v/3600)}h ${Math.floor((v%3600)/60)}m ${(v%60)|0}s` },
      { path: 'heartbeat_seq', label: 'Heartbeat',   fmt: v => String(v) },
    ]},
    { title: 'Audio', rows: [
      { path: 'audio.usb_mic_present',   label: 'USB mic',       fmt: v => v ? 'yes' : 'no' },
      { path: 'audio.streaming',         label: 'Streaming',     fmt: v => v ? 'yes' : 'no' },
      { path: 'audio.sample_rate',       label: 'Sample rate',   fmt: v => `${(v/1000).toFixed(0)} kHz` },
      { path: 'audio.rms_now',           label: 'RMS now',       fmt: v => v.toFixed(4) },
      { path: 'audio.rms_mean_10s',      label: 'RMS mean 10s',  fmt: v => v.toFixed(4) },
      { path: 'audio.rms_dbfs_now',      label: 'RMS dBFS now',  fmt: v => `${v.toFixed(1)} dBFS` },
      { path: 'audio.rms_dbfs_mean_10s', label: 'RMS dBFS 10s',  fmt: v => `${v.toFixed(1)} dBFS` },
      { path: 'audio.peak_now',          label: 'Peak now',      fmt: v => v.toFixed(4) },
      { path: 'audio.clip_rate_10s',     label: 'Clip rate 10s', fmt: v => v.toFixed(6) },
      { path: 'audio.xruns_last_hour',   label: 'XRuns/hour',    fmt: v => String(v) },
    ]},
    { title: 'Pipeline', rows: [
      { path: 'pipeline.state',             label: 'State',          fmt: v => v ?? '—' },
      { path: 'pipeline.model_version',     label: 'Model version',  fmt: v => v ?? '—' },
      { path: 'pipeline.last_inference_ts', label: 'Last inference', fmt: v => v ? new Date(v).toLocaleTimeString() : '—' },
    ]},
    { title: 'CPU', rows: [
      { path: 'cpu.percent_1s',       label: 'CPU % now',      fmt: v => `${v.toFixed(1)} %` },
      { path: 'cpu.percent_peak_60s', label: 'CPU % peak 60s', fmt: v => `${v.toFixed(1)} %` },
      { path: 'cpu.temp_c',           label: 'Temp',           fmt: v => `${v.toFixed(1)} °C` },
      { path: 'cpu.throttled_bits',   label: 'Throttled',      fmt: fmtThrottled },
    ]},
    { title: 'RAM', rows: [
      { path: 'ram.used_mb',     label: 'RAM used',     fmt: v => `${v.toFixed(0)} MB` },
      { path: 'ram.peak_60s_mb', label: 'RAM peak 60s', fmt: v => `${v.toFixed(0)} MB` },
    ]},
    { title: 'Disk', rows: [
      { path: 'disk.sd_free_mb', label: 'SD free', fmt: v => `${v.toFixed(0)} MB` },
    ]},
    { title: 'Network', rows: [
      { path: 'net.online',            label: 'Online',       fmt: v => v ? 'yes' : 'no' },
      { path: 'net.masmopi_ok',        label: 'Upstream OK',  fmt: v => v ? 'yes' : 'no' },
      { path: 'net.local_ip',          label: 'Local IP',     fmt: v => String(v) },
      { path: 'net.tailscale_ip',      label: 'Tailscale IP', fmt: v => String(v) },
      { path: 'net.last_upload_probe', label: 'Last upload',  fmt: v => v ? new Date(v).toLocaleTimeString() : '—' },
    ]},
    { title: 'Counts 24h', rows: [
      { path: 'counts_24h.bark_candidates', label: 'Bark candidates', fmt: v => String(v) },
      { path: 'counts_24h.bark_events',     label: 'Bark events',     fmt: v => String(v) },
      { path: 'counts_24h.evidence_clips',  label: 'Evidence clips',  fmt: v => String(v) },
      { path: 'counts_24h.uploads_ok',      label: 'Uploads OK',      fmt: v => String(v) },
      { path: 'counts_24h.uploads_failed',  label: 'Uploads failed',  fmt: v => String(v) },
      { path: 'counts_24h.uploads_retried', label: 'Uploads retried', fmt: v => String(v) },
    ]},
  ];

  function getVal(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  // ── Manual tab helpers ─────────────────────────────────────────────────────

  async function fetchRecordStatus() {
    try {
      const res = await fetch(`${BASE_URL}/record/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        recordStatus = await res.json();
        // Background recording worker failed after /record/start already
        // returned ok:true (e.g. an audio device error) -- surface it here
        // since it wasn't known at request time.
        if (recordStatus?.state === 'IDLE' && recordStatus?.error) {
          recordMessage = recordStatus.error;
        }
      }
    } catch (_e) { /* silently ignore — status shown via status tab */ }
  }

  async function startRecording() {
    recordMessage = '';
    selectedLabel = '';
    try {
      const res = await fetch(`${BASE_URL}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: recordDuration }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (!data.ok) recordMessage = data.error ?? 'Failed to start';
      else await fetchRecordStatus();
    } catch (_e) { recordMessage = 'Could not reach goblinpi'; }
  }

  async function stopRecording() {
    try {
      await fetch(`${BASE_URL}/record/stop`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      await fetchRecordStatus();
    } catch (_e) { recordMessage = 'Could not reach goblinpi'; }
  }

  async function labelRecording() {
    if (!selectedLabel) return;
    try {
      const res = await fetch(`${BASE_URL}/record/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: selectedLabel }),
        signal: AbortSignal.timeout(10000),
      });
      let data;
      try { data = await res.json(); } catch (_e) { data = null; }
      if (!res.ok || !data) {
        recordMessage = data?.error ?? `Server error ${res.status}`;
      } else {
        if (data.ok) {
          recordMessage = data.destination === 'local'
            ? `Saved locally: ${data.label}`
            : `Uploaded to Masmopi: ${data.filename ?? data.label} (UTC time)`;
        } else {
          recordMessage = data.error ?? 'Save failed';
        }
        selectedLabel = '';
        await fetchRecordStatus();
      }
    } catch (err) {
      recordMessage = err?.name === 'TimeoutError' ? 'Request timed out' : 'Could not reach goblinpi';
    }
  }

  async function discardRecording() {
    try {
      await fetch(`${BASE_URL}/record/discard`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      recordMessage = '';
      selectedLabel = '';
      await fetchRecordStatus();
    } catch (_e) { recordMessage = 'Could not reach goblinpi'; }
  }

  async function executeControl() {
    if (!confirmAction || controlBusy) return;
    controlBusy = true;
    controlMessage = '';
    const action = confirmAction;
    confirmAction = null;
    try {
      const res = await fetch(`${BASE_URL}/control/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      controlMessage = data.ok
        ? (action === 'reboot' ? 'Rebooting… (back in ~30 s)' : 'Shutting down…')
        : (data.error ?? 'Failed');
    } catch (_e) { controlMessage = 'Could not reach goblinpi'; }
    controlBusy = false;
  }

  async function setMonitorRunning(running) {
    if (monitorBusy) return;
    monitorBusy = true;
    monitorMessage = '';
    try {
      const res = await fetch(`${BASE_URL}/monitor/${running ? 'start' : 'stop'}`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!data.ok) monitorMessage = data.error ?? 'Failed';
      await fetchStatus();
    } catch (_e) {
      monitorMessage = 'Could not reach goblinpi';
    }
    monitorBusy = false;
  }

  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Escape' && showPopup) showPopup = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  class="status-dot dot-{dotState}"
  onclick={() => (showPopup = !showPopup)}
  title={DOT_TITLES[dotState]}
  aria-label="goblinpi status"
></button>

{#if showPopup}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="status-backdrop" onclick={() => (showPopup = false)}></div>

  <div class="status-popup" role="dialog" aria-modal="true" aria-label="goblinpi status">
    <div class="popup-header">
      <span class="popup-title">goblinpi</span>
      {#if status}
        <span class="popup-time">as of {new Date(status.now).toLocaleTimeString()}</span>
      {:else}
        <span class="popup-time popup-error">unreachable — not on tailnet?</span>
      {/if}
      <button class="popup-close" onclick={() => (showPopup = false)}>✕</button>
    </div>

    <div class="tab-bar">
      <button class="tab-btn" class:active={activeTab === 'status'}  onclick={() => (activeTab = 'status')}>Status</button>
      <button class="tab-btn" class:active={activeTab === 'manual'}  onclick={() => (activeTab = 'manual')}>Manual</button>
    </div>

    {#if activeTab === 'status'}
      {#if status}
        <div class="popup-body">
          <table class="status-table">
            {#each SECTIONS as section}
              <tbody>
                <tr class="section-hdr"><td colspan="3">{section.title}</td></tr>
                {#each section.rows as row}
                  {@const val = getVal(status, row.path)}
                  {@const level = getLevel(row.path, val)}
                  <tr>
                    <td class="td-label">{row.label}</td>
                    <td class="td-value" style:background={levelBg(level)}>
                      {val != null ? row.fmt(val) : '—'}
                      {#if level !== 'neutral' && levelLabel(level)}
                        <span class="level-tag">{levelLabel(level)}</span>
                      {/if}
                    </td>
                    <td class="td-hint">{HINT[row.path] ?? ''}</td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
      {:else}
        <div class="popup-body empty-body">
          <p>Could not reach <code>goblinpi.tail523149.ts.net</code>.</p>
          <p>Are you connected to Tailscale?</p>
          <button class="retry-btn" onclick={fetchStatus}>Retry now</button>
        </div>
      {/if}

    {:else if activeTab === 'manual'}
      <!-- Manual tab -->
      <div class="popup-body manual-body">

        <!-- Bark monitor section -->
        <div class="manual-section">
          <div class="manual-section-title">BARK MONITOR</div>

          <div class="monitor-row">
            <span class="monitor-state">
              {#if monitorActive === null}
                Unknown
              {:else if monitorActive}
                <span class="monitor-dot"></span> Running
              {:else}
                Stopped
              {/if}
            </span>
            {#if monitorActive}
              <button class="action-btn danger-btn" disabled={monitorBusy} onclick={() => setMonitorRunning(false)}>
                {monitorBusy ? 'Stopping…' : 'Stop monitor'}
              </button>
            {:else}
              <button class="action-btn" disabled={monitorBusy} onclick={() => setMonitorRunning(true)}>
                {monitorBusy ? 'Starting…' : 'Start monitor'}
              </button>
            {/if}
          </div>

          {#if monitorMessage}
            <div class="feedback-msg">{monitorMessage}</div>
          {/if}
        </div>

        <!-- Record section -->
        <div class="manual-section">
          <div class="manual-section-title">RECORD A SAMPLE</div>

          {#if monitorActive}
            <div class="feedback-msg">Stop the bark monitor above first — it holds the microphone.</div>
          {/if}

          {#if !recordStatus || recordStatus.state === 'IDLE' || recordStatus.state === 'LABELLED'}
            <div class="record-row">
              <select class="duration-select" bind:value={recordDuration}>
                <option value={5}>5 s</option>
                <option value={10}>10 s</option>
                <option value={15}>15 s</option>
                <option value={20}>20 s</option>
                <option value={30}>30 s</option>
              </select>
              <button class="action-btn" disabled={monitorActive === true} onclick={startRecording}>Start recording</button>
            </div>

          {:else if recordStatus.state === 'RECORDING'}
            <div class="recording-live">
              <span class="rec-dot"></span>
              <span class="rec-label">REC</span>
              <span class="rec-countdown">{recordStatus.seconds_remaining}s</span>
            </div>
            <button class="action-btn stop-btn" onclick={stopRecording}>Stop</button>

          {:else if recordStatus.state === 'DONE_UNLABELLED'}
            <p class="label-prompt">Recording done — pick a label:</p>
            <div class="label-grid">
              {#each LABELS as lbl}
                <button
                  class="label-btn"
                  class:selected={selectedLabel === lbl}
                  onclick={() => (selectedLabel = lbl)}
                >{lbl}</button>
              {/each}
            </div>
            <div class="save-row">
              <button class="action-btn" disabled={!selectedLabel} onclick={labelRecording}>Save</button>
              <button class="action-btn discard-btn" onclick={discardRecording}>Discard</button>
            </div>
          {/if}

          {#if recordMessage}
            <div class="feedback-msg">{recordMessage}</div>
          {/if}

          <!-- Recent recordings history (read-only -- use the Training page to play/annotate) -->
          <div class="recent-recordings">
            <div class="recent-recordings-title">Recent recordings</div>
            {#if samplesError}
              <div class="recent-recordings-msg recent-recordings-err">{samplesError}</div>
            {:else if samplesLoading && samples.length === 0}
              <div class="recent-recordings-msg">Loading…</div>
            {:else if recentSamples.length === 0}
              <div class="recent-recordings-msg">No recordings yet.</div>
            {:else}
              {#each recentSamples as sample (sample.id)}
                <div class="recent-recording-row">
                  <span class="sample-label-pill sample-label--{sample.label}">{sample.label}</span>
                  <span class="recent-recording-time">{formatSampleDatetime(sample.datetimeLocal)}</span>
                  <span class="recent-recording-dur">{formatDuration(sample.durationSec)}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- System control section -->
        <div class="manual-section">
          <div class="manual-section-title">SYSTEM</div>

          {#if !confirmAction}
            <div class="control-row">
              <button class="action-btn" onclick={() => { confirmAction = 'reboot'; controlMessage = ''; }}>
                Restart Goblin
              </button>
              <button class="action-btn danger-btn" onclick={() => { confirmAction = 'halt'; controlMessage = ''; }}>
                Shut down
              </button>
            </div>
          {:else}
            <div class="confirm-prompt">
              {confirmAction === 'reboot' ? 'Reboot the Pi?' : 'Shut down the Pi?'}
            </div>
            <div class="control-row">
              <button class="action-btn danger-btn" disabled={controlBusy} onclick={executeControl}>
                {controlBusy ? 'Sending…' : 'Confirm'}
              </button>
              <button class="action-btn" onclick={() => (confirmAction = null)}>Cancel</button>
            </div>
          {/if}

          {#if controlMessage}
            <div class="feedback-msg">{controlMessage}</div>
          {/if}
        </div>

      </div>
    {/if}

  </div>
{/if}

<style>
  /* ── Dot ── */
  .status-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .status-dot:hover { opacity: 0.7; }

  .dot-unavailable { background: #fff;     border-color: #333; }
  .dot-inactive    { background: #aaa;     border-color: #888; }
  .dot-red         { background: #e74c3c;  border-color: #c0392b; }
  .dot-orange      { background: #f39c12;  border-color: #d68910; }
  .dot-green       { background: #27ae60;  border-color: #1e8449; }

  /* ── Backdrop ── */
  .status-backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
  }

  /* ── Popup ── */
  .status-popup {
    position: fixed;
    top: 3rem;
    right: 1rem;
    width: min(540px, calc(100vw - 2rem));
    max-height: calc(100dvh - 4rem);
    background: #fff;
    border: 1px solid #e0e0dc;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    z-index: 901;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popup-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid #e0e0dc;
    background: #f7f7f5;
    flex-shrink: 0;
  }

  .popup-title {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .popup-time {
    font-size: 0.72rem;
    color: #999;
    flex: 1;
  }
  .popup-error { color: #c0392b; }

  .popup-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    color: #aaa;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    line-height: 1;
    font-family: inherit;
  }
  .popup-close:hover { background: #eee; color: #333; }

  .popup-body {
    overflow-y: auto;
    flex: 1;
  }

  .empty-body {
    padding: 1.5rem;
    text-align: center;
    color: #888;
    font-size: 0.85rem;
  }
  .empty-body code { font-size: 0.8rem; }

  .retry-btn {
    margin-top: 0.5rem;
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.9rem;
    font-size: 0.8rem;
    cursor: pointer;
    font-family: inherit;
  }
  .retry-btn:hover { background: #333; }

  /* ── Table ── */
  .status-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.76rem;
    table-layout: fixed;
  }

  .section-hdr td {
    background: #1a1a1a;
    color: #fff;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.3rem 0.9rem;
  }

  .td-label {
    padding: 0.27rem 0.5rem 0.27rem 0.9rem;
    color: #555;
    white-space: nowrap;
    width: 20%;
    border-bottom: 1px solid #f0f0ec;
  }

  .td-value {
    padding: 0.27rem 0.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: pre-line;
    width: 40%;
    border-bottom: 1px solid #f0f0ec;
  }

  .level-tag {
    margin-left: 0.4rem;
    font-size: 0.6rem;
    font-weight: 400;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.8;
  }

  .td-hint {
    padding: 0.27rem 0.9rem 0.27rem 0.4rem;
    color: #bbb;
    font-size: 0.62rem;
    line-height: 1.4;
    width: 40%;
    border-bottom: 1px solid #f0f0ec;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #e0e0dc;
    background: #fafaf8;
    flex-shrink: 0;
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.45rem 0.8rem;
    font-size: 0.72rem;
    font-weight: 600;
    font-family: inherit;
    letter-spacing: 0.04em;
    cursor: pointer;
    color: #aaa;
    transition: color 0.1s;
  }
  .tab-btn:hover { color: #555; }
  .tab-btn.active {
    color: #1a1a1a;
    border-bottom-color: #1a1a1a;
  }

  /* ── Manual body ── */
  .manual-body {
    padding: 0.6rem 0.9rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .manual-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0;
  }

  .manual-section:not(:first-child) {
    margin-top: 1.4rem;
    padding-top: 0.2rem;
  }

  .manual-section-title {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #999;
    border-bottom: 1px solid #e8e8e4;
    padding-bottom: 0.3rem;
    margin-bottom: 0.1rem;
  }

  /* ── Record controls ── */
  .record-row,
  .control-row,
  .save-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .monitor-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .monitor-state {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: #555;
  }

  .monitor-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2ecc71;
    flex-shrink: 0;
  }

  .duration-select {
    font-family: inherit;
    font-size: 0.78rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid #d0d0cc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  .action-btn {
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.85rem;
    font-size: 0.78rem;
    font-family: inherit;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.15s;
  }
  .action-btn:hover:not(:disabled) { opacity: 0.75; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }

  .stop-btn    { background: #e74c3c; }
  .danger-btn  { background: #c0392b; }
  .discard-btn { background: #888; }

  /* ── Recording live indicator ── */
  .recording-live {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e74c3c;
    flex-shrink: 0;
    animation: rec-blink 1s step-end infinite;
  }

  .rec-label { color: #e74c3c; letter-spacing: 0.05em; }
  .rec-countdown { color: #555; font-variant-numeric: tabular-nums; }

  @keyframes rec-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  /* ── Label grid ── */
  .label-prompt {
    font-size: 0.78rem;
    color: #555;
    margin: 0;
  }

  .label-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .label-btn {
    background: #f0f0ec;
    border: 1.5px solid transparent;
    border-radius: 4px;
    padding: 0.3rem 0.65rem;
    font-size: 0.76rem;
    font-family: inherit;
    cursor: pointer;
    color: #444;
    transition: background 0.1s, border-color 0.1s;
  }
  .label-btn:hover { background: #e0e0dc; }
  .label-btn.selected {
    background: #1a1a1a;
    color: #fff;
    border-color: #1a1a1a;
  }

  /* ── Confirm prompt ── */
  .confirm-prompt {
    font-size: 0.8rem;
    color: #c0392b;
    font-weight: 600;
  }

  /* ── Feedback ── */
  .feedback-msg {
    font-size: 0.74rem;
    color: #555;
    padding: 0.25rem 0.5rem;
    background: #f7f7f5;
    border-radius: 3px;
    border-left: 3px solid #ccc;
  }

  /* ── Recent recordings (end of RECORD A SAMPLE section) ── */
  .recent-recordings {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f0f0ec;
  }

  .recent-recordings-title {
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #999;
    margin-bottom: 0.35rem;
  }

  .recent-recordings-msg {
    font-size: 0.74rem;
    color: #999;
  }
  .recent-recordings-err { color: #c0392b; }

  .recent-recording-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.22rem 0;
    border-bottom: 1px solid #f4f4f0;
  }
  .recent-recording-row:last-child { border-bottom: none; }

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
  .sample-label--bark       { background: #e74c3c; }
  .sample-label--yap        { background: #e67e22; }
  .sample-label--wrongdog   { background: #8a8c00; }
  .sample-label--background { background: #27ae60; }
  .sample-label--wind       { background: #2980b9; }
  .sample-label--homestead  { background: #8e44ad; }
  .sample-label--gunshot    { background: #333333; }
  .sample-label--traffic    { background: #7f8c8d; }

  .recent-recording-time {
    flex: 1;
    font-size: 0.74rem;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  .recent-recording-dur {
    font-size: 0.68rem;
    color: #aaa;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
