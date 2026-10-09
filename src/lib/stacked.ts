// Layouts that stack two pictures in a vertical reel. Two speakers stacked: a podcast two-shot, each
// person in a half of their own, captions on the seam. Slides and me: a screen recording with the
// speaker's camera in a corner, the whole screen on top and their face below. findFaceTrack
// (faceVision.ts) finds who sits where; drawFrame (videoMedia.ts) draws with drawStacked and
// drawSlides. The layout ideas are openshorts' split_layout and screencast_layout
// (mutonby/openshorts, MIT); the code is our own.

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

/** A spot found on the whole picture, on a picture cut to its top `keep` of the height (burned-in text cropped off). */
export const lifted = (p: Spot, keep: number): Spot => (keep >= 1 ? p : [p[0], Math.min(1, p[1] / keep), p[2]]);

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
 * The part of the source shown in a band (w x h on the canvas) for this face: `wide` faces wide
 * (about three: head and shoulders), at least `floor` of the source's width (so a small face is
 * not blown up past sharp) and at most half (so the other person stays out), the face a little
 * above the middle, never past the picture's edge. `zoom` crops tighter (key-line zooms).
 */
export function halfCrop(spot: Spot, srcW: number, srcH: number, w: number, h: number, zoom = 1, wide = 3, floor = 0.3): { x: number; y: number; w: number; h: number } {
  const [fx, fy, fw] = spot;
  let cw = Math.min(srcW * 0.5, Math.max(srcW * floor, fw * srcW * wide)) / zoom;
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

/**
 * The face that stays in a screen recording (the speaker's camera): the person seen in the most
 * looks, when that is at least half the looks made; null when nobody is.
 */
export function meOf(looks: (SeenFace[] | null)[]): Spot | null {
  const p = peopleOf(looks, 0.5).sort((a, b) => b.share - a.share)[0];
  return p ? [p.x, p.y, p.w] : null;
}

/** The screen's band: the whole picture across the frame's width (W x H), at most 45% of its height. */
export const slidesHeight = (srcW: number, srcH: number, W: number, H: number) => Math.min(H * 0.45, (W * srcH) / srcW);

/** Where captions sit under the slides: three quarters of the way down the face's band, over the chest. */
export const slidesCaptionY = (srcW: number, srcH: number, W: number, H: number) => {
  const seam = slidesHeight(srcW, srcH, W, H) / H;
  return Math.round((seam + (1 - seam) * 0.75) * 100) / 100;
};

/**
 * Draws a screen recording as slides and me: the whole picture across the top (nothing cut off the
 * sides, so every word on a slide stays), and below it the speaker's face (`me`) filling the rest.
 * `zoom` (key lines) and `fx` (face effects) go on the face only.
 */
export function drawSlides(
  g: CanvasRenderingContext2D,
  v: CanvasImageSource & { videoWidth: number; videoHeight: number },
  me: Spot,
  W: number,
  H: number,
  zoom: number,
  filter: string,
  fx?: ((r: { x: number; y: number; w: number; h: number }) => void) | null,
) {
  const top = slidesHeight(v.videoWidth, v.videoHeight, W, H);
  const sh = Math.min(v.videoHeight, (v.videoWidth * top) / W); // a squarer source shows its middle rows
  g.filter = filter;
  g.drawImage(v, 0, (v.videoHeight - sh) / 2, v.videoWidth, sh, 0, 0, W, top);
  // about a face and a half wide: a corner camera frames head and shoulders in a wide box, and a
  // wider crop of this tall band would show the screen round it
  const c = halfCrop(me, v.videoWidth, v.videoHeight, W, H - top, zoom, 1.6, 0.08);
  g.drawImage(v, c.x, c.y, c.w, c.h, 0, top, W, H - top);
  g.filter = "none";
  fx?.({ x: 0, y: top, w: W, h: H - top });
}

/** A stored face for slides and me: a well formed spot, null (looked, none) or undefined (not looked yet). */
export function sanitizeMe(raw: unknown): Spot | null | undefined {
  if (raw === null) return null;
  return Array.isArray(raw) && raw.length === 3 && raw.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) ? [raw[0], raw[1], raw[2]] : undefined;
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
