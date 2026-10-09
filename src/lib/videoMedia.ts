// Browser side of the video editor: the source video stays on this device
// (IndexedDB); only a 16 kHz mono sound file goes to the server for captions,
// and up to three small stills for "match this reference". Preview and export
// draw every frame with drawFrame, so what you see is what you get.

import { readableOn } from "@/lib/carouselLayout";
import type { CarouselBrand } from "@/lib/carousel";
import {
  END_CARD_SECONDS,
  STYLES,
  aspectSize,
  exportSize,
  endCardLine,
  buildCaptions,
  captionAt,
  captionCenter,
  captionIntro,
  animOf,
  frameRect,
  captionBoxOf,
  captionFont,
  captionKey,
  distanceToCut,
  focusAt,
  gradeOf,
  integratedLoudness,
  isNumberWord,
  levelFits,
  musicGainAt,
  duckSpans,
  nextGain,
  PEAK_CEILING,
  truePeak,
  type Level,
  keepSegments,
  outIn,
  nameTagVisible,
  outAt,
  soundStats,
  speedOf,
  voiceAt,
  brollAt,
  type Broll,
  overlaysAt,
  type Overlay,
  totalLength,
  zoomAt,
  type Caption,
  type EditSettings,
  type Segment,
  type Word,
  peaksFrom,
  waveAt,
} from "@/lib/videoEdit";
import { cueTicker, drawMotion, dropGain, hookTop, keyZoom, motionOf, playCue } from "@/lib/videoMotion";
import { drawBroll } from "@/lib/brollCard";
import { joinKept, sampleKept, wholeFits, type KeptPart } from "@/lib/keptSound";
import { clipStats } from "@/lib/exportCheck";
import { FAST, isFast, segLength } from "@/lib/fastPauses";
import { DENOISE_RATE, denoiseNode } from "@/lib/denoise";
import { withColdOpen } from "@/lib/coldOpen";

// ---------- sound for captions ----------

export async function extractWav(file: Blob): Promise<{ wav: Blob; duration: number }> {
  const ctx = new AudioContext();
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  return { wav: encodeWav(pcm, rate), duration: audio.duration };
}

/** Mono 16-bit WAV from samples. */
export function encodeWav(pcm: Float32Array, rate: number): Blob {
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([out], { type: "audio/wav" });
}

/** The dubbed voice as one track the length of the edit: each line cut from the AI audio and laid where dubPlacement says. */
export async function layDub(audio: Blob, place: { at: number; from: number; dur: number }[], total: number): Promise<Blob> {
  const rate = 24000;
  const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await audio.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(total * rate)), rate);
  for (const p of place) {
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(p.at, p.from, p.dur);
  }
  return encodeWav((await off.startRendering()).getChannelData(0), rate);
}

/** Loudness of a sound file, 20 readings a second (decoded at 8 kHz, small even for a long podcast). */
export async function audioPeaks(file: Blob): Promise<number[]> {
  const buf = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(await file.arrayBuffer());
  return peaksFrom(buf.getChannelData(0), buf.sampleRate);
}

/** The Recent tile for a sound file: dark, with its loudness as bars across the middle. */
export function waveThumb(peaks: number[]): string {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 426;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0F172A";
  g.fillRect(0, 0, c.width, c.height);
  const n = 24;
  const per = Math.max(1, Math.floor(peaks.length / n));
  g.fillStyle = "#FFFFFF";
  for (let i = 0; i < n; i++) {
    const v = Math.max(...peaks.slice(i * per, i * per + per), 0);
    const h = Math.max(4, v * 120);
    roundRect(g, 24 + i * 8, c.height / 2 - h / 2, 5, h, 2.5);
  }
  return c.toDataURL("image/jpeg", 0.7);
}

/** A podcast or voice clip has no picture: the brand colour, the speaker's photo and name, and the sound as moving bars. */
function drawAudioScene(g: CanvasRenderingContext2D, W: number, H: number, peaks: number[], t: number, brand?: BrandArt | null) {
  const k = W / 1080;
  const base = brand?.color ?? "#0F172A";
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, base);
  grad.addColorStop(1, "#05070D");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const mid = H * 0.5;
  if (brand?.photo || brand?.name) {
    let y = mid - 420 * k;
    if (brand.photo) {
      const r = 110 * k;
      g.save();
      g.beginPath();
      g.arc(W / 2, y, r, 0, Math.PI * 2);
      g.clip();
      g.drawImage(brand.photo, W / 2 - r, y - r, r * 2, r * 2);
      g.restore();
      y += r + 56 * k;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#FFFFFF";
    g.font = `700 ${Math.round(46 * k)}px "DM Sans", Inter, system-ui, sans-serif`;
    if (brand.name) g.fillText(brand.name, W / 2, y, W * 0.86);
  }
  // the bar in the middle is now; the ones to its left were just said
  const bars = waveAt(peaks, t, 41);
  const gap = 8 * k;
  const bw = (W * 0.8 - gap * (bars.length - 1)) / bars.length;
  const x0 = W * 0.1;
  const maxH = 260 * k;
  bars.forEach((v, i) => {
    const h = Math.max(10 * k, v * maxH);
    g.globalAlpha = i < 20 ? 0.95 : i === 20 ? 1 : 0.4;
    g.fillStyle = "#FFFFFF";
    roundRect(g, x0 + i * (bw + gap), mid - 60 * k - h / 2, bw, h, bw / 2);
  });
  g.globalAlpha = 1;
}

// ---------- stills ----------

export function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("This browser can't open that video. Try an MP4 or MOV."));
  });
}

export const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.01) return resolve();
    v.addEventListener("seeked", () => resolve(), { once: true });
    v.currentTime = t;
  });

/** JPEG stills at the given fractions of the video, `width` px wide. */
export async function stills(file: Blob, at = [0.2, 0.5, 0.8], width = 360): Promise<string[]> {
  const v = await loadVideo(file);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * v.videoHeight) / v.videoWidth);
  const g = c.getContext("2d")!;
  const out: string[] = [];
  for (const f of at) {
    await seek(v, Math.min(v.duration - 0.05, v.duration * f));
    g.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL("image/jpeg", 0.7));
  }
  URL.revokeObjectURL(v.src);
  return out;
}

// ---------- the source file, on this device only ----------

export { putFile, getFile, deleteFile } from "@/lib/deviceFiles";

// ---------- caption fonts ----------

// The caption styles name Archivo Black, DM Sans and Fraunces. They load only
// here (the rest of the app never needs them), and drawing waits for them, so
// the canvas never paints a fallback face into an export.
let fontsReady: Promise<void> | null = null;
export function ensureCaptionFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (typeof document === "undefined") return;
    const href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:wght@500;600;700&family=Fraunces:wght@600&display=swap";
    if (!document.querySelector(`link[href="${href}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
      await new Promise((r) => { l.onload = r; l.onerror = r; });
    }
    await Promise.all(
      ['900 64px "Archivo Black"', '600 64px "DM Sans"', '700 64px "DM Sans"', '600 64px Fraunces'].map((f) => document.fonts.load(f).catch(() => [])),
    );
  })();
  return fontsReady;
}

// ---------- drawing ----------

const BASE_PX: Record<string, number> = { bold: 92, cutout: 84, minimal: 46, editorial: 54, native: 54, documentary: 42 };

function wrap(g: CanvasRenderingContext2D, words: string[], maxW: number): string[][] {
  const lines: string[][] = [[]];
  for (const w of words) {
    const line = lines[lines.length - 1];
    if (line.length && g.measureText([...line, w].join(" ")).width > maxW) lines.push([w]);
    else line.push(w);
  }
  return lines;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

export interface Frame {
  video: HTMLVideoElement;
  settings: EditSettings;
  caps: Caption[];
  segs: Segment[];
  /** where we are on the source and the edited timelines */
  src: number;
  out: number;
  total: number;
  /** Second-language line per caption, by captionKey. */
  subs?: Record<string, string>;
  /** The brand kit, for the logo. */
  brand?: BrandArt | null;
  /** A paused or scrubbed preview: captions drawn fully in, without the pop-in. */
  still?: boolean;
  /** The B-roll clip showing now (kept in step by syncBroll), drawn full-frame over the speaker. */
  broll?: HTMLVideoElement | null;
  /** Face and background effects (faceVision.ts), painted over the speaker's picture once it is drawn; r is where it shows. */
  fx?: ((g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }) => void) | null;
  /** A sound-only source's loudness (audioPeaks): drawn as a moving waveform on the brand colour. */
  peaks?: number[] | null;
}

// ---------- voice polish ----------

/**
 * Wires input to output, through the voice polish when on: a high-pass at
 * 90 Hz (rumble, 50 Hz mains hum), a small cut at 250 Hz (boxiness), a lift at
 * 3 kHz (clarity), then a gentle compressor so quiet and loud moments sit
 * closer together. With a measured level, it then lifts the sound to -14 LUFS
 * into a limiter that holds the peaks down. Returns a function that unwires it all.
 */
export function wireVoice(ctx: BaseAudioContext, input: AudioNode, output: AudioNode, polish: boolean, level?: Level | null, denoise?: AudioNode | null): () => void {
  // background noise out first (denoise.ts), so the polish and the loudness lift don't raise it
  const chain: AudioNode[] = denoise ? [denoise] : [];
  if (polish) {
    // two stages make a 4th-order Butterworth high-pass (24 dB an octave): 50 Hz hum drops about 20 dB
    chain.push(
      new BiquadFilterNode(ctx, { type: "highpass", frequency: 90, Q: 0.54 }),
      new BiquadFilterNode(ctx, { type: "highpass", frequency: 90, Q: 1.31 }),
      new BiquadFilterNode(ctx, { type: "peaking", frequency: 250, Q: 1, gain: -2.5 }),
      new BiquadFilterNode(ctx, { type: "peaking", frequency: 3000, Q: 0.9, gain: 3 }),
      // the compressor applies its own make-up gain (Web Audio spec), so no extra gain stage: loud sources keep headroom
      new DynamicsCompressorNode(ctx, { threshold: -26, knee: 10, ratio: 3.5, attack: 0.005, release: 0.2 }),
    );
  }
  if (level) {
    // the limiter's own make-up gain is part of what was measured, so the gain and trim account for it
    chain.push(
      new GainNode(ctx, { gain: 10 ** (level.gain / 20) }),
      new DynamicsCompressorNode(ctx, { threshold: -6, knee: 0, ratio: 20, attack: 0.001, release: 0.1 }),
      new GainNode(ctx, { gain: 10 ** (level.trim / 20) }),
    );
  }
  let last = input;
  for (const n of chain) last = last.connect(n);
  last.connect(output);
  return () => {
    input.disconnect(chain[0] ?? output);
    // every node lets go of what it fed, so a noise node kept for the next wiring feeds nothing old
    for (const n of chain) n.disconnect();
  };
}

/**
 * Measures the sound the edit keeps (keep.parts, source seconds) as the edit
 * plays it (voice polish as set), then finds the lift that brings it to -14 LUFS
 * through the limiter, rendering it offline to check (two or three quick passes),
 * and a trim that keeps the true peak under -1 dB. Null when the video has no
 * sound, or runs over 15 minutes and its sound can't be read in parts.
 */
export async function measureLevel(file: Blob, polish: boolean, keep: { parts: KeptPart[]; duration?: number; pieces?: { buf: AudioBuffer; start: number }[] }): Promise<Level | null> {
  const rate = 48000;
  const buf = await keptSound(file, keep);
  if (!buf) return null;
  const render = async (lvl: Level | null) => {
    // stereo, as the export records it: a mono phone recording plays in both channels and the apps count both
    const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(buf.duration * rate)), rate);
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    wireVoice(ctx, src, ctx.destination, polish, lvl);
    src.start();
    const out = await ctx.startRendering();
    const ch = Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i));
    return { lufs: integratedLoudness(ch, rate), peak: truePeak(ch) };
  };
  const before = (await render(null)).lufs;
  if (before === null) return null;
  const level: Level = { polish, before, after: before, peak: 0, gain: nextGain(0, before) ?? 0, trim: 0 };
  for (let pass = 0; pass < 3; pass++) {
    const m = await render(level);
    if (m.lufs === null) return null;
    level.after = m.lufs;
    level.peak = m.peak;
    const next = nextGain(level.gain, m.lufs);
    if (next === null || pass === 2) break;
    level.gain = next;
  }
  // the trim sits after the limiter, so it moves the level and the peak by the same amount
  level.trim = Math.min(0, PEAK_CEILING - level.peak);
  level.after += level.trim;
  level.peak += level.trim;
  return level;
}

/**
 * The sound the edit keeps (keptSound.ts), back to back: decoded part by part from an
 * MP4 or MOV (fastExport's decoder, or the pieces it already has), else the whole
 * file when it runs up to 15 minutes; null for a longer one, so it is never decoded whole.
 */
async function keptSound(file: Blob, keep: { parts: KeptPart[]; duration?: number; pieces?: { buf: AudioBuffer; start: number }[] }): Promise<AudioBuffer | null> {
  const parts = sampleKept(keep.parts);
  let pieces = keep.pieces ? parts.map((w) => keep.pieces![w.part]) : null;
  if (!pieces && parts.length) {
    const { decodeParts } = await import("@/lib/fastExport");
    pieces = await decodeParts(file, parts.map((w) => ({ at: 0, from: w.from, dur: w.dur }))).catch(() => null);
  }
  if (!pieces) {
    if (!wholeFits(keep.duration)) return null;
    try {
      const whole = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await file.arrayBuffer());
      pieces = parts.map(() => ({ buf: whole, start: 0 }));
    } catch {
      return null; // no sound track the browser can read
    }
  }
  const ch = joinKept(pieces.map((p) => ({ start: p.start, rate: p.buf.sampleRate, channels: Array.from({ length: p.buf.numberOfChannels }, (_, c) => p.buf.getChannelData(c)) })), parts);
  if (!ch) return null;
  const buf = new AudioBuffer({ length: ch[0].length, sampleRate: pieces[0].buf.sampleRate, numberOfChannels: ch.length });
  ch.forEach((d, c) => buf.copyToChannel(d, c));
  return buf;
}

// ---------- brand kit on video ----------

/** The brand kit with its pictures loaded, ready to paint. */
export interface BrandArt {
  logo?: HTMLImageElement;
  photo?: HTMLImageElement;
  name: string;
  handle: string;
  role: string;
  color: string;
  line: string;
}

function loadImg(src: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!src) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

export async function loadBrandArt(brand: CarouselBrand | null): Promise<BrandArt | null> {
  if (!brand || !(brand.name?.trim() || brand.handle?.trim() || brand.photo || brand.logo)) return null;
  const [logo, photo] = await Promise.all([loadImg(brand.logo), loadImg(brand.photo)]);
  return { logo, photo, name: brand.name.trim(), handle: brand.handle.trim(), role: (brand.role ?? "").trim(), color: brand.color, line: endCardLine(brand.signOff) };
}

/** The closing card: brand colour, round photo, name, handle, role and the sign-off line; fades in over 0.3 s. */
export function drawEndCard(g: CanvasRenderingContext2D, art: BrandArt, t: number) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = Math.min(W, H) / 1080;
  g.save();
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = Math.min(1, Math.max(0, t / 0.3));
  g.fillStyle = art.color;
  g.fillRect(0, 0, W, H);
  const ink = readableOn(art.color);
  const rows: { text: string; font: string; alpha: number; gap: number }[] = [];
  if (art.name) rows.push({ text: art.name, font: `800 ${Math.round(76 * u)}px "DM Sans", Inter, system-ui, sans-serif`, alpha: 1, gap: 92 * u });
  if (art.handle) rows.push({ text: art.handle, font: `600 ${Math.round(44 * u)}px "DM Sans", Inter, system-ui, sans-serif`, alpha: 0.85, gap: 62 * u });
  if (art.role) rows.push({ text: art.role, font: `500 ${Math.round(38 * u)}px "DM Sans", Inter, system-ui, sans-serif`, alpha: 0.75, gap: 56 * u });
  const r = art.photo ? 170 * u : 0;
  const lineH = art.line ? 120 * u : 0;
  const block = (r ? r * 2 + 60 * u : 0) + rows.reduce((a, b) => a + b.gap, 0) + lineH;
  let y = (H - block) / 2;
  if (art.photo) {
    const cx = W / 2;
    const cy = y + r;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    const side = Math.min(art.photo.naturalWidth, art.photo.naturalHeight);
    g.drawImage(art.photo, (art.photo.naturalWidth - side) / 2, (art.photo.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    g.restore();
    g.strokeStyle = ink;
    g.globalAlpha *= 0.5;
    g.lineWidth = 6 * u;
    g.beginPath();
    g.arc(cx, cy, r + 3 * u, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = Math.min(1, Math.max(0, t / 0.3));
    y += r * 2 + 60 * u;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fade = g.globalAlpha;
  for (const row of rows) {
    g.font = row.font;
    g.fillStyle = ink;
    g.globalAlpha = fade * row.alpha;
    g.fillText(row.text, W / 2, y + row.gap / 2, W * 0.88);
    y += row.gap;
  }
  if (art.line) {
    g.globalAlpha = fade;
    g.font = `700 ${Math.round(40 * u)}px "DM Sans", Inter, system-ui, sans-serif`;
    const tw = Math.min(W * 0.84, g.measureText(art.line).width);
    const bh = 84 * u;
    const by = y + 36 * u;
    g.fillStyle = ink;
    roundRect(g, (W - tw) / 2 - 36 * u, by, tw + 72 * u, bh, bh / 2);
    g.fillStyle = art.color;
    g.fillText(art.line, W / 2, by + bh / 2, W * 0.84);
  }
  g.restore();
}

export function drawFrame(g: CanvasRenderingContext2D, f: Frame) {
  const { video: v, settings: s } = f;
  const W = g.canvas.width;
  const H = g.canvas.height;
  const spec = STYLES[s.style];
  const k = W / 1080;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);

  // the picture: cover the frame, crop centred on focusX (or on the face, when following it), punch in on alternate cuts
  // (effects are skipped under a full-frame B-roll cutaway, which covers the picture anyway)
  const fx = f.broll?.videoWidth && !s.brollLayout ? null : f.fx;
  const shown = (x: number, y: number, w: number, h: number) => ({ x: Math.max(0, x), y: Math.max(0, y), w: Math.min(W, x + w) - Math.max(0, x), h: Math.min(H, y + h) - Math.max(0, y) });
  if (!v.videoWidth && f.peaks?.length) drawAudioScene(g, W, H, f.peaks, f.src, f.brand);
  // zooms on key lines (eased, held a little above the middle, where a face sits) replace the punch-in on cuts
  const motion = motionOf(s, f.segs, f.caps, f.total);
  if (v.videoWidth) {
    const zoom = motion.zooms.length ? keyZoom(motion.zooms, f.out) : s.punchIn ? zoomAt(f.segs, f.src, spec.punch) : 1;
    const zy = motion.zooms.length ? 0.42 : 0.5;
    const cover = Math.max(W / v.videoWidth, H / v.videoHeight);
    if (s.fit === "framed") {
      // the whole picture in a rounded window on the brand colour, darker at the foot
      const base = f.brand?.color ?? "#0F172A";
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, base);
      grad.addColorStop(1, "#05070D");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      const r = frameRect(W, H, v.videoWidth, v.videoHeight);
      const zw = r.w * zoom;
      const zh = r.h * zoom;
      g.save();
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 28 * k);
      g.clip();
      g.filter = gradeOf(s);
      g.drawImage(v, r.x - (zw - r.w) / 2, r.y - (zh - r.h) / 2, zw, zh);
      g.filter = "none";
      fx?.(g, shown(r.x, r.y, r.w, r.h));
      g.restore();
    } else if (s.fit === "blur") {
      // the whole picture, over a darkened, blurred copy filling the frame
      const bw = v.videoWidth * cover;
      const bh = v.videoHeight * cover;
      const look = gradeOf(s);
      g.filter = `blur(${Math.round(36 * k)}px) brightness(0.62)${look === "none" ? "" : ` ${look}`}`;
      g.drawImage(v, (W - bw) / 2, (H - bh) / 2, bw, bh);
      g.filter = "none";
      const scale = Math.min(W / v.videoWidth, H / v.videoHeight) * zoom;
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      g.filter = gradeOf(s);
      g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.filter = "none";
      fx?.(g, shown((W - dw) / 2, (H - dh) / 2, dw, dh));
    } else {
      const scale = cover * zoom;
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      const dx = Math.min(0, Math.max(W - dw, W / 2 - dw * focusAt(s, f.src)));
      const dy = Math.min(0, Math.max(H - dh, H * zy - dh * zy));
      g.filter = gradeOf(s);
      g.drawImage(v, dx, dy, dw, dh);
      g.filter = "none";
      fx?.(g, shown(0, 0, W, H));
    }
  }
  // where the captions sit: about two lines either side of their centre (cards and the hook keep clear)
  const capHalf = (BASE_PX[s.style] * s.size * k * 1.18) / H;
  const capBand: [number, number] | null = s.captions ? [captionCenter(s) - capHalf, captionCenter(s) + capHalf] : null;

  // a B-roll cutaway covers the whole frame, or sits in a card over the dimmed shot (brollCard.ts); captions and the rest still go on top
  if (f.broll?.videoWidth) drawBroll(g, f.broll, s, f.out, v, capBand, f.still);
  // transition at each cut: a quick dip through black or a white flash, 60 ms either side
  if (s.transition) {
    const d = distanceToCut(f.segs, f.out * speedOf(s)) / speedOf(s);
    if (d < 0.06) {
      g.save();
      g.globalAlpha = (1 - d / 0.06) * (s.transition === "soft" ? 0.9 : 0.75);
      g.fillStyle = s.transition === "soft" ? "#000" : "#FFF";
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
  if (spec.bars && s.grade) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H * 0.09);
    g.fillRect(0, H * 0.91, W, H * 0.09);
  }

  // hook title: a white card for the first seconds of the edit, 11% from the top unless the face is there
  // (laid out first so captions avoid it)
  let hook: { lines: string[][]; px: number; lh: number; bw: number; bh: number; top: number } | null = null;
  if (s.hook.trim() && f.out < s.hookSeconds) {
    const px = 60 * k;
    g.font = `800 ${Math.round(px)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
    const lines = wrap(g, s.hook.trim().split(/\s+/), W * 0.8);
    const lh = px * 1.2;
    hook = { lines, px, lh, bw: Math.max(...lines.map((l) => g.measureText(l.join(" ")).width)) + px * 1.2, bh: lines.length * lh + px * 0.7, top: 0 };
    hook.top = H * hookTop(s, W, H, v.videoWidth, v.videoHeight, hook.bh / H, captionCenter(s) >= 0.4 ? capBand : null);
  }

  // captions
  const cap = s.captions ? captionAt(f.caps, f.src) : null;
  if (cap) {
    const px = BASE_PX[s.style] * s.size * k;
    const font = captionFont(s);
    const box = captionBoxOf(s);
    g.font = font.replace("{px}", String(Math.round(px)));
    g.textAlign = "left";
    g.textBaseline = "middle";
    const text = cap.words.map((w) => (s.uppercase ? w.w.toUpperCase() : w.w));
    const lines = wrap(g, text, W * (spec.mode === "words" ? 0.86 : 0.84));
    // the way in, over the first 150 ms of each caption: pop scales up from 85%, slide rises a
    // little, both fading in; typewriter shows each word as it's said (below)
    const anim = animOf(s);
    const intro = f.still || anim === "none" || anim === "type" ? 1 : captionIntro(f.src, cap.s);
    g.save();
    if (intro < 1) {
      const cy = H * captionCenter(s);
      g.globalAlpha = 0.25 + 0.75 * intro;
      if (anim === "slide") {
        g.translate(0, (1 - intro) * px * 0.9);
      } else {
        g.translate(W / 2, cy);
        g.scale(0.85 + 0.15 * intro, 0.85 + 0.15 * intro);
        g.translate(-W / 2, -cy);
      }
    }
    const lh = px * 1.18;
    let y = H * captionCenter(s) - ((lines.length - 1) * lh) / 2;
    if (hook && captionCenter(s) < 0.4 && hook.top < H * 0.3) y = Math.max(y, hook.top + hook.bh + lh * 0.75);
    let wi = 0;
    for (const line of lines) {
      const full = line.join(" ");
      const lw = g.measureText(full).width;
      let x = (W - lw) / 2;
      if (box === "pill") {
        g.fillStyle = "rgba(10,12,18,0.72)";
        roundRect(g, x - px * 0.55, y - lh * 0.55, lw + px * 1.1, lh * 1.1, px * 0.5);
      }
      for (const word of line) {
        const w = cap.words[wi++];
        if (anim === "type" && !f.still && f.src < w.s - 0.02) {
          // not said yet: keep its space so the line doesn't shift as words arrive
          x += g.measureText(word + " ").width;
          continue;
        }
        const active = spec.mode === "words" && f.src >= w.s && f.src <= w.e + 0.05;
        if (active && box === "word") {
          // a highlight block behind the word being said, the word in dark ink on it
          const ww = g.measureText(word).width;
          g.fillStyle = s.activeColor;
          roundRect(g, x - px * 0.14, y - lh * 0.5, ww + px * 0.28, lh, px * 0.18);
          g.fillStyle = "#0B0B0B";
          g.fillText(word, x, y);
          x += g.measureText(word + " ").width;
          continue;
        }
        if (spec.stroke) {
          g.lineJoin = "round";
          g.lineWidth = px * (s.style === "bold" ? 0.16 : 0.1);
          g.strokeStyle = "rgba(0,0,0,0.9)";
          g.strokeText(word, x, y);
        }
        const num = s.highlightNumbers && isNumberWord(word);
        g.fillStyle = active || num ? s.activeColor : s.baseColor;
        g.fillText(word, x, y);
        x += g.measureText(word + " ").width;
      }
      y += lh;
    }
    g.restore();
    const sub = s.subLang && f.subs ? f.subs[captionKey(cap)] : "";
    if (sub) {
      const spx = Math.round(px * (spec.mode === "words" ? 0.5 : 0.75));
      const face = s.subLang === "zh" ? '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif'
        : s.subLang === "ta" ? '"Tamil Sangam MN", "Noto Sans Tamil", "Latha", sans-serif' : '"DM Sans", Inter, system-ui, sans-serif';
      g.font = `700 ${spx}px ${face}`;
      g.textAlign = "center";
      const subLines = wrap(g, sub.split(s.subLang === "zh" ? "" : /\s+/), W * 0.86).map((l) => l.join(s.subLang === "zh" ? "" : " "));
      let sy = y - lh / 2 + spx * 0.9;
      for (const l of subLines.slice(0, 2)) {
        g.lineJoin = "round";
        g.lineWidth = spx * 0.16;
        g.strokeStyle = "rgba(0,0,0,0.9)";
        g.strokeText(l, W / 2, sy);
        g.fillStyle = "#FFFFFF";
        g.fillText(l, W / 2, sy);
        sy += spx * 1.25;
      }
      g.textAlign = "left";
    }
  }

  // name tag: a lower-third card, left-aligned, clear of the captions
  if (nameTagVisible(s, f.out)) {
    const npx = Math.round(40 * k);
    const rpx = Math.round(28 * k);
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.font = `800 ${npx}px "DM Sans", Inter, system-ui, sans-serif`;
    const nw = g.measureText(s.nameTag.trim()).width;
    g.font = `600 ${rpx}px "DM Sans", Inter, system-ui, sans-serif`;
    const rw = s.roleTag.trim() ? g.measureText(s.roleTag.trim()).width : 0;
    const pad = 22 * k;
    const bw = Math.max(nw, rw) + pad * 2 + 10 * k;
    const bh = (s.roleTag.trim() ? npx + rpx + 14 * k : npx) + pad * 1.4;
    const x = 48 * k;
    const y = H * (s.position === "bottom" ? 0.6 : 0.74) - bh / 2;
    g.fillStyle = "rgba(10,12,18,0.82)";
    roundRect(g, x, y, bw, bh, 16 * k);
    g.fillStyle = s.activeColor;
    g.fillRect(x, y + 14 * k, 8 * k, bh - 28 * k);
    g.fillStyle = "#FFFFFF";
    g.font = `800 ${npx}px "DM Sans", Inter, system-ui, sans-serif`;
    g.fillText(s.nameTag.trim(), x + pad + 10 * k, y + pad * 0.7 + npx / 2);
    if (s.roleTag.trim()) {
      g.fillStyle = "rgba(255,255,255,0.82)";
      g.font = `600 ${rpx}px "DM Sans", Inter, system-ui, sans-serif`;
      g.fillText(s.roleTag.trim(), x + pad + 10 * k, y + pad * 0.7 + npx + 10 * k + rpx / 2);
    }
  }

  for (const o of overlaysAt(s.overlays, f.out)) drawOverlay(g, o, f.still ? 1 : captionIntro(f.out, o.from));

  // number cards and pop-ups, one at a time, clear of the face and the captions
  if (motion.cards.length || motion.pops.length) drawMotion(g, motion, f, capBand);

  if (hook) {
    // the hook card follows the caption animation: in over 250 ms, out over its last 200 ms
    const anim = animOf(s);
    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const hIn = f.still || anim === "none" ? 1 : ease(f.out / 0.25);
    const hOut = f.still || anim === "none" ? 1 : Math.min(1, Math.max(0, (s.hookSeconds - f.out) / 0.2));
    g.save();
    if (anim !== "type") g.globalAlpha = Math.min(hIn, hOut) * 0.75 + (Math.min(hIn, hOut) > 0 ? 0.25 : 0);
    else g.globalAlpha = hOut;
    const cx = W / 2;
    const cy = hook.top + hook.bh / 2;
    if (anim === "pop" && hIn < 1) {
      g.translate(cx, cy);
      g.scale(0.9 + 0.1 * hIn, 0.9 + 0.1 * hIn);
      g.translate(-cx, -cy);
    } else if (anim === "slide" && hIn < 1) {
      g.translate(0, -(1 - hIn) * hook.bh * 0.4);
    }
    g.font = `800 ${Math.round(hook.px)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
    g.textBaseline = "middle";
    g.fillStyle = "#FFFFFF";
    roundRect(g, (W - hook.bw) / 2, hook.top, hook.bw, hook.bh, hook.px * 0.35);
    g.fillStyle = "#0B0B0B";
    g.textAlign = "center";
    // typewriter: the hook's words arrive over its first 0.8 s
    const total = hook.lines.reduce((n, l) => n + l.length, 0);
    let show = anim === "type" && !f.still ? Math.ceil(total * Math.min(1, f.out / 0.8)) : total;
    hook.lines.forEach((l, i) => {
      const words = l.slice(0, Math.max(0, show));
      show -= l.length;
      if (!words.length) return;
      // keep each line's full width so arriving words don't slide it sideways
      const full = g.measureText(l.join(" ")).width;
      g.textAlign = "left";
      g.fillText(words.join(" "), W / 2 - full / 2, hook!.top + hook!.px * 0.35 + hook!.lh * (i + 0.5));
    });
    g.restore();
  }

  // the brand kit logo, top right, clear of the hook card
  const logo = s.logo ? f.brand?.logo : undefined;
  if (logo?.naturalWidth) {
    const u = Math.min(W, H) / 1080;
    let lw = 170 * u;
    let lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    if (lh > 110 * u) {
      lh = 110 * u;
      lw = (lh * logo.naturalWidth) / logo.naturalHeight;
    }
    g.save();
    g.globalAlpha = 0.9;
    g.drawImage(logo, W - lw - 44 * u, 44 * u, lw, lh);
    g.restore();
  }

  if (s.progressBar && f.total > 0) {
    g.fillStyle = s.activeColor;
    g.fillRect(0, 0, W * Math.min(1, f.out / f.total), Math.max(6, 10 * k));
  }
}

/** One sticker, centred on its x/y, popping in over its first 150 ms. */
export function drawOverlay(g: CanvasRenderingContext2D, o: Overlay, intro = 1) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = (Math.min(W, H) / 1080) * o.size;
  g.save();
  g.translate(o.x * W, o.y * H);
  if (intro < 1) {
    g.globalAlpha = 0.25 + 0.75 * intro;
    g.scale(0.85 + 0.15 * intro, 0.85 + 0.15 * intro);
  }
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 14 * u;
  g.strokeStyle = o.color;
  g.fillStyle = o.color;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (o.kind === "text") {
    const text = o.text.trim() || " ";
    let px = 52 * u;
    g.font = `800 ${Math.round(px)}px "DM Sans", Inter, system-ui, sans-serif`;
    const max = W * 0.86 - 44 * u;
    const tw = g.measureText(text).width;
    if (tw > max) {
      px *= max / tw;
      g.font = `800 ${Math.round(px)}px "DM Sans", Inter, system-ui, sans-serif`;
    }
    const w = g.measureText(text).width + 44 * u;
    const h = px * 1.5;
    roundRect(g, -w / 2, -h / 2, w, h, 16 * u);
    g.shadowColor = "transparent";
    g.fillStyle = readableOn(o.color);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 0, h * 0.04);
  } else if (o.kind === "arrow") {
    g.rotate((o.turn * Math.PI) / 2);
    g.lineWidth = 22 * u;
    g.beginPath();
    g.moveTo(0, -100 * u);
    g.lineTo(0, 40 * u);
    g.stroke();
    g.beginPath();
    g.moveTo(-58 * u, 20 * u);
    g.lineTo(0, 100 * u);
    g.lineTo(58 * u, 20 * u);
    g.closePath();
    g.fill();
  } else if (o.kind === "circle") {
    g.lineWidth = 14 * u;
    g.beginPath();
    g.ellipse(0, 0, 130 * u, 100 * u, 0, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.rotate((o.turn * Math.PI) / 2);
    g.lineWidth = 18 * u;
    g.beginPath();
    g.moveTo(-150 * u, 0);
    g.lineTo(150 * u, 0);
    g.stroke();
  }
  g.restore();
}

/**
 * A cover / thumbnail: the frame on screen (same fit and grade as the video),
 * a dark band and the title set large in the style's caption face. PNG at the
 * export size, so it uploads as the reel cover without resizing.
 */
export async function makeCover(video: HTMLVideoElement, settings: EditSettings, title: string, fx?: Frame["fx"]): Promise<Blob> {
  await ensureCaptionFonts();
  const [W, H] = aspectSize(settings.aspect, video.videoWidth, video.videoHeight);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  drawFrame(g, { video, settings: { ...settings, captions: false, hook: "", progressBar: false }, caps: [], segs: [], src: video.currentTime, out: 99, total: 0, fx });
  const k = W / 1080;
  const text = (title.trim() || " ").toUpperCase();
  const px = Math.round((settings.aspect === "16:9" ? 92 : 104) * k);
  g.font = `900 ${px}px "Archivo Black", "Arial Black", Impact, system-ui, sans-serif`;
  const lines = wrap(g, text.split(/\s+/), W * 0.84).slice(0, 4);
  const lh = px * 1.08;
  const blockH = lines.length * lh;
  const top = H * (settings.aspect === "16:9" ? 0.5 : 0.62) - blockH / 2;
  const grad = g.createLinearGradient(0, top - px, 0, top + blockH + px);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.35, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.75)");
  g.fillStyle = grad;
  g.fillRect(0, top - px, W, blockH + px * 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  lines.forEach((l, i) => {
    const y = top + lh * (i + 0.5);
    g.lineWidth = px * 0.12;
    g.strokeStyle = "rgba(0,0,0,0.85)";
    g.strokeText(l.join(" "), W / 2, y);
    g.fillStyle = i === lines.length - 1 && lines.length > 1 ? settings.activeColor : "#FFFFFF";
    g.fillText(l.join(" "), W / 2, y);
  });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the cover."))), "image/png"));
}

/**
 * Keeps the B-roll clips in step with the edit (preview and export alike) and
 * returns the one to draw: seeks it when it has drifted, plays it while the edit
 * plays, and pauses every clip not on screen.
 */
export function syncBroll(els: Map<string, HTMLVideoElement>, list: Broll[] | undefined, out: number | null, playing: boolean): HTMLVideoElement | null {
  const on = out === null ? null : brollAt(list, out);
  for (const [id, el] of els) if ((!playing || id !== on?.b.id) && !el.paused) el.pause();
  const el = on ? els.get(on.b.id) : undefined;
  if (!on || !el) return null;
  // a paused frame must be exact; a playing clip may run a touch ahead or behind
  if (Math.abs(el.currentTime - on.t) > (playing ? 0.25 : 0.04)) el.currentTime = on.t;
  if (playing && el.paused) void el.play().catch(() => {});
  return el;
}

export function planFor(words: Word[], duration: number, s: EditSettings) {
  const segs = withColdOpen(keepSegments(words, duration, s), s.coldOpen);
  return { segs, caps: buildCaptions(words, s), total: totalLength(segs) / speedOf(s) };
}

/**
 * A sound from a buffer played along the edited timeline: sync(t) starts it at
 * t seconds in (wrapped round when it loops) and restarts it only when it has
 * drifted more than `slack` seconds, so a cut, a stall or a seek never leaves it out of step; sync(null) stops it.
 */
export function bufferTrack(ctx: BaseAudioContext, buf: AudioBuffer, out: AudioNode, loop = false, slack = 0.08) {
  let cur: { node: AudioBufferSourceNode; at: number; t0: number } | null = null;
  const stop = () => {
    cur?.node.stop();
    cur = null;
  };
  const sync = (t: number | null) => {
    if (t === null || (!loop && t >= buf.duration)) return stop();
    const pos = loop ? t % buf.duration : t;
    if (cur) {
      const d = buf.duration;
      const drift = cur.at + (ctx.currentTime - cur.t0) - pos;
      if (Math.abs(loop ? ((((drift % d) + d * 1.5) % d) - d / 2) : drift) < slack) return;
    }
    stop();
    const node = new AudioBufferSourceNode(ctx, { buffer: buf, loop });
    node.connect(out);
    node.start(0, pos);
    cur = { node, at: pos, t0: ctx.currentTime };
  };
  return { sync, stop };
}

/** A sound file decoded for playing in any audio context; null when the browser can't read it. */
export async function decodeSound(file: Blob): Promise<AudioBuffer | null> {
  try {
    return await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  }
}

// ---------- export, kept outside React so it survives moving between pages ----------

export interface ExportJob {
  id: string;
  name: string;
  kind?: "video" | "small" | "audio";
  progress: number;
  state: "running" | "done" | "failed";
  url?: string;
  ext?: string;
  error?: string;
  /** How long the edit is, end card included: what the file should run. */
  seconds?: number;
  /** The file's size, and the most its platform takes (0 = no cap that matters). */
  bytes?: number;
  cap?: number;
  label?: string;
  /** True once it is exporting faster than real time (it can be stopped), false when it records in real time; unset while that is being worked out. */
  fast?: boolean;
}

let job: ExportJob | null = null;
let stopper: AbortController | null = null;
/** Stops a fast export; nothing is kept. A real-time one runs to its end. */
export const stopExport = () => stopper?.abort();
const listeners = new Set<(j: ExportJob | null) => void>();
const emit = () => listeners.forEach((l) => l(job && { ...job }));
export const exportJob = () => job;
export function onExportJob(fn: (j: ExportJob | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function clearExportJob() {
  if (job?.state !== "running") job = null;
  emit();
}

// Export all: several exports one after another (each its own startExport), still outside React.
export interface ExportQueue {
  /** The export running, counted from 1, and how many there are. */
  at: number;
  of: number;
  /** The ids of the exports, in order. */
  ids: string[];
  running: boolean;
  /** Asked to stop: the export running finishes and no more start. */
  stopping: boolean;
  /** What each export made, by its id. */
  files: Record<string, { url: string; ext: string }>;
  failed: Record<string, string>;
}
let queue: ExportQueue | null = null;
export const exportQueue = () => queue;
export function stopExportQueue() {
  if (!queue?.running) return;
  queue.stopping = true;
  emit();
}
/** Runs each export in turn; one that fails is noted and the rest still run. */
export async function exportAll(runs: { id: string; run: () => Promise<void> }[]): Promise<void> {
  if (job?.state === "running" || queue?.running) throw new Error("An export is already running.");
  const q: ExportQueue = { at: 0, of: runs.length, ids: runs.map((r) => r.id), running: true, stopping: false, files: {}, failed: {} };
  queue = q;
  try {
    for (const r of runs) {
      if (q.stopping) break;
      q.at++;
      emit();
      const before = job?.id;
      try {
        await r.run();
      } catch (e) {
        q.failed[r.id] = e instanceof Error ? e.message : String(e);
        continue;
      }
      const made = job && job.id !== before ? job : null;
      if (made?.state === "done" && made.url) q.files[r.id] = { url: made.url, ext: made.ext ?? "mp4" };
      else q.failed[r.id] = made?.error ?? "The export did not finish.";
    }
  } finally {
    q.running = false;
    emit();
  }
}

function pickMime(audioOnly = false): { mime: string; ext: string } {
  const options = audioOnly
    ? ([["audio/mp4", "m4a"], ["audio/webm;codecs=opus", "webm"], ["audio/webm", "webm"]] as const)
    : ([["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9,opus", "webm"], ["video/webm", "webm"]] as const);
  for (const [mime, ext] of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  throw new Error(audioOnly ? "This browser can't export sound only. Use Chrome or Safari." : "This browser can't export video. Use Chrome or Safari on a computer.");
}

/** Reads an exported file's sound back (decoded at 8 kHz, small even for a long edit): its length,
 * level, longest silence and where it clips. Null when the browser can't decode it. */
export async function measureExport(url: string): Promise<(ReturnType<typeof soundStats> & { clip: ReturnType<typeof clipStats> }) | null> {
  try {
    const buf = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(await (await fetch(url)).arrayBuffer());
    return { ...soundStats(buf.getChannelData(0), buf.sampleRate), clip: clipStats(buf.getChannelData(0), buf.sampleRate) };
  } catch {
    return null;
  }
}

/** A finished export: kept as the job's file and downloaded. */
function deliver(name: string, kind: ExportJob["kind"], out: Blob, ext: string, seconds: number, cap: number, label: string) {
  const url = URL.createObjectURL(out);
  job = { ...job!, progress: 1, state: "done", url, ext, seconds, bytes: out.size, cap, label };
  emit();
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}-${kind === "audio" ? "audio" : kind === "small" ? "small" : "edited"}.${ext}`;
  a.click();
}

/** Exports the edit faster than real time where the browser can (fastExport.ts), else renders it in real time (a 45 s reel takes about 45 s), and downloads it. */
export async function startExport(name: string, file: Blob, words: Word[], settings: EditSettings, subs?: Record<string, string>, brand?: BrandArt | null, voice?: Blob | null, brollFiles?: Record<string, Blob>, music?: Blob | null, fx?: Frame["fx"]) {
  if (job?.state === "running") throw new Error("An export is already running.");
  await ensureCaptionFonts();
  const kind = settings.exportAs ?? "video";
  job = { id: String(Date.now()), name, kind, progress: 0, state: "running" };
  emit();
  let video: HTMLVideoElement | null = null;
  let actx: AudioContext | null = null;
  // B-roll clips, muted, played in step with the picture
  const brEls = new Map<string, HTMLVideoElement>();
  try {
    // the fast route, loaded only now; null means this browser or file can't take it, so it records in real time below
    stopper = new AbortController();
    const fast = await import("@/lib/fastExport")
      .then((m) => m.exportFast({ file, words, settings, subs, brand, voice, brollFiles, music, fx }, (p) => {
        if (job) Object.assign(job, { fast: true, progress: p });
        emit();
      }, stopper!.signal))
      .catch(() => null);
    stopper = null;
    if (fast === "stopped") {
      job = null;
      emit();
      return;
    }
    if (fast) return deliver(name, kind, fast.blob, fast.ext, fast.seconds, fast.cap, fast.label);
    job = { ...job!, fast: false, progress: 0 };
    emit();
    const { mime, ext } = pickMime(kind === "audio");
    video = await loadVideo(file);
    const plan = planFor(words, video.duration, settings);
    if (plan.total < 0.5) throw new Error("Nothing left to export after the cuts.");
    // a podcast or voice clip has no picture: it is drawn as a waveform
    const peaks = video.videoWidth || kind === "audio" ? null : await audioPeaks(file);
    // sized for the platform it is for: frame, bitrates, and under its upload cap
    const size = exportSize(settings, plan.total + (settings.endCard && brand ? END_CARD_SECONDS : 0), video.videoWidth, video.videoHeight);
    const [W, H] = size.w ? [size.w, size.h] : aspectSize(settings.aspect, video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    actx = new AudioContext(settings.denoise ? { sampleRate: DENOISE_RATE } : undefined);
    await actx.resume(); // allowed once the person has clicked on the page (Export was a click)
    const polish = !!settings.voicePolish;
    const level = settings.loudness ? (levelFits(settings.level, polish) ? settings.level : await measureLevel(file, polish, { parts: plan.segs.map((g) => ({ from: g.start, dur: g.end - g.start })), duration: video.duration })) : null;
    const dest = actx.createMediaStreamDestination();
    // recorded, never played out loud; the gain ramps in and out at every cut so joins don't click
    const gain = actx.createGain();
    gain.gain.value = 0;
    wireVoice(actx, actx.createMediaElementSource(video), gain, polish, level, settings.denoise ? await denoiseNode(actx) : null);
    gain.connect(dest);
    const FADE = 0.025;
    const volume = Math.min(1, Math.max(0, settings.volume ?? 1));
    const stream = new MediaStream(kind === "audio" ? dest.stream.getAudioTracks() : [...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, ...(size.videoBps ? { videoBitsPerSecond: size.videoBps } : {}), audioBitsPerSecond: size.audioBps });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

    // the voiceover: decoded once, restarted at the right point whenever the recorder
    // resumes (after a cut or a stall) so it never drifts from the picture
    const vo = settings.voiceover && voice ? { set: settings.voiceover, gain: actx.createGain(), buf: await actx.decodeAudioData(await voice.arrayBuffer()) } : null;
    const voTrack = vo && bufferTrack(actx, vo.buf, vo.gain);
    if (vo) {
      vo.gain.gain.value = vo.set.gain ?? 1;
      vo.gain.connect(dest);
    }
    // background music: looped along the edit, under the voice while someone talks, on through the end card
    const muBuf = settings.music && music ? await decodeSound(music) : null;
    const drop = motionOf(settings, plan.segs, plan.caps, plan.total).drop;
    const mu = settings.music && muBuf ? { set: settings.music, gain: new GainNode(actx, { gain: 0 }), spans: duckSpans(words, plan.segs, settings) } : null;
    const muTrack = mu && muBuf && bufferTrack(actx, muBuf, mu.gain, true);
    mu?.gain.connect(dest);
    const fullEnd = plan.total + (settings.endCard && brand && kind !== "audio" ? END_CARD_SECONDS : 0);
    // voSync and voStop drive both the voiceover and the music
    const voStop = () => {
      voTrack?.stop();
      muTrack?.stop();
    };
    const voSync = (out: number) => {
      voTrack?.sync(voiceAt(vo!.set, out));
      if (mu && muTrack && actx) {
        muTrack.sync(out);
        mu.gain.gain.setTargetAtTime(musicGainAt(mu.spans, out, mu.set.level, fullEnd) * dropGain(drop, out), actx.currentTime, 0.03);
      }
    };

    if (kind !== "audio") {
      for (const b of settings.broll ?? []) {
        const blob = brollFiles?.[b.key];
        if (!blob) continue;
        const el = await loadVideo(blob);
        el.muted = true;
        brEls.set(b.id, el);
      }
    }

    const v = video;
    const speed = speedOf(settings);
    v.defaultPlaybackRate = v.playbackRate = speed; // pitch is kept (preservesPitch is on by default)
    // sound effects, made as the edit plays past each one, straight into the recording (not through the voice's fades)
    const cues = kind === "audio" ? [] : motionOf(settings, plan.segs, plan.caps, plan.total).cues;
    const sfxTick = cueTicker();
    let done = 0;
    // the part playing: a part heard twice (a cold open) maps by it, not by the source time alone
    let segI = 0;
    const endLen = settings.endCard && brand && kind !== "audio" ? END_CARD_SECONDS : 0;
    const draw = () => {
      const out = Math.min(plan.total, outIn(plan.segs, segI, v.currentTime, speed) ?? done / speed);
      drawFrame(g, { video: v, settings, ...plan, src: v.currentTime, out, subs, brand, broll: syncBroll(brEls, settings.broll, out, rec.state === "recording"), fx, peaks });
      if (rec.state === "recording") {
        voSync(out);
        for (const c of sfxTick(cues, out)) playCue(actx!, dest, c.kind);
      } else voStop();
      if (job) {
        job.progress = Math.min(0.99, out / (plan.total + endLen));
        emit();
      }
    };
    for (let i = 0; i < plan.segs.length; i++) {
      const seg = plan.segs[i];
      segI = i;
      await seek(v, seg.start);
      draw();
      // a pause played fast: the picture at 4x with the voice faded out, switched back a tick early so the next word starts at speed
      let fast = isFast(seg, seg.start);
      v.playbackRate = speed * (fast ? FAST : 1);
      // Play first, record once it is really playing: resuming the recorder before
      // playback starts records a frozen frame at every cut (an 8.6 s edit came out 10.6 s).
      await v.play();
      if (i === 0) rec.start(1000);
      else rec.resume();
      gain.gain.cancelScheduledValues(actx.currentTime);
      gain.gain.setValueAtTime(0, actx.currentTime);
      gain.gain.linearRampToValueAtTime(fast ? 0 : volume, actx.currentTime + FADE);
      let fading = false;
      // Record media time, not wall time: when playback stalls (buffering, or the
      // audio track ending before the video), pause the recorder so no frozen
      // frames are recorded, and treat a stall at the very end as the end.
      let lastT = v.currentTime;
      let lastMove = performance.now();
      let stalled = false;
      await new Promise<void>((resolve) => {
        const tick = () => {
          const nowMs = performance.now();
          if (v.currentTime > lastT + 0.001) {
            lastT = v.currentTime;
            lastMove = nowMs;
            if (stalled) {
              rec.resume();
              stalled = false;
            }
          } else if (!stalled && nowMs - lastMove > 120) {
            rec.pause();
            voStop();
            stalled = true;
          }
          if (stalled && v.currentTime >= seg.end - 0.4) return resolve();
          draw();
          if (!fading && isFast(seg, v.currentTime, (speed * FAST) / 30) !== fast) {
            fast = !fast;
            v.playbackRate = speed * (fast ? FAST : 1);
            gain.gain.cancelScheduledValues(actx!.currentTime);
            gain.gain.setValueAtTime(gain.gain.value, actx!.currentTime);
            gain.gain.linearRampToValueAtTime(fast ? 0 : volume, actx!.currentTime + FADE);
          }
          if (!fading && v.currentTime >= seg.end - FADE - 0.04) {
            fading = true;
            gain.gain.cancelScheduledValues(actx!.currentTime);
            gain.gain.setValueAtTime(gain.gain.value, actx!.currentTime);
            gain.gain.linearRampToValueAtTime(0, actx!.currentTime + FADE);
          }
          if (v.currentTime >= seg.end - 0.02 || v.ended) return resolve();
          // the next frame 1/30 s after this one began, not after it was drawn (face effects take a few ms)
          timer = window.setTimeout(tick, Math.max(0, 1000 / 30 - (performance.now() - nowMs)));
        };
        let timer = window.setTimeout(tick, 0);
      });
      v.pause();
      if (rec.state === "recording") rec.pause();
      voStop();
      done += segLength(seg);
    }
    if (endLen && brand) {
      // the end card: painted for its length in real time, over silence or the music
      drawEndCard(g, brand, 0);
      rec.resume();
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = (performance.now() - start) / 1000;
          drawEndCard(g, brand, t);
          voSync(plan.total + t);
          if (job) {
            job.progress = Math.min(0.99, (plan.total + t) / (plan.total + endLen));
            emit();
          }
          if (t >= endLen) return resolve();
          window.setTimeout(tick, 1000 / 30);
        };
        tick();
      });
    }
    rec.stop();
    await stopped;
    deliver(name, kind, new Blob(chunks, { type: mime.split(";")[0] }), ext, plan.total + endLen, size.capBytes, size.label);
  } catch (e) {
    job = { ...job!, state: "failed", error: e instanceof Error ? e.message : String(e) };
    emit();
  } finally {
    video?.pause();
    if (video) URL.revokeObjectURL(video.src);
    for (const el of brEls.values()) {
      el.pause();
      URL.revokeObjectURL(el.src);
    }
    void actx?.close();
  }
}

// ---------- joining takes, kept outside React like the export ----------

export interface JoinJob {
  progress: number;
  state: "running" | "done" | "failed";
  file?: File;
  error?: string;
}
let joinJob: JoinJob | null = null;
const joinListeners = new Set<(j: JoinJob | null) => void>();
const emitJoin = () => joinListeners.forEach((l) => l(joinJob && { ...joinJob }));
export const currentJoin = () => joinJob;
export function onJoinJob(fn: (j: JoinJob | null) => void) {
  joinListeners.add(fn);
  return () => joinListeners.delete(fn);
}
/** A finished or failed join, handed over once; a running one stays. */
export function endJoin(): JoinJob | null {
  const j = joinJob;
  if (!j || j.state === "running") return null;
  joinJob = null;
  emitJoin();
  return j;
}

/**
 * Plays each take's kept part in order and records them as one file, in real
 * time (no new dependency can join MP4s in the browser without re-encoding).
 * The frame is the first take's, at most 1920 on the long side; a take of
 * another shape fits inside it. The sound fades for 25 ms at each join so it doesn't click.
 */
export async function startJoin(name: string, takes: { file: Blob; start: number; end: number }[]) {
  if (joinJob?.state === "running") throw new Error("Takes are already being joined.");
  joinJob = { progress: 0, state: "running" };
  emitJoin();
  const els: HTMLVideoElement[] = [];
  let actx: AudioContext | null = null;
  try {
    // avc3 carries the codec setup in the stream, so pausing between takes doesn't trip Chrome's "codec description changed" warning
    const avc3 = "video/mp4;codecs=avc3.42E01E,mp4a.40.2";
    const { mime, ext } = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(avc3) ? { mime: avc3, ext: "mp4" } : pickMime();
    for (const t of takes) els.push(await loadVideo(t.file));
    const total = takes.reduce((n, t) => n + (t.end - t.start), 0);
    const k = Math.min(1, 1920 / Math.max(els[0].videoWidth, els[0].videoHeight));
    const W = Math.round((els[0].videoWidth * k) / 2) * 2;
    const H = Math.round((els[0].videoHeight * k) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    actx = new AudioContext();
    await actx.resume(); // allowed: Join was a click
    const dest = actx.createMediaStreamDestination();
    const gain = actx.createGain();
    gain.gain.value = 0;
    gain.connect(dest);
    // 4.5 Mbps keeps 12 minutes under the 500 MB an upload takes; the export re-encodes it anyway
    const rec = new MediaRecorder(new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    const draw = (v: HTMLVideoElement) => {
      const s = Math.min(W / v.videoWidth, H / v.videoHeight);
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      g.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    };
    const FADE = 0.025;
    let done = 0;
    for (let i = 0; i < takes.length; i++) {
      const v = els[i];
      const { start, end } = takes[i];
      const src = actx.createMediaElementSource(v);
      src.connect(gain);
      await seek(v, start);
      draw(v);
      await v.play();
      if (i === 0) rec.start(1000);
      else rec.resume();
      gain.gain.cancelScheduledValues(actx.currentTime);
      gain.gain.setValueAtTime(0, actx.currentTime);
      gain.gain.linearRampToValueAtTime(1, actx.currentTime + FADE);
      // as in the export: a stall pauses the recorder, so no frozen frames go in
      let lastT = v.currentTime;
      let lastMove = performance.now();
      let stalled = false;
      let fading = false;
      await new Promise<void>((resolve) => {
        const tick = () => {
          const now = performance.now();
          if (v.currentTime > lastT + 0.001) {
            lastT = v.currentTime;
            lastMove = now;
            if (stalled) {
              rec.resume();
              stalled = false;
            }
          } else if (!stalled && now - lastMove > 120) {
            rec.pause();
            stalled = true;
          }
          if (stalled && v.currentTime >= end - 0.4) return resolve();
          draw(v);
          joinJob!.progress = Math.min(0.99, (done + v.currentTime - start) / total);
          emitJoin();
          if (!fading && v.currentTime >= end - FADE - 0.04) {
            fading = true;
            gain.gain.cancelScheduledValues(actx!.currentTime);
            gain.gain.setValueAtTime(gain.gain.value, actx!.currentTime);
            gain.gain.linearRampToValueAtTime(0, actx!.currentTime + FADE);
          }
          if (v.currentTime >= end - 0.02 || v.ended) return resolve();
          window.setTimeout(tick, 1000 / 30);
        };
        tick();
      });
      v.pause();
      if (rec.state === "recording") rec.pause();
      src.disconnect();
      done += end - start;
    }
    rec.stop();
    await stopped;
    joinJob = { progress: 1, state: "done", file: new File(chunks, `${name}.${ext}`, { type: mime.split(";")[0] }) };
  } catch (e) {
    joinJob = { progress: 0, state: "failed", error: e instanceof Error ? e.message : String(e) };
  } finally {
    for (const v of els) {
      v.pause();
      URL.revokeObjectURL(v.src);
    }
    void actx?.close();
    emitJoin();
  }
}
