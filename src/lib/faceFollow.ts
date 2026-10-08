// Following the face in the video editor (auto-reframe): the pure part. Which face
// to follow in each look, and the crop's path from those looks. faceVision.ts does
// the looking; drawFrame crops on the path through focusAt (videoEdit.ts). Kept out
// of videoEdit.ts, which the main bundle carries, since only the editor needs it.

import { aspectSize, type Aspect, type FaceTrack } from "@/lib/videoEdit";

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

/**
 * The crop's path from the face's place in each look (null = no face there), like a camera
 * operator: a gap keeps the last place, a one-look blip is ignored, the crop holds still while
 * the face stays within `hold` of its centre and re-centres when it goes further, and every move
 * eases over about a second. Null when no face was found at all.
 */
export function smoothTrack(raw: (number | null)[], step: number, hold: number): number[] | null {
  const first = raw.find((x): x is number => x !== null);
  if (first === undefined) return null;
  let last = first;
  const filled = raw.map((x) => (x === null ? last : (last = x)));
  const mid = filled.map((_, i) => [filled[Math.max(0, i - 1)], filled[i], filled[Math.min(filled.length - 1, i + 1)]].sort((a, b) => a - b)[1]);
  let cam = mid[0];
  const target = mid.map((x) => (Math.abs(x - cam) > hold ? (cam = x) : cam));
  const h = Math.max(1, Math.round(0.5 / step));
  const ease = (a: number[]) => a.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { sum += a[j]; n++; }
    return sum / n;
  });
  return ease(ease(target)).map((x) => Math.round(x * 1000) / 1000);
}

/** A stored face track, kept only when well formed. */
export function sanitizeTrack(raw: unknown): FaceTrack | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const step = typeof r.step === "number" && r.step >= 0.1 && r.step <= 10 ? r.step : 0;
  if (!step || !Array.isArray(r.x) || !r.x.length || r.x.length > 2000) return undefined;
  if (!r.x.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
  return { step, x: (r.x as number[]).map((v) => Math.min(1, Math.max(0, v))) };
}
