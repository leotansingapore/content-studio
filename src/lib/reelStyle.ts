// "Copy a reel's style" in the video editor. A pasted Instagram or TikTok link
// is read by clone-reel (style mode: the post and Instagram's video link, no
// OpenAI); this tab downloads the video and MEASURES it, as Clone a reel's
// frame reading does: cuts a minute, zooms and punch-ins (a scale jump between
// two frames), flash or dip transitions, and frames from the opening and each
// cut. reel-visuals (style mode) writes how the captions and framing look and
// reads the overlays, and Jev picks the editor's look from that. The measured
// pace and Jev's look become one recipe (stylePresets.ts) laid over the edit.
// The job lives outside the page, so it finishes while the person is elsewhere
// and lands when the video is open again.

import { supabase } from "@/lib/supabase";
import { detectCuts, CUT_THRESHOLD } from "@/lib/reelFrames";
import { invokeFunction, ReelCloneError, type CloneSource } from "@/lib/reelClone";
import { applyRecipe, type Recipe } from "@/lib/stylePresets";
import { loadVideo, seek } from "@/lib/videoMedia";
import { STYLES, type EditSettings } from "@/lib/videoEdit";
import type { FrameInput, Pacing } from "../../supabase/functions/reel-visuals/logic.ts";
import type { ReelLook, StyleDescription } from "../../supabase/functions/reel-visuals/style.ts";

export type { ReelLook, StyleDescription };

// ---------- measuring the video ----------

const SAMPLE_W = 48;
const FRAME_W = 432;
const MAX_SCAN_SEC = 180;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
/** Cuts looked at closely (frame by frame) for a punch-in or a flash. */
const MAX_CLOSE_CUTS = 24;
export const MAX_STYLE_FRAMES = 12;

/** A greyscale picture, w x h, values 0-1. */
export interface Grey {
  px: Float32Array;
  w: number;
  h: number;
}

const SCALES = [1.06, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4];

/** Normalised correlation of b with a seen k times closer around (cx, cy) (shares of the frame), over b's inner part. */
function corrAt(a: Grey, b: Grey, k: number, cx: number, cy: number): number {
  const { w, h } = b;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  const mx = Math.round(w * 0.08);
  const my = Math.round(h * 0.08);
  for (let y = my; y < h - my; y++) {
    const ay = Math.round(cy * h + (y - cy * h) / k);
    if (ay < 0 || ay >= h) continue;
    for (let x = mx; x < w - mx; x++) {
      const ax = Math.round(cx * w + (x - cx * w) / k);
      if (ax < 0 || ax >= w) continue;
      const p = a.px[ay * w + ax];
      const q = b.px[y * w + x];
      sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q; n++;
    }
  }
  if (n < 16) return 0;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return va <= 1e-9 || vb <= 1e-9 ? 0 : (sab - (sa * sb) / n) / Math.sqrt(va * vb);
}

/**
 * How much closer b is than a (1.2 = 20% zoomed in, 1/1.2 = zoomed out), when the
 * same picture at another scale explains b clearly better than as it is; else 1.
 */
export function scaleJump(a: Grey, b: Grey): number {
  const still = corrAt(a, b, 1, 0.5, 0.5);
  let best = { c: still, k: 1 };
  for (const k of SCALES) {
    for (const cy of [0.42, 0.5]) {
      const cin = corrAt(a, b, k, 0.5, cy);
      if (cin > best.c) best = { c: cin, k };
      const cout = corrAt(b, a, k, 0.5, cy);
      if (cout > best.c) best = { c: cout, k: 1 / k };
    }
  }
  return best.k !== 1 && best.c >= 0.8 && best.c - still >= 0.08 ? Math.round(best.k * 100) / 100 : 1;
}

/** Mean brightness, 0-1. */
const meanOf = (g: Grey) => g.px.reduce((t, v) => t + v, 0) / g.px.length;

/** A white flash or a dip through black inside a run of frames across a cut (both ends ordinary). */
export function transitionIn(means: number[]): "flash" | "dip" | null {
  if (means.length < 3) return null;
  const ends = [means[0], means[means.length - 1]];
  const mid = means.slice(1, -1);
  if (ends.every((m) => m < 0.75) && mid.some((m) => m >= 0.85)) return "flash";
  if (ends.every((m) => m > 0.15) && mid.some((m) => m <= 0.08)) return "dip";
  return null;
}

/** Frames to read: the opening seconds (where the hook text lives), then just after each cut, at most `max`. */
export function styleFrameTimes(cuts: number[], duration: number, max = MAX_STYLE_FRAMES): number[] {
  const end = Math.max(0.1, duration - 0.1);
  const opening = [0.3, 1.5, 3, 4.5, 6].filter((t) => t < end);
  const after = cuts.map((t) => Math.min(end, t + 0.4)).filter((t) => t > 6.5);
  const fill = after.length < 3 ? [0.4, 0.7, 0.95].map((f) => duration * f).filter((t) => t > 6.5) : [];
  const rest = [...after, ...fill].map((t) => Math.round(t * 10) / 10).sort((a, b) => a - b).filter((t, i, all) => i === 0 || t - all[i - 1] >= 0.8);
  const want = Math.max(0, max - opening.length);
  const picked = rest.length <= want ? rest : Array.from({ length: want }, (_, i) => rest[Math.round((i * (rest.length - 1)) / Math.max(1, want - 1))]);
  return [...opening, ...picked];
}

export interface ReelMeasure {
  duration: number;
  cuts: number[];
  /** Times of the zooms and punch-ins found. */
  zooms: number[];
  flashes: number;
  dips: number;
  frames: FrameInput[];
  pacing: Pacing;
}

function greyOf(g: CanvasRenderingContext2D, w: number, h: number): Grey {
  const d = g.getImageData(0, 0, w, h).data;
  const px = new Float32Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return { px, w, h };
}

/** Measures a downloaded reel in this tab. Throws an Error with a message fit to show. */
export async function measureReel(blob: Blob, onProgress: (share: number) => void): Promise<ReelMeasure> {
  if (blob.size > MAX_VIDEO_BYTES) throw new Error("This video is too large to read in the browser.");
  const v = await loadVideo(blob);
  try {
    const duration = Math.min(v.duration || 0, MAX_SCAN_SEC);
    if (!(duration > 3) || !v.videoWidth) throw new Error("This video is too short or couldn't be read.");
    const c = document.createElement("canvas");
    c.width = SAMPLE_W;
    c.height = Math.max(8, Math.round((SAMPLE_W * v.videoHeight) / v.videoWidth));
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const grab = async (t: number) => {
      // never 0: at the start a seek resolves before any frame is decoded and the canvas stays blank
      await seek(v, Math.min(duration - 0.05, Math.max(0.05, t)));
      g.drawImage(v, 0, 0, c.width, c.height);
      return greyOf(g, c.width, c.height);
    };
    // 1. every half second: cuts, and zooms inside a shot
    const step = duration <= 60 ? 0.5 : 1;
    const n = Math.floor(duration / step);
    const diffs: number[] = [];
    const zooms: number[] = [];
    let prev: Grey | null = null;
    for (let i = 0; i <= n; i++) {
      const cur = await grab(i * step);
      let d = 0;
      if (prev) for (let k = 0; k < cur.px.length; k++) d += Math.abs(cur.px[k] - prev.px[k]);
      d = prev ? d / cur.px.length : 0;
      diffs.push(d);
      if (prev && d > 0.02 && d <= CUT_THRESHOLD && scaleJump(prev, cur) !== 1) zooms.push(i * step);
      prev = cur;
      onProgress((0.6 * i) / Math.max(1, n));
    }
    const cuts = detectCuts(diffs, step);
    // 2. each cut frame by frame (1/15 s, from the sample before it to just after): a punch-in across it, a flash or a dip
    let flashes = 0;
    let dips = 0;
    const close = cuts.slice(0, MAX_CLOSE_CUTS);
    for (let j = 0; j < close.length; j++) {
      const run: Grey[] = [];
      for (let t = close[j] - step; t <= close[j] + 0.25; t += 1 / 15) run.push(await grab(t));
      const kind = transitionIn(run.map(meanOf));
      if (kind === "flash") flashes++;
      else if (kind === "dip") dips++;
      else {
        // the biggest change in the run is the cut itself
        let at = 1;
        let most = -1;
        for (let k = 1; k < run.length; k++) {
          let d = 0;
          for (let q = 0; q < run[k].px.length; q++) d += Math.abs(run[k].px[q] - run[k - 1].px[q]);
          if (d > most) { most = d; at = k; }
        }
        if (scaleJump(run[at - 1], run[at]) !== 1) zooms.push(close[j]);
      }
      onProgress(0.6 + (0.3 * (j + 1)) / Math.max(1, close.length));
    }
    // 3. frames for reading the look
    const big = document.createElement("canvas");
    big.width = FRAME_W;
    big.height = Math.round((FRAME_W * v.videoHeight) / v.videoWidth);
    const bg = big.getContext("2d")!;
    const frames: FrameInput[] = [];
    for (const t of styleFrameTimes(cuts, duration)) {
      await seek(v, t);
      bg.drawImage(v, 0, 0, big.width, big.height);
      frames.push({ t, image: big.toDataURL("image/jpeg", 0.72) });
    }
    onProgress(1);
    zooms.sort((a, b) => a - b);
    const d = Math.max(1, duration);
    return {
      duration,
      cuts,
      zooms: zooms.filter((t, i) => i === 0 || t - zooms[i - 1] > 0.6),
      flashes,
      dips,
      frames,
      pacing: { durationSec: Math.round(d), cuts: cuts.length, avgShotSec: Math.round((d / (cuts.length + 1)) * 10) / 10, cutsFirst3s: cuts.filter((t) => t < 3).length },
    };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

// ---------- from what was measured to the edit ----------

/** Words a minute in a transcript over the video's length, or null without both. */
export function wordsPerMinute(transcript: string | null | undefined, seconds: number | null | undefined): number | null {
  const n = (transcript ?? "").split(/\s+/).filter(Boolean).length;
  return n >= 20 && seconds && seconds >= 5 ? Math.round((n / seconds) * 60) : null;
}

const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * How long the opening text stays up: the overlay read in the first 1.6 s, until the
 * first frame read after it that no longer shows it (all of them: 10 s, the most the
 * hook card shows). Null with no opening text.
 */
export function hookSecondsOf(overlays: { t: number; text: string }[], frameTimes: number[]): { seconds: number; text: string } | null {
  const first = overlays.filter((o) => o.t <= 1.6).sort((a, b) => a.t - b.t)[0];
  if (!first) return null;
  const key = plain(first.text);
  const shows = (t: number) => overlays.some((o) => Math.abs(o.t - t) < 0.05 && (plain(o.text).includes(key) || key.includes(plain(o.text))));
  const gone = frameTimes.filter((t) => t > first.t).find((t) => !shows(t));
  const seconds = gone === undefined ? 10 : Math.min(10, Math.max(1, Math.round(gone * 2) / 2));
  return { seconds, text: first.text };
}

export interface ReelFacts {
  cutsPerMin: number | null;
  zoomsPerMin: number | null;
  hookSeconds: number | null;
  wpm: number | null;
  overlays: number;
}

export interface ReelRead {
  source: Pick<CloneSource, "platform" | "author" | "transcript" | "durationSec">;
  measure: Omit<ReelMeasure, "frames"> & { frameTimes: number[] } | null;
  style: StyleDescription | null;
  look: ReelLook | null;
  /** Why the look wasn't read, when the pace was. */
  note?: string;
}

/**
 * The edit with the reel's style laid over it: Jev's look (caption style, case, box,
 * position, words at once, frame) and the measured pace (pause limit from cuts and
 * words a minute, speed matched to the reel's words a minute, zooms or punch-ins,
 * transitions, number cards and pop-ups when it has those overlays, hook seconds).
 * What could not be read stays as it is.
 */
export function withReelStyle(s: EditSettings, r: ReelRead, myWpm: number | null): { next: EditSettings; facts: ReelFacts } {
  const m = r.measure;
  const look = r.look;
  const wpm = wordsPerMinute(r.source.transcript, m?.duration ?? r.source.durationSec);
  const minutes = m ? Math.max(m.duration, 1) / 60 : null;
  const cutsPerMin = m && minutes ? Math.round(m.cuts.length / minutes) : null;
  const zoomsPerMin = m && minutes ? Math.round(m.zooms.length / minutes) : null;
  const hook = r.style && m ? hookSecondsOf(r.style.onScreenText, m.frameTimes) : null;
  const others = (r.style?.onScreenText ?? []).filter((o) => !hook || !(plain(o.text).includes(plain(hook.text)) || plain(hook.text).includes(plain(o.text))));
  const distinct = new Set(others.map((o) => plain(o.text)));

  const style = look?.style ?? s.style;
  const words = STYLES[style].mode === "words";
  let maxPause = s.maxPause;
  if (cutsPerMin !== null) maxPause = cutsPerMin >= 20 ? 0.3 : cutsPerMin >= 10 ? 0.4 : 0.55;
  if (wpm !== null && wpm >= 170) maxPause = Math.min(maxPause, 0.3);
  const punchy = !!m && m.cuts.length >= 3 && m.zooms.length / m.cuts.length >= 0.4;
  const recipe: Recipe = {
    style,
    wordsPerCaption: look?.words && look.words !== "line" ? Number(look.words) : look?.style ? STYLES[style].n || 3 : s.wordsPerCaption,
    uppercase: look?.uppercase ?? (look?.style ? STYLES[style].uppercase : s.uppercase),
    highlightNumbers: s.highlightNumbers,
    progressBar: s.progressBar,
    punchIn: m ? punchy : s.punchIn,
    keyZooms: m ? !punchy && (zoomsPerMin ?? 0) >= 1 : !!s.keyZooms,
    numberCards: r.style ? others.some((o) => /\d/.test(o.text)) : !!s.numberCards,
    popups: r.style ? distinct.size >= 2 : !!s.popups,
    sfx: !!s.sfx,
    maxPause,
    speed: wpm && myWpm ? Math.min(1.15, Math.max(1, Math.round((wpm / myWpm) * 20) / 20)) : s.speed ?? 1,
    hookSeconds: hook?.seconds ?? s.hookSeconds,
    fit: look?.framed === true ? "framed" : look?.framed === false ? "fill" : s.fit,
    captionBox: look ? (look.captionBox === "word" && !words ? undefined : look.captionBox ?? undefined) : s.captionBox,
    font: look ? undefined : s.font,
    captionAnim: look ? undefined : s.captionAnim,
    filter: look ? undefined : s.filter,
    transition: m ? (m.flashes >= 2 && m.flashes >= m.dips ? "flash" : m.dips >= 2 ? "soft" : undefined) : s.transition,
    brollLayout: look?.topHalf === true ? "top" : look?.topHalf === false ? undefined : s.brollLayout,
  };
  const next = applyRecipe(s, recipe);
  if (look?.position) {
    next.position = look.position;
    next.captionY = undefined;
  }
  if (look?.captions !== null && look?.captions !== undefined) next.captions = look.captions;
  return { next, facts: { cutsPerMin, zoomsPerMin, hookSeconds: hook?.seconds ?? null, wpm, overlays: distinct.size } };
}

// ---------- the job ----------

export interface ReelStyleJob {
  projectId: string;
  url: string;
  phase: "fetch" | "measure" | "read" | "done" | "error";
  progress: number;
  read?: ReelRead;
  error?: string;
  /** Set once the editor has laid it over the edit. */
  applied?: boolean;
}

let job: ReelStyleJob | null = null;
const listeners = new Set<(j: ReelStyleJob | null) => void>();
const emit = (patch: Partial<ReelStyleJob>, token: object) => {
  if (token !== current || !job) return;
  job = { ...job, ...patch };
  listeners.forEach((fn) => fn(job));
};
let current: object | null = null;

export const reelStyleJob = () => job;
export function onReelStyleJob(fn: (j: ReelStyleJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export function markReelStyleApplied() {
  if (job) job = { ...job, applied: true };
}
export function clearReelStyleJob() {
  current = null;
  job = null;
  listeners.forEach((fn) => fn(null));
}

/** Reads and measures the reel at `url` for this video. Another start replaces it. */
export async function startReelStyle(projectId: string, url: string): Promise<void> {
  const token = {};
  current = token;
  job = { projectId, url, phase: "fetch", progress: 0 };
  listeners.forEach((fn) => fn(job));
  try {
    const data = (await invokeFunction("clone-reel", { url, style: true })) as { source?: CloneSource & { videoUrl?: string | null } } | null;
    const source = data?.source;
    if (!source?.platform) throw new Error("The reel came back incomplete. Try again.");
    const base = { platform: source.platform, author: source.author, transcript: source.transcript, durationSec: source.durationSec };
    if (!source.videoUrl) {
      // TikTok shares no video file: the pace from its words is all there is to copy
      emit({ phase: "done", progress: 1, read: { source: base, measure: null, style: null, look: null } }, token);
      return;
    }
    emit({ phase: "measure", progress: 0 }, token);
    let blob: Blob;
    try {
      const res = await fetch(source.videoUrl);
      if (!res.ok) throw new Error(String(res.status));
      blob = await res.blob();
    } catch {
      throw new Error("Couldn't download the reel. Try again in a minute.");
    }
    const m = await measureReel(blob, (p) => emit({ progress: p }, token));
    emit({ phase: "read", progress: 1 }, token);
    const { data: seen, error } = await supabase.functions.invoke("reel-visuals", { body: { mode: "style", frames: m.frames, pacing: m.pacing }, timeout: 90_000 });
    // the look couldn't be read: the measured pace still applies, and the reason is shown
    let note: string | undefined;
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
      note = body?.error || "Couldn't read its captions this time.";
    }
    const reply = error ? null : (seen as { style?: StyleDescription; look?: ReelLook | null } | null);
    const { frames, ...rest } = m;
    emit({ phase: "done", progress: 1, read: { source: base, measure: { ...rest, frameTimes: frames.map((f) => f.t) }, style: reply?.style ?? null, look: reply?.look ?? null, note } }, token);
  } catch (e) {
    const message = e instanceof ReelCloneError || e instanceof Error ? e.message : "Couldn't read that reel. Try again.";
    emit({ phase: "error", error: message }, token);
  }
}
