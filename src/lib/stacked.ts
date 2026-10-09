// Two speakers stacked: a podcast two-shot in a vertical reel, each person in a half of their own,
// one above the other, with the captions on the seam. findFaceTrack (faceVision.ts) finds who sits
// where in each shot; drawFrame (videoMedia.ts) draws the halves with drawStacked. The layout idea
// is openshorts' split_layout (mutonby/openshorts, MIT); the code is our own.

import { faceOf, peopleOf, type SeenFace } from "@/lib/speakers";

/** A face's centre and width, as shares of the picture. */
export type Spot = [x: number, y: number, w: number];

/** A shot (source seconds, from `at` up to `to`) with two people side by side: the left one goes on top. */
export interface Pair {
  at: number;
  to: number;
  top: Spot;
  bottom: Spot;
}

/** The end of the last shot: past any source. */
export const OPEN_END = 1e6;

/**
 * The shots in which exactly two people stay and are in the same look at least half the time:
 * where each of them sits. `looks` are every `step` seconds from `from` (null = none made there);
 * `cuts` are the camera cuts in source seconds.
 */
export function pairsOf(looks: (SeenFace[] | null)[], from: number, step: number, cuts: number[]): Pair[] {
  const lookOf = (t: number) => Math.ceil((t - from) / step - 1e-6);
  const inside = cuts.filter((c) => lookOf(c) > 0 && lookOf(c) < looks.length).sort((a, b) => a - b);
  const pairs: Pair[] = [];
  for (let k = 0; k <= inside.length; k++) {
    const shot = looks.slice(k ? lookOf(inside[k - 1]) : 0, k < inside.length ? lookOf(inside[k]) : looks.length);
    const people = peopleOf(shot, 0.3);
    if (people.length !== 2) continue;
    const made = shot.filter((l) => l !== null);
    if (made.filter((l) => people.every((p) => faceOf(l, p))).length < made.length * 0.5) continue;
    const [a, b] = people.map((p): Spot => [p.x, p.y, p.w]);
    pairs.push({ at: k ? inside[k - 1] : 0, to: k < inside.length ? inside[k] : OPEN_END, top: a, bottom: b });
  }
  return pairs;
}

/** The pair at this moment of the source, if its shot has one. */
export const pairAt = (pairs: Pair[] | undefined, src: number): Pair | null => pairs?.find((p) => src >= p.at && src < p.to) ?? null;

/** The share of these stretches (the edit's kept parts) that the pairs cover. */
export function pairShare(pairs: Pair[] | undefined, spans: { start: number; end: number }[]): number {
  const total = spans.reduce((s, g) => s + g.end - g.start, 0);
  if (!pairs?.length || total <= 0) return 0;
  let on = 0;
  for (const g of spans) for (const p of pairs) on += Math.max(0, Math.min(g.end, p.to) - Math.max(g.start, p.at));
  return Math.min(1, on / total);
}

/**
 * The part of the source shown in one half (w x h on the canvas) for this face: about three faces
 * wide, kept between 30% and half the source's width so the other person stays out, the face a
 * little above the middle, never past the picture's edge. `zoom` crops tighter (key-line zooms).
 */
export function halfCrop(spot: Spot, srcW: number, srcH: number, w: number, h: number, zoom = 1): { x: number; y: number; w: number; h: number } {
  const [fx, fy, fw] = spot;
  let cw = Math.min(srcW * 0.5, Math.max(srcW * 0.3, fw * srcW * 3)) / zoom;
  let ch = (cw * h) / w;
  if (ch > srcH) [ch, cw] = [srcH, (srcH * w) / h];
  const x = Math.min(srcW - cw, Math.max(0, fx * srcW - cw / 2));
  const y = Math.min(srcH - ch, Math.max(0, fy * srcH - ch * 0.42));
  return { x, y, w: cw, h: ch };
}

/**
 * Draws the pair into the frame (W x H): the top person in the upper half, the other below, each
 * cropped round their face with the edit's colour look (`filter`); `fx` paints the face and
 * background effects over each half.
 */
export function drawStacked(
  g: CanvasRenderingContext2D,
  v: CanvasImageSource & { videoWidth: number; videoHeight: number },
  pair: Pair,
  W: number,
  H: number,
  zoom: number,
  filter: string,
  fx?: ((r: { x: number; y: number; w: number; h: number }) => void) | null,
) {
  const half = H / 2;
  [pair.top, pair.bottom].forEach((spot, i) => {
    const c = halfCrop(spot, v.videoWidth, v.videoHeight, W, half, zoom);
    g.filter = filter;
    g.drawImage(v, c.x, c.y, c.w, c.h, 0, i * half, W, half);
    g.filter = "none";
    fx?.({ x: 0, y: i * half, w: W, h: half });
  });
}

/** A stored list of pairs, each kept only when well formed; undefined when there is no list (not looked for yet). */
export function sanitizePairs(raw: unknown): Pair[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const spot = (s: unknown): Spot | null =>
    Array.isArray(s) && s.length === 3 && s.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) ? [s[0], s[1], s[2]] : null;
  return raw.slice(0, 500).flatMap((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const top = spot(r.top), bottom = spot(r.bottom);
    const ok = typeof r.at === "number" && typeof r.to === "number" && r.at >= 0 && r.to > r.at && r.to <= OPEN_END;
    return ok && top && bottom ? [{ at: r.at as number, to: r.to as number, top, bottom }] : [];
  });
}
