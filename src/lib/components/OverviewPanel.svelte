<script>
  import { rollup, max } from 'd3-array';

  /** @type {{ entries: import('$lib/types').Entry[] }} */
  let { entries } = $props();

  // ── Colour classification (mirrors DiaryEntry.svelte labelBase) ────────────
  // Priority order: first match wins (most severe first).
  const COLOR_RULES = [
    { test: (l) => l.includes('shot') || l.includes('shooting'), color: '#51211d' },
    { test: (l) => l.includes('barkattack') || l.includes('bark bark bark'), color: '#ff4c4c' },
    { test: (l) => l.includes('yapattack')  || l.includes('yap yap yap'),   color: '#420f8d' },
    { test: (l) => l.includes('bark bark'),  color: '#d9665d' },
    { test: (l) => l.includes('yap yap'),    color: '#593391' },
    { test: (l) => l.includes('bark'),       color: '#b0766e' },
    { test: (l) => l.includes('yap'),        color: '#726389' },
  ];

  const DEFAULT_COLOR = '#888888';

  function eventColor(label) {
    const l = (label ?? '').toLowerCase();
    for (const rule of COLOR_RULES) {
      if (rule.test(l)) return rule.color;
    }
    return DEFAULT_COLOR;
  }

  /** Pick the most severe colour among a set of labels for one day. */
  function dayColor(dayEntries) {
    for (const rule of COLOR_RULES) {
      if (dayEntries.some(e => rule.test((e.label ?? '').toLowerCase()))) return rule.color;
    }
    return DEFAULT_COLOR;
  }

  // ── SVG dimensions (viewBox units) ────────────────────────────────────────
  const CHART_H = 100; // viewBox height units

  // ── Data derivation ───────────────────────────────────────────────────────
  const yearRows = $derived(() => {
    // Group entries by year string
    const byYear = new Map();
    for (const e of entries) {
      const y = e.date.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(e);
    }

    const rows = [];
    for (const [year, yEntries] of [...byYear.entries()].sort()) {
      // Count and group entries per date
      const countMap    = rollup(yEntries, v => v.length, d => d.date);
      const entriesByDay = rollup(yEntries, v => v, d => d.date);

      const isLeap      = new Date(+year, 1, 29).getDate() === 29;
      const daysInYear  = isLeap ? 366 : 365;

      const bars = [];
      for (let doy = 0; doy < daysInYear; doy++) {
        const d       = new Date(+year, 0, doy + 1);
        const mm      = String(d.getMonth() + 1).padStart(2, '0');
        const dd      = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        const count   = countMap.get(dateStr) ?? 0;
        const color   = count > 0 ? dayColor(entriesByDay.get(dateStr) ?? []) : null;
        bars.push({ doy, dateStr, count, color });
      }

      const maxCount = max(bars, b => b.count) ?? 1;
      rows.push({ year, bars, daysInYear, maxCount });
    }

    return rows;
  });
</script>

<div class="overview">
  {#each yearRows() as row (row.year)}
    <div class="year-row">
      <div class="year-label">{row.year}</div>
      <div class="year-chart-wrap">
        <svg
          class="year-chart"
          viewBox="0 0 {row.daysInYear} {CHART_H}"
          preserveAspectRatio="none"
          role="img"
          aria-label="Event counts for {row.year}"
        >
          {#each row.bars as bar (bar.doy)}
            {#if bar.count > 0}
              <rect
                x={bar.doy + 0.1}
                y={CHART_H - (bar.count / row.maxCount) * CHART_H}
                width={0.8}
                height={(bar.count / row.maxCount) * CHART_H}
                fill={bar.color}
              >
                <title>{bar.dateStr}: {bar.count} event{bar.count !== 1 ? 's' : ''}</title>
              </rect>
            {/if}
          {/each}
        </svg>
      </div>
    </div>
  {/each}
  <p class="overview-caption">Number of events per day, colored by most severe</p>
</div>

<style>
  .overview {
    border-bottom: 2px solid #d0d0cc;
    background: #fafaf8;
    padding: 0.5rem 0;
  }

  /* ── Year row ── */
  .year-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid #e8e8e4;
  }
  .year-row:last-child { border-bottom: none; }

  /* Fixed-width year label column – matches DayRow date column */
  .year-label {
    flex-shrink: 0;
    width: 108px;
    padding: 6px 10px 6px 14px;
    border-right: 1px solid #ccc;
    font-size: 0.85rem;
    font-weight: 700;
    color: #1a1a1a;
    display: flex;
    align-items: center;
  }

  /* Chart area fills remaining width */
  .year-chart-wrap {
    flex: 1;
    min-width: 0;
    padding: 6px 0;
  }

  .year-chart {
    display: block;
    width: 100%;
    height: 60px;
  }

  /* ── Mobile ── */
  @media (max-width: 520px) {
    .year-label { width: 56px; padding: 6px 4px 6px 8px; font-size: 0.75rem; }
  }
  .overview-caption {
    margin: 0;
    padding: 3px 14px 5px;
    font-size: 0.75rem;
    color: #bbb;
  }
</style>
