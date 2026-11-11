// The Image page's layouts (docs/north-star/items/formats-static-ad.md), as data: layoutImage() places every shape
// and wrapped line of one designed picture at one of four sizes, and renderSvg (carouselLayout.ts) turns it into an
// SVG. Pure: text is measured by the caller (a canvas in the browser, a fake in tests). Every size keeps 96 px side
// margins, and a 9:16 story keeps 250 px clear at the top and bottom for the app's own buttons. formats-memes adds
// five meme layouts (docs/north-star/items/formats-memes.md): white words outlined in black over a full-bleed
// picture, a "Nobody:" band, two labelled pictures, a POV line on a fade and the brand's own post over a reaction.
// ff1111 adds the static ad formats (src/data/staticFormats.ts, after Fastlane's 22): each a generic look-alike drawn
// in code (a text chat, a forum post, an AI chat), never a real app's logo or trade dress, in the brand's colour.

import { STATIC_FORMATS } from "@/data/staticFormats";
import { normalizeHandle, sanitizeImage, type CarouselBrand } from "@/lib/carousel";
import {
  PAD_X,
  SLIDE_FONTS,
  accentOnPaper,
  contrastRatio,
  ellipsize,
  mix,
  paperColors,
  readableOn,
  wrapText,
  type FontSpec,
  type Measure,
  type SlideFont,
  type SlidePaper,
  type SvgNode,
} from "@/lib/carouselLayout";
import { STATIC_LAYOUT_IDS, type ImageLayout } from "@/lib/links";

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
/** The Meme group: the remix writer's MEME_LAYOUTS, in the same order. */
export const MEME_LAYOUT_IDS = ["top-bottom", "nobody-me", "expectation", "pov", "post-reaction"] as const;
export type MemeLayoutId = (typeof MEME_LAYOUT_IDS)[number];
export const isMeme = (l: string): l is MemeLayoutId => (MEME_LAYOUT_IDS as readonly string[]).includes(l);
/** The Static group: the static ad formats drawn so far, by their staticFormats.ts slug. */
export type StaticLayoutId = (typeof STATIC_LAYOUT_IDS)[number];
export const isStatic = (l: string): l is StaticLayoutId => (STATIC_LAYOUT_IDS as readonly string[]).includes(l);
/** Whether a static format is best with a product photo, needs one (no download without it), or takes none. */
export const staticPhoto = (l: string): "best" | "needs" | null => {
  const f = isStatic(l) ? STATIC_FORMATS.find((x) => x.slug === l) : undefined;
  return f?.needs === "photo" ? "needs" : f?.best === "photo" ? "best" : null;
};
export const LAYOUT_LABELS: Record<ImageLayout, string> = {
  ...(Object.fromEntries(STATIC_LAYOUT_IDS.map((id) => [id, STATIC_FORMATS.find((f) => f.slug === id)?.name ?? id])) as Record<StaticLayoutId, string>),
  headline: "Headline ad",
  quote: "Quote card",
  stat: "Stat card",
  testimonial: "Testimonial",
  "top-bottom": "Top and bottom",
  "nobody-me": "Nobody / me",
  expectation: "Expectation vs reality",
  pov: "POV",
  "post-reaction": "Post and reaction",
};
/** A meme is a feed post or a story, never a link ad; a new one starts on Square. */
export const MEME_SIZES = ["4x5", "1x1", "9x16"] as const satisfies readonly ImageSize[];
export const MEME_SIZE: ImageSize = "1x1";
/** A static ad is a feed post or a story too (MEME_SIZES); a new one keeps Feed 4:5. */
export const sizesFor = (layout: ImageLayout): readonly ImageSize[] => (isMeme(layout) || isStatic(layout) ? MEME_SIZES : IMAGE_SIZES);

export interface ImageField {
  key: string;
  label: string;
  max: number;
  unit: "words" | "chars";
  /** Drawn in grey on the preview while the field is empty; never in a download. */
  sample: string;
  /** The brand types it (a flyer's price): Write it for me never fills it. */
  typed?: true;
}

const chat = (them: string, you: string): ImageField[] => [
  { key: "name", label: them, max: 2, unit: "words", sample: "Maya" },
  { key: "one", label: "1. Them", max: 14, unit: "words", sample: "The first message" },
  { key: "two", label: `2. ${you}`, max: 14, unit: "words", sample: "The reply" },
  { key: "three", label: "3. Them", max: 14, unit: "words", sample: "A message back" },
  { key: "four", label: `4. ${you}`, max: 14, unit: "words", sample: "Another reply" },
  { key: "five", label: "5. Them", max: 14, unit: "words", sample: "One more" },
  { key: "six", label: `6. ${you}`, max: 14, unit: "words", sample: "The last word" },
];
/** Each static ad format's fields, in the order they are drawn; the writer's STATIC_FIELDS limits (asserted equal in the test). */
const STATIC_FIELDS: Record<StaticLayoutId, ImageField[]> = {
  "text-chat": chat("Their name", "You"),
  "friend-recommends": chat("The friend's name", "Friend").map((f) => (f.key === "name" ? f : { ...f, label: f.label.replace("Them", "Asks") })),
  "ai-chat": [
    { key: "question", label: "Their question", max: 25, unit: "words", sample: "The question someone asks" },
    { key: "lead", label: "Answer, first line", max: 20, unit: "words", sample: "The answer's main point" },
    { key: "answer", label: "Answer, the rest", max: 35, unit: "words", sample: "The rest of the answer, naming you" },
  ],
  "forum-thread": [
    { key: "asker", label: "Who asks", max: 2, unit: "words", sample: "quietteapot" },
    { key: "title", label: "Post title", max: 14, unit: "words", sample: "The question in the post's title" },
    { key: "body", label: "Post", max: 30, unit: "words", sample: "What they've tried so far" },
    { key: "replier", label: "Who replies", max: 2, unit: "words", sample: "luckypebble" },
    { key: "reply", label: "Reply", max: 45, unit: "words", sample: "The reply that names you" },
  ],
  "us-vs-them": [
    { key: "headline", label: "Headline", max: 10, unit: "words", sample: "The choice in one line" },
    { key: "them", label: "Their side", max: 4, unit: "words", sample: "The usual way" },
    { key: "us", label: "Your side", max: 4, unit: "words", sample: "Your name" },
    { key: "oldA", label: "Row 1, theirs", max: 7, unit: "words", sample: "A hassle" },
    { key: "newA", label: "Row 1, yours", max: 7, unit: "words", sample: "Your fix" },
    { key: "oldB", label: "Row 2, theirs", max: 7, unit: "words", sample: "A cost" },
    { key: "newB", label: "Row 2, yours", max: 7, unit: "words", sample: "Your fix" },
    { key: "oldC", label: "Row 3, theirs", max: 7, unit: "words", sample: "A wait" },
    { key: "newC", label: "Row 3, yours", max: 7, unit: "words", sample: "Your fix" },
    { key: "close", label: "Closing line", max: 8, unit: "words", sample: "The line to end on" },
  ],
  "news-headline": [
    { key: "badge", label: "Badge", max: 3, unit: "words", sample: "Just in" },
    { key: "headline", label: "Headline", max: 16, unit: "words", sample: "A headline written like news" },
    { key: "footer", label: "Small line", max: 10, unit: "words", sample: "Your name and what it is" },
  ],
};
/** The field a static design is named after, and needs before a download. */
const STATIC_MAIN: Record<StaticLayoutId, string> = {
  "text-chat": "one",
  "friend-recommends": "one",
  "ai-chat": "question",
  "forum-thread": "title",
  "us-vs-them": "headline",
  "news-headline": "headline",
};

/**
 * Each layout's fields and limits. The testimonial's words are their own field (clientWords): a quote card's words are
 * the brand's own, and switching layouts must never turn them into a client's.
 */
export const IMAGE_FIELDS: Record<ImageLayout, ImageField[]> = {
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
  // the meme writer's MEME_FIELDS limits (supabase/functions/remix/logic.ts), asserted equal in the test
  "top-bottom": [
    { key: "top", label: "Top line", max: 10, unit: "words", sample: "The setup" },
    { key: "bottom", label: "Bottom line", max: 10, unit: "words", sample: "The punchline" },
  ],
  "nobody-me": [
    { key: "setup", label: "After Nobody:", max: 12, unit: "words", sample: "Me at 2am" },
    { key: "punch", label: "What you're doing", max: 12, unit: "words", sample: "What you are doing" },
  ],
  expectation: [
    { key: "expectation", label: "Expectation", max: 6, unit: "words", sample: "What you expected" },
    { key: "reality", label: "Reality", max: 6, unit: "words", sample: "What you got" },
  ],
  pov: [{ key: "line", label: "After POV:", max: 15, unit: "words", sample: "The moment, in one line" }],
  "post-reaction": [{ key: "post", label: "Your post", max: 30, unit: "words", sample: "A short post your picture answers" }],
  ...STATIC_FIELDS,
};

/** Expectation vs reality's second picture: a media key kept in the design's words (SavedImage holds one pictureKey). */
export const SECOND_PICTURE = "realityPicture";
// shortcut: the reality picture rides in words because images.ts keeps one pictureKey; move it when SavedImage gains a list
export const secondPicture = (words: Record<string, string>): string | undefined => {
  const k = words[SECOND_PICTURE];
  return k && /^cimg-[a-z0-9]{6,30}$/.test(k) ? k : undefined;
};

export const countOf = (text: string, unit: ImageField["unit"]) =>
  unit === "words" ? text.trim().split(/\s+/).filter(Boolean).length : Array.from(text.trim()).length;

/** Why this design can't be downloaded or posted yet, or null. A stat card needs your own number and its source. */
export function imageBlock(layout: ImageLayout, words: Record<string, string>): string | null {
  const has = (k: string) => !!words[k]?.trim();
  if (isStatic(layout)) return has(STATIC_MAIN[layout]) ? null : "Add the words first.";
  if (layout === "top-bottom") return has("top") || has("bottom") ? null : "Add the words first.";
  if (layout === "nobody-me") return has("setup") && has("punch") ? null : "Add both lines first.";
  if (layout === "expectation") return has("expectation") && has("reality") ? null : "Add both labels first.";
  if (layout === "pov") return has("line") ? null : "Add the line first.";
  if (layout === "post-reaction") return has("post") ? null : "Add your post first.";
  if (layout === "stat") return !has("number") || !has("statSource") ? "Type your own number and where it's from." : has("statLabel") ? null : "Add what the number means first.";
  if (layout === "quote") return has("quote") ? null : "Add the quote first.";
  if (layout === "testimonial") return has("clientWords") ? null : "Add your client's own words first.";
  return has("headline") ? null : "Add a headline first.";
}

/** A meme's pictures: expectation vs reality needs two, every other meme one, as does a static format that needs a photo; an ad's picture is optional. */
export function pictureBlock(layout: ImageLayout, pictures: number): string | null {
  const need = layout === "expectation" ? 2 : isMeme(layout) || staticPhoto(layout) === "needs" ? 1 : 0;
  return pictures >= need ? null : need === 2 ? "Add both pictures first." : "Add a picture first.";
}

/** The words a file is named after: the layout's main field, or a meme as it reads. */
export function mainWords(layout: ImageLayout, words: Record<string, string>): string {
  if (isStatic(layout)) return words[STATIC_MAIN[layout]]?.replace(/\s+/g, " ").trim() ?? "";
  if (!isMeme(layout)) return words[{ headline: "headline", quote: "quote", stat: "statLabel", testimonial: "clientWords" }[layout]] ?? "";
  const w = (k: string) => words[k]?.replace(/\s+/g, " ").trim() ?? "";
  if (layout === "top-bottom") return [w("top"), w("bottom")].filter(Boolean).join(" / ");
  if (layout === "nobody-me") return [w("setup"), w("punch")].filter(Boolean).join(": ");
  if (layout === "expectation") return [w("expectation"), w("reality")].filter(Boolean).join(" vs ");
  if (layout === "pov") return w("line") && `POV: ${w("line")}`;
  return w("post");
}

/** A written meme set's option to show first: Jev's best, else the first one it kept, else none. */
export function memeChoice(set: { options: unknown[]; best: number | null; dropped: number[] }): number | null {
  const kept = set.options.map((_, i) => i).filter((i) => !set.dropped.includes(i));
  return set.best !== null && kept.includes(set.best) ? set.best : (kept[0] ?? null);
}

/** Which option the design's words still are (a typed edit makes it none). */
export const optionIndex = (words: Record<string, string>, options: Record<string, string>[]): number | null => {
  const i = options.findIndex((o) => Object.entries(o).every(([k, v]) => (words[k] ?? "") === v));
  return i < 0 ? null : i;
};

export interface ImageInput {
  layout: ImageLayout;
  words: Record<string, string>;
  brand: CarouselBrand;
  font?: SlideFont;
  paper?: SlidePaper;
  align?: "left" | "center";
  /** The headline ad's or a meme's picture, as a data URL (a blob: link draws on screen only, never in a PNG). */
  picture?: string;
  /** Expectation vs reality's second picture, the same way. */
  picture2?: string;
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
  /** An outline under the fill (a meme's white words on any picture). */
  outline?: string;
  /** Wrapped to this width instead of the stack's (a static ad's chat bubble or reply). */
  width?: number;
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

function fitBlock(b: Block, size: number, stackWidth: number, measure: Measure): Fitted {
  const width = b.width ?? stackWidth;
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
    long.lines[long.lines.length - 1] = ellipsize(long.lines[long.lines.length - 1], long.b.width ?? width, long.font, measure);
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
      const outline = it.b.outline ? { stroke: it.b.outline, strokeWidth: Math.max(4, Math.round(size * 0.12)) } : {};
      it.lines.forEach((line, i) => nodes.push({ type: "text", x, y: y + i * it.lineHeight + baseline, text: line, font: it.font, fill: it.b.fill, ...faded, ...anchor, ...outline }));
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
  if (isMeme(input.layout)) return layoutMeme(input, input.layout, size, measure);
  if (isStatic(input.layout)) return layoutStatic(input, input.layout, size, measure);
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

// ---- memes -----------------------------------------------------------------------------------

const MEME_INK = "#FFFFFF";
const MEME_OUTLINE = "#000000";
const MEME_DARK = "#111111";
const MEME_MUTED = "#71717A";
/** No picture yet: two greys, so expectation's halves read as two. */
const NO_PICTURE = ["#3F3F46", "#52525B"];
const CAPS_SIZES = [112, 104, 96, 88, 80, 72, 64, 58, 52, 46, 42, 38];
const BAND_SIZES = [64, 58, 54, 50, 46, 42, 38, 34, 31, 28];
const STRIP_SIZES = [60, 54, 50, 46, 42, 38, 34, 31, 28];
const POV_SIZES = [80, 72, 66, 60, 54, 50, 46, 42, 38, 34];
const POST_SIZES = [52, 48, 44, 41, 38, 35, 32, 30, 28];
const HEAD = 88;

/**
 * The five meme layouts. Pictures go full bleed (a 9:16 story's pictures run under the app's buttons); the words keep
 * 96 px side margins and, on a story, the 250 px clear at the top and bottom. Never a famous meme picture: the
 * picture is the brand's own, made, or free stock, and the preview shows a grey stand-in until there is one.
 */
function layoutMeme(input: ImageInput, layout: MemeLayoutId, size: ImageSize, measure: Measure): DrawnImage {
  const { width: W, height: H } = SIZE_INFO[size];
  const clear = size === "9x16" ? STORY_CLEAR : 0;
  const w = W - 2 * PAD_X;
  const nodes: SvgNode[] = [{ type: "rect", x: 0, y: 0, width: W, height: H, fill: NO_PICTURE[0] }];
  let overflow = false;

  const word = (key: string): { text: string; sample: boolean } | null => {
    const typed = (input.words[key] ?? "").replace(/\s+/g, " ").trim();
    if (typed) return { text: typed, sample: false };
    const def = IMAGE_FIELDS[layout].find((f) => f.key === key);
    return input.samples && def ? { text: def.sample, sample: true } : null;
  };
  const faded = (sample: boolean | undefined, by = 0.6) => (sample ? { opacity: by } : {});
  const fit = (blocks: Block[], room: number) => {
    const r = fitStack(blocks, w, room, measure);
    overflow ||= r.overflow;
    return r.fitted;
  };
  const picture = (href: string | undefined, box: Box, shade = 0) => {
    const h = href?.trim();
    if (h) return void nodes.push({ type: "image", x: box.x, y: box.y, width: box.w, height: box.h, href: h, shape: "square" });
    nodes.push({ type: "rect", x: box.x, y: box.y, width: box.w, height: box.h, fill: NO_PICTURE[shade] });
    if (input.samples) nodes.push({ type: "text", x: box.x + box.w / 2, y: Math.round(box.y + box.h * 0.42), text: "Your picture", font: { family: "sans", weight: 400, size: 34 }, fill: "#D4D4D8", anchor: "middle" });
  };

  if (layout === "top-bottom") {
    // upper-case white words outlined in black, at the top and the bottom of a full-bleed picture
    picture(input.picture, { x: 0, y: 0, w: W, h: H });
    const h = Math.round((H - 2 * clear) * 0.32);
    for (const [key, y, valign] of [["top", clear + 40, 0], ["bottom", H - clear - 40 - h, 1]] as const) {
      const v = word(key);
      if (!v) continue;
      const f = fit([{ text: v.text.toUpperCase(), family: "sans", weight: 600, sizes: CAPS_SIZES, line: 1.08, fill: MEME_INK, outline: MEME_OUTLINE, gap: 0, ...faded(v.sample) }], h);
      placeStack(nodes, f, { x: PAD_X, y, w, h }, true, valign);
    }
  } else if (layout === "nobody-me") {
    // a white band on top: "Nobody:", then "Me at 2am: what you're doing"; the picture fills the rest
    const setup = word("setup");
    const punch = word("punch");
    const line = [setup?.text.replace(/^nobody\s*:\s*/i, "").replace(/[\s:]+$/, ""), punch?.text].filter(Boolean).join(": ");
    const f = fit(
      [
        { text: "Nobody:", family: "sans", weight: 600, sizes: BAND_SIZES, line: 1.25, fill: MEME_DARK, gap: 20 },
        ...(line ? [{ text: line, family: "sans" as const, weight: 400 as const, sizes: BAND_SIZES, line: 1.25, fill: MEME_DARK, gap: 0, ...faded(setup?.sample || punch?.sample, 0.5) }] : []),
      ],
      Math.round((H - 2 * clear) * 0.4),
    );
    const top = clear + 56;
    const band = top + stackHeight(f) + 56;
    picture(input.picture, { x: 0, y: band, w: W, h: H - band });
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: band, fill: "#FFFFFF" });
    placeStack(nodes, f, { x: PAD_X, y: top, w, h: stackHeight(f) }, false, 0);
  } else if (layout === "expectation") {
    // two pictures stacked, each with its label on a dark strip at its foot
    const half = Math.round(H / 2);
    const parts = [
      { key: "expectation", label: "Expectation", href: input.picture, box: { x: 0, y: 0, w: W, h: half } },
      { key: "reality", label: "Reality", href: input.picture2, box: { x: 0, y: half, w: W, h: H - half } },
    ];
    parts.forEach((p, i) => picture(p.href, p.box, i));
    for (const p of parts) {
      const v = word(p.key);
      const f = fit([{ text: `${p.label}: ${v?.text ?? ""}`.trim(), family: "sans", weight: 600, sizes: STRIP_SIZES, line: 1.2, fill: MEME_INK, gap: 0, ...faded(v?.sample) }], Math.round(p.box.h * 0.4));
      const strip = stackHeight(f) + 56;
      const foot = Math.min(p.box.y + p.box.h, H - clear);
      nodes.push({ type: "rect", x: 0, y: foot - strip, width: W, height: strip, fill: "#000000", opacity: 0.72 });
      placeStack(nodes, f, { x: PAD_X, y: foot - strip + 28, w, h: stackHeight(f) }, false, 0);
    }
  } else if (layout === "pov") {
    // a full-bleed picture, a dark fade at the bottom, and "POV: ..." in white on it
    picture(input.picture, { x: 0, y: 0, w: W, h: H });
    const fade = Math.round(H * 0.38);
    nodes.push({ type: "fade", x: 0, y: fade, width: W, height: H - fade, color: "#000000", opacity: 0.85 });
    const v = word("line");
    const top = Math.round(H * 0.5);
    const box = { x: PAD_X, y: top, w, h: H - clear - 72 - top };
    placeStack(nodes, fit([{ text: `POV: ${v?.text ?? ""}`.trim(), family: "sans", weight: 600, sizes: POV_SIZES, line: 1.2, fill: MEME_INK, gap: 0, ...faded(v?.sample) }], box.h), box, false, 1);
  } else {
    // the brand's own post as a card on top (headshot, name and handle from the brand kit, no network's logo), the
    // reaction picture under it
    const photo = sanitizeImage(input.brand.photo);
    const name = (input.brand.name ?? "").replace(/\s+/g, " ").trim();
    const handle = normalizeHandle(input.brand.handle);
    const head = photo || name || handle ? HEAD : 0;
    const top = clear + 56;
    const v = word("post");
    const f = fit(v ? [{ text: v.text, family: "sans", weight: 400, sizes: POST_SIZES, line: 1.3, fill: MEME_DARK, gap: 0, ...faded(v.sample, 0.5) }] : [], Math.round((H - 2 * clear) * 0.5) - head);
    const textTop = top + (head ? head + 28 : 0);
    const card = textTop + stackHeight(f) + 56;
    picture(input.picture, { x: 0, y: card, w: W, h: H - card });
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: card, fill: "#FFFFFF" });
    if (head) {
      if (photo) nodes.push({ type: "image", x: PAD_X, y: top, width: HEAD, height: HEAD, href: photo, shape: "circle" });
      const textX = photo ? PAD_X + HEAD + 24 : PAD_X;
      const room = W - PAD_X - textX;
      const nameFont: FontSpec = { family: "sans", weight: 600, size: 34 };
      const handleFont: FontSpec = { family: "sans", weight: 400, size: 30 };
      const cut = (t: string, font: FontSpec) => (measure(t, font) <= room ? t : ellipsize(t, room, font, measure));
      const mid = top + HEAD / 2;
      if (name) nodes.push({ type: "text", x: textX, y: Math.round(handle ? mid - HEAD * 0.06 : mid + 12), text: cut(name, nameFont), font: nameFont, fill: MEME_DARK });
      if (handle) nodes.push({ type: "text", x: textX, y: Math.round(name ? mid + HEAD * 0.38 : mid + 11), text: cut(handle, handleFont), font: handleFont, fill: MEME_MUTED });
    }
    placeStack(nodes, f, { x: PAD_X, y: textTop, w, h: stackHeight(f) }, false, 0);
  }

  return { width: W, height: H, background: NO_PICTURE[0], nodes, overflow };
}

// ---- static ad formats (ff1111) ----------------------------------------------------------------

/** A generic app screen's colours on the design's background: light, dark, or a light tint of the brand colour. */
function uiColors(paper: SlidePaper | undefined, color: string) {
  if (paper === "dark") return { screen: "#0B0B0C", bar: "#1C1C1E", bubble: "#2C2C2E", ink: "#F5F5F7", body: "#D1D1D6", muted: "#98989F", line: "#3A3A3C" };
  const screen = paper === "tint" ? mix("#FFFFFF", color, 0.08) : "#FFFFFF";
  return { screen, bar: mix(screen, "#000000", 0.04), bubble: mix(screen, "#000000", 0.09), ink: "#111111", body: "#3A3A3C", muted: "#6B6B70", line: mix(screen, "#000000", 0.14) };
}

/** A rounded box as path data, for an outline. */
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const dot = (cx: number, cy: number, r: number, fill: string, opacity?: number): SvgNode => ({ type: "rect", x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, rx: r, fill, ...(opacity !== undefined ? { opacity } : {}) });
const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "";

const SAMPLE_FADE = 0.55;
/** A bubble or pill is this much wider than its measured words: a preview shrunk on screen sets small text wider. */
const SLACK = 1.06;
const CHAT_SIZES = [44, 41, 38, 35, 32, 30, 28, 26, 24];

/**
 * The static ad formats. The whole picture is the scene (a phone screen, a news photo, a comparison); on a 9:16
 * story it is drawn inside the 250 px clear at the top and bottom, its background running to the edges, and words
 * keep the 96 px side margins.
 */
function layoutStatic(input: ImageInput, layout: StaticLayoutId, size: ImageSize, measure: Measure): DrawnImage {
  const { width: W, height: H } = SIZE_INFO[size];
  const clear = size === "9x16" ? STORY_CLEAR : 0;
  const top = clear;
  const bottom = H - clear;
  const w = W - 2 * PAD_X;
  const brand = input.brand;
  const ui = uiColors(input.paper, brand.color);
  const accent = accentOnPaper(brand.color, ui.screen);
  const onBrand = readableOn(brand.color);
  const fonts = SLIDE_FONTS[input.font ?? "classic"] ?? SLIDE_FONTS.classic;
  const nodes: SvgNode[] = [{ type: "rect", x: 0, y: 0, width: W, height: H, fill: ui.screen }];
  let overflow = false;

  const word = (key: string): { text: string; sample: boolean } | null => {
    const typed = (input.words[key] ?? "").replace(/\s+/g, " ").trim();
    if (typed) return { text: typed, sample: false };
    const def = IMAGE_FIELDS[layout].find((f) => f.key === key);
    return input.samples && def ? { text: def.sample, sample: true } : null;
  };
  /** A block of a field's words, faded when it is the preview's sample; none when the field is empty. */
  const block = (key: string, o: Omit<Block, "text">, upper = false): Block[] => {
    const v = word(key);
    return v ? [{ ...o, text: upper ? v.text.toUpperCase() : v.text, ...(v.sample ? { opacity: SAMPLE_FADE } : {}) }] : [];
  };
  const fit = (blocks: Block[], width: number, room: number) => {
    const r = fitStack(blocks, width, Math.max(0, room), measure);
    overflow ||= r.overflow;
    return r.fitted;
  };
  /** Fields fitted as one stack (all step down together); each field's lines by its key, none when it is empty. */
  const fitFields = (spec: [string, Omit<Block, "text">, boolean?][], width: number, room: number): Record<string, Fitted | undefined> => {
    const keyed = spec.flatMap(([k, o, upper]) => block(k, o, upper).map((b) => [k, b] as const));
    const f = fit(keyed.map(([, b]) => b), width, room);
    return Object.fromEntries(keyed.map(([k], i) => [k, f[i]]));
  };
  /** One fitted block's lines from y down; returns its height. */
  const draw = (it: Fitted | undefined, x: number, y: number, o: { anchor?: "middle" | "end"; fill?: (line: number) => string } = {}): number => {
    if (!it) return 0;
    const base = Math.round((it.lineHeight - it.font.size) / 2 + it.font.size * 0.8);
    it.lines.forEach((text, i) =>
      nodes.push({ type: "text", x, y: y + i * it.lineHeight + base, text, font: it.font, fill: o.fill?.(i) ?? it.b.fill, ...(it.b.opacity !== undefined ? { opacity: it.b.opacity } : {}), ...(o.anchor ? { anchor: o.anchor } : {}) }),
    );
    return it.height;
  };
  /** One line of chrome (a name, a time), cut with "…" to its room. */
  const text = (t: string, x: number, y: number, font: FontSpec, fill: string, o: { anchor?: "middle" | "end"; room?: number; opacity?: number } = {}) => {
    const room = o.room ?? w;
    nodes.push({ type: "text", x, y, text: measure(t, font) <= room ? t : ellipsize(t, room, font, measure), font, fill, ...(o.anchor ? { anchor: o.anchor } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}) });
  };
  /** The product photo, or for a format that needs one, a grey stand-in on the preview; false when nothing is drawn. */
  const photo = (box: Box, shape: "square" | "rounded" = "square"): boolean => {
    const href = input.picture?.trim();
    if (href) return void nodes.push({ type: "image", x: box.x, y: box.y, width: box.w, height: box.h, href, shape }), true;
    if (staticPhoto(layout) !== "needs") return false;
    nodes.push({ type: "rect", x: box.x, y: box.y, width: box.w, height: box.h, fill: NO_PICTURE[0], ...(shape === "rounded" ? { rx: 28 } : {}) });
    if (input.samples) nodes.push({ type: "text", x: box.x + box.w / 2, y: Math.round(box.y + box.h / 2 + 12), text: "Your picture", font: { family: "sans", weight: 400, size: 34 }, fill: "#D4D4D8", anchor: "middle" });
    return true;
  };
  const chevron = (x: number, cy: number, color: string) => nodes.push({ type: "path", d: `M${x + 16} ${cy - 22}L${x} ${cy}L${x + 16} ${cy + 22}`, stroke: color, strokeWidth: 6 });

  /**
   * Chat bubbles from the top of the box, theirs on the left and the brand's side on the right, all at the biggest
   * size that fits; past the smallest the longest bubble ends in "…". meta puts a time (and ticks) at a bubble's foot.
   */
  const bubbles = (keys: string[], box: Box, o: { theirs: [string, string]; mine: [string, string]; meta?: (i: number) => string; tick?: string }) => {
    const said = keys.map((k, i) => ({ v: word(k), mine: i % 2 === 1 })).filter((m) => m.v);
    const padX = (s: number) => Math.max(24, Math.round(s * 0.62));
    const metaFont = (s: number): FontSpec => ({ family: "sans", weight: 400, size: Math.round(s * 0.55) });
    const maxW = Math.round(box.w * 0.76);
    const plan = (s: number) => {
      const room = Math.floor((maxW - 2 * padX(s)) / SLACK);
      const blocks: Block[] = said.map((m) => ({ text: m.v!.text, family: "sans", weight: 400, sizes: [s], line: 1.28, fill: m.mine ? o.mine[1] : o.theirs[1], gap: Math.round(s * 0.5), width: room, ...(m.v!.sample ? { opacity: SAMPLE_FADE } : {}) }));
      // a time takes a line of its own under the words
      const extra = o.meta ? Math.round(metaFont(s).size * 1.3) : 0;
      return { blocks, extra, room };
    };
    let chosen: { fitted: Fitted[]; s: number; extra: number } | null = null;
    for (const s of CHAT_SIZES) {
      const p = plan(s);
      const pad = Math.round(s * 0.42) * 2 + p.extra;
      const r = fitStack(p.blocks, p.room, box.h - pad * said.length, measure);
      if (!r.overflow || s === CHAT_SIZES[CHAT_SIZES.length - 1]) {
        overflow ||= r.overflow;
        chosen = { fitted: r.fitted, s, extra: p.extra };
        if (!r.overflow) break;
      }
    }
    if (!chosen) return null;
    const { fitted, s, extra } = chosen;
    const padY = Math.round(s * 0.42);
    let y = box.y;
    let last: Box | null = null;
    fitted.forEach((it, i) => {
      const mine = said[i].mine;
      const textW = Math.max(...it.lines.map((l) => measure(l, it.font)));
      const metaText = o.meta?.(i) ?? "";
      const metaW = metaText ? measure(metaText, metaFont(s)) + (mine && o.tick ? 44 : 0) : 0;
      const bw = Math.round(Math.max(textW * SLACK, metaW) + 2 * padX(s));
      const bh = it.height + 2 * padY + extra;
      const x = mine ? box.x + box.w - bw : box.x;
      const [fill] = mine ? o.mine : o.theirs;
      nodes.push({ type: "rect", x, y, width: bw, height: bh, rx: Math.min(Math.round(s * 0.9), Math.round(bh / 2)), fill });
      draw(it, x + padX(s), y + padY);
      if (metaText) {
        const mf = metaFont(s);
        const right = x + bw - padX(s);
        const base = y + bh - padY + Math.round(mf.size * 0.1);
        if (mine && o.tick) {
          const t = right - 34;
          nodes.push({ type: "path", d: `M${t} ${base - 12}l7 8l13 -16M${t + 12} ${base - 4}l2 0l13 -16`, stroke: o.tick, strokeWidth: 3.5 });
        }
        text(metaText, right - (mine && o.tick ? 44 : 0), base, mf, o.mine[1] === o.theirs[1] ? ui.muted : mine ? o.mine[1] : ui.muted, { anchor: "end", opacity: 0.7 });
      }
      last = { x, y, w: bw, h: bh };
      y += bh + (i < fitted.length - 1 ? it.b.gap : 0);
    });
    return last as Box | null;
  };

  if (layout === "text-chat") {
    // a phone's text messages: the contact on top, grey bubbles theirs, the brand's colour yours, the reply box below
    const headH = size === "1x1" ? 190 : 220;
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: top + headH, fill: ui.bar }, { type: "rect", x: 0, y: top + headH, width: W, height: 2, fill: ui.line });
    chevron(PAD_X, top + headH / 2 - 10, accent);
    const name = word("name");
    const avatarR = 46;
    const ay = top + 34 + avatarR;
    nodes.push(dot(W / 2, ay, avatarR, "#A1A1AA"));
    if (name) text(initialOf(name.text), W / 2, ay + 16, { family: "sans", weight: 600, size: 44 }, "#FFFFFF", { anchor: "middle", opacity: name.sample ? SAMPLE_FADE : undefined });
    if (name) text(name.text, W / 2, ay + avatarR + 46, { family: "sans", weight: 400, size: 32 }, ui.ink, { anchor: "middle", room: w - 120, opacity: name.sample ? SAMPLE_FADE : undefined });
    const barH = 84;
    const barY = bottom - 40 - barH;
    nodes.push(dot(PAD_X + 34, barY + barH / 2, 34, ui.bubble), { type: "path", d: `M${PAD_X + 34} ${barY + barH / 2 - 14}v28M${PAD_X + 20} ${barY + barH / 2}h28`, stroke: ui.muted, strokeWidth: 4 });
    nodes.push({ type: "path", d: roundRect(PAD_X + 88, barY, W - 2 * PAD_X - 88, barH, barH / 2), stroke: ui.line, strokeWidth: 3 });
    text("Text message", PAD_X + 120, barY + barH / 2 + 11, { family: "sans", weight: 400, size: 30 }, ui.muted);
    const box: Box = { x: PAD_X - 24, y: top + headH + 40, w: W - 2 * (PAD_X - 24), h: barY - 40 - (top + headH + 40) - 48 };
    const last = bubbles(["one", "two", "three", "four", "five", "six"], box, { theirs: [ui.bubble, ui.ink], mine: [brand.color, onBrand] });
    if (last && last.x > box.x + 1) text("Delivered", W - PAD_X, last.y + last.h + 36, { family: "sans", weight: 400, size: 24 }, ui.muted, { anchor: "end" });
  } else if (layout === "friend-recommends") {
    // a messaging app: the friend's name in the bar, a tinted wallpaper, white and tinted bubbles with times and ticks
    const wall = mix(input.paper === "dark" ? "#0B0B0C" : "#FFFFFF", brand.color, input.paper === "dark" ? 0.14 : 0.12);
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: H, fill: wall });
    for (let y = 60; y < H; y += 120) for (let x = (y / 120) % 2 ? 60 : 120; x < W; x += 120) nodes.push(dot(x, y, 6, ui.ink, 0.05));
    const headH = 160;
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: top + headH, fill: ui.bar });
    chevron(PAD_X, top + headH / 2, accent);
    const name = word("name");
    const ax = PAD_X + 92;
    nodes.push(dot(ax, top + headH / 2, 44, brand.color));
    if (name) {
      const faded = name.sample ? SAMPLE_FADE : undefined;
      text(initialOf(name.text), ax, top + headH / 2 + 15, { family: "sans", weight: 600, size: 40 }, onBrand, { anchor: "middle", opacity: faded });
      text(name.text, ax + 66, top + headH / 2 - 6, { family: "sans", weight: 600, size: 36 }, ui.ink, { room: W - PAD_X - (ax + 66) - 90, opacity: faded });
    }
    text("online", ax + 66, top + headH / 2 + 38, { family: "sans", weight: 400, size: 26 }, ui.muted);
    const cam = W - PAD_X - 64;
    nodes.push({ type: "path", d: roundRect(cam, top + headH / 2 - 20, 44, 40, 8), stroke: accent, strokeWidth: 4 }, { type: "path", d: `M${cam + 48} ${top + headH / 2 - 6}l16 -10v32l-16 -10z`, fill: accent });
    const pillY = top + headH + 30;
    nodes.push({ type: "rect", x: W / 2 - 70, y: pillY, width: 140, height: 50, rx: 25, fill: ui.screen, opacity: 0.92 });
    text("Today", W / 2, pillY + 34, { family: "sans", weight: 600, size: 24 }, ui.muted, { anchor: "middle" });
    const barH = 110;
    nodes.push({ type: "rect", x: 0, y: bottom - barH, width: W, height: H - (bottom - barH), fill: ui.bar });
    const midBar = bottom - barH / 2;
    nodes.push({ type: "path", d: `M${PAD_X + 18} ${midBar - 16}v32M${PAD_X + 2} ${midBar}h32`, stroke: accent, strokeWidth: 4 });
    nodes.push({ type: "rect", x: PAD_X + 66, y: midBar - 34, width: W - 2 * PAD_X - 66 - 96, height: 68, rx: 34, fill: ui.screen });
    text("Message", PAD_X + 96, midBar + 10, { family: "sans", weight: 400, size: 28 }, ui.muted);
    nodes.push(dot(W - PAD_X - 34, midBar, 34, brand.color));
    const mine = input.paper === "dark" ? mix("#1C1C1E", brand.color, 0.4) : mix("#FFFFFF", brand.color, 0.2);
    const box: Box = { x: PAD_X - 24, y: pillY + 50 + 32, w: W - 2 * (PAD_X - 24), h: bottom - barH - 32 - (pillY + 50 + 32) };
    bubbles(["one", "two", "three", "four", "five", "six"], box, {
      theirs: [ui.screen, ui.ink],
      mine: [mine, ui.ink],
      meta: (i) => `9:${String(37 + i).padStart(2, "0")}`,
      tick: contrastRatio("#0EA5E9", mine) >= 2.4 ? "#0EA5E9" : ui.muted,
    });
  } else if (layout === "ai-chat") {
    // an assistant's chat: the question in a grey bubble on the right, the answer in plain type, the photo under it
    const headH = 130;
    const mid = top + headH / 2;
    nodes.push({ type: "path", d: `M${PAD_X} ${mid - 14}h40M${PAD_X} ${mid}h40M${PAD_X} ${mid + 14}h28`, stroke: ui.ink, strokeWidth: 5 });
    text("Assistant", W / 2 - 14, mid + 12, { family: "sans", weight: 600, size: 34 }, ui.ink, { anchor: "middle" });
    nodes.push({ type: "path", d: `M${W / 2 + 62} ${mid - 4}l9 9l9 -9`, stroke: ui.muted, strokeWidth: 4 });
    nodes.push({ type: "path", d: roundRect(W - PAD_X - 42, mid - 21, 42, 42, 12), stroke: ui.ink, strokeWidth: 4 });
    const barH = 92;
    const barY = bottom - 40 - barH;
    nodes.push({ type: "path", d: roundRect(PAD_X - 24, barY, W - 2 * PAD_X - 64, barH, barH / 2), stroke: ui.line, strokeWidth: 3 });
    nodes.push({ type: "path", d: `M${PAD_X + 14} ${barY + barH / 2 - 14}v28M${PAD_X} ${barY + barH / 2}h28`, stroke: ui.muted, strokeWidth: 4 });
    text("Ask anything", PAD_X + 56, barY + barH / 2 + 11, { family: "sans", weight: 400, size: 30 }, ui.muted, { room: w - 200 });
    nodes.push(dot(W - PAD_X - 8, barY + barH / 2, 44, ui.ink), { type: "path", d: `M${W - PAD_X - 24} ${barY + barH / 2 - 8}v16M${W - PAD_X - 8} ${barY + barH / 2 - 16}v32M${W - PAD_X + 8} ${barY + barH / 2 - 8}v16`, stroke: ui.screen, strokeWidth: 5 });
    const area: Box = { x: PAD_X, y: top + headH + 30, w, h: barY - 40 - (top + headH + 30) };
    const hasPhoto = !!input.picture?.trim();
    const picH = hasPhoto ? Math.round(Math.min(area.h * 0.36, w * 0.5)) : 0;
    const bubbleText = Math.floor((Math.round(w * 0.78) - 2 * 32) / SLACK);
    const p = fitFields(
      [
        ["question", { family: "sans", weight: 400, sizes: CHAT_SIZES, line: 1.3, fill: ui.ink, gap: 56, width: bubbleText }],
        ["lead", { family: "sans", weight: 600, sizes: CHAT_SIZES, line: 1.32, fill: ui.ink, gap: 22 }],
        ["answer", { family: "sans", weight: 400, sizes: CHAT_SIZES, line: 1.38, fill: ui.ink, gap: 0 }],
      ],
      w,
      area.h - 2 * 24 - (picH ? picH + 40 : 0),
    );
    let y = area.y;
    const q = p.question;
    if (q) {
      const qw = Math.round(Math.max(...q.lines.map((l) => measure(l, q.font))) * SLACK + 64);
      nodes.push({ type: "rect", x: W - PAD_X - qw + 24, y, width: qw, height: q.height + 48, rx: Math.min(44, Math.round((q.height + 48) / 2)), fill: ui.bubble });
      draw(q, W - PAD_X - qw + 24 + 32, y + 24);
      y += q.height + 48 + q.b.gap;
    }
    for (const it of [p.lead, p.answer]) if (it) y += draw(it, PAD_X, y) + it.b.gap;
    if (picH) photo({ x: PAD_X, y: y + 40, w: Math.round(picH * 1.33), h: picH }, "rounded");
  } else if (layout === "forum-thread") {
    // a forum post and the reply under it: names and times, the title in bold, vote and reply rows, a thread line
    const nameFont: FontSpec = { family: "sans", weight: 600, size: 28 };
    const meta = (key: string, ago: string, x: number, y: number, color: string) => {
      const v = word(key);
      nodes.push(dot(x + 28, y, 28, color));
      const nx = x + 72;
      const name = v ? v.text : "";
      text(name, nx, y + 10, nameFont, ui.ink, { room: W - PAD_X - nx - 140, opacity: v?.sample ? SAMPLE_FADE : undefined });
      const at = nx + Math.min(measure(name, nameFont), W - PAD_X - nx - 140) + 30;
      nodes.push(dot(at - 15, y + 1, 4, ui.muted));
      text(ago, at, y + 10, { family: "sans", weight: 400, size: 28 }, ui.muted, { room: 100 });
      nodes.push(dot(W - PAD_X - 30, y, 5, ui.muted), dot(W - PAD_X - 15, y, 5, ui.muted), dot(W - PAD_X, y, 5, ui.muted));
    };
    const votes = (x: number, y: number, n: string, more: string[]) => {
      const font: FontSpec = { family: "sans", weight: 600, size: 26 };
      const down = Math.round(x + 60 + measure(n, font) * SLACK + 12);
      const pillW = down + 24 + 22 - x;
      nodes.push({ type: "path", d: roundRect(x, y, pillW, 60, 30), stroke: ui.line, strokeWidth: 3 });
      nodes.push({ type: "path", d: `M${x + 22} ${y + 38}l12 -14l12 14`, stroke: ui.ink, strokeWidth: 4 });
      text(n, x + 60, y + 40, font, ui.ink);
      nodes.push({ type: "path", d: `M${down} ${y + 24}l12 14l12 -14`, stroke: ui.ink, strokeWidth: 4 });
      let at = x + pillW + 20;
      for (const m of more) {
        const mw = Math.round(measure(m, font) * SLACK + 48);
        nodes.push({ type: "path", d: roundRect(at, y, mw, 60, 30), stroke: ui.line, strokeWidth: 3 });
        text(m, at + 24, y + 40, font, ui.ink);
        at += mw + 16;
      }
    };
    const replyX = PAD_X + 72;
    const chrome = 56 + 28 + 60 + 48 + 56 + 28 + 60;
    const p = fitFields(
      [
        ["title", { family: "sans", weight: 600, sizes: [60, 56, 52, 48, 44, 40, 37, 34, 31, 28], line: 1.2, fill: ui.ink, gap: 18 }],
        ["body", { family: "sans", weight: 400, sizes: [44, 41, 38, 36, 34, 32, 30, 28, 26, 24, 22], line: 1.38, fill: ui.body, gap: chrome - 120 }],
        ["reply", { family: "sans", weight: 400, sizes: [44, 41, 38, 36, 34, 32, 30, 28, 26, 24, 22], line: 1.38, fill: ui.ink, gap: 0, width: W - PAD_X - replyX }],
      ],
      w,
      bottom - top - 2 * 64 - 120,
    );
    // the thread sits in the middle of the picture: its height is the words' plus the rows around them
    const used = 56 + (p.title ? p.title.height + p.title.b.gap : 0) + (p.body?.height ?? 0) + 28 + 108 + 84 + (p.reply?.height ?? 0) + 28 + 60;
    let y = top + Math.max(64, Math.round((bottom - top - used) / 2)) + 28;
    meta("asker", "12h", PAD_X, y, accent);
    y += 28 + 28;
    y += draw(p.title, PAD_X, y) + (p.title ? p.title.b.gap : 0);
    y += draw(p.body, PAD_X, y) + 28;
    votes(PAD_X, y, "588", ["24 replies", "Share"]);
    y += 60 + 48;
    const threadTop = y;
    meta("replier", "8h", PAD_X, y + 28, mix(brand.color, "#7C3AED", 0.5));
    y += 56 + 28;
    y += draw(p.reply, replyX, y) + 28;
    votes(replyX, y, "443", ["Reply"]);
    nodes.push({ type: "rect", x: PAD_X + 26, y: threadTop + 64, width: 4, height: Math.max(0, y + 60 - threadTop - 64), fill: ui.line });
  } else if (layout === "us-vs-them") {
    // a dark band with the headline, the photo, two labelled columns of paired rows, and the closing line on dark
    const dark = "#111111";
    const onDark = accentOnPaper(brand.color, dark);
    const stageH = bottom - top;
    const bandH = Math.round(stageH * 0.22);
    nodes.push({ type: "rect", x: 0, y: 0, width: W, height: top + bandH, fill: dark });
    const head = fit(block("headline", { family: fonts.title, weight: 600, sizes: [76, 70, 64, 58, 54, 50, 46, 42, 38], line: 1.12, fill: onDark, gap: 0 }), w, bandH - 72);
    draw(head[0], W / 2, top + Math.round((bandH - (head[0]?.height ?? 0)) / 2), { anchor: "middle" });
    let y = top + bandH;
    const hasPhoto = !!input.picture?.trim();
    const picH = hasPhoto ? Math.round(stageH * (size === "1x1" ? 0.2 : 0.24)) : 0;
    if (picH) photo({ x: 0, y, w: W, h: picH });
    y += picH;
    const closeH = Math.round(stageH * 0.13);
    nodes.push({ type: "rect", x: 0, y: bottom - closeH, width: W, height: H - (bottom - closeH), fill: dark });
    const close = fit(block("close", { family: fonts.title, weight: 600, sizes: [48, 44, 40, 37, 34, 31, 28], line: 1.15, fill: onDark, gap: 0 }), w, closeH - 40);
    draw(close[0], W / 2, bottom - closeH + Math.round((closeH - (close[0]?.height ?? 0)) / 2), { anchor: "middle" });
    // the column labels: theirs with a cross, yours with a tick
    const col = Math.round((w - 24) / 2);
    const rightX = PAD_X + col + 24;
    const pillH = 64;
    const py = y + 28;
    const label = (key: string, x: number, fill: string, ink: string, good: boolean) => {
      const v = word(key);
      const cx = x + col / 2;
      const font: FontSpec = { family: "sans", weight: 600, size: 30 };
      const t = v ? (measure(v.text, font) <= col - 120 ? v.text : ellipsize(v.text, col - 120, font, measure)) : "";
      const pw = Math.min(col, Math.round(measure(t, font) * SLACK + 116));
      nodes.push({ type: "rect", x: Math.round(cx - pw / 2), y: py, width: pw, height: pillH, rx: pillH / 2, fill });
      const ix = Math.round(cx - pw / 2 + 36);
      nodes.push(dot(ix, py + pillH / 2, 20, good ? "#16A34A" : "#DC2626"));
      nodes.push({ type: "path", d: good ? `M${ix - 9} ${py + pillH / 2}l6 7l12 -14` : `M${ix - 7} ${py + pillH / 2 - 7}l14 14M${ix + 7} ${py + pillH / 2 - 7}l-14 14`, stroke: "#FFFFFF", strokeWidth: 4 });
      if (t) nodes.push({ type: "text", x: ix + 32, y: py + pillH / 2 + 11, text: t, font, fill: ink, ...(v!.sample ? { opacity: SAMPLE_FADE } : {}) });
    };
    label("them", PAD_X, ui.bubble, ui.ink, false);
    label("us", rightX, brand.color, onBrand, true);
    y = py + pillH + 24;
    // three paired rows, one size for all six cells, each row as tall as its longer cell
    const rows = [["oldA", "newA"], ["oldB", "newB"], ["oldC", "newC"]] as const;
    const room = bottom - closeH - 24 - y;
    const cellPad = 22;
    const cellW = col - 2 * cellPad;
    const cell = (key: string, s: number, fill: string, weight: 400 | 600) => {
      const b = block(key, { family: "sans", weight, sizes: [s], line: 1.25, fill, gap: 0 })[0];
      return b ? fitBlock(b, s, cellW, measure) : undefined;
    };
    const atSize = (s: number) => rows.map(([a, b]) => [cell(a, s, ui.muted, 400), cell(b, s, ui.ink, 600)] as const).filter(([l, r]) => l || r);
    const rowH = (pair: readonly (Fitted | undefined)[]) => Math.max(...pair.map((c) => c?.height ?? 0)) + 2 * cellPad;
    const total = (rs: ReturnType<typeof atSize>) => rs.reduce((h, r) => h + rowH(r) + 12, 0);
    const sizes = [40, 37, 34, 32, 30, 28, 26, 24, 22];
    let fitted = atSize(sizes[0]);
    for (const s of sizes) if (total((fitted = atSize(s))) <= room) break;
    // still too tall at the smallest size: the longest cell loses its last line into "…"
    while (total(fitted) > room) {
      const long = fitted.flat().filter((c): c is Fitted => !!c && c.lines.length > 1).sort((x, y) => y.height - x.height)[0];
      if (!long) break;
      overflow = true;
      long.lines = long.lines.slice(0, -1);
      long.lines[long.lines.length - 1] = ellipsize(long.lines[long.lines.length - 1], cellW, long.font, measure);
      long.height = long.lines.length * long.lineHeight;
    }
    const tint = mix(ui.screen, brand.color, 0.12);
    for (const [left, right] of fitted) {
      const rh = rowH([left, right]);
      nodes.push({ type: "rect", x: PAD_X - 16, y, width: col + 16, height: rh, rx: 16, fill: ui.bar }, { type: "rect", x: rightX, y, width: col + 16, height: rh, rx: 16, fill: tint });
      draw(left, PAD_X + col / 2, y + cellPad + Math.round((rh - 2 * cellPad - (left?.height ?? 0)) / 2), { anchor: "middle" });
      draw(right, rightX + col / 2, y + cellPad + Math.round((rh - 2 * cellPad - (right?.height ?? 0)) / 2), { anchor: "middle" });
      y += rh + 12;
    }
  } else {
    // news-headline: the photo full bleed, a round badge, the headline in capitals, white and yellow, on a dark fade
    // that is solid from the headline's first line down, so it reads on any photo
    const href = input.picture?.trim();
    if (href) nodes.push({ type: "image", x: 0, y: 0, width: W, height: H, href, shape: "square" });
    else nodes.push({ type: "rect", x: 0, y: 0, width: W, height: H, fill: brand.color });
    const badgeR = 104;
    const bx = PAD_X + badgeR;
    const by = top + 48 + badgeR;
    const boxTop = Math.max(by + badgeR + 40, top + Math.round((bottom - top) * 0.36));
    const room = bottom - 64 - 56 - boxTop;
    const head = fit(block("headline", { family: "sans", weight: 600, sizes: [116, 106, 98, 90, 82, 74, 66, 60, 54, 48, 44], line: 1.04, fill: "#FFFFFF", gap: 0 }, true), w, room);
    const headTop = bottom - 64 - 56 - (head[0]?.height ?? 0);
    const fadeTop = Math.max(0, headTop - 380);
    nodes.push({ type: "fade", x: 0, y: fadeTop, width: W, height: headTop - fadeTop, color: "#000000", opacity: 0.82 }, { type: "rect", x: 0, y: headTop, width: W, height: H - headTop, fill: "#000000", opacity: 0.82 });
    nodes.push(dot(bx, by, badgeR, "#DC2626"));
    const badge = fit(block("badge", { family: "sans", weight: 600, sizes: [46, 42, 38, 34, 31, 28, 26], line: 1.05, fill: "#FFFFFF", gap: 0 }, true), 2 * badgeR - 48, 2 * badgeR - 70);
    draw(badge[0], bx, by - Math.round((badge[0]?.height ?? 0) / 2), { anchor: "middle" });
    const foot = word("footer");
    if (foot) text(foot.text.toUpperCase(), PAD_X, bottom - 64, { family: "sans", weight: 600, size: 28 }, "#FFFFFF", { opacity: foot.sample ? SAMPLE_FADE : 0.85 });
    draw(head[0], PAD_X, headTop, { fill: (i) => (i % 2 ? "#FACC15" : "#FFFFFF") });
  }

  return { width: W, height: H, background: ui.screen, nodes, overflow };
}
