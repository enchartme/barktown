# barktown

Static audio-diary site. All audio is pre-processed locally; no server, no database.

---

## Audio preprocessing

### What it does

`scripts/build-audio-index.mjs` scans a folder of `.m4a` recordings, reads each
file's duration via **ffprobe**, generates waveform peaks via **audiowaveform**
(only for files ≥ 5 seconds), and writes a single `index.json` with one entry
per recording.

### Prerequisites

Both tools must be on your `PATH` before running the script.

```bash
# macOS (Homebrew)
brew install ffmpeg audiowaveform

# Debian / Ubuntu
sudo apt install ffmpeg
# audiowaveform: see https://github.com/bbc/audiowaveform#installation
```

The script will exit immediately with a helpful error message if either tool is
missing.

---

### Folder layout

**Before running the script:**

```
barktown/
├── scripts/
│   └── build-audio-index.mjs
└── static/
    └── audio/
        ├── 2026-02-07 at 17-25 barks.m4a
        ├── 2026-01-11 at 12-41 barks and yaps.m4a
        ├── 2025-12-11 at 05-32.m4a
        └── 2026-01-06 at 13-53 bark bark.m4a
```

**After running the script:**

```
barktown/
├── scripts/
│   └── build-audio-index.mjs
└── static/
    ├── index.json                              ← generated
    ├── audio/
    │   ├── 2026-02-07 at 17-25 barks.m4a
    │   ├── 2026-01-11 at 12-41 barks and yaps.m4a
    │   ├── 2025-12-11 at 05-32.m4a
    │   └── 2026-01-06 at 13-53 bark bark.m4a
    └── waveforms/                              ← generated
        ├── 2026-02-07_17-25_barks.json
        ├── 2026-01-11_12-41_barks_and_yaps.json
        └── 2026-01-06_13-53_bark_bark.json
        # (no waveform for the 0-second file)
```

---

### Running the script

**Quickstart (default paths – audio already in `static/audio`):**

```bash
node scripts/build-audio-index.mjs
```

**Full explicit invocation:**

```bash
node scripts/build-audio-index.mjs \
  --input        ./static/audio \
  --audio-out    ./static/audio \
  --waveform-out ./static/waveforms \
  --index-out    ./static/index.json
```

**Recursive scan (sub-folders included):**

```bash
node scripts/build-audio-index.mjs --recursive
```

**Copy audio files from a raw source folder into the site folder:**

```bash
node scripts/build-audio-index.mjs \
  --input     ./raw-audio \
  --audio-out ./static/audio \
  --copy
```

`--copy` is off by default. Without it the script reads files in place and only
writes `index.json` and waveform JSON files.

**Help:**

```bash
node scripts/build-audio-index.mjs --help
```

---

### Input filename format

```
YYYY-MM-DD at HH-MM optional free text.m4a
```

| Part | Required | Example |
|---|---|---|
| `YYYY-MM-DD` | yes | `2026-02-07` |
| ` at ` | yes | literal |
| `HH-MM` | yes | `17-25` |
| ` optional free text` | no | ` barks and yaps` |

Files whose names do not match this pattern are skipped with a warning; they
never crash the run.

---

### Output schema

`static/index.json` is a JSON array sorted chronologically (oldest first).

**Entry for a full audio recording (duration ≥ 5 s):**

```json
{
  "id":            "2026-02-07_17-25_barks",
  "filename":      "2026-02-07 at 17-25 barks.m4a",
  "audioPath":     "audio/2026-02-07 at 17-25 barks.m4a",
  "waveformPath":  "waveforms/2026-02-07_17-25_barks.json",
  "date":          "2026-02-07",
  "time":          "17:25",
  "datetimeLocal": "2026-02-07T17:25:00",
  "label":         "barks",
  "durationSec":   18.42,
  "kind":          "audio"
}
```

**Entry for a short or empty recording (duration < 5 s):**

```json
{
  "id":            "2025-12-11_05-32",
  "filename":      "2025-12-11 at 05-32.m4a",
  "audioPath":     "audio/2025-12-11 at 05-32.m4a",
  "waveformPath":  null,
  "date":          "2025-12-11",
  "time":          "05:32",
  "datetimeLocal": "2025-12-11T05:32:00",
  "label":         "",
  "durationSec":   0,
  "kind":          "note"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable slug derived from filename, safe for URLs and filenames |
| `filename` | string | Original filename, preserved exactly |
| `audioPath` | string | Web-relative path to the audio file |
| `waveformPath` | string \| null | Web-relative path to waveform JSON, or `null` |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:MM` |
| `datetimeLocal` | string | `YYYY-MM-DDTHH:MM:00` (local time, no timezone) |
| `label` | string | Free-text note from filename, empty string if absent |
| `durationSec` | number | Duration in seconds, 3 decimal places, 0 if unreadable |
| `kind` | `"audio"` \| `"note"` \| `"empty"` | Classification by duration |

**Waveform JSON** (written by `audiowaveform`, one file per `"audio"` entry):

```json
{
  "version": 2,
  "channels": 1,
  "sample_rate": 44100,
  "samples_per_pixel": 441,
  "bits": 8,
  "length": 4178,
  "data": [-8, 7, -12, 11, ...]
}
```

The `data` array contains interleaved min/max pairs per pixel column. Pass
`pixels_per_second` (configured as `100` by default) to your frontend renderer
to display the waveform at the correct time scale.

---

### Frontend consumption

```js
// 1. Load the index
const response = await fetch("/index.json");
const entries = await response.json();

// 2. Render each entry
for (const entry of entries) {
  // Always available: date, time, label, audioPath, kind
  renderCard(entry);

  // Load waveform only for audio entries
  if (entry.waveformPath) {
    const wfRes = await fetch("/" + entry.waveformPath);
    const waveform = await wfRes.json();
    // waveform.data is an Int8Array of interleaved [min, max] pairs
    // waveform.length = number of pixel columns
    renderWaveform(waveform);
  }
}
```

The `audioPath` and `waveformPath` fields are already web-relative (no leading
slash), so prefix with `/` or your CDN base URL as needed.

---

### Re-running the script

The script is **idempotent**: running it again on the same folder overwrites
`index.json` and any existing waveform JSON files in place. It does not
accumulate stale entries.
