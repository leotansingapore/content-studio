// Where each scene's parts sit in a frame of any shape: one spec lays out in 9:16, 1:1 and 16:9 by
// these rules, with no model call. Tall frames stack the words over the phone, square ones shrink
// the phone to 62 % of the height, wide ones put the words left and the phone right (as huashu's
// t2_keynote_ui does). At 9:16 everything stays clear of what Instagram and TikTok draw on top.
import { APP_COVER } from "@/lib/videoEdit";
import type { FilmScene } from "./timeline.ts";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Shape = "tall" | "square" | "wide";
export const shapeOf = (w: number, h: number): Shape => (h > w * 1.2 ? "tall" : w > h * 1.2 ? "wide" : "square");

// width over height of the device frames' outlines
export const PHONE_ASPECT = 0.49;
export const BROWSER_ASPECT = 1.5;

/** The frame minus its margins; at 9:16 minus the larger of Instagram's and TikTok's covered bands. */
export function safeArea(w: number, h: number): Rect {
  if (shapeOf(w, h) === "tall") {
    const band = (k: "top" | "bottom" | "right") => Math.max(APP_COVER.instagram[k], APP_COVER.tiktok[k]);
    const top = Math.ceil(band("top") * h), bottom = Math.ceil(band("bottom") * h), right = Math.ceil(band("right") * w);
    const left = Math.round(0.07 * w);
    return { x: left, y: top, w: w - left - right, h: h - top - bottom };
  }
  const m = Math.round(0.06 * Math.min(w, h));
  return { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
}

/** The largest box of `aspect` (width over height) centred in r. */
export function fit(r: Rect, aspect: number): Rect {
  const w = Math.min(r.w, r.h * aspect), h = w / aspect;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });

export interface CardBox {
  box: Rect;
  icon: Rect;
  title: Rect;
  line: Rect;
}
export interface SceneLayout {
  /** Text lines: a type scene's words, a screen's highlight label, a montage's word. */
  words: Rect[];
  /** The phone or browser frame's outline. */
  device?: Rect;
  cards?: CardBox[];
  value?: Rect;
  label?: Rect;
  logo?: Rect;
  line?: Rect;
  cta?: Rect;
  /** The band for the spoken line, just above the bottom of the safe area. */
  caption: Rect;
}

/** Words and a device side by side: the same device box for every screen and montage scene, so a carry cut keeps the frame still. */
function wordsAndDevice(safe: Rect, shape: Shape, h: number, frame: "phone" | "browser"): { words: Rect; device: Rect } {
  const aspect = frame === "browser" ? BROWSER_ASPECT : PHONE_ASPECT;
  const gap = Math.round(0.03 * Math.max(safe.w, safe.h));
  if (shape === "wide") {
    const ww = Math.round(safe.w * 0.42);
    return { words: { ...safe, w: ww }, device: fit({ x: safe.x + ww + gap, y: safe.y, w: safe.w - ww - gap, h: safe.h }, aspect) };
  }
  const dh = shape === "square" && frame === "phone" ? Math.min(Math.round(0.62 * h), safe.h - 2 * gap) : Math.round(safe.h * 0.8);
  const words = { x: safe.x, y: safe.y, w: safe.w, h: safe.h - dh - gap };
  return { words, device: fit({ x: safe.x, y: safe.y + safe.h - dh, w: safe.w, h: dh }, aspect) };
}

function cardBoxes(safe: Rect, shape: Shape, n: number): CardBox[] {
  const gap = Math.round(0.03 * Math.max(safe.w, safe.h));
  const row = shape === "wide";
  const cw = row ? (safe.w - gap * (n - 1)) / n : safe.w;
  const ch = row ? Math.min(safe.h * 0.75, cw * 1.25) : Math.min((safe.h - gap * (n - 1)) / n, safe.w * 0.5);
  const total = row ? cw * n + gap * (n - 1) : ch * n + gap * (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const box = row
      ? { x: safe.x + (safe.w - total) / 2 + i * (cw + gap), y: safe.y + (safe.h - ch) / 2, w: cw, h: ch }
      : { x: safe.x, y: safe.y + (safe.h - total) / 2 + i * (ch + gap), w: cw, h: ch };
    const p = Math.round(0.09 * Math.min(box.w, box.h));
    const r = inset(box, p);
    if (box.w > box.h * 1.3) {
      // a wide card: the icon square on the left, the title over the line beside it
      const s = Math.min(r.h, r.w * 0.28);
      const tx = r.x + s + p, tw = r.w - s - p;
      return { box, icon: { x: r.x, y: r.y + (r.h - s) / 2, w: s, h: s }, title: { x: tx, y: r.y, w: tw, h: r.h * 0.45 }, line: { x: tx, y: r.y + r.h * 0.5, w: tw, h: r.h * 0.5 } };
    }
    const s = Math.min(r.w * 0.4, r.h * 0.3);
    return { box, icon: { x: r.x, y: r.y, w: s, h: s }, title: { x: r.x, y: r.y + s + p, w: r.w, h: r.h * 0.22 }, line: { x: r.x, y: r.y + s + p + r.h * 0.24, w: r.w, h: r.h - s - p - r.h * 0.24 } };
  });
}

export function layoutScene(scene: FilmScene, w: number, h: number): SceneLayout {
  const safe = safeArea(w, h);
  const shape = shapeOf(w, h);
  const ch = Math.round(Math.min(safe.h * 0.09, safe.w * 0.12));
  const caption = { x: safe.x, y: safe.y + safe.h - ch, w: safe.w, h: ch };
  if (scene.kind === "type") {
    const n = Math.max(1, scene.words.length);
    const lh = Math.min(safe.h / n, safe.w * (shape === "wide" ? 0.16 : 0.26));
    const top = safe.y + (safe.h - lh * n) / 2;
    return { words: scene.words.map((_, i) => ({ x: safe.x, y: top + i * lh, w: safe.w, h: lh })), caption };
  }
  if (scene.kind === "screen" || scene.kind === "montage") {
    const { words, device } = wordsAndDevice(safe, shape, h, scene.kind === "screen" ? scene.frame ?? "phone" : "phone");
    // one line of words, centred in its region
    const lh = Math.min(words.h, shape === "wide" ? words.w * 0.3 : safe.h * 0.1);
    return { words: [{ x: words.x, y: words.y + (words.h - lh) / 2, w: words.w, h: lh }], device, caption };
  }
  if (scene.kind === "cards") return { words: [], cards: cardBoxes(safe, shape, Math.max(1, Math.min(3, scene.cards.length))), caption };
  if (scene.kind === "number") {
    const vh = Math.min(safe.h * 0.3, safe.w * 0.32), lh = Math.min(safe.h * 0.08, safe.w * 0.09);
    const top = safe.y + (safe.h - vh - lh) / 2;
    return { words: [], value: { x: safe.x, y: top, w: safe.w, h: vh }, label: { x: safe.x, y: top + vh, w: safe.w, h: lh }, caption };
  }
  // logo: the mark a little above the middle, its line and the call to action under it
  const lw = safe.w * (shape === "wide" ? 0.4 : 0.6), lgh = Math.min(safe.h * 0.24, lw * 0.6);
  const lineH = Math.min(safe.h * 0.07, safe.w * 0.08), ctaH = lineH * 0.7;
  const top = safe.y + (safe.h - lgh - lineH - ctaH) / 2 - safe.h * 0.04;
  return {
    words: [],
    logo: { x: safe.x + (safe.w - lw) / 2, y: top, w: lw, h: lgh },
    line: { x: safe.x, y: top + lgh + lineH * 0.4, w: safe.w, h: lineH },
    cta: { x: safe.x, y: top + lgh + lineH * 1.6, w: safe.w, h: ctaH },
    caption,
  };
}
