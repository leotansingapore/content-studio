// Captions for a long recording (a podcast or webinar up to about 2 hours), pure
// logic: the recording is captioned in parts of about 10 minutes that overlap by
// a few seconds (each part one 16 kHz WAV under Whisper's 25 MB, one use of the
// "video-transcribe" cap), and the parts' words are stitched back into one
// transcript. The browser side is src/lib/longAudio.ts (reading the sound in
// pieces) and src/lib/captionJob.ts (the job that keeps running across pages).

import type { Word } from "@/lib/videoEdit";

/** About 10 minutes a part: 19 MB of 16 kHz WAV, about 6 US cents of Whisper. */
export const PART_SECONDS = 600;
/** Seconds each part runs into the next, so a word cut at a part's edge is heard whole in one of them. */
export const OVERLAP_SECONDS = 5;
/** The longest recording the editor captions: about 2 hours. */
export const MAX_LONG_SECONDS = 2 * 3600 + 5 * 60;
/** The biggest file the editor takes: about 4 GB, kept on this device. */
export const MAX_LONG_BYTES = 4 * 1024 ** 3;
/** Up to this long, one part (today's 12 minutes, 23 MB of WAV). */
const ONE_PART = PART_SECONDS * 1.2;
/** Up to this size and one part, a file is read whole as before (decodeAudioData). */
export const WHOLE_MAX_BYTES = 500 * 1024 * 1024;

export interface Part {
  from: number;
  to: number;
}

/**
 * The parts a recording is captioned in: equal lengths of about PART_SECONDS (at
 * most 1.2x, so no part passes 12 minutes), each running OVERLAP_SECONDS into the next.
 */
export function captionPlan(duration: number): Part[] {
  const d = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const n = d <= ONE_PART ? 1 : Math.ceil(d / PART_SECONDS - 0.2);
  const len = d / n;
  return Array.from({ length: n }, (_, k) => ({ from: round(k * len), to: round(Math.min(d, (k + 1) * len + (k < n - 1 ? OVERLAP_SECONDS : 0))) }));
}

/** A recording captioned by the job, in parts: over 12 minutes, or too big to read whole. */
export const isLong = (duration: number, bytes: number) => captionPlan(duration).length > 1 || bytes > WHOLE_MAX_BYTES;

const round = (t: number) => Math.round(t * 1000) / 1000;
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * One transcript from the parts' words (each timed from its part's start). Where
 * two parts overlap, the earlier part's words run to the middle of the longest
 * pause it heard in the overlap (the overlap's middle when there is none) and the
 * later part's words carry on after the last of them. The two parts' clocks can
 * differ by a fraction of a second, so a word both heard is dropped from the
 * later part, and so is a piece of a word the earlier part heard whole.
 */
export function stitchParts(plan: Part[], results: Word[][]): Word[] {
  const out: Word[] = [];
  plan.forEach((p, k) => {
    const words = (results[k] ?? [])
      .map((w) => ({ w: w.w, s: round(w.s + p.from), e: round(Math.min(p.to, w.e + p.from)) }))
      .filter((w) => w.s < p.to);
    if (!out.length) return out.push(...words);
    const prevEnd = plan[k - 1].to;
    const seam = seamIn(out, p.from, prevEnd);
    while (out.length && out[out.length - 1].s >= seam) out.pop();
    const last = out[out.length - 1];
    let next = last ? words.filter((w) => w.s > last.s && w.s >= last.e - 0.15) : words;
    if (last && next[0] && norm(next[0].w) === norm(last.w) && next[0].s - last.s < 1) next = next.slice(1);
    out.push(...next);
  });
  return out;
}

/** The middle of the longest gap between the words heard in the overlap, half a second clear of either part's edge. */
function seamIn(words: Word[], from: number, to: number): number {
  const lo = from + 0.5;
  const hi = to - 0.5;
  let heard = lo;
  let best = { gap: -1, at: (from + to) / 2 };
  for (const w of words) {
    if (w.e <= lo) continue;
    if (w.s >= hi) break;
    if (w.s - heard > best.gap) best = { gap: w.s - heard, at: (heard + w.s) / 2 };
    heard = Math.max(heard, w.e);
  }
  if (hi - heard > best.gap) best = { gap: hi - heard, at: (heard + hi) / 2 };
  return best.at;
}

/** "1 h 52 min" or "38 min". */
export function hoursMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
