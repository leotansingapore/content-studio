// Slide drawing for the carousel maker, as data. layoutSlide() places every
// shape and wrapped line on a 1080x1350 (4:5) slide and renderSvg() turns that
// into an SVG string. Text is measured by a function the caller passes in (a
// canvas 2D context in the browser, a fake in tests), so this file is pure.
//
// Fonts: an SVG drawn into a canvas can't load web fonts, so slides use system
// serif and sans stacks, which render the same in the SVG and in measureText.

import { normalizeHandle, slideRole, type CarouselBrand, type SlideRole } from "@/lib/carousel";

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
const CONTENT_BOTTOM = FOOTER_RULE_Y - 64;
const ACCENT = { width: 96, height: 10, gap: 52 };
const TITLE_BODY_GAP = 40;
/** Room kept under the cover text for "Swipe →". */
const SWIPE_SPACE = 96;

export interface FontSpec {
  family: "serif" | "sans";
  weight: 400 | 600;
  size: number;
}

export type Measure = (text: string, font: FontSpec) => number;

export function fontCss(font: FontSpec): string {
  return `${font.weight} ${font.size}px ${font.family === "serif" ? SERIF_STACK : SANS_STACK}`;
}

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
export function accentOnPaper(color: string): string {
  return contrastRatio(color, PAPER) >= 3 ? color : INK;
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

/** Greedy word wrap. Line breaks in the text start new lines; blank lines collapse. */
export function wrapText(text: string, maxWidth: number, font: FontSpec, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, font) <= maxWidth) {
        line = word;
        continue;
      }
      const pieces = breakWord(word, maxWidth, font, measure);
      lines.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? "";
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function ellipsize(line: string, maxWidth: number, font: FontSpec, measure: Measure): string {
  let chars = Array.from(line.replace(/[\s.,;:!?…-]+$/, ""));
  while (chars.length && measure(`${chars.join("")}…`, font) > maxWidth) chars = chars.slice(0, -1);
  return `${chars.join("").trimEnd()}…`;
}

function clampLines(lines: string[], maxLines: number, font: FontSpec, measure: Measure): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(0, maxLines));
  if (kept.length) kept[kept.length - 1] = ellipsize(kept[kept.length - 1], CONTENT_WIDTH, font, measure);
  return kept;
}

// ---- Layout -------------------------------------------------------------------

export type SvgNode =
  | { type: "rect"; x: number; y: number; width: number; height: number; fill: string; opacity?: number }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      font: FontSpec;
      fill: string;
      opacity?: number;
      anchor?: "end";
    };

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
}

export function layoutSlide(input: SlideInput, measure: Measure): SlideLayout {
  const role = slideRole(input.index, input.total);
  const onBrand = role !== "point";
  const brandColor = input.brand.color;
  const background = onBrand ? brandColor : PAPER;
  const ink = onBrand ? readableOn(brandColor) : INK;
  const nodes: SvgNode[] = [
    { type: "rect", x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, fill: background },
  ];
  if (!onBrand) nodes.push({ type: "rect", x: 0, y: 0, width: SLIDE_WIDTH, height: BAR_HEIGHT, fill: brandColor });

  const style = STYLES[role];
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const bottom = role === "cover" ? CONTENT_BOTTOM - SWIPE_SPACE : CONTENT_BOTTOM;
  const room = bottom - CONTENT_TOP - ACCENT.height - ACCENT.gap;

  const options = (
    text: string,
    sizes: number[],
    family: FontSpec["family"],
    weight: FontSpec["weight"],
    line: number,
  ): TextBlock[] => {
    if (!text) return [{ font: { family, weight, size: sizes[0] }, lines: [], lineHeight: 0 }];
    return sizes.map((size) => {
      const font: FontSpec = { family, weight, size };
      return { font, lines: wrapText(text, CONTENT_WIDTH, font, measure), lineHeight: Math.round(size * line) };
    });
  };
  const titles = options(title, style.title, "serif", 600, style.titleLine);
  const bodies = title
    ? options(body, style.body, "sans", 400, style.bodyLine)
    : options(body, BODY_ONLY.sizes, "serif", 400, BODY_ONLY.line);
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
    const bFit = { ...b, lines: b.lineHeight ? clampLines(b.lines, Math.floor(bodyRoom / b.lineHeight), b.font, measure) : [] };
    chosen = [tFit, bFit];
  }
  const [t, b] = chosen;
  const usedGap = t.lines.length && b.lines.length ? gap : 0;

  const blockHeight = ACCENT.height + ACCENT.gap + heightOf(t) + usedGap + heightOf(b);
  const slack = Math.max(0, bottom - CONTENT_TOP - blockHeight);
  let y = CONTENT_TOP + Math.round(slack * (role === "point" ? 0.4 : 0.5));
  nodes.push({
    type: "rect",
    x: PAD_X,
    y,
    width: ACCENT.width,
    height: ACCENT.height,
    fill: onBrand ? ink : accentOnPaper(brandColor),
  });
  y += ACCENT.height + ACCENT.gap;

  const place = (block: TextBlock, fill: string, opacity?: number) => {
    const baseline = Math.round((block.lineHeight - block.font.size) / 2 + block.font.size * 0.8);
    block.lines.forEach((line, i) => {
      nodes.push({
        type: "text",
        x: PAD_X,
        y: y + i * block.lineHeight + baseline,
        text: line,
        font: block.font,
        fill,
        ...(opacity !== undefined ? { opacity } : {}),
      });
    });
    y += heightOf(block);
  };
  place(t, ink);
  y += usedGap;
  if (onBrand) place(b, ink, title ? 0.9 : undefined);
  else place(b, title ? INK_BODY : INK);

  if (role === "cover") {
    nodes.push({
      type: "text",
      x: PAD_X,
      y: CONTENT_BOTTOM - 24,
      text: "Swipe →",
      font: { family: "sans", weight: 600, size: 36 },
      fill: ink,
      opacity: 0.85,
    });
  }

  // Footer: name and handle on the left, "3/8" on the right.
  const muted = onBrand ? ink : INK_MUTED;
  const mutedOpacity = onBrand ? { opacity: 0.8 } : {};
  nodes.push({
    type: "rect",
    x: PAD_X,
    y: FOOTER_RULE_Y,
    width: CONTENT_WIDTH,
    height: 2,
    fill: onBrand ? ink : RULE,
    ...(onBrand ? { opacity: 0.3 } : {}),
  });
  const middle = Math.round((FOOTER_RULE_Y + SLIDE_HEIGHT) / 2);
  const numberFont: FontSpec = { family: "sans", weight: 600, size: 32 };
  const numberText = `${input.index + 1}/${input.total}`;
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
  const footerWidth = CONTENT_WIDTH - measure(numberText, numberFont) - 48;
  const fit = (text: string, font: FontSpec) =>
    measure(text, font) <= footerWidth ? text : ellipsize(text, footerWidth, font, measure);
  const name = String(input.brand.name ?? "").replace(/\s+/g, " ").trim();
  const handle = normalizeHandle(input.brand.handle);
  const nameFont: FontSpec = { family: "sans", weight: 600, size: 34 };
  const handleFont: FontSpec = { family: "sans", weight: 400, size: 30 };
  if (name) {
    nodes.push({ type: "text", x: PAD_X, y: handle ? middle - 8 : middle + 12, text: fit(name, nameFont), font: nameFont, fill: ink });
  }
  if (handle) {
    nodes.push({
      type: "text",
      x: PAD_X,
      y: name ? middle + 34 : middle + 11,
      text: fit(handle, handleFont),
      font: handleFont,
      fill: muted,
      ...mutedOpacity,
    });
  }

  return { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, role, background, nodes, overflow };
}

// ---- SVG ----------------------------------------------------------------------

// Characters XML 1.0 forbids; one of these would stop the whole image loading.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[ --￾￿]/g;

export function escapeXml(text: string): string {
  return String(text ?? "")
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSvg(layout: SlideLayout): string {
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
  ];
  for (const node of layout.nodes) {
    const opacity = node.opacity !== undefined ? ` fill-opacity="${node.opacity}"` : "";
    if (node.type === "rect") {
      out.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="${escapeXml(node.fill)}"${opacity}/>`,
      );
    } else {
      const family = node.font.family === "serif" ? SERIF_STACK : SANS_STACK;
      const anchor = node.anchor === "end" ? ' text-anchor="end"' : "";
      out.push(
        `<text x="${node.x}" y="${node.y}" font-family="${escapeXml(family)}" font-size="${node.font.size}" font-weight="${node.font.weight}" fill="${escapeXml(node.fill)}"${opacity}${anchor}>${escapeXml(node.text)}</text>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("");
}
