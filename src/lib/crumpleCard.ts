// The crumpled-notification hook's first frame (/make/hook-demo, play "crumple"; src/lib/hookDemoJob.ts): a frame of
// the adviser's own video with one notification card carrying their hook drawn over it, sent to ai-video's
// crumple-hook template as the clip's first frame. The card is drawn here because video models garble words: the
// motion prompt only moves the card and never letters it (Leo's Higgsfield test, 21 Oct: crumple kept the card sharp
// for about 2.5 s; AdLauncher 3b235760 ships the same move). Our own plain card, as notifyStack.ts draws: a coloured
// circle with a letter, a label line and the message; no status bar, no platform logos or fonts. The layout and the
// SVG are pure and tested (crumpleCard.test.ts); the frame is drawn on this device at the bottom, as greenScreen.ts
// draws a note.

import { SANS_STACK, accentOnPaper, escapeXml, readableOn, wrapText, type FontSpec, type Measure } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { ICON_COLOR } from "@/lib/notifyStack";
import { NOTIFY_LABEL_MAX } from "@/lib/videoEdit";
import { loadVideo, seek } from "@/lib/videoMedia";

export const FRAME_W = 1080;
export const FRAME_H = 1920;
/** The card across a 1080-wide frame, its top a little under the top 15% that Reels and TikTok cover with their own header. */
export const CARD = { x: 70, w: 940, top: 300, r: 44, pad: 36 };
const ICON_R = 46;
const TEXT_X = CARD.x + CARD.pad + ICON_R * 2 + 28;
const TEXT_MAX = CARD.x + CARD.w - CARD.pad - TEXT_X;
/** The message's sizes, largest first: the first that holds it on two lines wins. */
const SIZES = [56, 52, 48, 44];
const LABEL: FontSpec = { family: "sans", weight: 600, size: 26 };
const LABEL_LINE = 40;
const FILL = "#F6F6F6";

export interface CardLine {
  text: string;
  /** The baseline. */
  y: number;
}

export interface CardLayout {
  /** The card's top and height; it always spans CARD.x to CARD.x + CARD.w. */
  y: number;
  h: number;
  /** The label line's baseline and words (upper case), when there is a label. */
  label: CardLine | null;
  lines: CardLine[];
  font: FontSpec;
  icon: { cx: number; cy: number; r: number };
}

/** The hook on the card: the largest size that holds it on two lines (three at the smallest), under the label line. */
export function layoutCard(hook: string, label: string, measure: Measure): CardLayout {
  const text = hook.trim().replace(/\s+/g, " ");
  let font: FontSpec = { family: "sans", weight: 600, size: SIZES[SIZES.length - 1] };
  let wrapped: string[] = [];
  for (const size of SIZES) {
    const f: FontSpec = { family: "sans", weight: 600, size };
    const w = wrapText(text, TEXT_MAX, f, measure);
    font = f;
    wrapped = w;
    if (w.length <= 2) break;
  }
  const lineH = Math.round(font.size * 1.22);
  const name = label.trim().slice(0, NOTIFY_LABEL_MAX).toUpperCase();
  const head = name ? LABEL_LINE : 0;
  const h = Math.max(ICON_R * 2 + CARD.pad * 2, CARD.pad * 2 + head + wrapped.length * lineH);
  const y = CARD.top;
  // the words sit in the middle of the card, the label over them
  const top = y + (h - head - wrapped.length * lineH) / 2;
  return {
    y,
    h,
    label: name ? { text: name, y: Math.round(top + LABEL.size) } : null,
    lines: wrapped.map((t, i) => ({ text: t, y: Math.round(top + head + i * lineH + font.size * 0.92) })),
    font,
    icon: { cx: CARD.x + CARD.pad + ICON_R, cy: y + h / 2, r: ICON_R },
  };
}

const textEl = (x: number, y: number, size: number, weight: number, fill: string, text: string, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${escapeXml(SANS_STACK)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(text)}</text>`;

/** The card alone on a clear 1080x1920 SVG, its circle in `color` (the brand's, or a plain blue when too pale to see) with `letter` on it. */
export function cardSvg(l: CardLayout, color: string, letter: string): string {
  const fill = accentOnPaper(/^#[0-9a-f]{6}$/i.test(color) ? color : ICON_COLOR, FILL);
  const right = CARD.x + CARD.w - CARD.pad;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">`,
    `<defs><filter id="s" x="-10%" y="-30%" width="120%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000000" flood-opacity="0.25"/></filter></defs>`,
    `<rect x="${CARD.x}" y="${l.y}" width="${CARD.w}" height="${l.h}" rx="${CARD.r}" fill="${FILL}" fill-opacity="0.97" filter="url(#s)"/>`,
    `<circle cx="${l.icon.cx}" cy="${l.icon.cy}" r="${l.icon.r}" fill="${fill}"/>`,
    textEl(l.icon.cx, Math.round(l.icon.cy + 17), 48, 700, readableOn(fill), [...letter.trim()][0]?.toUpperCase() ?? "", "middle"),
    ...(l.label ? [textEl(TEXT_X, l.label.y, LABEL.size, 600, "#6E6E73", l.label.text), textEl(right, l.label.y, LABEL.size, 600, "#6E6E73", "NOW", "end")] : []),
    ...l.lines.map((t) => textEl(TEXT_X, t.y, l.font.size, 600, "#111111", t.text)),
    "</svg>",
  ].join("");
}

// ---------- the frame (browser only) ----------

export const FRAME_FAILED = "Couldn't read a frame from your video. Try an MP4 or MOV.";

/**
 * The clip's first frame as a JPEG at 1080x1920: the video at `at` seconds cover-fitted to 9:16, the card over it.
 * The label is the brand's name (none: no label line), the circle its colour and first letter.
 */
export async function cardFrame(video: Blob, at: number, hook: string, brand: { name?: string; color?: string } | null): Promise<Blob> {
  const v = await loadVideo(video);
  try {
    await seek(v, Math.max(0, Math.min(v.duration - 0.05, at)));
    if (!v.videoWidth || !v.videoHeight) throw new Error(FRAME_FAILED);
    const c = document.createElement("canvas");
    c.width = FRAME_W;
    c.height = FRAME_H;
    const g = c.getContext("2d")!;
    const k = Math.max(FRAME_W / v.videoWidth, FRAME_H / v.videoHeight);
    g.drawImage(v, (FRAME_W - v.videoWidth * k) / 2, (FRAME_H - v.videoHeight * k) / 2, v.videoWidth * k, v.videoHeight * k);
    const name = brand?.name?.trim() ?? "";
    const img = new Image();
    img.src = svgDataUrl(cardSvg(layoutCard(hook, name, createCanvasMeasure()), brand?.color ?? ICON_COLOR, name || hook));
    await img.decode();
    g.drawImage(img, 0, 0, FRAME_W, FRAME_H);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(FRAME_FAILED))), "image/jpeg", 0.92));
  } finally {
    URL.revokeObjectURL(v.src);
  }
}
