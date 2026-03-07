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

  /**
   * Map a label string to a single base colour.
   * Rules are checked top-to-bottom; first match wins.
   * Add more cases here – just return a CSS colour string.
   *
   * @param {string} label
   * @returns {string}
   */
  function labelBase(label) {
    const l = (label ?? '').toLowerCase();

    if (l.includes('shot')) return '#51211d'; 
    if (l.includes('shooting')) return '#51211d'; 
    if (l.includes('barkattack')) return '#ff4c4c'; 
    if (l.includes('bark bark bark')) return '#ff4c4c'; 
    if (l.includes('yapattack')) return '#420f8d'; 
    if (l.includes('yap yap yap')) return '#420f8d'; 
    if (l.includes('bark bark'))      return '#d9665d'; 
    if (l.includes('yap yap'))      return '#593391'; 
    if (l.includes('bark'))           return '#b0766e'; 
    if (l.includes('yap'))           return '#726389'; 

    // ── default ──────────────────────────────────────────────────────────────
    return '#888888';
  }

  const baseColor = $derived(labelBase(entry.label));

  // Strip leading "still " (case-insensitive) – redundant once pins are seen in sequence.
  const displayLabel = $derived(entry.label.replace(/^still\s+/i, '').replace('barking', 'bark').replace('yapping', 'yap'));
</script>

<!-- Flag/pin marker – visually overflows its slot -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="flag"
  class:selected={isSelected}
  class:flag--audio={entry.kind === 'audio'}
  role="button"
  tabindex="0"
  aria-label="{entry.kind === 'audio' ? 'Audio' : 'Note'}: {entry.label || entry.time} at {entry.time}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  style="height: {height}px; --c-base: {baseColor};"
  title="{entry.time}  {entry.label}  ({entry.kind})"
>
  <span class="flag-stem"></span>
  {#if entry.kind === 'audio'}
    <!-- Play-in-circle knob for audio entries -->
    <svg class="flag-knob" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" stroke="#fff" stroke-width="1"/>
      <polygon points="5.5,4.5 12,8 5.5,11.5" fill="#fff"/>
    </svg>
  {/if}
  <span class="flag-tag">
    {#if displayLabel}
      <span class="flag-label-text">{displayLabel}</span>
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
    background: var(--c-base);
    border-radius: 1px;
    z-index: 1;
  }

  /* Circle knob – only rendered for audio (SVG play icon) */
  .flag-knob {
    position: absolute;
    left: 50%;
    top: 0px;
    transform: translateX(-50%);
    pointer-events: none;
    display: block;
    z-index: 2;
  }
  .flag-knob circle { fill: var(--c-base); }

  /* Label tag hanging to the right of the stem */
  .flag-tag {
    position: absolute;
    left: 50%;
    top: 3px;
    display: flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    background: color-mix(in srgb, var(--c-base) 12%, white);
    border: 1px solid color-mix(in srgb, var(--c-base) 35%, white);
    border-left: none;
    border-radius: 0 3px 3px 0;
    padding: 1px 4px;
    pointer-events: none; /* parent .flag handles clicks */
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }

  .flag-time {
    font-size: 0.58rem;
    font-weight: 700;
    color: color-mix(in srgb, var(--c-base) 85%, black);
    line-height: 1.2;
  }

  .flag-label-text {
    font-size: 0.58rem;
    color: color-mix(in srgb, var(--c-base) 85%, black);
    line-height: 1.2;
  }

  /* ── Audio: extra left padding so text clears the knob circle ── */
  .flag--audio .flag-tag { padding-left: 8px; }

  /* ── Selected state ── */
  .flag.selected .flag-stem { filter: brightness(1.3); }
  .flag.selected .flag-knob circle { stroke: #4a7cdc; }
  .flag.selected .flag-tag  { outline: 2px solid #4a7cdc; outline-offset: 1px; }

  /* ── Focus ring ── */
  .flag:focus-visible .flag-knob circle { stroke: #4a7cdc; stroke-width: 2; }
  .flag:focus-visible .flag-tag  { outline: 2px solid #4a7cdc; outline-offset: 1px; }
</style>
