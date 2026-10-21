// Slide drawing for the carousel maker, as data. layoutSlide() places every
// shape and wrapped line on a 1080x1350 (4:5) slide, or 1:1 or 9:16 with a size,
// in one of the designs in carouselDesigns.ts, and renderSvg() turns that into
// an SVG string. Clean at 4:5 (no design, no size) draws exactly as before. Text is measured by a function the caller passes in (a
// canvas 2D context in the browser, a fake in tests), so this file is pure.
//
// Fonts: an SVG drawn into a canvas can't load web fonts, so slides use system
// serif and sans stacks, which render the same in the SVG and in measureText.

import { normalizeHandle, sanitizeImage, slideRole, splitSentences, type CarouselBrand, type CarouselSize, type SlideRole } from "@/lib/carousel";
import { DESIGNS, SLIDE_SIZES } from "@/lib/carouselDesigns";
import type { CarouselDesign } from "@/lib/links";

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
export const SERIF_STACK = "Georgia, 'Times New Roman', Times, serif";
export const SANS_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const PAPER = "#FBFAF7";
export const INK = "#1C1917";
export const INK_BODY = "#44403C";
export const INK_MUTED = "#78716C";
export const RULE = "#E7E5E4";

export const PAD_X = 96;
export const CONTENT_WIDTH = SLIDE_WIDTH - PAD_X * 2;
export const BAR_HEIGHT = 24;
export const CONTENT_TOP = 168;
export const FOOTER_RULE_Y = 1176;
const ACCENT = { width: 96, height: 10, gap: 52 };
const TITLE_BODY_GAP = 40;
/** Room kept under the cover text for "Swipe →". */
const SWIPE_SPACE = 96;

export interface FontSpec {
  family: "serif" | "sans";
  weight: 400 | 600;
  size: number;
  /** Set only while measuring Chinese or Tamil text, so fontCss names their fonts; layouts never store it. */
  scripts?: true;
}

export type Measure = (text: string, font: FontSpec) => number;

/** Chinese and Tamil fonts on Mac, Android and Windows (the names videoMedia.ts gives subtitles). */
const SCRIPT_FONTS = "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Tamil Sangam MN', 'Noto Sans Tamil', Latha";
// Han, Tamil, CJK punctuation and full-width forms
const OTHER_SCRIPT = /[\p{Script=Han}\p{Script=Tamil}\u3000-\u303F\uFF00-\uFFEF]/u;

/** The family's stack; text in Chinese or Tamil gets their fonts before the generic family, and Latin text keeps today's stack exactly. */
export function stackFor(family: FontSpec["family"], scripts = false): string {
  const stack = family === "serif" ? SERIF_STACK : SANS_STACK;
  return scripts ? stack.replace(/, ([a-z-]+)$/, `, ${SCRIPT_FONTS}, $1`) : stack;
}

export function fontCss(font: FontSpec): string {
  return `${font.weight} ${font.size}px ${stackFor(font.family, font.scripts)}`;
}

/** The caller's measure, with Chinese or Tamil text measured in their fonts (Latin text gets the very font it was given). */
const scriptAware = (measure: Measure): Measure => (text, font) => measure(text, OTHER_SCRIPT.test(text) ? { ...font, scripts: true } : font);

// ---- Colour -------------------------------------------------------------------

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(String(hex).replace(/^#/, "").slice(0, 6), 16) || 0;
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or ink, whichever reads better on the background. */
export function readableOn(background: string): string {
  return contrastRatio("#FFFFFF", background) >= contrastRatio(INK, background) ? "#FFFFFF" : INK;
}

/** The brand colour for accents on paper, unless it's too pale to see. */
export function accentOnPaper(color: string, paper = PAPER): string {
  return contrastRatio(color, paper) >= 3 ? color : readableOn(paper);
}

// ---- Looks: font pairing and the point slides' background ---------------------

export type SlideFont = "classic" | "modern" | "serif";
export type SlidePaper = "light" | "dark" | "tint";
export const SLIDE_FONTS: Record<SlideFont, { label: string; title: FontSpec["family"]; body: FontSpec["family"] }> = {
  classic: { label: "Classic", title: "serif", body: "sans" },
  modern: { label: "Modern", title: "sans", body: "sans" },
  serif: { label: "Editorial", title: "serif", body: "serif" },
};

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Colours of a point slide for each background: light paper, dark, or a light tint of the brand colour. */
export function paperColors(paper: SlidePaper | undefined, brandColor: string) {
  if (paper === "dark") return { bg: "#18181B", ink: "#FAFAFA", body: "#D4D4D8", muted: "#A1A1AA", rule: "#3F3F46" };
  if (paper === "tint") {
    const bg = mix(PAPER, brandColor, 0.1);
    return { bg, ink: INK, body: INK_BODY, muted: contrastRatio(INK_MUTED, bg) >= 4.5 ? INK_MUTED : INK_BODY, rule: mix(bg, INK, 0.12) };
  }
  return { bg: PAPER, ink: INK, body: INK_BODY, muted: INK_MUTED, rule: RULE };
}

// ---- Text ---------------------------------------------------------------------

function breakWord(word: string, maxWidth: number, font: FontSpec, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const ch of Array.from(word)) {
    if (current && measure(current + ch, font) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

// Chinese (edit-translate): no spaces to break at, so a line may break between any two characters, but never before
// its closing punctuation (U+FF0C, U+3002, U+FF01, U+FF1F, U+3001, U+FF1A, U+FF1B, U+300D, U+FF09) nor after an
// opening bracket (U+300C, U+FF08).
const CLOSE = "\uFF0C\u3002\uFF01\uFF1F\u3001\uFF1A\uFF1B\u300D\uFF09";
const OPEN = "\u300C\uFF08";
const HAN = /\p{Script=Han}/u;
const SPACE_BEFORE_CLOSE = new RegExp(`\\s+(?=[${CLOSE}])`, "g");
// one Han character or a run of anything else (Latin words keep together), brackets and closing punctuation held on
const PIECE = new RegExp(`[${OPEN}]*(?:\\p{Script=Han}|[^\\p{Script=Han}${OPEN}${CLOSE}]+)[${CLOSE}]*|[${OPEN}]+[${CLOSE}]*|[${CLOSE}]+`, "gu");

/**
 * Greedy word wrap. Line breaks in the text start new lines; blank lines collapse. Chinese breaks between characters,
 * never starting a line with its closing punctuation; Latin words, in Chinese text too, break at spaces.
 */
export function wrapText(text: string, maxWidth: number, font: FontSpec, measureAny: Measure): string[] {
  const measure = scriptAware(measureAny);
  const lines: string[] = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const han = HAN.test(paragraph);
    const words = (han ? paragraph.replace(SPACE_BEFORE_CLOSE, "") : paragraph).trim().split(/\s+/).filter(Boolean);
    let line = "";
    const place = (word: string, glue: string) => {
      const candidate = line ? `${line}${glue}${word}` : word;
      if (measure(candidate, font) <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      if (measure(word, font) <= maxWidth) {
        line = word;
        return;
      }
      const pieces = breakWord(word, maxWidth, font, measure);
      lines.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? "";
    };
    for (const word of words) {
      if (han && HAN.test(word)) word.match(PIECE)!.forEach((piece, i) => place(piece, i ? "" : " "));
      else place(word, " ");
    }
    if (line) lines.push(line);
  }
  return lines;
}

// what a shortened line drops before its "…"
const TRAILING = new RegExp(`[\\s.,;:!?…${CLOSE}-]+$`);

export function ellipsize(line: string, maxWidth: number, font: FontSpec, measureAny: Measure): string {
  const measure = scriptAware(measureAny);
  let chars = Array.from(line.replace(TRAILING, ""));
  while (chars.length && measure(`${chars.join("")}…`, font) > maxWidth) chars = chars.slice(0, -1);
  return `${chars.join("").trimEnd()}…`;
}

function clampLines(lines: string[], maxLines: number, font: FontSpec, measure: Measure, width = CONTENT_WIDTH): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(0, maxLines));
  if (kept.length) kept[kept.length - 1] = ellipsize(kept[kept.length - 1], width, font, measure);
  return kept;
}

/** A checklist slide's ticked lines: one per line of its text, or one per sentence when it is one paragraph. */
export function checklistItems(body: string): string[] {
  const lines = String(body ?? "")
    .split("\n")
    .map((l) => l.replace(/^(?:[•●▪◦‣*+-]|[✓✔☑✅]\uFE0F?)\s*/u, "").trim())
    .filter(Boolean);
  if (lines.length !== 1) return lines;
  const sentences = splitSentences(lines[0]);
  return sentences.length > 1 ? sentences : lines;
}

// ---- Layout -------------------------------------------------------------------

export type SvgNode =
  | { type: "rect"; x: number; y: number; width: number; height: number; fill: string; opacity?: number; rx?: number }
  /** A fade from clear at its top to `color` at `opacity` at its bottom: the dark fade under a photo cover's hook. */
  | { type: "fade"; x: number; y: number; width: number; height: number; color: string; opacity: number }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      font: FontSpec;
      fill: string;
      opacity?: number;
      anchor?: "end" | "middle";
      /** An outline drawn under the fill (paint-order stroke): a meme's white words on any picture. */
      stroke?: string;
      strokeWidth?: number;
    }
  /**
   * A picture: the brand kit headshot (circle), a slide image (rounded box) or a full-bleed picture (square), each
   * cropped to fill; `fit: "contain"` keeps it whole against the right edge of its box instead, unclipped (a logo).
   */
  | { type: "image"; x: number; y: number; width: number; height: number; href: string; shape: "circle" | "rounded" | "square"; fit?: "contain" };

export interface SlideLayout {
  width: number;
  height: number;
  role: SlideRole;
  background: string;
  nodes: SvgNode[];
  /** True when the text didn't fit and was cut short with "…". */
  overflow: boolean;
}

interface TextBlock {
  font: FontSpec;
  lines: string[];
  lineHeight: number;
  /** A checklist's lines that start an item (each gets a ticked box), and how far its text sits right of the box. */
  marks?: number[];
  indent?: number;
}

const heightOf = (b: TextBlock) => b.lines.length * b.lineHeight;

const STYLES: Record<SlideRole, { title: number[]; titleLine: number; body: number[]; bodyLine: number }> = {
  cover: { title: [112, 100, 90, 80, 72, 64], titleLine: 1.1, body: [44, 40, 36, 32], bodyLine: 1.4 },
  point: { title: [80, 72, 64, 58, 52, 46], titleLine: 1.14, body: [46, 42, 38, 34, 31, 28], bodyLine: 1.42 },
  cta: { title: [96, 88, 80, 72, 64, 56], titleLine: 1.12, body: [48, 44, 40, 36, 32, 28], bodyLine: 1.4 },
};
/** A slide with no title sets its body in the serif, larger. */
const BODY_ONLY = { sizes: [64, 58, 52, 48, 44, 40, 36, 32], line: 1.3 };
/** Body sizes tried before the title is allowed to shrink. */
const COMFORTABLE_BODY_SIZES = 3;

export interface SlideInput {
  title: string;
  body: string;
  index: number;
  total: number;
  brand: CarouselBrand;
  /** A picture for the slide (data URL), shown above the text. */
  image?: string;
  align?: "left" | "center";
  /** Text size, 0.8 to 1.25 times the usual. */
  scale?: number;
  font?: SlideFont;
  paper?: SlidePaper;
  /** carouselDesigns.ts; absent is clean, today's look. */
  design?: CarouselDesign;
  /** 4x5 (absent, today's 1080x1350), 1x1 or 9x16. */
  size?: CarouselSize;
  /** The brand kit person who signs it (CarouselBrand.people id): their photo, name and handle in the name row. */
  signer?: string;
}

/** Height of a slide picture at 4:5 (SLIDE_SIZES has each size's) and the gap under it. */
export const SLIDE_IMAGE = { height: 470, gap: 44 };
/** The hook on a Bold cover: very large first, down to today's sizes for a long one. */
const BOLD_COVER_TITLE = [152, 136, 120, 108, 96, 86, 76, 68];
/** What sits above a point slide's title in place of the accent bar: Numbered's "01", Quote's mark. */
const NUMBER = { height: 112, gap: 28, size: 128 };
const QUOTE_MARK = { height: 96, gap: 16, size: 240 };
/** A post card's inset from the slide edge, its corner, and the gap from its top to the text with and without a name row. */
const CARD = { inset: PAD_X / 2, rx: 40, above: 96, header: 184, bare: 80 };

export function layoutSlide(input: SlideInput, measure: Measure): SlideLayout {
  const role = slideRole(input.index, input.total);
  const design = DESIGNS[input.design as CarouselDesign] ?? DESIGNS.clean;
  const frame = SLIDE_SIZES[input.size as CarouselSize] ?? SLIDE_SIZES["4x5"];
  const height = frame.height;
  const contentBottom = frame.footer - 64;
  const point = role === "point" ? design.point : "plain";
  const card = point === "card";
  const onBrand = role !== "point";
  // the kit's second colour (brand-kit) takes the CTA slide and the accent; the main colour keeps everything else
  const second = input.brand.palette?.[0]?.hex;
  const brandColor = role === "cta" && second ? second : input.brand.color;
  const pc = paperColors(input.paper, brandColor);
  const fonts = SLIDE_FONTS[input.font ?? "classic"] ?? SLIDE_FONTS.classic;
  // a Photo cover is the cover's own picture full bleed; with no picture it is today's cover
  const coverPhoto = role === "cover" && design.cover === "photo" ? sanitizeImage(input.image) : undefined;
  // a post card sits on the brand colour; its text is the paper's, inside the card
  const background = onBrand || card ? brandColor : pc.bg;
  const ink = coverPhoto ? "#FFFFFF" : onBrand ? readableOn(brandColor) : pc.ink;
  const nodes: SvgNode[] = [
    { type: "rect", x: 0, y: 0, width: SLIDE_WIDTH, height, fill: background },
  ];
  if (!onBrand && !card) nodes.push({ type: "rect", x: 0, y: 0, width: SLIDE_WIDTH, height: BAR_HEIGHT, fill: brandColor });
  if (coverPhoto) {
    const fadeTop = Math.round(height * 0.3);
    nodes.push(
      { type: "image", x: 0, y: 0, width: SLIDE_WIDTH, height, href: coverPhoto, shape: "square" },
      { type: "fade", x: 0, y: fadeTop, width: SLIDE_WIDTH, height: height - fadeTop, color: "#000000", opacity: 0.85 },
    );
  }
  if (point === "notebook") {
    nodes.push({ type: "rect", x: PAD_X - 40, y: BAR_HEIGHT, width: 3, height: height - BAR_HEIGHT, fill: accentOnPaper(brandColor, pc.bg) });
  }
  const cardTop = frame.top - CARD.above;
  const cardBottom = frame.footer + 40;
  if (card) nodes.push({ type: "rect", x: CARD.inset, y: cardTop, width: SLIDE_WIDTH - CARD.inset * 2, height: cardBottom - cardTop, fill: pc.bg, rx: CARD.rx });

  const scale = Math.min(1.25, Math.max(0.8, input.scale ?? 1));
  const sized = (list: number[]) => list.map((n) => Math.round(n * scale));
  const base = role === "cover" && design.cover === "bold" ? { ...STYLES.cover, title: BOLD_COVER_TITLE } : STYLES[role];
  const style = { ...base, title: sized(base.title), body: sized(base.body) };
  // a checklist's ticked lines read down the left edge
  const center = input.align === "center" && point !== "checklist";
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const signer = input.signer ? input.brand.people?.find((p) => p.id === input.signer) : undefined;
  const photo = sanitizeImage(signer ? signer.photo : input.brand.photo);
  const name = String((signer ?? input.brand).name ?? "").replace(/\s+/g, " ").trim();
  const handle = normalizeHandle(signer?.handle || input.brand.handle);
  const contentTop = card ? cardTop + (photo || name || handle ? CARD.header : CARD.bare) : frame.top;
  const bottom = role === "cover" ? contentBottom - SWIPE_SPACE : card ? cardBottom - 64 : contentBottom;
  // a slide picture sits above the text, which fits into what is left; a Bold cover is the brand colour alone
  const pic = coverPhoto || (role === "cover" && design.cover === "bold") ? undefined : sanitizeImage(input.image);
  const top = pic ? contentTop + frame.image + SLIDE_IMAGE.gap : contentTop;
  if (pic) nodes.push({ type: "image", x: PAD_X, y: contentTop, width: CONTENT_WIDTH, height: frame.image, href: pic, shape: "rounded" });
  const lead = point === "numbered" ? NUMBER : point === "quote" ? QUOTE_MARK : ACCENT;
  const room = bottom - top - lead.height - lead.gap;

  const options = (
    text: string,
    sizes: number[],
    family: FontSpec["family"],
    weight: FontSpec["weight"],
    line: number,
    ticked = false,
  ): TextBlock[] => {
    if (!text) return [{ font: { family, weight, size: sizes[0] }, lines: [], lineHeight: 0 }];
    return sizes.map((size) => {
      const font: FontSpec = { family, weight, size };
      const lineHeight = Math.round(size * line);
      if (!ticked) return { font, lines: wrapText(text, CONTENT_WIDTH, font, measure), lineHeight };
      const indent = tickBox(size) + 24;
      const lines: string[] = [];
      const marks: number[] = [];
      for (const item of checklistItems(text)) {
        marks.push(lines.length);
        lines.push(...wrapText(item, CONTENT_WIDTH - indent, font, measure));
      }
      return { font, lines, lineHeight, marks, indent };
    });
  };
  const ticked = point === "checklist";
  const titles = options(title, style.title, fonts.title, 600, style.titleLine);
  const bodies = title
    ? options(body, style.body, fonts.body, 400, style.bodyLine, ticked)
    : options(body, sized(BODY_ONLY.sizes), fonts.title, 400, BODY_ONLY.line, ticked);
  const gap = title && body ? TITLE_BODY_GAP : 0;

  const pick = (bodyCount: number): [TextBlock, TextBlock] | null => {
    for (const t of titles) {
      for (const b of bodies.slice(0, bodyCount)) {
        if (heightOf(t) + gap + heightOf(b) <= room) return [t, b];
      }
    }
    return null;
  };

  let overflow = false;
  let chosen = pick(COMFORTABLE_BODY_SIZES) ?? pick(bodies.length);
  if (!chosen) {
    overflow = true;
    const t = titles[titles.length - 1];
    const b = bodies[bodies.length - 1];
    const titleRoom = body ? Math.floor(room / 2) : room;
    const tFit = { ...t, lines: t.lineHeight ? clampLines(t.lines, Math.floor(titleRoom / t.lineHeight), t.font, measure) : [] };
    const bodyRoom = room - heightOf(tFit) - gap;
    const bFit = { ...b, lines: b.lineHeight ? clampLines(b.lines, Math.floor(bodyRoom / b.lineHeight), b.font, measure, CONTENT_WIDTH - (b.indent ?? 0)) : [] };
    chosen = [tFit, bFit];
  }
  const [t, b] = chosen;
  const usedGap = t.lines.length && b.lines.length ? gap : 0;

  const blockHeight = lead.height + lead.gap + heightOf(t) + usedGap + heightOf(b);
  const slack = Math.max(0, bottom - top - blockHeight);
  // a photo cover's hook sits low, on the dark end of the fade
  let y = top + Math.round(slack * (coverPhoto ? 1 : role === "point" && !pic ? 0.4 : pic ? 0.25 : 0.5));
  const behindText = nodes.length;
  const accent = onBrand ? ink : accentOnPaper(second ?? brandColor, pc.bg);
  const leadX = center ? SLIDE_WIDTH / 2 : PAD_X;
  const leadAnchor = center ? { anchor: "middle" as const } : {};
  if (point === "numbered") {
    const font: FontSpec = { family: "sans", weight: 600, size: NUMBER.size };
    nodes.push({ type: "text", x: leadX, y: y + NUMBER.height - 6, text: String(input.index).padStart(2, "0"), font, fill: accent, ...leadAnchor });
  } else if (point === "quote") {
    const font: FontSpec = { family: "serif", weight: 600, size: QUOTE_MARK.size };
    nodes.push({ type: "text", x: leadX, y: y + Math.round(QUOTE_MARK.size * 0.72), text: "\u201C", font, fill: accent, ...leadAnchor });
  } else {
    nodes.push({
      type: "rect",
      x: center ? (SLIDE_WIDTH - ACCENT.width) / 2 : PAD_X,
      y,
      width: ACCENT.width,
      height: ACCENT.height,
      fill: accent,
    });
  }
  y += lead.height + lead.gap;

  const place = (block: TextBlock, fill: string, opacity?: number) => {
    const baseline = Math.round((block.lineHeight - block.font.size) / 2 + block.font.size * 0.8);
    const box = tickBox(block.font.size);
    block.lines.forEach((line, i) => {
      const lineY = y + i * block.lineHeight + baseline;
      if (block.marks?.includes(i)) {
        const boxY = lineY - Math.round(block.font.size * 0.78);
        nodes.push(
          { type: "rect", x: PAD_X, y: boxY, width: box, height: box, fill: accent, rx: Math.round(box / 5) },
          { type: "text", x: PAD_X + box / 2, y: boxY + Math.round(box * 0.8), text: "\u2713", font: { family: "sans", weight: 600, size: Math.round(box * 0.8) }, fill: readableOn(accent), anchor: "middle" },
        );
      }
      nodes.push({
        type: "text",
        x: center ? SLIDE_WIDTH / 2 : PAD_X + (block.indent ?? 0),
        y: lineY,
        text: line,
        font: block.font,
        fill,
        ...(opacity !== undefined ? { opacity } : {}),
        ...(center ? { anchor: "middle" as const } : {}),
      });
    });
    y += heightOf(block);
  };
  place(t, ink);
  y += usedGap;
  const ruled = b.lines.length ? b : t;
  const ruledTop = b.lines.length ? y : y - usedGap - heightOf(t);
  if (onBrand) place(b, ink, title ? 0.9 : undefined);
  else place(b, title ? pc.body : pc.ink);
  if (point === "notebook" && ruled.lineHeight) {
    // faint ruled lines under each line of the text, on down the page
    const rules: SvgNode[] = [];
    for (let ry = ruledTop + ruled.lineHeight - 6; ry < contentBottom; ry += ruled.lineHeight) {
      rules.push({ type: "rect", x: 0, y: ry, width: SLIDE_WIDTH, height: 2, fill: pc.rule });
    }
    nodes.splice(behindText, 0, ...rules);
  }

  if (role === "cover") {
    nodes.push({
      type: "text",
      x: center ? SLIDE_WIDTH / 2 : PAD_X,
      y: contentBottom - 24,
      text: "Swipe →",
      font: { family: "sans", weight: 600, size: 36 },
      fill: ink,
      opacity: 0.85,
      ...(center ? { anchor: "middle" as const } : {}),
    });
  }

  // the brand kit headshot, a circle left of the name, then the name over the handle
  const PHOTO = 88;
  const nameFont: FontSpec = { family: "sans", weight: 600, size: 34 };
  const handleFont: FontSpec = { family: "sans", weight: 400, size: 30 };
  const nameRow = (middle: number, reserve: number, nameFill: string, handleFill: string, handleOpacity: { opacity?: number }) => {
    if (photo) nodes.push({ type: "image", x: PAD_X, y: middle - PHOTO / 2, width: PHOTO, height: PHOTO, href: photo, shape: "circle" });
    const textX = photo ? PAD_X + PHOTO + 24 : PAD_X;
    const rowWidth = CONTENT_WIDTH - (textX - PAD_X) - reserve;
    const fit = (text: string, font: FontSpec) => (measure(text, font) <= rowWidth ? text : ellipsize(text, rowWidth, font, measure));
    if (name) {
      nodes.push({ type: "text", x: textX, y: handle ? middle - 8 : middle + 12, text: fit(name, nameFont), font: nameFont, fill: nameFill });
    }
    if (handle) {
      nodes.push({ type: "text", x: textX, y: name ? middle + 34 : middle + 11, text: fit(handle, handleFont), font: handleFont, fill: handleFill, ...handleOpacity });
    }
  };

  // Footer: name and handle on the left, "3/8" on the right. A post card shows its name row at the card's
  // top, like a social post, and only the number under it.
  const numberFont: FontSpec = { family: "sans", weight: 600, size: 32 };
  const numberText = `${input.index + 1}/${input.total}`;
  if (card) {
    nameRow(cardTop + 92, 0, pc.ink, pc.muted, {});
    const middle = Math.round((cardBottom + frame.footerEnd) / 2);
    nodes.push({ type: "text", x: SLIDE_WIDTH - PAD_X, y: middle + 11, text: numberText, font: numberFont, fill: readableOn(brandColor), anchor: "end", opacity: 0.8 });
    return { width: SLIDE_WIDTH, height, role, background, nodes, overflow };
  }
  const muted = onBrand ? ink : pc.muted;
  const mutedOpacity = onBrand ? { opacity: 0.8 } : {};
  nodes.push({
    type: "rect",
    x: PAD_X,
    y: frame.footer,
    width: CONTENT_WIDTH,
    height: 2,
    fill: onBrand ? ink : pc.rule,
    ...(onBrand ? { opacity: 0.3 } : {}),
  });
  const middle = Math.round((frame.footer + frame.footerEnd) / 2);
  nodes.push({
    type: "text",
    x: SLIDE_WIDTH - PAD_X,
    y: middle + 11,
    text: numberText,
    font: numberFont,
    fill: muted,
    anchor: "end",
    ...mutedOpacity,
  });
  nameRow(middle, measure(numberText, numberFont) + 48, ink, muted, mutedOpacity);

  return { width: SLIDE_WIDTH, height, role, background, nodes, overflow };
}

/** A checklist's ticked box, sized to the text it starts. */
const tickBox = (fontSize: number) => Math.round(fontSize * 0.9);

// ---- SVG ----------------------------------------------------------------------

// Characters XML 1.0 forbids; one of these would stop the whole image loading.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function escapeXml(text: string): string {
  return String(text ?? "")
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSvg(layout: Pick<SlideLayout, "width" | "height" | "nodes">): string {
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
  ];
  layout.nodes.forEach((node, i) => {
    if (node.type === "image") {
      if (node.fit === "contain") {
        out.push(`<image href="${escapeXml(node.href)}" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" preserveAspectRatio="xMaxYMid meet"/>`);
        return;
      }
      const clip =
        node.shape === "circle"
          ? `<circle cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" r="${node.width / 2}"/>`
          : `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${node.shape === "square" ? "" : ' rx="28"'}/>`;
      out.push(
        `<clipPath id="c${i}">${clip}</clipPath>`,
        `<image href="${escapeXml(node.href)}" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${i})"/>`,
      );
      return;
    }
    if (node.type === "fade") {
      const color = escapeXml(node.color);
      out.push(
        `<linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${node.opacity}"/></linearGradient>`,
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="url(#g${i})"/>`,
      );
      return;
    }
    const opacity = node.opacity !== undefined ? ` fill-opacity="${node.opacity}"` : "";
    if (node.type === "rect") {
      const rx = node.rx ? ` rx="${node.rx}"` : "";
      out.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${rx} fill="${escapeXml(node.fill)}"${opacity}/>`,
      );
    } else {
      const family = stackFor(node.font.family, OTHER_SCRIPT.test(node.text));
      const anchor = node.anchor ? ` text-anchor="${node.anchor}"` : "";
      const stroke = node.stroke ? ` stroke="${escapeXml(node.stroke)}" stroke-width="${node.strokeWidth ?? 1}" stroke-linejoin="round" paint-order="stroke"` : "";
      out.push(
        `<text x="${node.x}" y="${node.y}" font-family="${escapeXml(family)}" font-size="${node.font.size}" font-weight="${node.font.weight}" fill="${escapeXml(node.fill)}"${opacity}${anchor}${stroke}>${escapeXml(node.text)}</text>`,
      );
    }
  });
  out.push("</svg>");
  return out.join("");
}
