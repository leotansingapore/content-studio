// The Image page's layouts (docs/north-star/items/formats-static-ad.md), as data: layoutImage() places every shape
// and wrapped line of one designed picture at one of four sizes, and renderSvg (carouselLayout.ts) turns it into an
// SVG. Pure: text is measured by the caller (a canvas in the browser, a fake in tests). Every size keeps 96 px side
// margins, and a 9:16 story keeps 250 px clear at the top and bottom for the app's own buttons. formats-memes adds
// its five layouts here in wave 5.

import { normalizeHandle, sanitizeImage, type CarouselBrand } from "@/lib/carousel";
import {
  PAD_X,
  SLIDE_FONTS,
  accentOnPaper,
  ellipsize,
  paperColors,
  readableOn,
  wrapText,
  type FontSpec,
  type Measure,
  type SlideFont,
  type SlidePaper,
  type SvgNode,
} from "@/lib/carouselLayout";

export const IMAGE_SIZES = ["4x5", "1x1", "9x16", "wide"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export const SIZE_INFO: Record<ImageSize, { width: number; height: number; label: string }> = {
  "4x5": { width: 1080, height: 1350, label: "Feed 4:5" },
  "1x1": { width: 1080, height: 1080, label: "Square" },
  "9x16": { width: 1080, height: 1920, label: "Story 9:16" },
  wide: { width: 1200, height: 628, label: "Link 1.91:1" },
};
/** Kept clear at the top and bottom of a 9:16 story, where the app's own buttons sit. */
export const STORY_CLEAR = 250;

export const AD_LAYOUT_IDS = ["headline", "quote", "stat", "testimonial"] as const;
export type AdLayoutId = (typeof AD_LAYOUT_IDS)[number];
export const LAYOUT_LABELS: Record<AdLayoutId, string> = { headline: "Headline ad", quote: "Quote card", stat: "Stat card", testimonial: "Testimonial" };

export interface ImageField {
  key: string;
  label: string;
  max: number;
  unit: "words" | "chars";
  /** Drawn in grey on the preview while the field is empty; never in a download. */
  sample: string;
}

/**
 * Each layout's fields and limits. The testimonial's words are their own field (clientWords): a quote card's words are
 * the brand's own, and switching layouts must never turn them into a client's.
 */
export const IMAGE_FIELDS: Record<AdLayoutId, ImageField[]> = {
  headline: [
    { key: "headline", label: "Headline", max: 8, unit: "words", sample: "Your headline" },
    { key: "line", label: "Line", max: 16, unit: "words", sample: "One line on what they get" },
    { key: "button", label: "Button", max: 3, unit: "words", sample: "Message me" },
  ],
  quote: [
    { key: "quote", label: "Quote", max: 25, unit: "words", sample: "A line worth quoting, in your own words" },
    { key: "who", label: "Who said it", max: 40, unit: "chars", sample: "Your name" },
  ],
  stat: [
    { key: "number", label: "Number", max: 8, unit: "chars", sample: "Your number" },
    { key: "statLabel", label: "What it means", max: 12, unit: "words", sample: "What the number means" },
    { key: "statSource", label: "Source", max: 60, unit: "chars", sample: "Where it's from" },
  ],
  testimonial: [
    { key: "clientWords", label: "Client's words", max: 30, unit: "words", sample: "Your client's own words" },
    { key: "client", label: "Client's first name", max: 30, unit: "chars", sample: "First name and initial" },
  ],
};

export const countOf = (text: string, unit: ImageField["unit"]) =>
  unit === "words" ? text.trim().split(/\s+/).filter(Boolean).length : Array.from(text.trim()).length;

/** Why this design can't be downloaded or posted yet, or null. A stat card needs your own number and its source. */
export function imageBlock(layout: AdLayoutId, words: Record<string, string>): string | null {
  const has = (k: string) => !!words[k]?.trim();
  if (layout === "stat") return !has("number") || !has("statSource") ? "Type your own number and where it's from." : has("statLabel") ? null : "Add what the number means first.";
  if (layout === "quote") return has("quote") ? null : "Add the quote first.";
  if (layout === "testimonial") return has("clientWords") ? null : "Add your client's own words first.";
  return has("headline") ? null : "Add a headline first.";
}

/** The words a file is named after: the layout's main field. */
export function mainWords(layout: AdLayoutId, words: Record<string, string>): string {
  return words[{ headline: "headline", quote: "quote", stat: "statLabel", testimonial: "clientWords" }[layout]] ?? "";
}

export interface ImageInput {
  layout: AdLayoutId;
  words: Record<string, string>;
  brand: CarouselBrand;
  font?: SlideFont;
  paper?: SlidePaper;
  align?: "left" | "center";
  /** The headline ad's picture, as a data URL (a blob: link draws on screen only, never in a PNG). */
  picture?: string;
  /** The preview draws an empty field's sample words in grey; a download leaves it out. */
  samples?: boolean;
}

export interface DrawnImage {
  width: number;
  height: number;
  background: string;
  nodes: SvgNode[];
  /** True when the words didn't fit and were cut short with "…". */
  overflow: boolean;
}

// ---- fitting a stack of text blocks into a box -----------------------------------------------

interface Block {
  text: string;
  family: FontSpec["family"];
  weight: FontSpec["weight"];
  /** Biggest first; every block steps down together until the stack fits. */
  sizes: number[];
  line: number;
  fill: string;
  opacity?: number;
  gap: number;
  /** One line, cut with "…" when it can't fit (a number, a button). */
  single?: true;
  /** Drawn on a filled box of this colour. */
  button?: string;
}

interface Fitted {
  b: Block;
  font: FontSpec;
  lines: string[];
  lineHeight: number;
  height: number;
  /** The single line's width, for a button's box. */
  width: number;
  cut: boolean;
}

const BUTTON_PAD = { x: 0.9, y: 0.55 };

function fitBlock(b: Block, size: number, width: number, measure: Measure): Fitted {
  const font: FontSpec = { family: b.family, weight: b.weight, size };
  const lineHeight = Math.round(size * b.line);
  if (b.single) {
    const room = width - (b.button ? 2 * Math.round(size * BUTTON_PAD.x) : 0);
    const cut = measure(b.text, font) > room;
    const text = cut ? ellipsize(b.text, room, font, measure) : b.text;
    const height = b.button ? size + 2 * Math.round(size * BUTTON_PAD.y) : lineHeight;
    return { b, font, lines: [text], lineHeight, height, width: measure(text, font), cut };
  }
  const lines = wrapText(b.text, width, font, measure);
  return { b, font, lines, lineHeight, height: lines.length * lineHeight, width, cut: false };
}

const stackHeight = (f: Fitted[]) => f.reduce((h, x, i) => h + x.height + (i < f.length - 1 ? x.b.gap : 0), 0);

function fitStack(blocks: Block[], width: number, room: number, measure: Measure): { fitted: Fitted[]; overflow: boolean } {
  const steps = Math.max(1, ...blocks.map((b) => b.sizes.length));
  const at = (t: number) => blocks.map((b) => fitBlock(b, b.sizes[Math.min(t, b.sizes.length - 1)], width, measure));
  for (let t = 0; t < steps; t++) {
    const f = at(t);
    // a one-line block cut short only passes at the smallest size
    if (stackHeight(f) <= room && (t === steps - 1 || !f.some((x) => x.cut))) return { fitted: f, overflow: f.some((x) => x.cut) };
  }
  // the smallest sizes still run over: take lines off the longest block, ending it in "…", until the stack fits
  const f = at(steps - 1);
  while (stackHeight(f) > room) {
    const long = f.filter((x) => !x.b.single && x.lines.length > 1).sort((a, b) => b.height - a.height)[0];
    if (!long) break;
    long.lines = long.lines.slice(0, -1);
    long.lines[long.lines.length - 1] = ellipsize(long.lines[long.lines.length - 1], width, long.font, measure);
    long.height = long.lines.length * long.lineHeight;
  }
  return { fitted: f, overflow: true };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws a fitted stack in the box, `valign` 0 at the top to 1 at the bottom of the room it leaves. */
function placeStack(nodes: SvgNode[], f: Fitted[], box: Box, center: boolean, valign: number): void {
  let y = box.y + Math.round(Math.max(0, box.h - stackHeight(f)) * valign);
  const x = center ? box.x + box.w / 2 : box.x;
  for (const it of f) {
    const size = it.font.size;
    const faded = it.b.opacity !== undefined ? { opacity: it.b.opacity } : {};
    const anchor = center ? { anchor: "middle" as const } : {};
    if (it.b.button) {
      const padX = Math.round(size * BUTTON_PAD.x);
      const w = Math.round(it.width) + 2 * padX;
      const left = center ? Math.round(box.x + (box.w - w) / 2) : box.x;
      nodes.push({ type: "rect", x: left, y, width: w, height: it.height, fill: it.b.button, ...faded });
      nodes.push({ type: "text", x: center ? x : left + padX, y: y + Math.round((it.height - size) / 2 + size * 0.8), text: it.lines[0], font: it.font, fill: it.b.fill, ...faded, ...anchor });
    } else {
      const baseline = Math.round((it.lineHeight - size) / 2 + size * 0.8);
      it.lines.forEach((line, i) => nodes.push({ type: "text", x, y: y + i * it.lineHeight + baseline, text: line, font: it.font, fill: it.b.fill, ...faded, ...anchor }));
    }
    y += it.height + it.b.gap;
  }
}

// ---- the layouts -----------------------------------------------------------------------------

const TITLE_SIZES = [96, 88, 80, 72, 64, 58, 52, 46, 42, 38, 34];
const BODY_SIZES = [44, 40, 37, 34, 31, 28, 26, 24, 22];
const QUOTE_SIZES = [84, 76, 68, 62, 56, 50, 46, 42, 38, 34, 30, 27];
/** An opening quote mark: its ink sits from the top of its 0.8-high line box down, so the box can be that tight. */
const MARK = "\u201C";

/**
 * One designed picture: a headline ad (picture, headline, line, button), a quote card, a stat card (your number on a
 * brand-colour block, never drawn without its source) or a client testimonial, at 4:5, 1:1, 9:16 or 1.91:1.
 */
export function layoutImage(input: ImageInput, size: ImageSize, measure: Measure): DrawnImage {
  const { width: W, height: H } = SIZE_INFO[size];
  const wide = size === "wide";
  const padY = size === "9x16" ? STORY_CLEAR : wide ? 56 : PAD_X;
  const brand = input.brand;
  const pc = paperColors(input.paper, brand.color);
  const accent = accentOnPaper(brand.color, pc.bg);
  const fonts = SLIDE_FONTS[input.font ?? "classic"] ?? SLIDE_FONTS.classic;
  const center = input.align === "center";
  const nodes: SvgNode[] = [{ type: "rect", x: 0, y: 0, width: W, height: H, fill: pc.bg }];
  let overflow = false;

  /** A field's words, else its grey sample on the preview, else nothing. */
  const field = (key: string): { text: string; sample: boolean } | null => {
    const typed = (input.words[key] ?? "").replace(/[ \t]+/g, " ").trim();
    if (typed) return { text: typed, sample: false };
    const def = IMAGE_FIELDS[input.layout].find((f) => f.key === key);
    return input.samples && def ? { text: def.sample, sample: true } : null;
  };
  const block = (key: string, o: Omit<Block, "text">): Block[] => {
    const v = field(key);
    return v ? [{ ...o, text: v.text, ...(v.sample ? { fill: o.button ? o.fill : pc.muted, opacity: o.button ? 0.5 : 0.75 } : {}) }] : [];
  };
  /** Fits and draws blocks in a box; returns the height they took. */
  const stack = (blocks: Block[], box: Box, valign: number, centered = center): number => {
    const { fitted, overflow: over } = fitStack(blocks, box.w, box.h, measure);
    overflow ||= over;
    placeStack(nodes, fitted, box, centered, valign);
    return stackHeight(fitted);
  };

  const footH = wide ? 64 : 88;
  /** The brand row at the foot of a box: headshot, name and handle on the left, the logo whole on the right. Returns its top. */
  const footer = (box: Box, o: { headshot: boolean; name: string }): number => {
    const top = box.y + box.h - footH;
    const photo = o.headshot ? sanitizeImage(brand.photo) : undefined;
    const logo = sanitizeImage(brand.logo);
    const logoW = logo ? Math.min(240, Math.round(box.w * 0.3)) : 0;
    if (photo) nodes.push({ type: "image", x: box.x, y: top, width: footH, height: footH, href: photo, shape: "circle" });
    if (logo) nodes.push({ type: "image", x: box.x + box.w - logoW, y: top + Math.round(footH * 0.1), width: logoW, height: Math.round(footH * 0.8), href: logo, shape: "square", fit: "contain" });
    const textX = photo ? box.x + footH + 24 : box.x;
    const room = box.x + box.w - textX - (logo ? logoW + 24 : 0);
    const name = o.name.replace(/\s+/g, " ").trim();
    const handle = normalizeHandle(brand.handle);
    const nameFont: FontSpec = { family: "sans", weight: 600, size: wide ? 26 : 34 };
    const handleFont: FontSpec = { family: "sans", weight: 400, size: wide ? 22 : 30 };
    const fit = (t: string, f: FontSpec) => (measure(t, f) <= room ? t : ellipsize(t, room, f, measure));
    const mid = top + footH / 2;
    if (name) nodes.push({ type: "text", x: textX, y: Math.round(handle ? mid - footH * 0.06 : mid + nameFont.size * 0.35), text: fit(name, nameFont), font: nameFont, fill: pc.ink });
    if (handle) nodes.push({ type: "text", x: textX, y: Math.round(name ? mid + footH * 0.38 : mid + handleFont.size * 0.35), text: fit(handle, handleFont), font: handleFont, fill: pc.muted });
    return top;
  };
  /** The words' column beside or under a full-bleed part (the picture, the number's block). */
  const column = (part: Box): Box =>
    wide ? { x: part.w + 72, y: padY, w: W - part.w - 72 - PAD_X, h: H - 2 * padY } : { x: PAD_X, y: part.h + 56, w: W - 2 * PAD_X, h: H - padY - part.h - 56 };
  const above = (col: Box, top: number): Box => ({ ...col, h: top - 32 - col.y });

  if (input.layout === "headline") {
    // the picture full bleed: the top of a feed post or story, the left of a link ad; the brand colour stands in
    const pic: Box = wide ? { x: 0, y: 0, w: Math.round(W * 0.42), h: H } : { x: 0, y: 0, w: W, h: Math.round(H * (size === "1x1" ? 0.42 : 0.5)) };
    const href = input.picture?.trim();
    if (href) nodes.push({ type: "image", x: 0, y: 0, width: pic.w, height: pic.h, href, shape: "square" });
    else nodes.push({ type: "rect", x: 0, y: 0, width: pic.w, height: pic.h, fill: brand.color });
    const col = column(pic);
    const top = footer(col, { headshot: false, name: brand.name });
    stack(
      [
        ...block("headline", { family: fonts.title, weight: 600, sizes: TITLE_SIZES, line: 1.1, fill: pc.ink, gap: 24 }),
        ...block("line", { family: fonts.body, weight: 400, sizes: BODY_SIZES, line: 1.35, fill: pc.body, gap: 32 }),
        ...block("button", { family: "sans", weight: 600, sizes: [38, 36, 34, 32, 30, 28, 26, 24], line: 1, fill: readableOn(accent), gap: 0, single: true, button: accent }),
      ],
      above(col, top),
      0,
    );
  } else if (input.layout === "stat") {
    // your number, huge on a brand-colour block, drawn only once its source is typed (MAS: no invented numbers)
    const part: Box = wide ? { x: 0, y: 0, w: Math.round(W * 0.42), h: H } : { x: 0, y: 0, w: W, h: Math.round(H * 0.48) };
    nodes.push({ type: "rect", x: 0, y: 0, width: part.w, height: part.h, fill: brand.color });
    const sourced = !!input.words.number?.trim() && !!input.words.statSource?.trim();
    const number = sourced ? input.words.number.trim() : input.samples ? IMAGE_FIELDS.stat[0].sample : "";
    if (number) {
      const inner: Box = wide ? { x: PAD_X, y: padY, w: part.w - PAD_X - 64, h: H - 2 * padY } : { x: PAD_X, y: padY, w: W - 2 * PAD_X, h: part.h - padY - 48 };
      const sizes = sourced ? [300, 260, 220, 190, 160, 136, 116, 100, 86] : [96, 80, 64, 52];
      stack([{ text: number, family: "sans", weight: 600, sizes, line: 1, fill: readableOn(brand.color), gap: 0, single: true, ...(sourced ? {} : { opacity: 0.6 }) }], inner, 0.5, true);
    }
    const col = column(part);
    const top = footer(col, { headshot: true, name: brand.name });
    // the source small at the foot, just above the brand row; what the number means fills the room above it
    const source = field("statSource");
    const room = above(col, top);
    const cited = source
      ? stack([{ text: source.sample ? source.text : `Source: ${source.text}`, family: "sans", weight: 400, sizes: [28, 26, 24, 22, 20], line: 1.3, fill: pc.muted, gap: 0, ...(source.sample ? { opacity: 0.75 } : {}) }], { ...room, y: room.y + Math.round(room.h / 2), h: room.h - Math.round(room.h / 2) }, 1)
      : 0;
    stack(block("statLabel", { family: fonts.title, weight: 600, sizes: [80, 72, 64, 58, 52, 46, 42, 38, 34, 30, 27, 24], line: 1.15, fill: pc.ink, gap: 0 }), { ...room, h: room.h - cited - (cited ? 24 : 0) }, 0);
  } else {
    // a quote card or a testimonial: big quote marks, the words, then who said them; the brand row at the foot
    const testimonial = input.layout === "testimonial";
    const box: Box = { x: PAD_X, y: padY, w: W - 2 * PAD_X, h: H - 2 * padY };
    const top = footer(box, { headshot: true, name: testimonial ? brand.name : input.words.who?.trim() || brand.name });
    stack(
      [
        { text: MARK, family: "serif", weight: 600, sizes: wide ? [150, 120, 96] : [220, 190, 160, 130, 110], line: 0.8, fill: accent, gap: wide ? 8 : 16, single: true },
        ...block(testimonial ? "clientWords" : "quote", { family: fonts.title, weight: 400, sizes: QUOTE_SIZES, line: 1.25, fill: pc.ink, gap: 32 }),
        ...(testimonial ? block("client", { family: "sans", weight: 600, sizes: [40, 36, 32, 28, 26, 24], line: 1.2, fill: accent, gap: 0 }) : []),
      ],
      above(box, top),
      0.45,
    );
  }

  return { width: W, height: H, background: pc.bg, nodes, overflow };
}
