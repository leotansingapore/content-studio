// Carousel maker: turns a finished post into 5 to 10 slides (a cover hook, one
// point per slide, a closing call to action) plus the consultant's brand.
// Pure text logic, tested in carousel.test.ts. Slide drawing lives in
// carouselLayout.ts (pure) and carouselRender.ts (browser only).

import { toPlainText } from "@/lib/plainText";
import { splitScriptCaption } from "@/lib/scriptCaption";
import type { DraftEntry } from "@/lib/draftHistory";
import { scoped } from "@/lib/profiles";

export const MAX_SLIDES = 10;
export const MIN_SLIDES = 2;
/** Cover + points + CTA must fit in MAX_SLIDES. */
export const MAX_POINTS = MAX_SLIDES - 2;
/** Fewer points than this and the post is too short for a carousel. */
export const MIN_POINTS = 2;
/** Carousels read best at 5+ slides, so short drafts are split to 3 points when they can be. */
const TARGET_POINTS = 3;
export const WORDS_PER_SLIDE = 40;
export const TITLE_WORDS = 12;
export const COVER_WORDS = 20;
/** Paragraphs shorter than this join their neighbour instead of taking a slide alone. */
const SHORT_PARAGRAPH_WORDS = 8;

export interface Slide {
  id: string;
  title: string;
  body: string;
  /** Key of a picture kept on this device (deviceFiles.ts), shown above the text. */
  image?: string;
}

/** Device file keys for slide pictures look like this; anything else is ignored. */
export const SLIDE_IMAGE_KEY = /^cimg-[a-z0-9]{6,30}$/;

export type SlideRole = "cover" | "point" | "cta";

/** A slide's template comes from its position: first is the cover, last is the CTA. */
export function slideRole(index: number, total: number): SlideRole {
  if (index === 0) return "cover";
  if (index === total - 1) return "cta";
  return "point";
}

export const DEFAULT_CTA = {
  title: "Found this useful?",
  body: "Save it for later and share it with someone who needs it.",
};

// ---- Words and sentences ------------------------------------------------------

export function countWords(text: string): number {
  const t = String(text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

const ABBREVIATION = /\b(e\.g|i\.e|vs|p\.a|approx|mr|mrs|ms|dr)\.(?=\s)/gi;
/** Control characters used as markers while splitting; never in real text. */
const DOT = "\u0001";
const BREAK = "\u0000";

/** Splits at . ! ? or … followed by whitespace, so "S$1.5k" and "e.g. this" stay whole. */
export function splitSentences(text: string): string[] {
  return String(text ?? "")
    .replace(ABBREVIATION, (m) => `${m.slice(0, -1)}${DOT}`)
    .replace(/([.!?…]+["'”’)\]]*)\s+/g, `$1${BREAK}`)
    .split(BREAK)
    .map((s) => s.split(DOT).join(".").trim())
    .filter(Boolean);
}

/** Shortens to at most `max` words, at a sentence end when that keeps most of the text. */
export function capWords(text: string, max: number): string {
  const clean = String(text ?? "").replace(/[ \t]+/g, " ").trim();
  if (countWords(clean) <= max) return clean;
  const kept: string[] = [];
  let n = 0;
  for (const sentence of splitSentences(clean)) {
    const w = countWords(sentence);
    if (n + w > max) break;
    kept.push(sentence);
    n += w;
  }
  if (kept.length && n >= max / 2) return kept.join(" ");
  return `${clean.split(/\s+/).slice(0, max).join(" ").replace(/[,;:\-–—]+$/, "")}…`;
}

/** Splits text into pieces of at most `max` words, breaking between sentences. */
export function chunkByWords(text: string, max: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let n = 0;
  const push = () => {
    if (current.length) chunks.push(current.join(" "));
    current = [];
    n = 0;
  };
  for (const sentence of splitSentences(text)) {
    const words = sentence.split(/\s+/);
    if (words.length > max) {
      push();
      for (let i = 0; i < words.length; i += max) chunks.push(words.slice(i, i + max).join(" "));
      continue;
    }
    if (n + words.length > max) push();
    current.push(sentence);
    n += words.length;
  }
  push();
  return chunks;
}

// ---- Reading the draft --------------------------------------------------------

const HASHTAG = "#[\\p{L}_][\\p{L}\\p{N}_]*";
const HASHTAG_LINE = new RegExp(`^(?:${HASHTAG}[\\s,]*)+$`, "u");
const TRAILING_HASHTAGS = new RegExp(`[ \\t]+${HASHTAG}(?:[ \\t]+${HASHTAG})*[ \\t]*$`, "gmu");
const STAGE_DIRECTION = /^(?:\[[^\]]*\]|\([^)]*\))$/;
const RULE_LINE = /^[-–—_*=•·~]{3,}$/;
const SLIDE_MARKER = /^(?:slide|page|card)\s*(\d{1,2})\s*(?:[:.)\-–—]\s*(.*))?$/i;
const LABEL_WORDS = "hook|cta|call[\\s-]to[\\s-]action|body|intro|outro";
/** "HOOK:", "Hook (0-3s):" or "[CTA]" at the start of a script line. */
const SCRIPT_LABEL = new RegExp(
  `^(?:\\[(${LABEL_WORDS})\\]\\s*:?|(${LABEL_WORDS})\\s*(?:\\([^)]*\\))?\\s*:)\\s*(.*)$`,
  "i",
);
/** "Title: ..." or "Text: ..." on a generated slide: the label goes, the text stays. */
const FIELD_LABEL = /^(?:title|headline|heading|sub-?heading|subtitle|text|sub-?text|copy|slide text|on-screen text)\s*:\s*(.*)$/i;
/** "Visual: ..." or "Image idea: ..." are notes for whoever designs the slide, not slide text. */
const DESIGN_NOTE = /^(?:visuals?|images?|graphics?|design|background|photo|icon|layout)(?:\s+(?:idea|note|suggestion|direction))?\s*:/i;
const LIST_ITEM =
  /^(?:(?:[•●▪◦‣*+-]|\d{1,2}[.)]|step\s+\d{1,2}\s*[:.\-–—])\s+|(?:\d️?⃣|[✅✔☑👉➡→▶🔹🔸📌💡⭐✨]️?)\s*)(.+)$/iu;
const CTA_PATTERN =
  /\b(dm|pm|message me|comment|follow|save (?:this|it)|share (?:this|it)|link in (?:my )?bio|book (?:a|your)|reach out|drop (?:me|a)|tag (?:a|someone)|let me know|whatsapp|click|sign up|download|get in touch|chat with me|talk to me|send me|text me|repost|bookmark)\b/i;

interface Block {
  text: string;
  kind: "para" | "item";
  label?: "hook" | "cta";
}

function endsSentence(text: string): boolean {
  return /[.!?…:;,]["'”’)]*$/.test(text) || /\p{Extended_Pictographic}️?$/u.test(text);
}

/** Joins the lines of one paragraph. A line that ends without punctuation before a capital gets a full stop. */
function joinLines(lines: string[]): string {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    const startsNew = /^[\p{Lu}\p{N}"“'‘]/u.test(line);
    return endsSentence(acc) || !startsNew ? `${acc} ${line}` : `${acc}. ${line}`;
  }, "");
}

function paragraphBlocks(lines: string[], label?: Block["label"]): Block[] {
  // "What I check:" followed by short unpunctuated lines is a list without bullets.
  const rest = lines.slice(1);
  if (
    !label &&
    lines.length >= 3 &&
    /:$/.test(lines[0]) &&
    rest.every((l) => countWords(l) <= 10 && !/[.!?]$/.test(l))
  ) {
    return [{ text: lines[0], kind: "para" }, ...rest.map((l) => ({ text: l, kind: "item" as const }))];
  }
  return [{ text: joinLines(lines), kind: "para", label }];
}

function labelKind(word: string): Block["label"] {
  const w = word.toLowerCase();
  if (w === "hook") return "hook";
  if (w === "cta" || w.startsWith("call")) return "cta";
  return undefined;
}

function isNoise(line: string): boolean {
  return HASHTAG_LINE.test(line) || STAGE_DIRECTION.test(line) || RULE_LINE.test(line);
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let label: Block["label"];
  const flush = () => {
    if (para.length) blocks.push(...paragraphBlocks(para, label));
    para = [];
    label = undefined;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (DESIGN_NOTE.test(line)) continue;
    const field = line.match(FIELD_LABEL);
    if (field) {
      flush();
      if (field[1].trim()) para.push(field[1].trim());
      flush();
      continue;
    }
    const labelled = line.match(SCRIPT_LABEL);
    if (labelled) {
      flush();
      label = labelKind(labelled[1] ?? labelled[2] ?? "");
      if (labelled[3]?.trim()) para.push(labelled[3].trim());
      continue;
    }
    if (isNoise(line)) continue;
    const item = line.match(LIST_ITEM);
    if (item) {
      flush();
      blocks.push({ text: item[1].trim(), kind: "item" });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function cleanLines(draft: string): string[] {
  // Short-video drafts end with a suggested caption that repeats the script.
  const { script, caption } = splitScriptCaption(String(draft ?? ""));
  return toPlainText(script ?? caption)
    .replace(TRAILING_HASHTAGS, "")
    .split("\n");
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The text after the hook when `text` opens with it, or null when it doesn't. */
function afterHook(text: string, hook: string): string | null {
  const h = normalise(hook);
  if (!h) return null;
  const sentences = splitSentences(text);
  for (let k = 1; k <= Math.min(3, sentences.length); k++) {
    const opening = normalise(sentences.slice(0, k).join(" "));
    if (opening === h || (h.length >= 12 && opening.startsWith(h))) {
      return sentences.slice(k).join(" ");
    }
    if (opening.length > h.length + 20) break;
  }
  return null;
}

function splitInHalf(text: string): [string, string] | null {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return null;
  const total = countWords(text);
  let best = 1;
  let bestGap = Infinity;
  let n = 0;
  for (let k = 1; k < sentences.length; k++) {
    n += countWords(sentences[k - 1]);
    const gap = Math.abs(n - total / 2);
    if (gap < bestGap) {
      bestGap = gap;
      best = k;
    }
  }
  const a = sentences.slice(0, best).join(" ");
  const b = sentences.slice(best).join(" ");
  return countWords(a) >= 5 && countWords(b) >= 5 ? [a, b] : null;
}

// ---- Slide text ---------------------------------------------------------------

// trailing punctuation goes, and quote marks wrapping the whole title ("Move #1: Top up early")
const tidyTitle = (s: string) => {
  const t = s.trim().replace(/[.:;,]+$/, "");
  const m = t.match(/^["“'‘](.+)["”'’]$/);
  return m && !/["“”]/.test(m[1]) ? m[1].trim() : t;
};
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Title and body for one point: a short opening sentence becomes the title. */
export function toSlideText(text: string): { title: string; body: string } {
  const clean = String(text ?? "").trim();
  if (!clean) return { title: "", body: "" };
  const newline = clean.indexOf("\n");
  if (newline > 0) {
    const first = clean.slice(0, newline).trim();
    if (countWords(first) <= TITLE_WORDS) {
      return { title: tidyTitle(first), body: clean.slice(newline + 1).trim() };
    }
  }
  const flat = clean.replace(/\s+/g, " ");
  const sentences = splitSentences(flat);
  if (sentences.length >= 2 && countWords(sentences[0]) <= TITLE_WORDS) {
    return { title: tidyTitle(sentences[0]), body: sentences.slice(1).join(" ") };
  }
  if (countWords(flat) <= TITLE_WORDS) return { title: tidyTitle(flat), body: "" };
  const labelled = flat.match(/^(.{2,60}?)(?::|\s[-–—])\s+(.+)$/);
  if (labelled && countWords(labelled[1]) <= 6) {
    return { title: tidyTitle(labelled[1]), body: capitalise(labelled[2]) };
  }
  return { title: "", body: flat };
}

function coverText(text: string): { title: string; body: string } {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (countWords(clean) <= COVER_WORDS) return { title: tidyTitle(clean), body: "" };
  const sentences = splitSentences(clean);
  const title: string[] = [];
  let n = 0;
  for (const s of sentences) {
    if (n + countWords(s) > COVER_WORDS) break;
    title.push(s);
    n += countWords(s);
  }
  if (!title.length) return { title: capWords(clean, COVER_WORDS), body: "" };
  return { title: tidyTitle(title.join(" ")), body: capWords(sentences.slice(title.length).join(" "), 30) };
}

// ---- Splitter -----------------------------------------------------------------

export interface SplitResult {
  slides: Slide[];
  /** Points found after the hook (before any were left out). */
  points: number;
  tooShort: boolean;
  /** Points left out because they didn't fit in MAX_SLIDES. */
  dropped: number;
  /** False when the draft had no closing call to action and DEFAULT_CTA was used. */
  ctaFromDraft: boolean;
}

interface Parts {
  cover: string;
  points: string[];
  cta: string;
}

function fromSlideMarkers(lines: string[]): Parts {
  const intro: string[] = [];
  const segments: string[][] = [];
  let current: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const marker = line.match(SLIDE_MARKER);
    if (marker) {
      current = [];
      segments.push(current);
      if (marker[2]?.trim()) current.push(marker[2].trim());
      continue;
    }
    (current ?? intro).push(line);
  }
  const texts = [intro, ...segments]
    .map((seg) =>
      parseBlocks(seg)
        .map((b) => (b.kind === "item" ? `• ${b.text}` : b.text))
        .join("\n"),
    )
    .filter(Boolean);
  const cover = texts.shift() ?? "";
  const last = texts[texts.length - 1];
  const cta = texts.length >= 2 && last && CTA_PATTERN.test(last) ? (texts.pop() as string) : "";
  // The draft marks its own slides: keep one slide per marker. A long one stays whole
  // (the editor flags it over the word count) rather than spilling its last sentence
  // onto a slide of its own.
  return { cover, points: texts, cta };
}

function fromBlocks(blocks: Block[], hook: string): Parts {
  let cover = "";
  const labelledHook = blocks.findIndex((b) => b.label === "hook");
  if (hook) {
    cover = hook;
    if (labelledHook >= 0) blocks.splice(labelledHook, 1);
    else if (blocks.length) {
      const rest = afterHook(blocks[0].text, hook);
      if (rest !== null) {
        if (rest) blocks[0] = { ...blocks[0], text: rest };
        else blocks.shift();
      }
    }
  } else if (labelledHook >= 0) {
    cover = blocks[labelledHook].text;
    blocks.splice(labelledHook, 1);
  } else if (blocks.length) {
    const first = blocks.shift() as Block;
    if (countWords(first.text) <= COVER_WORDS) cover = first.text;
    else {
      const sentences = splitSentences(first.text);
      cover = sentences[0];
      const rest = sentences.slice(1).join(" ");
      if (rest) blocks.unshift({ ...first, text: rest });
    }
  }

  let cta = "";
  let labelledCta = -1;
  blocks.forEach((b, i) => {
    if (b.label === "cta") labelledCta = i;
  });
  if (labelledCta >= 0) {
    cta = blocks[labelledCta].text;
    blocks.splice(labelledCta, 1);
  } else if (blocks.length) {
    const last = blocks[blocks.length - 1];
    if (CTA_PATTERN.test(last.text)) {
      if (last.kind === "item" || countWords(last.text) <= WORDS_PER_SLIDE) {
        cta = last.text;
        blocks.pop();
      } else {
        const sentences = splitSentences(last.text);
        const from = Math.max(0, sentences.findIndex((s) => CTA_PATTERN.test(s)));
        cta = sentences.slice(from).join(" ");
        const rest = sentences.slice(0, from).join(" ");
        if (rest) blocks[blocks.length - 1] = { ...last, text: rest };
        else blocks.pop();
      }
    }
  }

  const points: string[] = [];
  let pending = "";
  const flush = () => {
    if (pending) points.push(...chunkByWords(pending, WORDS_PER_SLIDE));
    pending = "";
  };
  blocks.forEach((b, i) => {
    if (b.kind === "item") {
      flush();
      points.push(...chunkByWords(b.text, WORDS_PER_SLIDE));
      return;
    }
    if (/:$/.test(b.text) && blocks[i + 1]?.kind === "item") {
      // A short "Here's how:" before a list is glue; a longer one introduces the list on its own slide.
      flush();
      if (countWords(b.text) > 5) points.push(b.text.replace(/:$/, ""));
      return;
    }
    const pendingWords = countWords(pending);
    const words = countWords(b.text);
    if (
      pending &&
      (pendingWords < SHORT_PARAGRAPH_WORDS || words < SHORT_PARAGRAPH_WORDS) &&
      pendingWords + words <= WORDS_PER_SLIDE
    ) {
      pending = `${pending} ${b.text}`;
      return;
    }
    flush();
    pending = b.text;
  });
  flush();
  return { cover, points, cta };
}

export function splitDraftIntoSlides(draft: string, opts: { hook?: string } = {}): SplitResult {
  const lines = cleanLines(draft);
  const hook = toPlainText(String(opts.hook ?? ""))
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const markerCount = lines.filter((l) => SLIDE_MARKER.test(l.trim())).length;
  const parts = markerCount >= 2 ? fromSlideMarkers(lines) : fromBlocks(parseBlocks(lines), hook);
  if (!parts.cover && hook) parts.cover = hook;

  const points = parts.points.filter((p) => p.trim());
  while (points.length > 0 && points.length < TARGET_POINTS) {
    let pick = -1;
    let most = 0;
    points.forEach((p, i) => {
      const w = countWords(p);
      if (w >= 14 && w > most && splitSentences(p).length >= 2) {
        pick = i;
        most = w;
      }
    });
    const halves = pick >= 0 ? splitInHalf(points[pick]) : null;
    if (!halves) break;
    points.splice(pick, 1, ...halves);
  }

  const found = points.length;
  if (!parts.cover && found === 0 && !parts.cta) {
    return { slides: [], points: 0, tooShort: true, dropped: 0, ctaFromDraft: false };
  }
  const kept = points.slice(0, MAX_POINTS);
  const slides: Slide[] = [
    { id: "slide-1", ...coverText(parts.cover) },
    ...kept.map((p, i) => ({ id: `slide-${i + 2}`, ...toSlideText(p) })),
  ];
  const cta = parts.cta ? toSlideText(capWords(parts.cta, WORDS_PER_SLIDE)) : DEFAULT_CTA;
  slides.push({ id: `slide-${slides.length + 1}`, ...cta });
  return {
    slides,
    points: found,
    tooShort: found < MIN_POINTS,
    dropped: Math.max(0, found - MAX_POINTS),
    ctaFromDraft: Boolean(parts.cta),
  };
}

// ---- Editing ------------------------------------------------------------------

export function moveSlide(slides: Slide[], index: number, delta: -1 | 1): Slide[] {
  const to = index + delta;
  if (index < 0 || index >= slides.length || to < 0 || to >= slides.length) return slides;
  const next = slides.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeSlide(slides: Slide[], index: number): Slide[] {
  if (slides.length <= MIN_SLIDES || index < 0 || index >= slides.length) return slides;
  return slides.filter((_, i) => i !== index);
}

/** Adds a point slide just before the closing CTA. */
export function addSlide(slides: Slide[], slide: Slide): Slide[] {
  if (slides.length >= MAX_SLIDES) return slides;
  const next = slides.slice();
  next.splice(slides.length >= 2 ? slides.length - 1 : slides.length, 0, slide);
  return next;
}

export function newSlideId(): string {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Applies rewritten copy slide-for-slide, keeping ids. Mismatched lengths change nothing. */
export function applyCopy(slides: Slide[], copy: { title: string; body: string }[]): Slide[] {
  if (copy.length !== slides.length) return slides;
  return slides.map((s, i) => ({ ...s, title: copy[i].title, body: copy[i].body }));
}

// ---- Files and sources --------------------------------------------------------

export function slugify(text: string, max = 40): string {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return slug || "carousel";
}

export function slideFileName(base: string, index: number): string {
  return `${slugify(base)}-${String(index + 1).padStart(2, "0")}.png`;
}

/** Drafts with written text; board ideas that only have a hook can't make slides. */
export function draftsWithText(drafts: DraftEntry[]): DraftEntry[] {
  return drafts.filter((d) => typeof d.draft === "string" && d.draft.trim().length > 0);
}

export function draftLabel(d: Pick<DraftEntry, "hook" | "draft">, max = 70): string {
  const base = String(d.hook || d.draft || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "Untitled post";
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

// ---- Brand --------------------------------------------------------------------

// The brand kit (My Playbook > Brand kit). One per profile; carousels, videos
// and copied posts all read it.
export interface CarouselBrand {
  color: string;
  name: string;
  handle: string;
  /** "Financial adviser": the video name tag's second line. */
  role?: string;
  /** Square headshot as a small JPEG data URL: carousel footers and the video end card. */
  photo?: string;
  /** Logo as a PNG/WebP data URL: the video watermark. */
  logo?: string;
  /** Sign-off added to the end of a post when it is copied: call to action, disclaimer, usual hashtags. */
  signOff?: string;
  /** Add UTM tracking to links when a post is copied. */
  tagLinks?: boolean;
  /** Weekly posting times, "<day 0 = Mon>T<HH:MM>": Write suggests the next open one. */
  slots?: string[];
}

export const BRAND_PRESETS: { name: string; color: string }[] = [
  { name: "Navy", color: "#1E3A8A" },
  { name: "Blue", color: "#2563EB" },
  { name: "Teal", color: "#0F766E" },
  { name: "Plum", color: "#6B21A8" },
  { name: "Red", color: "#B91C1C" },
  { name: "Charcoal", color: "#27272A" },
];

export const DEFAULT_BRAND: CarouselBrand = { color: BRAND_PRESETS[0].color, name: "", handle: "" };
export const MAX_NAME_CHARS = 40;
export const MAX_HANDLE_CHARS = 40;
export const MAX_ROLE_CHARS = 50;
export const MAX_SIGNOFF_CHARS = 600;
/** Encoded image cap: keeps a synced brand kit small. */
export const MAX_IMAGE_CHARS = 350_000;
export const BRAND_KEY_PREFIX = "content-studio-carousel-brand-";

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only a base64 PNG, JPEG or WebP data URL under the size cap; anything else is dropped. */
export function sanitizeImage(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length <= MAX_IMAGE_CHARS && IMAGE_DATA_URL.test(raw) ? raw : undefined;
}

export function normalizeHex(input: string): string | null {
  const m = String(input ?? "")
    .trim()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${hex.toUpperCase()}`;
}

/** "jane", "@jane" or an Instagram/TikTok URL -> "@jane". Other URLs are kept as typed. */
export function normalizeHandle(input: string): string {
  let h = String(input ?? "").trim().replace(/\s+/g, "");
  if (!h) return "";
  h = h.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  const social = h.match(/^(?:instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net)\/@?([^/?#]+)/i);
  if (social) h = social[1];
  if (!h.includes("/") && !h.startsWith("@")) h = `@${h}`;
  return h.slice(0, MAX_HANDLE_CHARS);
}

export function sanitizeBrand(raw: unknown, fallback: CarouselBrand = DEFAULT_BRAND): CarouselBrand {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    color: normalizeHex(String(r.color ?? "")) ?? fallback.color,
    name: typeof r.name === "string" ? r.name.slice(0, MAX_NAME_CHARS) : fallback.name,
    handle: typeof r.handle === "string" ? r.handle.slice(0, MAX_HANDLE_CHARS) : fallback.handle,
    role: typeof r.role === "string" ? r.role.slice(0, MAX_ROLE_CHARS) : fallback.role,
    photo: "photo" in r ? sanitizeImage(r.photo) : fallback.photo,
    logo: "logo" in r ? sanitizeImage(r.logo) : fallback.logo,
    signOff: typeof r.signOff === "string" ? r.signOff.slice(0, MAX_SIGNOFF_CHARS) : fallback.signOff,
    tagLinks: typeof r.tagLinks === "boolean" ? r.tagLinks : fallback.tagLinks,
    slots: Array.isArray(r.slots)
      ? [...new Set(r.slots.filter((x): x is string => typeof x === "string" && /^[0-6]T([01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort().slice(0, 14)
      : fallback.slots,
  };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved brand, or null when this user hasn't saved one. */
export function loadBrand(userId: string | null | undefined): CarouselBrand | null {
  const s = storage();
  if (!s || !userId) return null;
  try {
    const raw = s.getItem(BRAND_KEY_PREFIX + scoped(userId));
    return raw ? sanitizeBrand(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveBrand(userId: string, brand: CarouselBrand): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(BRAND_KEY_PREFIX + scoped(userId), JSON.stringify(sanitizeBrand(brand)));
  } catch {
    // storage full or blocked: the brand still applies for this visit
  }
}

// ---- Saved carousels -------------------------------------------------------------
// Carousels kept to come back to, per profile (synced like everything else):
//   key: content-studio-carousels-${scoped(userId)}

export interface SavedCarousel {
  /** "d:<draft id>" for one made from a post, "p:<time>" for pasted text. */
  id: string;
  title: string;
  platform: "instagram" | "linkedin";
  slides: Slide[];
  draftId?: string;
  align?: "left" | "center";
  scale?: number;
  font?: "classic" | "modern" | "serif";
  paper?: "light" | "dark" | "tint";
  updatedAt: string;
}

export const MAX_SAVED_CAROUSELS = 20;
const SAVED_KEY_PREFIX = "content-studio-carousels-";

function sanitizeSaved(raw: unknown): SavedCarousel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): SavedCarousel[] => {
    if (!c || typeof c !== "object") return [];
    const r = c as Record<string, unknown>;
    if (typeof r.id !== "string" || !Array.isArray(r.slides)) return [];
    const slides = r.slides
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({
        id: String(s.id ?? newSlideId()),
        title: String(s.title ?? ""),
        body: String(s.body ?? ""),
        ...(typeof s.image === "string" && SLIDE_IMAGE_KEY.test(s.image) ? { image: s.image } : {}),
      }))
      .slice(0, MAX_SLIDES);
    if (slides.length === 0) return [];
    return [{
      id: r.id,
      title: typeof r.title === "string" ? r.title.slice(0, 120) : "Carousel",
      platform: r.platform === "linkedin" ? "linkedin" : "instagram",
      slides,
      draftId: typeof r.draftId === "string" ? r.draftId : undefined,
      ...(r.align === "center" ? { align: "center" as const } : {}),
      ...(typeof r.scale === "number" && r.scale >= 0.8 && r.scale <= 1.25 ? { scale: r.scale } : {}),
      ...(r.font === "modern" || r.font === "serif" ? { font: r.font } : {}),
      ...(r.paper === "dark" || r.paper === "tint" ? { paper: r.paper } : {}),
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
    }];
  });
}

export function loadCarousels(userId: string | null | undefined): SavedCarousel[] {
  const s = storage();
  if (!s || !userId) return [];
  try {
    return sanitizeSaved(JSON.parse(s.getItem(SAVED_KEY_PREFIX + scoped(userId)) ?? "[]"));
  } catch {
    return [];
  }
}

/** Saves (or replaces) one carousel, newest first, keeping the latest 20. */
export function saveCarousel(userId: string, c: Omit<SavedCarousel, "updatedAt">, now = new Date()): SavedCarousel[] {
  const next = [{ ...c, updatedAt: now.toISOString() }, ...loadCarousels(userId).filter((x) => x.id !== c.id)].slice(0, MAX_SAVED_CAROUSELS);
  storage()?.setItem(SAVED_KEY_PREFIX + scoped(userId), JSON.stringify(next));
  return next;
}

export function removeCarousel(userId: string, id: string): SavedCarousel[] {
  const next = loadCarousels(userId).filter((x) => x.id !== id);
  storage()?.setItem(SAVED_KEY_PREFIX + scoped(userId), JSON.stringify(next));
  return next;
}
