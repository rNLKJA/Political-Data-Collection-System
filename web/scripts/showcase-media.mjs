#!/usr/bin/env node
/**
 * Turns the raw output of the showcase tour (web/.showcase/, written by
 * `pnpm showcase:record`) into the committed media:
 *
 *   docs/showcase/NN-name.png          screenshots for the README (palette PNG, < 600 KB)
 *   docs/showcase/<journey>.gif        walkthrough GIFs for the README (960 px, <= 8 MB)
 *   web/public/showcase/screens/*.webp screenshots for /tour
 *   web/public/showcase/<journey>.mp4  walkthroughs for /tour (H.264, faststart, <= 8 MB)
 *   web/public/showcase/<journey>.webp poster frames
 *   web/public/showcase/<journey>.vtt  step captions, timed from the recording
 *   web/src/data/showcase-media.json   sizes, durations and step times for /tour
 *
 * Idle stretches the tour marked (page loads, server work) are cut from both
 * the MP4 and the GIF, and the caption times are shifted to match.
 *
 * Needs ffmpeg and cwebp on PATH. Usage: node scripts/showcase-media.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(WEB, "..");
const RAW = path.join(WEB, ".showcase");
const DOCS = path.join(ROOT, "docs", "showcase");
const PUBLIC = path.join(WEB, "public", "showcase");
const MANIFEST = path.join(WEB, "src", "data", "showcase-media.json");

const MAX_PNG = 600 * 1024;
const MAX_MEDIA = 8 * 1024 * 1024;
/** Idle stretches shorter than this are left in; longer ones keep this much at each end. */
const MIN_IDLE_MS = 450;
const IDLE_MARGIN_MS = 150;
const FPS = 25;

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
}

function probe(file, entries) {
  return execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "csv=p=0", file],
    { encoding: "utf8" },
  ).trim();
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const size = (file) => fs.statSync(file).size;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

for (const dir of [DOCS, path.join(PUBLIC, "screens")]) fs.mkdirSync(dir, { recursive: true });

// ---------------------------------------------------------------------------
// Screenshots

const screens = [];
const screenDir = path.join(RAW, "screens");
for (const name of fs.existsSync(screenDir) ? fs.readdirSync(screenDir).sort() : []) {
  if (!name.endsWith(".png")) continue;
  const src = path.join(screenDir, name);
  const base = name.replace(/\.png$/, "");
  const raw = pngSize(src);
  // Phones are captured at device scale 2: the README copy is downscaled to 1x,
  // the site copy keeps 2x for sharp text on high-density screens.
  const mobile = raw.width < 1000;
  const docsPng = path.join(DOCS, `${base}.png`);
  const scale = mobile ? `scale=${raw.width / 2}:-1:flags=lanczos,` : "";
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-vf",
    `${scale}split[a][b];[a]palettegen=max_colors=256:stats_mode=single[p];[b][p]paletteuse=dither=none`,
    "-compression_level",
    "9",
    "-pred",
    "mixed",
    docsPng,
  ]);
  if (size(docsPng) > MAX_PNG) throw new Error(`${docsPng} is ${kb(size(docsPng))}`);
  const webp = path.join(PUBLIC, "screens", `${base}.webp`);
  run("cwebp", ["-quiet", "-q", "84", "-m", "6", "-sharp_yuv", src, "-o", webp]);
  const docsDims = pngSize(docsPng);
  screens.push({
    file: base,
    png: `docs/showcase/${base}.png`,
    pngBytes: size(docsPng),
    webp: `/showcase/screens/${base}.webp`,
    webpBytes: size(webp),
    width: raw.width,
    height: raw.height,
    docsWidth: docsDims.width,
    docsHeight: docsDims.height,
  });
  console.log(`screen  ${base}: png ${kb(size(docsPng))}, webp ${kb(size(webp))}`);
}

// ---------------------------------------------------------------------------
// Walkthroughs

/** Spans of the raw recording to keep, in seconds. */
function keepSpans(t) {
  const start = Math.max(0, t.steps[0].atMs - 450);
  const end = t.endMs;
  const cuts = t.idle
    .filter(([a, b]) => b - a >= MIN_IDLE_MS)
    .map(([a, b]) => [Math.max(a + IDLE_MARGIN_MS, start), b - IDLE_MARGIN_MS])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const spans = [];
  let from = start;
  for (const [a, b] of cuts) {
    if (a > from) spans.push([from, a]);
    from = Math.max(from, b);
  }
  if (end > from) spans.push([from, end]);
  return spans.map(([a, b]) => [a / 1000, b / 1000]);
}

/** Map a time in the raw recording to the trimmed one. */
function mapTime(spans, rawS) {
  let out = 0;
  for (const [a, b] of spans) {
    if (rawS <= a) return out;
    if (rawS <= b) return out + (rawS - a);
    out += b - a;
  }
  return out;
}

const vttTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, "0")}`;
};

const journeys = {};
const videoDir = path.join(RAW, "videos");
for (const name of fs.existsSync(videoDir) ? fs.readdirSync(videoDir).sort() : []) {
  if (!name.endsWith(".json")) continue;
  const t = JSON.parse(fs.readFileSync(path.join(videoDir, name), "utf8"));
  const webm = path.join(videoDir, `${t.slug}.webm`);
  if (!fs.existsSync(webm)) throw new Error(`Missing ${webm}`);
  const spans = keepSpans(t);
  const select = spans.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})`).join("+");
  const trim = `fps=${FPS},select='${select}',setpts=N/${FPS}/TB`;

  const mp4 = path.join(PUBLIC, `${t.slug}.mp4`);
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    webm,
    "-vf",
    trim,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "28",
    "-tune",
    "stillimage",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  if (size(mp4) > MAX_MEDIA) throw new Error(`${mp4} is ${kb(size(mp4))}`);
  const duration = Number(probe(mp4, "stream=duration")) || mapTime(spans, t.endMs / 1000);

  // GIF: 960 px, 10 fps, a palette per clip; the lowest setting that fits 8 MB wins.
  const gif = path.join(DOCS, `${t.slug}.gif`);
  for (const colors of [192, 128, 96]) {
    run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      mp4,
      "-vf",
      `fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      "-loop",
      "0",
      gif,
    ]);
    if (size(gif) <= MAX_MEDIA) break;
  }
  if (size(gif) > MAX_MEDIA) throw new Error(`${gif} is ${kb(size(gif))}`);

  const steps = t.steps.map((s) => ({
    step: s.step,
    text: s.text,
    atS: Number(mapTime(spans, s.atMs / 1000).toFixed(2)),
  }));

  // Poster: the chosen step, once its caption has faded in.
  const posterStep = steps.find((s) => s.step === t.posterStep) ?? steps[0];
  const posterPng = path.join(RAW, `${t.slug}-poster.png`);
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(posterStep.atS + 1.6),
    "-i",
    mp4,
    "-frames:v",
    "1",
    posterPng,
  ]);
  const poster = path.join(PUBLIC, `${t.slug}.webp`);
  run("cwebp", ["-quiet", "-q", "80", "-m", "6", posterPng, "-o", poster]);

  const cues = steps.map((s, i) => {
    const end = i + 1 < steps.length ? steps[i + 1].atS : duration;
    return `${i + 1}\n${vttTime(s.atS)} --> ${vttTime(end)}\nStep ${s.step} of ${steps.length}. ${s.text}\n`;
  });
  const vtt = path.join(PUBLIC, `${t.slug}.vtt`);
  fs.writeFileSync(vtt, `WEBVTT\n\n${cues.join("\n")}`);

  const [width, height] = probe(mp4, "stream=width,height").split(",").map(Number);
  journeys[t.slug] = {
    title: t.title,
    mp4: `/showcase/${t.slug}.mp4`,
    mp4Bytes: size(mp4),
    poster: `/showcase/${t.slug}.webp`,
    posterBytes: size(poster),
    vtt: `/showcase/${t.slug}.vtt`,
    gif: `docs/showcase/${t.slug}.gif`,
    gifBytes: size(gif),
    width,
    height,
    durationS: Number(duration.toFixed(1)),
    steps: steps.map(({ step, atS }) => ({ step, atS })),
  };
  console.log(
    `journey ${t.slug}: ${duration.toFixed(1)} s, mp4 ${kb(size(mp4))}, gif ${kb(size(gif))}, poster ${kb(size(poster))}`,
  );
}

fs.writeFileSync(MANIFEST, `${JSON.stringify({ journeys, screens }, null, 2)}\n`);
console.log(`wrote ${path.relative(ROOT, MANIFEST)}`);
