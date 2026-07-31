const SAMPLE_LABEL_DEFINITIONS = Object.freeze([
  { name: 'bark',       color: '#e74c3c', duration: '1\u20133 s', occupancy: '50\u201380 %' },
  { name: 'yap',        color: '#e67e22', duration: '1\u20133 s', occupancy: '50\u201380 %' },
  { name: 'background', color: '#27ae60', duration: '3\u20135 s', occupancy: 'n/a' },
  { name: 'wind',       color: '#2980b9', duration: '3\u20135 s', occupancy: 'n/a' },
  { name: 'homestead',  color: '#8e44ad', duration: '3\u20135 s', occupancy: 'n/a' },
  { name: 'traffic',    color: '#7f8c8d', duration: '3\u20135 s', occupancy: 'n/a' },
  { name: 'wildlife',   color: '#2ea096', duration: '1\u20133 s', occupancy: '50\u201380 %' },
  { name: 'gunshot',    color: '#333333', duration: '1\u20133 s', occupancy: '50\u201380 %' },
  { name: 'wrongdog',   color: '#8a8c00', duration: '1\u20133 s', occupancy: '50\u201380 %' },
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

export function sampleLabelColor(label) {
  return SAMPLE_LABEL_COLORS.get(label) ?? '#4a7cdc';
}
