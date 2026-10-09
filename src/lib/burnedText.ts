// Text already burned into the bottom of a video (someone else's subtitles, a caption bar): found on
// this device from a few small grey frames, so the editor can offer to crop it off before its own
// captions go on. The pure part, plus the crop drawFrame applies; BurnedTextOffer samples the frames.
// The cut rule (seen in at least 40% of frames, the highest line less a margin, a limit on how much
// goes) follows mutonby/openshorts burned_subtitles.py (MIT); the finding is our own.

/** A light-dark step at least this big between neighbouring pixels (0-255) is a letter's edge. */
const EDGE = 60;
/** The bottom of the picture looked at for text: from 65% down to 98%. */
const LOOK_FROM = 0.65;
const LOOK_TO = 0.98;

/**
 * Rows of one small grey frame (w x h, 0-255 per pixel, row by row) that look like a line of text:
 * many sharp light-dark edges packed close (each letter has several; two people's outlines against
 * a wall give a few, far apart), their middle near the middle of the picture (subtitles are
 * centred) and not edge to edge (a blind, a shelf or a desk is).
 */
export function textRows(lum: ArrayLike<number>, w: number, h: number): boolean[] {
  const need = Math.max(12, Math.round(w * 0.04));
  return Array.from({ length: h }, (_, y) => {
    let n = 0, sum = 0, first = -1, last = -1;
    for (let x = 0, i = y * w; x + 1 < w; x++, i++) {
      if (Math.abs(lum[i + 1] - lum[i]) < EDGE) continue;
      n++;
      sum += x;
      if (first < 0) first = x;
      last = x;
    }
    if (n < need || n / (last - first + 1) < 0.12) return false;
    const mid = sum / n / w;
    return mid > 0.25 && mid < 0.75 && last - first <= w * 0.9;
  });
}

/**
 * Where text starts in the bottom of one frame (a share of its height from the top), or null: the
 * top of the highest run of text rows there, two lines and the gap between them counting as one, a
 * run 2% to 20% of the height with no text rows just above it (so it is a band, not the bottom of
 * a busy picture).
 */
export function bandTop(lum: ArrayLike<number>, w: number, h: number): number | null {
  const rows = textRows(lum, w, h);
  const from = Math.floor(h * LOOK_FROM), to = Math.ceil(h * LOOK_TO);
  const gap = Math.max(1, Math.round(h * 0.035));
  const runs: [number, number][] = [];
  for (let y = from; y < to; y++) {
    if (!rows[y]) continue;
    const r = runs[runs.length - 1];
    if (r && y - r[1] <= gap) r[1] = y;
    else runs.push([y, y]);
  }
  const above = Math.max(1, Math.round(h * 0.03));
  for (const [a, b] of runs) {
    const tall = (b - a + 1) / h;
    const clear = rows.slice(Math.max(0, a - above), a).every((r) => !r);
    if (tall >= 0.02 && tall <= 0.2 && clear) return Math.round((a / h) * 1000) / 1000;
  }
  return null;
}

/** Text must show in at least this share of the frames: subtitles come and go with the speech. */
const MIN_PRESENCE = 0.4;

/**
 * Where to cut (a share of the height: everything below goes), from each sampled frame's band top
 * (null = no text in it): when text shows in at least 40% of the frames at about the same height,
 * its highest line (one stray reading left out) less a 2% margin; null when it is not there that
 * often, or the cut would take more than the bottom 30% or less than 3%.
 */
export function cutLine(tops: (number | null)[]): number | null {
  const seen = tops.filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (!tops.length || seen.length < MIN_PRESENCE * tops.length) return null;
  const mid = seen[seen.length >> 1];
  const near = seen.filter((t) => Math.abs(t - mid) <= 0.1);
  if (near.length < MIN_PRESENCE * tops.length) return null;
  const cut = (near.length >= 4 ? near[1] : near[0]) - 0.02;
  return cut >= 0.7 && cut <= 0.97 ? Math.round(cut * 1000) / 1000 : null;
}

/** Grey levels (0-255) of RGBA pixels. */
export function greyOf(px: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length >> 2);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  return out;
}

let pad: HTMLCanvasElement | null = null;

/**
 * The picture with its bottom cut off below `keep` (a share of its height), as something drawFrame
 * draws like the video; the video itself when nothing is cut (or `keep` is out of range, from a
 * stored edit: never more than the bottom 40%).
 */
export function keepTop<T extends { videoWidth: number; videoHeight: number }>(v: T, keep: number | undefined): T {
  if (!keep || !(keep >= 0.6 && keep < 1) || !v.videoWidth) return v;
  const h = Math.max(1, Math.round(v.videoHeight * keep));
  pad ??= document.createElement("canvas");
  if (pad.width !== v.videoWidth) pad.width = v.videoWidth;
  if (pad.height !== h) pad.height = h;
  pad.getContext("2d")!.drawImage(v as unknown as CanvasImageSource, 0, 0, v.videoWidth, h, 0, 0, v.videoWidth, h);
  return Object.assign(pad, { videoWidth: v.videoWidth, videoHeight: h }) as unknown as T;
}
