// Slideshow model (/slideshow): photo slides with free text boxes, the one slideshow format in phase 1
// (docs/north-star/items/edit-slideshow.md). Everything here is pure apart from load and save; drawing and
// export live in slideshowDraw.ts.
//   synced: content-studio-slideshows-${scoped(userId)}, newest 20, sanitized on read
//   device hint: cs-slideshow-style, the last text style used

import { scoped } from "@/lib/profiles";
import { MAX_SLIDES, MIN_SLIDES, SLIDE_IMAGE_KEY, splitDraftIntoSlides } from "@/lib/carousel";
import { newDraftId, type DraftEntry } from "@/lib/draftHistory";

export type BoxFont = "heavy" | "clean" | "serif";
export type BoxBg = "white" | "none" | "bar";
export type ShowSize = "1x1" | "4x5" | "3x4" | "9x16";

export interface TextBox {
  id: string;
  /** At most 400 characters. */
  text: string;
  /** Centre and width as shares of the frame. */
  x: number;
  y: number;
  w: number;
  font: BoxFont;
  /** Pixels on the 1080-wide frame. */
  size: number;
  color: string;
  stroke: number;
  strokeColor: string;
  bg: BoxBg;
}

export interface ShowSlide {
  id: string;
  /** A cimg- device key (deviceFiles.ts): the picture on the device that added it. */
  image?: string;
  /** A Pexels pick, synced so another device can fetch it again. */
  photo?: { src: string; by: string; byUrl: string };
  /** At most 6. */
  boxes: TextBox[];
}

export interface Slideshow {
  id: string;
  title: string;
  size: ShowSize;
  overlay: { darken: number; mark: "off" | "handle" | "logo" };
  /** 2 to 10. */
  slides: ShowSlide[];
  draftId?: string;
  updatedAt: string;
}

export const FRAME_W = 1080;
export const SIZES: Record<ShowSize, { label: string; h: number }> = {
  "1x1": { label: "1:1", h: 1080 },
  "4x5": { label: "4:5", h: 1350 },
  "3x4": { label: "3:4", h: 1440 },
  "9x16": { label: "9:16", h: 1920 },
};
export const frameHeight = (size: ShowSize) => SIZES[size].h;
export const FONT_LABELS: Record<BoxFont, string> = { heavy: "Heavy", clean: "Clean", serif: "Serif" };
export const BG_LABELS: Record<BoxBg, string> = { white: "White", none: "None", bar: "Dark bar" };

export const MAX_BOXES = 6;
export const MAX_BOX_CHARS = 400;
export const MAX_SHOWS = 20;
export const MAX_HISTORY = 20;
export const SIZE_MIN = 16;
export const SIZE_MAX = 160;
export const STROKE_MAX = 12;
export const W_MIN = 0.2;
export const DARKEN_MAX = 0.8;
export { MAX_SLIDES, MIN_SLIDES };

export type BoxStyle = Pick<TextBox, "font" | "size" | "color" | "stroke" | "strokeColor" | "bg">;
export const STYLE_KEYS = ["font", "size", "color", "stroke", "strokeColor", "bg"] as const;
export const DEFAULT_STYLE: BoxStyle = { font: "clean", size: 48, color: "#111111", stroke: 0, strokeColor: "#FFFFFF", bg: "white" };
export const NEW_WORDS = "Your words here";

const HEX = /^#[0-9a-f]{6}$/i;
const PEXELS_PHOTO = /^https:\/\/images\.pexels\.com\//;
const PEXELS_PAGE = /^https:\/\/(www\.)?pexels\.com\//;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

let seq = 0;
/** Short ids, unique within a session even when made in the same millisecond. */
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A box with every number inside its range. */
export function clampBox(b: TextBox): TextBox {
  return {
    ...b,
    text: b.text.slice(0, MAX_BOX_CHARS),
    x: clamp(b.x, 0, 1),
    y: clamp(b.y, 0, 1),
    w: clamp(b.w, W_MIN, 1),
    size: Math.round(clamp(b.size, SIZE_MIN, SIZE_MAX)),
    stroke: Math.round(clamp(b.stroke, 0, STROKE_MAX)),
  };
}

export function makeBox(text: string, o: Partial<TextBox> = {}): TextBox {
  return clampBox({ id: newId("b"), text, x: 0.5, y: 0.5, w: 0.84, ...DEFAULT_STYLE, ...o });
}

/** Only the style keys of `o`, each one valid; text, place and id never come through. */
export function styleOf(o: Partial<Record<string, unknown>>): Partial<BoxStyle> {
  const out: Partial<BoxStyle> = {};
  if (o.font === "heavy" || o.font === "clean" || o.font === "serif") out.font = o.font;
  if (typeof o.size === "number" && Number.isFinite(o.size)) out.size = Math.round(clamp(o.size, SIZE_MIN, SIZE_MAX));
  if (typeof o.color === "string" && HEX.test(o.color)) out.color = o.color;
  if (typeof o.stroke === "number" && Number.isFinite(o.stroke)) out.stroke = Math.round(clamp(o.stroke, 0, STROKE_MAX));
  if (typeof o.strokeColor === "string" && HEX.test(o.strokeColor)) out.strokeColor = o.strokeColor;
  if (o.bg === "white" || o.bg === "none" || o.bg === "bar") out.bg = o.bg;
  return out;
}

const slideWith = (texts: { text: string; y: number; size: number }[], style: Partial<BoxStyle>): ShowSlide => ({
  id: newId("s"),
  boxes: texts.filter((t) => t.text.trim()).map((t) => makeBox(t.text, { ...style, size: t.size, y: t.y })),
});

/** Two slides with one box each. `style` is the last style used (its size is left out). */
export function blankSlideshow(style: Partial<BoxStyle> = {}, now = new Date()): Slideshow {
  const { size: _size, ...look } = style;
  return {
    id: newId("ss"),
    title: "Slideshow",
    size: "4x5",
    overlay: { darken: 0.2, mark: "off" },
    slides: [slideWith([{ text: NEW_WORDS, y: 0.5, size: 60 }], look), slideWith([{ text: NEW_WORDS, y: 0.5, size: 48 }], look)],
    updatedAt: now.toISOString(),
  };
}

/**
 * A post split the way /carousel splits it (the hook stands in as the cover when the text has none): a cover,
 * one slide per point and the call to action, no pictures. `style` is the last style used.
 */
export function fromPost(text: string, o: { hook?: string; style?: Partial<BoxStyle>; now?: Date } = {}): Slideshow {
  const { style = {}, now = new Date() } = o;
  const { slides } = splitDraftIntoSlides(text, { hook: o.hook });
  if (slides.length < MIN_SLIDES) return blankSlideshow(style, now);
  const { size: _size, ...look } = style;
  const made = slides.map((s, i) =>
    i === 0
      ? slideWith([{ text: s.title.slice(0, MAX_BOX_CHARS), y: s.body ? 0.42 : 0.5, size: 60 }, { text: s.body.slice(0, MAX_BOX_CHARS), y: 0.62, size: 40 }], look)
      : s.title && s.body
        ? slideWith([{ text: s.title.slice(0, MAX_BOX_CHARS), y: 0.3, size: 52 }, { text: s.body.slice(0, MAX_BOX_CHARS), y: 0.56, size: 40 }], look)
        : slideWith([{ text: (s.title || s.body).slice(0, MAX_BOX_CHARS), y: 0.5, size: 48 }], look),
  );
  return { ...blankSlideshow(style, now), title: (slides[0].title || "Slideshow").slice(0, 120), slides: made.slice(0, MAX_SLIDES) };
}

// ---- Slide and box edits: each returns a new slideshow, or the same one when the edit isn't allowed ----

const freshSlide = (s: ShowSlide): ShowSlide => ({ ...s, id: newId("s"), boxes: s.boxes.map((b) => ({ ...b, id: newId("b") })) });

export function addSlide(s: Slideshow, after: number, style: Partial<BoxStyle> = {}): Slideshow {
  if (s.slides.length >= MAX_SLIDES) return s;
  const slides = [...s.slides];
  slides.splice(clamp(after + 1, 0, slides.length), 0, slideWith([{ text: NEW_WORDS, y: 0.5, size: style.size ?? 48 }], style));
  return { ...s, slides };
}

export function duplicateSlide(s: Slideshow, i: number): Slideshow {
  if (s.slides.length >= MAX_SLIDES || !s.slides[i]) return s;
  const slides = [...s.slides];
  slides.splice(i + 1, 0, freshSlide(s.slides[i]));
  return { ...s, slides };
}

export function deleteSlide(s: Slideshow, i: number): Slideshow {
  if (s.slides.length <= MIN_SLIDES || !s.slides[i]) return s;
  return { ...s, slides: s.slides.filter((_, k) => k !== i) };
}

export function moveSlide(s: Slideshow, i: number, delta: -1 | 1): Slideshow {
  const j = i + delta;
  if (!s.slides[i] || j < 0 || j >= s.slides.length) return s;
  const slides = [...s.slides];
  [slides[i], slides[j]] = [slides[j], slides[i]];
  return { ...s, slides };
}

export function changeSlide(s: Slideshow, slideId: string, fn: (slide: ShowSlide) => ShowSlide): Slideshow {
  return { ...s, slides: s.slides.map((x) => (x.id === slideId ? fn(x) : x)) };
}

export function addBox(s: Slideshow, slideId: string, box: TextBox): Slideshow {
  return changeSlide(s, slideId, (x) => (x.boxes.length >= MAX_BOXES ? x : { ...x, boxes: [...x.boxes, clampBox(box)] }));
}

export function changeBox(s: Slideshow, slideId: string, boxId: string, patch: Partial<Omit<TextBox, "id">>): Slideshow {
  return changeSlide(s, slideId, (x) => ({ ...x, boxes: x.boxes.map((b) => (b.id === boxId ? clampBox({ ...b, ...patch }) : b)) }));
}

export function deleteBox(s: Slideshow, slideId: string, boxId: string): Slideshow {
  return changeSlide(s, slideId, (x) => ({ ...x, boxes: x.boxes.filter((b) => b.id !== boxId) }));
}

/** "Apply to all text boxes": the style keys in `patch` on every box of every slide; the words stay. */
export function applyToAll(s: Slideshow, patch: Partial<Record<string, unknown>>): Slideshow {
  const style = styleOf(patch);
  return { ...s, slides: s.slides.map((x) => ({ ...x, boxes: x.boxes.map((b) => ({ ...b, ...style })) })) };
}

export const pickStyle = (b: TextBox): BoxStyle => ({ font: b.font, size: b.size, color: b.color, stroke: b.stroke, strokeColor: b.strokeColor, bg: b.bg });

/** Every word on the slides, slide by slide: the caption a saved slideshow gets. */
export const slideWords = (s: Slideshow) =>
  s.slides
    .map((x) => x.boxes.map((b) => b.text.trim()).filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

/** The draft Save to My posts writes: to every network a slideshow is a photo carousel. */
export function slideshowToDraft(s: Slideshow, now: string): DraftEntry {
  return {
    id: s.draftId ?? newDraftId(),
    createdAt: now,
    hook: s.title,
    draft: slideWords(s),
    pillar: "topic",
    pillarDetail: s.title,
    audience: "general",
    format: "carousel",
    platform: s.size === "9x16" ? "tiktok" : "instagram",
    ctaType: "save-share",
    status: "draft",
  };
}

// ---- Undo: in memory, 20 steps. Typing and sliders on one control within a second are one step. ----

export interface History {
  past: Slideshow[];
  future: Slideshow[];
  tag?: string;
  at?: number;
}
export const emptyHistory = (): History => ({ past: [], future: [] });

/** Records `before` as an undo step, unless it continues the last step (same tag within a second). */
export function remember(h: History, before: Slideshow, tag?: string, now = Date.now()): History {
  if (tag && tag === h.tag && h.at !== undefined && now - h.at < 1000) return { ...h, future: [], at: now };
  return { past: [...h.past, before].slice(-MAX_HISTORY), future: [], tag, at: now };
}

export function undo(h: History, current: Slideshow): { h: History; show: Slideshow } | null {
  const show = h.past[h.past.length - 1];
  return show ? { h: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, MAX_HISTORY) }, show } : null;
}

export function redo(h: History, current: Slideshow): { h: History; show: Slideshow } | null {
  const show = h.future[0];
  return show ? { h: { past: [...h.past, current].slice(-MAX_HISTORY), future: h.future.slice(1) }, show } : null;
}

// ---- Sanitize, load and save ----

function sanitizeBox(raw: unknown): TextBox | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const style = styleOf(r);
  // a box whose font or colours didn't survive is dropped, not guessed at
  if (!style.font || !style.color || (r.strokeColor !== undefined && !style.strokeColor)) return null;
  return clampBox({
    ...DEFAULT_STYLE,
    ...style,
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : newId("b"),
    text: typeof r.text === "string" ? r.text : "",
    x: num(r.x, 0.5),
    y: num(r.y, 0.5),
    w: num(r.w, 0.84),
  });
}

function sanitizePhoto(raw: unknown): ShowSlide["photo"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.src !== "string" || !PEXELS_PHOTO.test(r.src)) return undefined;
  return { src: r.src, by: typeof r.by === "string" ? r.by.slice(0, 80) : "", byUrl: typeof r.byUrl === "string" && PEXELS_PAGE.test(r.byUrl) ? r.byUrl : "" };
}

function sanitizeSlide(raw: unknown): ShowSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const photo = sanitizePhoto(r.photo);
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : newId("s"),
    ...(typeof r.image === "string" && SLIDE_IMAGE_KEY.test(r.image) ? { image: r.image } : {}),
    ...(photo ? { photo } : {}),
    boxes: (Array.isArray(r.boxes) ? r.boxes : []).map(sanitizeBox).filter((b): b is TextBox => !!b).slice(0, MAX_BOXES),
  };
}

export function sanitizeSlideshow(raw: unknown): Slideshow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || !Array.isArray(r.slides)) return null;
  const slides = r.slides.map(sanitizeSlide).filter((s): s is ShowSlide => !!s).slice(0, MAX_SLIDES);
  if (!slides.length) return null;
  while (slides.length < MIN_SLIDES) slides.push({ id: newId("s"), boxes: [] });
  const o = (r.overlay ?? {}) as Record<string, unknown>;
  return {
    id: r.id.slice(0, 40),
    title: typeof r.title === "string" && r.title.trim() ? r.title.slice(0, 120) : "Slideshow",
    size: typeof r.size === "string" && r.size in SIZES ? (r.size as ShowSize) : "4x5",
    overlay: { darken: clamp(num(o.darken, 0), 0, DARKEN_MAX), mark: o.mark === "handle" || o.mark === "logo" ? o.mark : "off" },
    slides,
    ...(typeof r.draftId === "string" && r.draftId ? { draftId: r.draftId } : {}),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

export function sanitizeSlideshows(raw: unknown): Slideshow[] {
  return (Array.isArray(raw) ? raw : []).map(sanitizeSlideshow).filter((s): s is Slideshow => !!s).slice(0, MAX_SHOWS);
}

const PREFIX = "content-studio-slideshows-";
const STYLE_KEY = "cs-slideshow-style";
const CHANGED = "content-studio-slideshows-changed";

/** Calls `cb` whenever a slideshow is saved or removed on this device (the editor, or a job outside React). */
export function onSlideshowsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSlideshows(userId: string | null | undefined): Slideshow[] {
  if (!userId) return [];
  try {
    return sanitizeSlideshows(JSON.parse(storage()?.getItem(PREFIX + scoped(userId)) ?? "[]"));
  } catch {
    return [];
  }
}

function write(userId: string, list: Slideshow[]): Slideshow[] {
  try {
    storage()?.setItem(PREFIX + scoped(userId), JSON.stringify(list));
  } catch {
    // storage full or blocked: the list still shows for this visit
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return list;
}

/** Saves (or replaces) one slideshow, newest first, keeping the latest 20. */
export function saveSlideshow(userId: string, s: Slideshow, now = new Date()): Slideshow[] {
  return write(userId, [{ ...s, updatedAt: now.toISOString() }, ...loadSlideshows(userId).filter((x) => x.id !== s.id)].slice(0, MAX_SHOWS));
}

export function removeSlideshow(userId: string, id: string): Slideshow[] {
  return write(userId, loadSlideshows(userId).filter((x) => x.id !== id));
}

/** The last text style used on this device (cs-slideshow-style), or nothing. */
export function loadStyleHint(): Partial<BoxStyle> {
  try {
    return styleOf(JSON.parse(storage()?.getItem(STYLE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveStyleHint(style: BoxStyle): void {
  try {
    storage()?.setItem(STYLE_KEY, JSON.stringify(style));
  } catch {
    // a hint only: skip when storage is blocked
  }
}

/** "just now", "5 min ago", "2 hr ago", "3 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
