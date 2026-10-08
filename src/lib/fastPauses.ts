// Long pauses played fast instead of cut (auto-editor's "silent speed"): the
// picture runs through the pause at FAST times speed with the sound faded out,
// so there is no jump cut. A kept part carries its fast stretches; preview,
// both exports and every timeline mapping read them from here.

import type { Segment } from "@/lib/videoEdit";

export const FAST = 4;

/** A kept part as runs at one speed: [from, to, rate] on the source timeline. */
export function piecesOf(g: Segment): [number, number, number][] {
  if (!g.fast?.length) return [[g.start, g.end, 1]];
  const out: [number, number, number][] = [];
  let at = g.start;
  for (const [s, e] of g.fast) {
    if (s > at) out.push([at, s, 1]);
    out.push([s, e, FAST]);
    at = e;
  }
  if (g.end > at) out.push([at, g.end, 1]);
  return out;
}

/** Seconds a kept part lasts in the edit. */
export const segLength = (g: Segment) => (g.fast?.length ? piecesOf(g).reduce((t, [s, e, r]) => t + (e - s) / r, 0) : g.end - g.start);

/** Seconds into a kept part's own stretch of the edit at source time src. */
export function outWithin(g: Segment, src: number): number {
  let t = 0;
  for (const [s, e, r] of piecesOf(g)) {
    if (src <= s) break;
    t += (Math.min(src, e) - s) / r;
  }
  return t;
}

/** The source time t seconds into a kept part's own stretch of the edit. */
export function srcWithin(g: Segment, t: number): number {
  let acc = 0;
  for (const [s, e, r] of piecesOf(g)) {
    const len = (e - s) / r;
    if (t < acc + len) return s + (t - acc) * r;
    acc += len;
  }
  return g.end;
}

/** Plays fast at src: inside a fast stretch, and not within `early` source seconds of its end, so the next word never starts fast. */
export const isFast = (g: Segment, src: number, early = 0) => !!g.fast?.some(([s, e]) => src >= s && src < e - early);

/** The kept parts with each pause that would have been cut marked fast instead, clipped to the part it falls in. */
export function withFast(segs: Segment[], pauses: { start: number; end: number }[]): Segment[] {
  if (!pauses.length) return segs;
  return segs.map((g) => {
    const fast = pauses
      .map((p): [number, number] => [Math.max(p.start, g.start), Math.min(p.end, g.end)])
      .filter(([s, e]) => e - s > 0.04)
      .sort((a, b) => a[0] - b[0]);
    return fast.length ? { ...g, fast } : g;
  });
}
