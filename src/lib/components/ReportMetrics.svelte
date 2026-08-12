<script>
  import { formatDisturbedTime } from '$lib/report-summary.js';

  let { summary, compact = false, label = 'Report summary' } = $props();
</script>

<section class="metrics" class:compact aria-label={label}>
  <div class="metric">
    <span>Disturbances</span>
    <strong>{summary.disturbances.toLocaleString()}</strong>
  </div>
  <div class="metric">
    <span>Time disturbed</span>
    <strong>{formatDisturbedTime(summary.totalDurationSec)}</strong>
  </div>
  <div class="metric">
    <span>Barks</span>
    <strong>{summary.barks.toLocaleString()}</strong>
  </div>
  <div class="metric">
    <span>Worst density</span>
    <strong>{summary.worstDensityBpm.toLocaleString()} bpm</strong>
  </div>
</section>

<style>
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    border: 1px solid #dededa;
    border-radius: 7px;
    background: #dededa;
  }

  .metric {
    min-width: 0;
    padding: 0.65rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    background: #fff;
  }

  .metric span {
    color: #777;
    font-size: 0.68rem;
    white-space: nowrap;
  }

  .metric strong {
    color: #222;
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .metrics.compact {
    height: 100%;
    grid-template-columns: 1fr;
    gap: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .compact .metric {
    padding: 0.16rem 0.65rem;
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    background: transparent;
  }

  .compact .metric span { font-size: 0.64rem; }
  .compact .metric strong { font-size: 0.7rem; }

  @media (max-width: 620px) {
    .metrics:not(.compact) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .compact .metric { padding-inline: 0.4rem; }
    .compact .metric span { font-size: 0.58rem; }
    .compact .metric strong { font-size: 0.64rem; }
  }
</style>
