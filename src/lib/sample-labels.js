const SAMPLE_LABEL_DEFINITIONS = Object.freeze([
  { name: 'bark',       color: '#e74c3c', shortcut: 'b', duration: '1–3 s', occupancy: '50–80 %' },
  { name: 'yap',        color: '#e67e22', shortcut: 'y', duration: '1–3 s', occupancy: '50–80 %' },
  { name: 'background', color: '#27ae60', shortcut: 'a', duration: '3–5 s', occupancy: 'n/a' },
  { name: 'wind',       color: '#2980b9', shortcut: 'd', duration: '3–5 s', occupancy: 'n/a' },
  { name: 'homestead',  color: '#8e44ad', shortcut: 'h', duration: '3–5 s', occupancy: 'n/a' },
  { name: 'traffic',    color: '#7f8c8d', shortcut: 't', duration: '3–5 s', occupancy: 'n/a' },
  { name: 'wildlife',   color: '#2ea096', shortcut: 'e', duration: '1–3 s', occupancy: '50–80 %' },
  { name: 'gunshot',    color: '#333333', shortcut: 's', duration: '1–3 s', occupancy: '50–80 %' },
  { name: 'wrongdog',   color: '#8a8c00', shortcut: 'r', duration: '1–3 s', occupancy: '50–80 %' },
].map(Object.freeze));

export const SAMPLE_LABELS = Object.freeze(
  SAMPLE_LABEL_DEFINITIONS.map(({ name }) => name),
);

export const SAMPLE_LABEL_GUIDELINES = Object.freeze(Object.fromEntries(
  SAMPLE_LABEL_DEFINITIONS.map(({ name, duration, occupancy }) => [
    name,
    Object.freeze({ duration, occupancy }),
  ]),
));

const SAMPLE_LABEL_COLORS = new Map(
  SAMPLE_LABEL_DEFINITIONS.map(({ name, color }) => [name, color]),
);

/** Map from shortcut key (single letter) to label name. */
export const LABEL_BY_SHORTCUT = new Map(
  SAMPLE_LABEL_DEFINITIONS.map(({ name, shortcut }) => [shortcut, name]),
);

/** Return the single-letter keyboard shortcut for a label, or '' if none. */
export function sampleLabelShortcut(label) {
  return SAMPLE_LABEL_DEFINITIONS.find(d => d.name === label)?.shortcut ?? '';
}

export function sampleLabelColor(label) {
  return SAMPLE_LABEL_COLORS.get(label) ?? '#4a7cdc';
}
