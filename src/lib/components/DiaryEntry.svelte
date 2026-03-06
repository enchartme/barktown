<script>
  /**
   * @type {{
   *   entry: import('$lib/types').Entry;
   *   height: number;
   *   isSelected: boolean;
   *   onselect: (entry: import('$lib/types').Entry) => void;
   * }}
   */
  let { entry, height, isSelected, onselect } = $props();

  function handleClick() {
    onselect(entry);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(entry);
    }
  }
</script>

<!-- Flag/pin marker – visually overflows its slot -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="flag flag--{entry.kind}"
  class:selected={isSelected}
  role="button"
  tabindex="0"
  aria-label="{entry.kind === 'audio' ? 'Audio' : 'Note'}: {entry.label || entry.time} at {entry.time}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  style="height: {height}px;"
  title="{entry.time}  {entry.label}  ({entry.kind})"
>
  <span class="flag-stem"></span>
  {#if entry.kind === 'audio'}
    <!-- Play-in-circle knob for audio entries -->
    <svg class="flag-knob" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="#2255bb" stroke="#fff" stroke-width="1"/>
      <polygon points="5.5,4.5 12,8 5.5,11.5" fill="#fff"/>
    </svg>
  {/if}
  <span class="flag-tag">
    {#if entry.label}
      <span class="flag-label-text">{entry.label}</span>
    {:else}
      <span class="flag-time">{entry.time}</span>
    {/if}
  </span>
</div>

<style>
  /* ══ Flag / pin (all entry kinds) ════════════════════════════ */
  .flag {
    position: relative;
    /* slot width is usually 15-min minimum – let visual elements overflow */
    overflow: visible;
    width: 100%;
    cursor: pointer;
    user-select: none;
  }

  /* Vertical stem */
  .flag-stem {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    width: 2px;
    height: 100%;
    background: #c4a000;
    border-radius: 1px;
  }

  /* Circle knob – only rendered for audio (SVG play icon) */
  .flag-knob {
    position: absolute;
    left: 50%;
    top: 0px;
    transform: translateX(-50%);
    pointer-events: none;
    display: block;
  }

  /* Label tag hanging to the right of the stem */
  .flag-tag {
    position: absolute;
    left: calc(50% + 7px);
    top: 3px;
    display: flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    background: #fffbe6;
    border: 1px solid #e6c96a;
    border-radius: 3px;
    padding: 1px 4px;
    pointer-events: none; /* parent .flag handles clicks */
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }

  .flag-time {
    font-size: 0.58rem;
    font-weight: 700;
    color: #7a5700;
    line-height: 1.2;
  }

  .flag-label-text {
    font-size: 0.58rem;
    color: #443300;
    line-height: 1.2;
  }

  /* ── Audio variant (blue) ── */
  .flag--audio .flag-stem { background: #2255bb; }
  /* knob is an SVG – no background overrides needed */
  .flag--audio .flag-tag  { background: #dce8ff; border-color: #aac4f0; }
  .flag--audio .flag-time { color: #1a3d99; }
  .flag--audio .flag-label-text { color: #223366; }

  /* ── Note variant (yellow) ── */
  .flag--note .flag-stem { background: #c4a000; }
  .flag--note .flag-tag  { background: #fffbe6; border-color: #e6c96a; }
  .flag--note .flag-time { color: #7a5700; }
  .flag--note .flag-label-text { color: #443300; }

  /* ── Empty variant (gray) ── */
  .flag--empty .flag-stem { background: #999; }
  .flag--empty .flag-tag  { background: #f5f5f5; border-color: #ccc; }
  .flag--empty .flag-time { color: #666; }
  .flag--empty .flag-label-text { color: #555; }

  /* ── Selected state ── */
  .flag.selected .flag-stem { filter: brightness(1.3); }
  .flag.selected .flag-knob circle { stroke: #4a7cdc; }
  .flag.selected .flag-tag  { outline: 2px solid #4a7cdc; outline-offset: 1px; }

  /* ── Focus ring ── */
  .flag:focus-visible .flag-knob circle { stroke: #4a7cdc; stroke-width: 2; }
  .flag:focus-visible .flag-tag  { outline: 2px solid #4a7cdc; outline-offset: 1px; }
</style>
