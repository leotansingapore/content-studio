// B-roll as a card: the clip in a rounded card at the top or the side, over the
// speaker's shot dimmed to CARD_DIM, so the speaker stays in view (the B-roll
// overlay style of ArtCog/chatmonteur, MIT, ideas only). drawFrame calls
// drawBroll for every B-roll frame, so the preview and both exports (fastExport
// and the real-time one) draw it the same way. Unset layout = full frame.

import { brollAt, gradeOf, type Broll, type EditSettings } from "@/lib/videoEdit";
import { faceBand, fitBlock } from "@/lib/videoMotion";

export type BrollLayout = "top" | "side";

/** The shot under a card keeps this share of its light. */
export const CARD_DIM = 0.55;
/** A card fades in and out over this many seconds. */
export const CARD_FADE = 0.2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the card sits on a W x H frame. Top: most of the width, as high as it
 * can go clear of the face and the captions (smaller, down to 70%, when it has
 * to be), else just under the app's top bar. Side: under half the width, on the
 * side away from the face (the right when the face isn't known), a little above
 * the middle. face and caps are rows as shares of the height; faceX is the
 * face's middle as a share of the source's width.
 */
export function cardRect(layout: BrollLayout, W: number, H: number, face: [number, number] | null, faceX: number | null, caps: [number, number] | null): Rect {
  if (layout === "side") {
    const w = W * (W > H ? 0.42 : 0.46);
    const h = W > H ? H * 0.62 : Math.min(H * 0.42, w * 1.3);
    const x = faceX !== null && faceX > 0.5 ? W * 0.04 : W * 0.96 - w;
    const y = Math.max(H * 0.06, Math.min(H * 0.94 - h, H * 0.42 - h / 2));
    return round({ x, y, w, h });
  }
  const w0 = W * 0.88;
  const h0 = Math.min(H * 0.36, w0 * 0.8);
  const { top, scale } = fitBlock(h0 / H, [face, caps], [0.1]);
  return round({ x: (W - w0 * scale) / 2, y: top * H, w: w0 * scale, h: h0 * scale });
}

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** How far in the card is at this point of the edit: 0 to 1 over CARD_FADE at either end of its cutaway. */
export const cardAlpha = (b: Pick<Broll, "from" | "to">, out: number) =>
  Math.max(0, Math.min(1, (out - b.from) / CARD_FADE, (b.to - out) / CARD_FADE));

/**
 * The B-roll frame showing now: full frame (the layout unset), or a card over
 * the dimmed shot already drawn. `speaker` is the filmed picture (for where the
 * face sits); `caps` is where drawFrame puts the captions; a paused preview
 * (`still`) shows the card fully in, without the fade.
 */
export function drawBroll(
  g: CanvasRenderingContext2D,
  b: { videoWidth: number; videoHeight: number } & CanvasImageSource,
  s: EditSettings,
  out: number,
  speaker: { videoWidth: number; videoHeight: number },
  caps: [number, number] | null,
  still = false,
) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const look = gradeOf(s);
  if (!s.brollLayout) {
    const cover = Math.max(W / b.videoWidth, H / b.videoHeight);
    g.filter = look;
    g.drawImage(b, (W - b.videoWidth * cover) / 2, (H - b.videoHeight * cover) / 2, b.videoWidth * cover, b.videoHeight * cover);
    g.filter = "none";
    return;
  }
  const on = brollAt(s.broll, out);
  const a = on && !still ? cardAlpha(on.b, out) : 1;
  const box = s.faceBox;
  const r = cardRect(s.brollLayout, W, H, faceBand(box, s, W, H, speaker.videoWidth, speaker.videoHeight), box ? (box.x0 + box.x1) / 2 : null, caps);
  const u = Math.min(W, H) / 1080;
  const radius = 32 * u;
  g.save();
  g.globalAlpha = a * (1 - CARD_DIM);
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = a;
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = 40 * u;
  g.shadowOffsetY = 12 * u;
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, radius);
  g.fill();
  g.shadowColor = "transparent";
  g.save();
  g.clip();
  const cover = Math.max(r.w / b.videoWidth, r.h / b.videoHeight);
  const dw = b.videoWidth * cover;
  const dh = b.videoHeight * cover;
  g.filter = look;
  g.drawImage(b, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
  g.filter = "none";
  g.restore();
  g.lineWidth = 4 * u;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, radius);
  g.stroke();
  g.restore();
}
