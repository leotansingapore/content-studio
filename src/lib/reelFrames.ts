// Frames for the visual breakdown in "Clone a reel": downloads the Instagram
// reel (most of its CDN hosts send CORS headers; clone-reel relays the rest), finds the
// scene changes from tiny greyscale samples, measures the pacing, and returns
// a handful of JPEG frames for reel-visuals to read.

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { loadVideo, seek } from "@/lib/videoMedia";
import type { FrameInput, Pacing } from "../../supabase/functions/reel-visuals/logic.ts";

export type { FrameInput, Pacing };

/** Mean absolute greyscale difference (0-1) between samples that counts as a cut. */
// ponytail: one global threshold on 24px samples; per-video adaptive thresholds if cuts are missed on dark or busy reels.
export const CUT_THRESHOLD = 0.14;
export const MAX_FRAMES = 10;
const SAMPLE_W = 24;
const FRAME_W = 432;
const MAX_SCAN_SEC = 180;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** Times (s) of the cuts: a sample that differs enough from the one before. A fade over two samples counts once. */
export function detectCuts(diffs: number[], step: number, threshold = CUT_THRESHOLD): number[] {
  const cuts: number[] = [];
  let lastIndex = -2;
  diffs.forEach((d, i) => {
    if (i === 0 || d <= threshold) return;
    if (i - lastIndex > 1) cuts.push(Math.round(i * step * 10) / 10);
    lastIndex = i;
  });
  return cuts;
}

export function pacingOf(cuts: number[], duration: number): Pacing {
  const d = Math.max(1, duration);
  return {
    durationSec: Math.round(d),
    cuts: cuts.length,
    avgShotSec: Math.round((d / (cuts.length + 1)) * 10) / 10,
    cutsFirst3s: cuts.filter((t) => t < 3).length,
  };
}

/**
 * When to grab frames: the opening (where the hook lives), just after each cut
 * once the new shot has settled, and evenly spaced fill when there are few
 * cuts. Over `max`, the opening is kept and the rest is thinned evenly.
 */
export function pickFrameTimes(cuts: number[], duration: number, max = MAX_FRAMES): number[] {
  const end = Math.max(0.1, duration - 0.1);
  const opening = [0.3, Math.min(1.5, end)];
  const afterCuts = cuts.map((t) => Math.min(end, t + 0.4));
  const fill = cuts.length < 4 ? [0.25, 0.5, 0.75, 0.95].map((f) => duration * f) : [];
  const all = [...opening, ...afterCuts, ...fill].map((t) => Math.round(Math.min(end, t) * 10) / 10).sort((a, b) => a - b);
  const times: number[] = [];
  for (const t of all) if (!times.length || t - times[times.length - 1] >= 0.8) times.push(t);
  if (times.length <= max) return times;
  const head = times.slice(0, 2);
  const rest = times.slice(2);
  const want = max - head.length;
  return [...head, ...Array.from({ length: want }, (_, i) => rest[Math.round((i * (rest.length - 1)) / Math.max(1, want - 1))])];
}

function grey(g: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const px = g.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  return out;
}

export type FramesPhase = "download" | "scan";

/**
 * A reel's video: straight from Instagram, or relayed by clone-reel when the host refuses the
 * browser (some of Instagram's CDN hosts send no CORS header, so the same reel fails on some runs).
 */
export async function fetchReelVideo(videoUrl: string, signal?: AbortSignal): Promise<Blob> {
  try {
    const res = await fetch(videoUrl, { signal });
    if (res.ok) {
      // the relay would refuse it too, so don't spend a use on it
      if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new RangeError("This video is too large to read in the browser.");
      return await res.blob();
    }
  } catch (e) {
    if (signal?.aborted || e instanceof RangeError) throw e;
  }
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/clone-reel`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ video: videoUrl }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error || `The relay answered ${res.status}.`);
  return res.blob();
}

/** The frames and measured pacing for a reel. Throws an Error with a message fit to show. */
export async function sampleReelFrames(
  videoUrl: string,
  onProgress: (phase: FramesPhase, fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ frames: FrameInput[]; pacing: Pacing }> {
  onProgress("download", 0);
  let blob: Blob;
  try {
    blob = await fetchReelVideo(videoUrl, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("Couldn't download the video. Instagram's link may have expired, so clone it again to read it.");
  }
  if (blob.size > MAX_VIDEO_BYTES) throw new Error("This video is too large to read in the browser.");

  const v = await loadVideo(blob);
  try {
    const duration = Math.min(v.duration || 0, MAX_SCAN_SEC);
    if (!(duration > 3) || !v.videoWidth) throw new Error("This video is too short or couldn't be read.");
    const ratio = v.videoHeight / v.videoWidth;

    const small = document.createElement("canvas");
    small.width = SAMPLE_W;
    small.height = Math.max(1, Math.round(SAMPLE_W * ratio));
    const sg = small.getContext("2d", { willReadFrequently: true })!;
    const step = duration <= 60 ? 0.5 : 1;
    const diffs: number[] = [];
    let prev: Float32Array | null = null;
    const samples = Math.floor(duration / step);
    for (let i = 0; i <= samples; i++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      await seek(v, Math.min(duration - 0.05, i * step));
      sg.drawImage(v, 0, 0, small.width, small.height);
      const cur = grey(sg, small.width, small.height);
      let sum = 0;
      if (prev) for (let k = 0; k < cur.length; k++) sum += Math.abs(cur[k] - prev[k]);
      diffs.push(prev ? sum / cur.length : 0);
      prev = cur;
      onProgress("scan", i / Math.max(1, samples));
    }
    const cuts = detectCuts(diffs, step);

    const big = document.createElement("canvas");
    big.width = FRAME_W;
    big.height = Math.round(FRAME_W * ratio);
    const bg = big.getContext("2d")!;
    const frames: FrameInput[] = [];
    for (const t of pickFrameTimes(cuts, duration)) {
      await seek(v, t);
      bg.drawImage(v, 0, 0, big.width, big.height);
      frames.push({ t, image: big.toDataURL("image/jpeg", 0.72) });
    }
    return { frames, pacing: pacingOf(cuts, duration) };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}
