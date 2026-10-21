// The note behind a green screen (docs/north-star/items/formats-green-screen.md): a plain note at 1080x1920, an
// off-white page with the title in bold under it a thin rule, then up to 6 items, each beside a round tick box. It is
// our own plain look on purpose: no phone status bar and no app chrome. Pure, like carouselLayout.ts: text is
// measured by the caller's function (carouselRender's canvas measure in the browser, a fake in tests), and the SVG
// becomes a PNG on the device (greenScreen.ts).

import { SANS_STACK, escapeXml, wrapText, type FontSpec, type Measure } from "@/lib/carouselLayout";

export const NOTE_W = 1080;
export const NOTE_H = 1920;
export const NOTE_ITEMS = 6;
const PAD_X = 96;
const TOP = 200;
const TITLE: FontSpec = { family: "sans", weight: 600, size: 76 };
const ITEM: FontSpec = { family: "sans", weight: 400, size: 50 };
const TITLE_LINE = 90;
const ITEM_LINE = 64;
const TITLE_LINES = 2;
const ITEM_LINES = 3;
const TITLE_GAP = 72;
const ITEM_GAP = 36;
const TICK_R = 22;
export const TEXT_X = PAD_X + TICK_R * 2 + 28;
const PAPER = "#FAF7F0";
const INK = "#1C1917";
const INK_BODY = "#292524";
const RULE = "#E7E5E4";
const TICK = "#A8A29E";

export interface NoteLine {
  x: number;
  /** The baseline. */
  y: number;
  text: string;
  font: FontSpec;
  /** The widest the line may be. */
  max: number;
}

export interface NoteLayout {
  title: NoteLine[];
  /** Under the title, when it has items under it. */
  rule: number | null;
  items: { tick: { cx: number; cy: number; r: number }; lines: NoteLine[] }[];
  /** Where the last line's box ends. */
  bottom: number;
}

/** At most `n` lines; the last one kept is cut to fit with "..." when more are left out. */
function clamp(lines: string[], n: number, max: number, font: FontSpec, measure: Measure): string[] {
  if (lines.length <= n) return lines;
  const kept = lines.slice(0, n);
  let last = kept[n - 1].replace(/[\s.,;:!?-]+$/, "");
  while (last && measure(`${last}...`, font) > max) last = last.slice(0, -1).trimEnd();
  kept[n - 1] = `${last}...`;
  return kept;
}

/** The note laid out: the title wrapped to 2 lines at most, then up to 6 items of up to 3 lines each. */
export function layoutNote(note: { title: string; items: string[] }, measure: Measure): NoteLayout {
  const titleMax = NOTE_W - PAD_X * 2;
  const itemMax = NOTE_W - TEXT_X - PAD_X;
  let y = TOP;
  const title = clamp(wrapText(note.title.trim(), titleMax, TITLE, measure), TITLE_LINES, titleMax, TITLE, measure).map((text) => {
    const line = { x: PAD_X, y: y + TITLE_LINE * 0.78, text, font: TITLE, max: titleMax };
    y += TITLE_LINE;
    return line;
  });
  const shown = note.items.map((i) => i.trim()).filter(Boolean).slice(0, NOTE_ITEMS);
  const rule = shown.length && title.length ? y + TITLE_GAP / 2 : null;
  if (title.length && shown.length) y += TITLE_GAP;
  const items = shown.map((text, i) => {
    if (i) y += ITEM_GAP;
    const top = y;
    const lines = clamp(wrapText(text, itemMax, ITEM, measure), ITEM_LINES, itemMax, ITEM, measure).map((t) => {
      const line = { x: TEXT_X, y: y + ITEM_LINE * 0.76, text: t, font: ITEM, max: itemMax };
      y += ITEM_LINE;
      return line;
    });
    return { tick: { cx: PAD_X + TICK_R, cy: top + ITEM_LINE / 2, r: TICK_R }, lines };
  });
  return { title, rule, items, bottom: y };
}

const text = (l: NoteLine, fill: string) =>
  `<text x="${l.x}" y="${l.y}" font-family="${escapeXml(SANS_STACK)}" font-size="${l.font.size}" font-weight="${l.font.weight}" fill="${fill}">${escapeXml(l.text)}</text>`;

/** The note as an SVG string at 1080x1920. */
export function noteSvg(l: NoteLayout): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${NOTE_W}" height="${NOTE_H}" viewBox="0 0 ${NOTE_W} ${NOTE_H}">`,
    `<rect x="0" y="0" width="${NOTE_W}" height="${NOTE_H}" fill="${PAPER}"/>`,
    ...l.title.map((t) => text(t, INK)),
    ...(l.rule === null ? [] : [`<rect x="${PAD_X}" y="${l.rule - 1}" width="${NOTE_W - PAD_X * 2}" height="3" fill="${RULE}"/>`]),
    ...l.items.flatMap((i) => [
      `<circle cx="${i.tick.cx}" cy="${i.tick.cy}" r="${i.tick.r}" fill="none" stroke="${TICK}" stroke-width="4"/>`,
      ...i.lines.map((t) => text(t, INK_BODY)),
    ]),
    "</svg>",
  ].join("");
}
