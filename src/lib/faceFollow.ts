// Following the face in the video editor (auto-reframe): the pure part. Which face
// to follow in each look, and the crop's path from those looks. faceVision.ts does
// the looking; drawFrame crops on the path through focusAt (videoEdit.ts). Kept out
// of videoEdit.ts, which the main bundle carries, since only the editor needs it.

import { aspectSize, type Aspect, type FaceTrack } from "@/lib/videoEdit";
import { sanitizeMe, sanitizePairs } from "@/lib/stacked";

/** Seconds between the frames looked at for the face: every half second, fewer on a long video (at most 900 looks). */
export const trackStep = (duration: number) => Math.max(0.5, Math.ceil((duration / 900) * 10) / 10);

/** The share of the source's width the frame shows when it crops to fill (1 = the whole width). */
export function cropShare(aspect: Aspect, srcW: number, srcH: number): number {
  if (!srcW || !srcH) return 1;
  const [w, h] = aspectSize(aspect, srcW, srcH);
  return Math.min(1, w / h / (srcW / srcH));
}

/** The face to follow in one frame: the one followed so far while it is still there and not much
 * smaller than the biggest, else the biggest. Null when there is no face. */
export function pickFace(faces: { x: number; w: number }[], prev: number | null): number | null {
  if (!faces.length) return null;
  const big = faces.reduce((a, b) => (b.w > a.w ? b : a));
  if (prev === null) return big.x;
  const near = faces.reduce((a, b) => (Math.abs(b.x - prev) < Math.abs(a.x - prev) ? b : a));
  return Math.abs(near.x - prev) < near.w * 1.5 && near.w >= big.w * 0.6 ? near.x : big.x;
}

/** A move bigger than the hold must show in this many looks in a row before the crop goes (openshorts' SmoothedCameraman: a lone jump is far more often the detector than the person). */
export const CONFIRM = 3;

/**
 * The crop's path from the face's place in each look (null = no face there), like a camera
 * operator on a heavy tripod: the crop holds still while the face stays within `hold` of it; a
 * bigger move must show in CONFIRM looks in a row, and the crop then goes from the first of
 * them (the whole video is known, so it never lags); a gap keeps the last place, and every move
 * eases over about a second. `cuts` are the looks where a new shot starts (a camera cut): there
 * the crop starts afresh on the new shot's face and never eases across. Null with no face at all.
 */
export function smoothTrack(raw: (number | null)[], step: number, hold: number, cuts: number[] = []): number[] | null {
  const first = raw.find((x): x is number => x !== null);
  if (first === undefined) return null;
  const bounds = [...new Set([0, ...cuts.filter((c) => c > 0 && c < raw.length), raw.length])].sort((a, b) => a - b);
  const h = Math.max(1, Math.round(0.5 / step));
  const ease = (a: number[]) => a.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { sum += a[j]; n++; }
    return sum / n;
  });
  const out: number[] = [];
  let carry = first;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const shot = raw.slice(bounds[k], bounds[k + 1]);
    let cam = shot.find((x): x is number => x !== null) ?? carry;
    const target: number[] = [];
    let pendAt = -1, pendX = 0, seen = 0;
    shot.forEach((x, i) => {
      target.push(cam);
      if (x === null) return;
      if (Math.abs(x - cam) <= hold) { pendAt = -1; return; }
      if (pendAt < 0 || Math.abs(x - pendX) > hold) { pendAt = i; pendX = x; seen = 0; }
      if (++seen >= CONFIRM) {
        cam = x;
        target.fill(cam, pendAt);
        pendAt = -1;
      }
    });
    carry = cam;
    out.push(...ease(ease(target)));
  }
  return out.map((x) => Math.round(x * 1000) / 1000);
}

/** The stretches worth looking at: the edit's kept parts, joined across gaps under 3 s (playing a short gap costs less than jumping it). */
export function lookSpans(segs: { start: number; end: number }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const g of segs) {
    const last = out[out.length - 1];
    if (last && g.start - last.end < 3) last.end = Math.max(last.end, g.end);
    else out.push({ start: g.start, end: g.end });
  }
  return out;
}

/** How much two small frames differ: the mean change per colour value, 0 to 255 (RGBA pixels, alpha left out). */
export function frameChange(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0, n = 0;
  for (let i = 0; i + 2 < Math.min(a.length, b.length); i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return n ? sum / n : 0;
}

/** A frame that changes at least this much (0-255 a colour value) from the one before can be a camera cut. */
export const CUT_CHANGE = 28;

/**
 * Camera cuts, from how much each frame seen changed from the one before (t = its time): a change
 * of CUT_CHANGE or more that is also well above the usual change just before it (someone moving
 * changes a frame a little all the time; a cut changes all of it at once), at most one a second.
 */
export function findCuts(seen: { t: number; d: number }[]): number[] {
  const cuts: number[] = [];
  seen.forEach(({ t, d }, j) => {
    const before = seen.slice(Math.max(0, j - 8), j).map((x) => x.d).sort((a, b) => a - b);
    const usual = before.length ? before[before.length >> 1] : 0;
    if (d >= CUT_CHANGE && d >= usual * 3 + 6 && t - (cuts[cuts.length - 1] ?? -Infinity) >= 1) cuts.push(t);
  });
  return cuts;
}

/** The track covers these stretches (an older track, or one found before the trims moved, may not). */
export function trackCovers(t: FaceTrack | undefined, spans: { start: number; end: number }[]): boolean {
  if (!t?.x.length || !spans.length) return false;
  const from = t.from ?? 0;
  return from <= spans[0].start + t.step && from + (t.x.length - 1) * t.step >= spans[spans.length - 1].end - t.step;
}

/** A stored face track, kept only when well formed. */
export function sanitizeTrack(raw: unknown): FaceTrack | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const step = typeof r.step === "number" && r.step >= 0.1 && r.step <= 10 ? r.step : 0;
  if (!step || !Array.isArray(r.x) || !r.x.length || r.x.length > 2000) return undefined;
  if (!r.x.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
  const from = typeof r.from === "number" && Number.isFinite(r.from) && r.from > 0 ? r.from : 0;
  const cuts = Array.isArray(r.cuts) ? r.cuts.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0).slice(0, 500).sort((a, b) => a - b) : [];
  const pairs = sanitizePairs(r.pairs);
  const me = sanitizeMe(r.me);
  return { step, x: (r.x as number[]).map((v) => Math.min(1, Math.max(0, v))), ...(from ? { from } : {}), ...(cuts.length ? { cuts } : {}), ...(pairs ? { pairs } : {}), ...(me !== undefined ? { me } : {}) };
}
