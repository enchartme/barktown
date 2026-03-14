#!/usr/bin/env node
/**
 * build-audio-index.mjs
 *
 * Preprocessing script for the barktown audio-diary project.
 *
 * Reads a folder of .m4a / .aac files whose filenames encode a timestamp and optional
 * free-text note, then produces:
 *   1. index.json   – metadata array for every file, sorted chronologically
 *   2. waveform JSON files (one per audio file with duration >= 5 seconds)
 *
 * Files must live in a YYYY/MM/ folder hierarchy and follow the naming pattern:
 *   YYYY-MM-DD HH-MM-SS optional free text.m4a
 *   YYYY-MM-DD HH-MM-SS optional free text.aac
 *
 * Example tree:
 *   audio/
 *     2026/
 *       01/
 *         2026-01-17 15-42-00 bark bark bark shot.m4a
 *       02/
 *         2026-02-07 17-25-00 barks.m4a
 *   - ffprobe   (part of FFmpeg)   https://ffmpeg.org/download.html
 *   - audiowaveform                https://github.com/bbc/audiowaveform
 *
 * External tools required: at a local
 * binary with --ffprobe-bin and --audiowaveform-bin.  Downloading a static
 * build avoids a full brew/apt install:
 *
 *   macOS static ffmpeg builds : https://evermeet.cx/ffmpeg/
 *   audiowaveform releases     : https://github.com/bbc/audiowaveform/releases
 *
 *   # one-time setup
 *   mkdir -p ./bin
 *   # place the ffprobe binary at ./bin/ffprobe  (chmod +x it)
 *   chmod +x ./bin/ffprobe ./bin/audiowaveform
 *
 *   node scripts/build-audio-index.mjs \
 *     --ffprobe-bin        ./bin/ffprobe \
 *     --audiowaveform-bin  ./bin/audiowaveform
 *
 * Usage:
 *   node scripts/build-audio-index.mjs \
 *     --input        ./static/audio \
 *     --audio-out    ./static/audio \
 *     --waveform-out ./static/waveforms \
 *     --index-out    ./static/index.json
 *
 * All flags have sensible defaults (see CONFIG below).
 * Run with --help for a quick reference.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ─── Configuration defaults ───────────────────────────────────────────────────
// Edit these or override them via CLI flags (--input, --audio-out, etc.)

const CONFIG = {
  /** Folder that contains the raw audio files to process (scanned recursively by default). */
  inputDir: "./audio",

  /**
   * Folder where processed audio files should live (web-accessible).
   * The script does NOT copy files unless --copy is passed.
   * Used to construct the `audioPath` in index.json.
   */
  audioOutDir: "./audio",

  /** Folder where waveform JSON files will be written (YYYY/MM sub-dirs are created automatically). */
  waveformOutDir: "./waveforms",

  /** Output path for the generated index.json. */
  indexOutPath: "./index.json",

  /**
   * Set to true to also scan sub-folders recursively.
   * true = default (files live in YYYY/MM/ subfolders).
   */
  recursive: true,

  /**
   * Set to true to copy .m4a files from inputDir into audioOutDir.
   * false = assume files are already in place (default).
   */
  copyAudio: false,

  /** Minimum duration (seconds, exclusive) to generate a waveform. */
  waveformThresholdSec: 5,

  /**
   * audiowaveform resolution: samples represented per second of audio.
   * Lower = smaller JSON, less detail. 100 is a good default for a waveform bar chart.
   */
  waveformPixelsPerSecond: 100,

  /** Bit depth for audiowaveform peaks (8 or 16). */
  waveformBits: 8,

  /**
   * Path to the ffprobe binary.
   * "ffprobe" resolves from PATH; set to e.g. "./bin/ffprobe" for a local copy.
   */
  ffprobeBin: "./.bin/ffprobe",

  /**
   * Path to the ffmpeg binary.
   * "ffmpeg" resolves from PATH; set to e.g. "./.bin/ffmpeg" for a local copy.
   */
  ffmpegBin: "./.bin/ffmpeg",

  /**
   * Path to the audiowaveform binary.
   * "audiowaveform" resolves from PATH; set to e.g. "./bin/audiowaveform" for a local copy.
   */
  audiowaveformBin: "audiowaveform",
};

// ─── Filename pattern ─────────────────────────────────────────────────────────
//
// Expected:  YYYY-MM-DD HH-MM-SS optional free text.(m4a|aac)
// Examples:
//   2026-01-17 15-42-00 bark bark bark shot.m4a
//   2025-12-11 05-32-00.aac
//
// Group 1: YYYY-MM-DD
// Group 2: HH
// Group 3: MM
// Group 4: SS
// Group 5: optional label (may be undefined)

const FILENAME_RE =
  /^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{2})(?:\s+(.+?))?\.(?:m4a|aac)$/i;

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2); // strip "node" and script name

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage:
  node scripts/build-audio-index.mjs [options]

Options:
  --input             <dir>   Folder containing audio source files  (default: ${CONFIG.inputDir})
  --audio-out         <dir>   Web-accessible audio folder           (default: ${CONFIG.audioOutDir})
  --waveform-out      <dir>   Folder for generated waveform JSON    (default: ${CONFIG.waveformOutDir})
  --index-out         <file>  Output path for index.json            (default: ${CONFIG.indexOutPath})
  --ffprobe-bin       <path>  Path to ffprobe binary               (default: "ffprobe" on PATH)
  --ffmpeg-bin        <path>  Path to ffmpeg binary                (default: "ffmpeg" on PATH)
  --audiowaveform-bin <path>  Path to audiowaveform binary         (default: "audiowaveform" on PATH)
  --recursive                 Scan inputDir recursively            (default: true)
  --copy                      Copy .m4a files into audio-out       (default: false)
  --help                      Show this message

Using local binaries (avoids brew/apt):
  mkdir -p ./.bin
  # download ffprobe + ffmpeg (separate static builds) from https://evermeet.cx/ffmpeg/
  # audiowaveform: brew install audiowaveform  OR  https://github.com/bbc/audiowaveform/releases
  chmod +x ./.bin/ffprobe ./.bin/ffmpeg
  node scripts/build-audio-index.mjs \\
    --ffprobe-bin ./.bin/ffprobe --ffmpeg-bin ./.bin/ffmpeg
`);
    process.exit(0);
  }

  const cfg = { ...CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input":
        cfg.inputDir = args[++i];
        break;
      case "--audio-out":
        cfg.audioOutDir = args[++i];
        break;
      case "--waveform-out":
        cfg.waveformOutDir = args[++i];
        break;
      case "--index-out":
        cfg.indexOutPath = args[++i];
        break;
      case "--recursive":
        cfg.recursive = true;
        break;
      case "--copy":
        cfg.copyAudio = true;
        break;
      case "--ffprobe-bin":
        cfg.ffprobeBin = args[++i];
        break;
      case "--ffmpeg-bin":
        cfg.ffmpegBin = args[++i];
        break;
      case "--audiowaveform-bin":
        cfg.audiowaveformBin = args[++i];
        break;
      default:
        warn(`Unknown argument: ${args[i]} (ignored)`);
    }
  }

  return cfg;
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function log(...parts) {
  console.log("[build-audio-index]", ...parts);
}

function warn(...parts) {
  console.warn("[build-audio-index] WARN", ...parts);
}

function fatal(...parts) {
  console.error("[build-audio-index] ERROR", ...parts);
  process.exit(1);
}

// ─── External tool checks ─────────────────────────────────────────────────────

/**
 * Verify that a binary exists and is executable.
 * `binPath` may be a bare name (resolved from PATH) or a relative/absolute path.
 * Exits the process with a helpful message if it is missing.
 */
function requireTool(binPath, installHint) {
  // Resolve relative paths against cwd so spawnSync can find them.
  const resolved = path.resolve(binPath) !== binPath
    ? binPath  // bare name like "ffprobe" — leave as-is so the OS resolves it
    : binPath;

  const result = spawnSync(resolved, ["--version"], { encoding: "utf8" });
  if (result.error) {
    const isPath = binPath.startsWith(".") || binPath.startsWith("/");
    fatal(
      `Required tool "${binPath}" was not found${isPath ? " at that path" : " on PATH"}.\n` +
        `  ${installHint}\n` +
        `  Then re-run this script.`
    );
  }
}

/**
 * @param {{ ffprobeBin: string, ffmpegBin: string, audiowaveformBin: string }} cfg
 */
function checkRequiredTools(cfg) {
  requireTool(
    cfg.ffprobeBin,
    cfg.ffprobeBin === "ffprobe"
      ? "Download a static build from https://evermeet.cx/ffmpeg/ and pass --ffprobe-bin ./.bin/ffprobe"
      : `Check that the file exists and is executable: chmod +x ${cfg.ffprobeBin}`
  );
  requireTool(
    cfg.ffmpegBin,
    cfg.ffmpegBin === "ffmpeg"
      ? "Download a static build from https://evermeet.cx/ffmpeg/ (separate from ffprobe) and pass --ffmpeg-bin ./.bin/ffmpeg"
      : `Check that the file exists and is executable: chmod +x ${cfg.ffmpegBin}`
  );
  requireTool(
    cfg.audiowaveformBin,
    cfg.audiowaveformBin === "audiowaveform"
      ? "Install with: brew install audiowaveform  # macOS\n  See https://github.com/bbc/audiowaveform/releases for pre-built Linux packages"
      : `Check that the file exists and is executable: chmod +x ${cfg.audiowaveformBin}`
  );
}

// ─── File system helpers ──────────────────────────────────────────────────────

/**
 * Collect .m4a and .aac file paths from `dir`.
 * @param {string} dir      Absolute or relative directory path.
 * @param {boolean} recursive  Recurse into sub-directories?
 * @returns {string[]}  Array of absolute file paths.
 */
function collectM4aFiles(dir, recursive) {
  const absDir = path.resolve(dir);

  if (!fs.existsSync(absDir)) {
    fatal(`Input directory does not exist: ${absDir}`);
  }

  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      warn(`Could not read directory: ${currentDir} — ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(fullPath);
      } else if (entry.isFile() && /\.(m4a|aac)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(absDir);
  return results;
}

/** Ensure a directory exists, creating it (and parents) as needed. */
function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true });
}

// ─── Filename parsing ─────────────────────────────────────────────────────────

/**
 * Parse a .m4a / .aac filename into structured metadata.
 *
 * @param {string} filename  Bare filename (no directory), e.g. "2026-01-17 15-42-00 bark bark bark shot.m4a"
 * @returns {{ date, time, datetimeLocal, label, id } | null}
 *   Returns null if the filename does not match the expected pattern.
 */
function parseFilename(filename) {
  const match = FILENAME_RE.exec(filename);
  if (!match) return null;

  const [, datePart, hh, mm, ss, rawLabel] = match;

  // Trim any accidental extra whitespace from the free-text label.
  const label = rawLabel ? rawLabel.trim() : "";

  const date = datePart;                        // "2026-01-17"
  const time = `${hh}:${mm}`;                  // "15:42"  (seconds not shown in UI)
  const datetimeLocal = `${date}T${hh}:${mm}:${ss}`; // "2026-01-17T15:42:00"

  // Build a stable, filesystem-safe slug from the filename stem:
  //   "2026-01-17 15-42-00 bark bark bark shot" → "2026-01-17_15-42-00_bark_bark_bark_shot"
  const ext  = filename.match(/\.(m4a|aac)$/i)?.[0] ?? '';
  const stem = filename.slice(0, filename.length - ext.length);
  const id = stem
    .replace(/\s+/g, "_")                 // spaces → "_"
    .replace(/[^a-zA-Z0-9_\-]/g, "_")    // anything non-safe → "_"
    .replace(/_+/g, "_")                  // collapse repeated "_"
    .replace(/^_|_$/g, "");               // trim leading/trailing "_"

  return { date, time, datetimeLocal, label, id };
}

// ─── ffprobe wrapper ──────────────────────────────────────────────────────────

/**
 * Use ffprobe to read the duration (in seconds) of an audio file.
 *
 * Returns 0 if the file is unreadable or has no detectable duration.
 * Never throws.
 *
 * @param {string} filePath  Absolute path to the audio file.
 * @param {string} ffprobeBin  Path to the ffprobe binary (name or path).
 * @returns {number}
 */
function getDuration(filePath, ffprobeBin) {
  const result = spawnSync(
    ffprobeBin,
    [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    { encoding: "utf8" }
  );

  if (result.error || result.status !== 0) {
    warn(`ffprobe failed for: ${path.basename(filePath)}`);
    return 0;
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    warn(`ffprobe returned invalid JSON for: ${path.basename(filePath)}`);
    return 0;
  }

  // Duration can live in format.duration or the first stream's duration.
  const formatDuration = parsed?.format?.duration;
  if (formatDuration != null) {
    const d = parseFloat(formatDuration);
    if (Number.isFinite(d)) return d;
  }

  const streams = parsed?.streams ?? [];
  for (const stream of streams) {
    const d = parseFloat(stream?.duration);
    if (Number.isFinite(d) && d > 0) return d;
  }

  return 0;
}

// ─── audiowaveform wrapper ────────────────────────────────────────────────────

/**
 * Run audiowaveform on an audio file and write a peaks JSON file.
 *
 * audiowaveform does not support M4A/AAC natively, so we decode via ffmpeg
 * first and pipe the raw WAV PCM bytes into audiowaveform's stdin.
 *
 * Pipeline:  ffmpeg -i <file> -f wav -  |  audiowaveform -i - --input-format wav -o <out>
 *
 * @param {string} inputPath   Absolute path to the source .m4a file.
 * @param {string} outputPath  Absolute path for the output .json file.
 * @param {object} cfg         Script configuration.
 * @returns {boolean}  true on success, false on failure.
 */
function generateWaveform(inputPath, outputPath, cfg) {
  // ── Step 1: decode M4A → WAV via ffmpeg, capturing stdout as a Buffer ──
  const decoded = spawnSync(
    cfg.ffmpegBin,
    [
      "-i", inputPath,
      "-vn",          // drop any video stream
      "-ac", "1",    // mix to mono (waveform only needs amplitude, not stereo)
      "-ar", "44100",// normalise sample rate
      "-f", "wav",   // output container: WAV
      "-",           // write to stdout
    ],
    {
      // Do NOT pass encoding:"utf8" – we need a raw Buffer for binary audio data.
      maxBuffer: 300 * 1024 * 1024, // 300 MB – plenty for long recordings
    }
  );

  if (decoded.error || decoded.status !== 0) {
    warn(
      `ffmpeg decode failed for: ${path.basename(inputPath)}\n` +
        `  stderr: ${(decoded.stderr?.toString() || "").trim()}`
    );
    return false;
  }

  // ── Step 2: pipe WAV bytes into audiowaveform's stdin ──
  const result = spawnSync(
    cfg.audiowaveformBin,
    [
      "-i", "-",              // read from stdin
      "--input-format", "wav",// tell audiowaveform what it's receiving
      "-o", outputPath,
      "--pixels-per-second", String(cfg.waveformPixelsPerSecond),
      "--bits", String(cfg.waveformBits),
    ],
    {
      input: decoded.stdout,          // Buffer from ffmpeg
      maxBuffer: 50 * 1024 * 1024,
    }
  );

  if (result.error || result.status !== 0) {
    warn(
      `audiowaveform failed for: ${path.basename(inputPath)}\n` +
        `  stderr: ${(result.stderr?.toString() || "").trim()}`
    );
    return false;
  }

  return true;
}

// ─── Audio copying (optional) ─────────────────────────────────────────────────

/**
 * Copy a source audio file into the audio output directory.
 * Skips the copy if the source and destination are the same file.
 *
 * @param {string} srcPath  Absolute source path.
 * @param {string} destDir  Absolute destination directory (must already exist).
 * @returns {string}  The destination path.
 */
function copyAudioFile(srcPath, destDir) {
  const destPath = path.join(destDir, path.basename(srcPath));
  const absSrc = path.resolve(srcPath);
  const absDest = path.resolve(destPath);

  if (absSrc === absDest) {
    // Already in the right place – nothing to do.
    return destPath;
  }

  try {
    fs.copyFileSync(absSrc, absDest);
  } catch (err) {
    warn(`Could not copy ${path.basename(srcPath)}: ${err.message}`);
  }

  return destPath;
}

// ─── Kind classification ───────────────────────────────────────────────────────

/**
 * Classify an entry by its duration.
 *
 * @param {number} durationSec
 * @param {number} threshold
 * @returns {"empty" | "note" | "audio"}
 */
function classifyKind(durationSec, threshold) {
  if (durationSec <= 0) return "empty";
  if (durationSec < threshold) return "note";
  return "audio";
}

// ─── Web-relative path helper ─────────────────────────────────────────────────

/**
 * Build a web-relative path string.
 *
 * Returns a forward-slash relative path from cwd to the given file,
 * e.g. "audio/2026/01/2026-01-17 15-42-00 barks.m4a".
 *
 * @param {string} absOrRelPath
 * @param {string} cwd  Process working directory (default: process.cwd())
 * @returns {string}
 */
function toWebPath(absOrRelPath, cwd = process.cwd()) {
  let rel = path.relative(cwd, path.resolve(absOrRelPath));
  // Normalise to forward slashes on Windows.
  return rel.replace(/\\/g, "/");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = parseArgs(process.argv);

  log("Starting…");
  log(`  input        : ${path.resolve(cfg.inputDir)}`);
  log(`  audio-out    : ${path.resolve(cfg.audioOutDir)}`);
  log(`  waveform-out : ${path.resolve(cfg.waveformOutDir)}`);
  log(`  index-out    : ${path.resolve(cfg.indexOutPath)}`);
  log(`  recursive    : ${cfg.recursive}`);
  log(`  copy-audio   : ${cfg.copyAudio}`);
  log(`  ffprobe      : ${cfg.ffprobeBin}`);
  log(`  ffmpeg       : ${cfg.ffmpegBin}`);
  log(`  audiowaveform: ${cfg.audiowaveformBin}`);
  log();

  // Verify external tools are available before doing any work.
  checkRequiredTools(cfg);

  // Ensure output directories exist.
  ensureDir(cfg.audioOutDir);
  ensureDir(cfg.waveformOutDir);
  ensureDir(path.dirname(cfg.indexOutPath));

  // Collect source files.
  const files = collectM4aFiles(cfg.inputDir, cfg.recursive);
  log(`Found ${files.length} audio file(s) in ${cfg.inputDir}`);

  if (files.length === 0) {
    log("Nothing to process. Exiting.");
    process.exit(0);
  }

  // ── Counters for the final summary ──
  const stats = {
    total: files.length,
    parsed: 0,
    parseFailures: 0,
    empty: 0,
    notes: 0,
    audioEntries: 0,
    waveformsGenerated: 0,
  };

  const warnings = [];
  const entries = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);

    // ── Parse filename ──
    const parsed = parseFilename(filename);
    if (!parsed) {
      const msg = `Skipping unrecognised filename: "${filename}"`;
      warn(msg);
      warnings.push(msg);
      stats.parseFailures++;
      continue;
    }
    stats.parsed++;

    const { date, time, datetimeLocal, label, id } = parsed;
    const [yyyy, mm] = date.split('-');

    // ── Optionally copy audio file ──
    if (cfg.copyAudio) {
      const audioCopyDir = path.resolve(cfg.audioOutDir, yyyy, mm);
      ensureDir(audioCopyDir);
      copyAudioFile(filePath, audioCopyDir);
    }

    // ── Detect duration ──
    const durationSec = getDuration(filePath, cfg.ffprobeBin);

    // ── Classify ──
    const kind = classifyKind(durationSec, cfg.waveformThresholdSec);

    if (kind === "empty") stats.empty++;
    else if (kind === "note") stats.notes++;
    else stats.audioEntries++;

    // ── Generate waveform (only for full audio entries) ──
    let waveformPath = null;

    if (kind === "audio") {
      const waveformFilename = `${id}.json`;
      const waveformAbsOut = path.resolve(
        cfg.waveformOutDir, yyyy, mm, waveformFilename
      );
      ensureDir(path.dirname(waveformAbsOut));
      const ok = generateWaveform(filePath, waveformAbsOut, cfg);
      if (ok) {
        stats.waveformsGenerated++;
        waveformPath = toWebPath(waveformAbsOut);
        log(`  ✓ waveform  ${waveformFilename}`);
      } else {
        warnings.push(`Waveform generation failed for: "${filename}"`);
      }
    }

    // ── Build index entry ──
    const audioAbsPath = cfg.copyAudio
      ? path.join(path.resolve(cfg.audioOutDir), yyyy, mm, filename)
      : filePath;

    // (ensureDir already called in the copy block above)

    const entry = {
      id,
      filename,
      audioPath: toWebPath(audioAbsPath),
      waveformPath,
      date,
      time,
      datetimeLocal,
      label,
      durationSec: parseFloat(durationSec.toFixed(3)),
      kind,
    };

    entries.push(entry);
    log(`  ${kind === "audio" ? "●" : "○"} ${filename}  [${kind}, ${durationSec.toFixed(2)}s]`);
  }

  // ── Sort chronologically ascending ──
  entries.sort((a, b) => a.datetimeLocal.localeCompare(b.datetimeLocal));

  // ── Write index.json ──
  const indexAbsPath = path.resolve(cfg.indexOutPath);
  try {
    fs.writeFileSync(indexAbsPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
    log(`\nWrote ${entries.length} entries to ${indexAbsPath}`);
  } catch (err) {
    fatal(`Could not write index.json: ${err.message}`);
  }

  // ── Print warnings ──
  if (warnings.length > 0) {
    log("\nWarnings:");
    for (const w of warnings) log(`  ⚠  ${w}`);
  }

  // ── Final summary ──
  log(`
────────────────────────────────
 Summary
────────────────────────────────
 Total .m4a files found   : ${stats.total}
 Parsed successfully      : ${stats.parsed}
 Parse failures (skipped) : ${stats.parseFailures}
 ─
 empty  (0s / unreadable) : ${stats.empty}
 note   (< ${cfg.waveformThresholdSec}s)          : ${stats.notes}
 audio  (>= ${cfg.waveformThresholdSec}s)         : ${stats.audioEntries}
 ─
 Waveform files generated : ${stats.waveformsGenerated}
────────────────────────────────`);
}

main().catch((err) => {
  fatal("Unhandled error:", err);
});
