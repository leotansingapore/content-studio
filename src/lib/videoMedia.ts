// Browser side of the video editor: the source video stays on this device
// (IndexedDB); only a 16 kHz mono sound file goes to the server for captions,
// and up to three small stills for "match this reference". Preview and export
// draw every frame with drawFrame, so what you see is what you get.

import {
  STYLES,
  aspectSize,
  buildCaptions,
  captionAt,
  isNumberWord,
  keepSegments,
  nameTagVisible,
  outputTime,
  totalLength,
  zoomAt,
  type Caption,
  type EditSettings,
  type Segment,
  type Word,
} from "@/lib/videoEdit";

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
  return { wav: new Blob([out], { type: "audio/wav" }), duration: audio.duration };
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

const seek = (v: HTMLVideoElement, t: number) =>
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

const DB = "content-studio-video";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction("files", mode).objectStore("files"));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export const putFile = (id: string, file: Blob) => tx("readwrite", (s) => s.put(file, id));
export const getFile = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteFile = (id: string) => tx("readwrite", (s) => s.delete(id));

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
const Y: Record<string, number> = { top: 0.26, middle: 0.64, bottom: 0.8 };

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
}

export function drawFrame(g: CanvasRenderingContext2D, f: Frame) {
  const { video: v, settings: s } = f;
  const W = g.canvas.width;
  const H = g.canvas.height;
  const spec = STYLES[s.style];
  const k = W / 1080;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);

  // the picture: cover the frame, crop centred on focusX, punch in on alternate cuts
  if (v.videoWidth) {
    const zoom = s.punchIn ? zoomAt(f.segs, f.src, spec.punch) : 1;
    const cover = Math.max(W / v.videoWidth, H / v.videoHeight);
    if (s.fit === "blur") {
      // the whole picture, over a darkened, blurred copy filling the frame
      const bw = v.videoWidth * cover;
      const bh = v.videoHeight * cover;
      g.filter = `blur(${Math.round(36 * k)}px) brightness(0.62)`;
      g.drawImage(v, (W - bw) / 2, (H - bh) / 2, bw, bh);
      g.filter = "none";
      const scale = Math.min(W / v.videoWidth, H / v.videoHeight) * zoom;
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      if (s.grade) g.filter = spec.grade;
      g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.filter = "none";
    } else {
      const scale = cover * zoom;
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      const dx = Math.min(0, Math.max(W - dw, W / 2 - dw * s.focusX));
      const dy = (H - dh) / 2;
      if (s.grade) g.filter = spec.grade;
      g.drawImage(v, dx, dy, dw, dh);
      g.filter = "none";
    }
  }
  if (spec.bars && s.grade) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H * 0.09);
    g.fillRect(0, H * 0.91, W, H * 0.09);
  }

  // hook title: a white card at the top for the first seconds of the edit (laid out first so captions avoid it)
  let hook: { lines: string[][]; px: number; lh: number; bw: number; bh: number; top: number } | null = null;
  if (s.hook.trim() && f.out < s.hookSeconds) {
    const px = 60 * k;
    g.font = `800 ${Math.round(px)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
    const lines = wrap(g, s.hook.trim().split(/\s+/), W * 0.8);
    const lh = px * 1.2;
    hook = { lines, px, lh, bw: Math.max(...lines.map((l) => g.measureText(l.join(" ")).width)) + px * 1.2, bh: lines.length * lh + px * 0.7, top: H * 0.11 };
  }

  // captions
  const cap = s.captions ? captionAt(f.caps, f.src) : null;
  if (cap) {
    const px = BASE_PX[s.style] * s.size * k;
    g.font = spec.font.replace("{px}", String(Math.round(px)));
    g.textAlign = "left";
    g.textBaseline = "middle";
    const text = cap.words.map((w) => (s.uppercase ? w.w.toUpperCase() : w.w));
    const lines = wrap(g, text, W * (spec.mode === "words" ? 0.86 : 0.84));
    const lh = px * 1.18;
    let y = H * Y[s.position] - ((lines.length - 1) * lh) / 2;
    if (hook && s.position === "top") y = Math.max(y, hook.top + hook.bh + lh * 0.75);
    let wi = 0;
    for (const line of lines) {
      const full = line.join(" ");
      const lw = g.measureText(full).width;
      let x = (W - lw) / 2;
      if (spec.box === "pill") {
        g.fillStyle = "rgba(10,12,18,0.72)";
        roundRect(g, x - px * 0.55, y - lh * 0.55, lw + px * 1.1, lh * 1.1, px * 0.5);
      }
      for (const word of line) {
        const w = cap.words[wi++];
        const active = spec.mode === "words" && f.src >= w.s && f.src <= w.e + 0.05;
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

  if (hook) {
    g.font = `800 ${Math.round(hook.px)}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
    g.textBaseline = "middle";
    g.fillStyle = "#FFFFFF";
    roundRect(g, (W - hook.bw) / 2, hook.top, hook.bw, hook.bh, hook.px * 0.35);
    g.fillStyle = "#0B0B0B";
    g.textAlign = "center";
    hook.lines.forEach((l, i) => g.fillText(l.join(" "), W / 2, hook!.top + hook!.px * 0.35 + hook!.lh * (i + 0.5)));
  }

  if (s.progressBar && f.total > 0) {
    g.fillStyle = s.activeColor;
    g.fillRect(0, 0, W * Math.min(1, f.out / f.total), Math.max(6, 10 * k));
  }
}

/**
 * A cover / thumbnail: the frame on screen (same fit and grade as the video),
 * a dark band and the title set large in the style's caption face. PNG at the
 * export size, so it uploads as the reel cover without resizing.
 */
export async function makeCover(video: HTMLVideoElement, settings: EditSettings, title: string): Promise<Blob> {
  await ensureCaptionFonts();
  const [W, H] = aspectSize(settings.aspect, video.videoWidth, video.videoHeight);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  drawFrame(g, { video, settings: { ...settings, captions: false, hook: "", progressBar: false }, caps: [], segs: [], src: video.currentTime, out: 99, total: 0 });
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

export function planFor(words: Word[], duration: number, s: EditSettings) {
  const segs = keepSegments(words, duration, s);
  return { segs, caps: buildCaptions(words, s), total: totalLength(segs) };
}

// ---------- export, kept outside React so it survives moving between pages ----------

export interface ExportJob {
  id: string;
  name: string;
  progress: number;
  state: "running" | "done" | "failed";
  url?: string;
  ext?: string;
  error?: string;
}

let job: ExportJob | null = null;
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

function pickMime(): { mime: string; ext: string } {
  for (const [mime, ext] of [
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ] as const) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  throw new Error("This browser can't export video. Use Chrome or Safari on a computer.");
}

/** Renders the edit in real time (a 45 s reel takes about 45 s) and downloads it. */
export async function startExport(name: string, file: Blob, words: Word[], settings: EditSettings) {
  if (job?.state === "running") throw new Error("An export is already running.");
  await ensureCaptionFonts();
  job = { id: String(Date.now()), name, progress: 0, state: "running" };
  emit();
  let video: HTMLVideoElement | null = null;
  let actx: AudioContext | null = null;
  try {
    const { mime, ext } = pickMime();
    video = await loadVideo(file);
    const plan = planFor(words, video.duration, settings);
    if (plan.total < 0.5) throw new Error("Nothing left to export after the cuts.");
    const [W, H] = aspectSize(settings.aspect, video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    actx = new AudioContext();
    await actx.resume(); // allowed once the person has clicked on the page (Export was a click)
    const dest = actx.createMediaStreamDestination();
    // recorded, never played out loud; the gain ramps in and out at every cut so joins don't click
    const gain = actx.createGain();
    gain.gain.value = 0;
    actx.createMediaElementSource(video).connect(gain).connect(dest);
    const FADE = 0.025;
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

    const v = video;
    let done = 0;
    const draw = () => {
      const out = Math.min(plan.total, outputTime(plan.segs, v.currentTime) ?? done);
      drawFrame(g, { video: v, settings, ...plan, src: v.currentTime, out });
      if (job) {
        job.progress = Math.min(0.99, out / plan.total);
        emit();
      }
    };
    for (let i = 0; i < plan.segs.length; i++) {
      const seg = plan.segs[i];
      await seek(v, seg.start);
      draw();
      // Play first, record once it is really playing: resuming the recorder before
      // playback starts records a frozen frame at every cut (an 8.6 s edit came out 10.6 s).
      await v.play();
      if (i === 0) rec.start(1000);
      else rec.resume();
      gain.gain.cancelScheduledValues(actx.currentTime);
      gain.gain.setValueAtTime(0, actx.currentTime);
      gain.gain.linearRampToValueAtTime(1, actx.currentTime + FADE);
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
            stalled = true;
          }
          if (stalled && v.currentTime >= seg.end - 0.4) return resolve();
          draw();
          if (!fading && v.currentTime >= seg.end - FADE - 0.04) {
            fading = true;
            gain.gain.cancelScheduledValues(actx!.currentTime);
            gain.gain.setValueAtTime(gain.gain.value, actx!.currentTime);
            gain.gain.linearRampToValueAtTime(0, actx!.currentTime + FADE);
          }
          if (v.currentTime >= seg.end - 0.02 || v.ended) return resolve();
          timer = window.setTimeout(tick, 1000 / 30);
        };
        let timer = window.setTimeout(tick, 0);
      });
      v.pause();
      if (rec.state === "recording") rec.pause();
      done += seg.end - seg.start;
    }
    rec.stop();
    await stopped;
    const url = URL.createObjectURL(new Blob(chunks, { type: mime.split(";")[0] }));
    job = { ...job!, progress: 1, state: "done", url, ext };
    emit();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}-edited.${ext}`;
    a.click();
  } catch (e) {
    job = { ...job!, state: "failed", error: e instanceof Error ? e.message : String(e) };
    emit();
  } finally {
    video?.pause();
    if (video) URL.revokeObjectURL(video.src);
    void actx?.close();
  }
}
