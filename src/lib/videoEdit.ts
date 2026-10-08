// Video editor: the edit is data. A project is the source video (kept on the
// device), its word-timed transcript, and EditSettings; preview and export both
// draw from the same settings, and a "vibe edit" is a patch to them. Nothing
// here touches the DOM, so it is all unit-tested.
//
// Caption styles mirror Leo's talking-head-reel signatures (picked 2026-10-04):
// bold (Hormozi), cutout (Kallaway gold), minimal (Ali Abdaal pill), editorial,
// native (TikTok) and documentary.

import type { FaceBox, KeyLine } from "@/lib/videoMotion";
import { mergeSlivers, pauseCut } from "@/lib/cutRules";

export interface Word {
  w: string;
  s: number;
  e: number;
}

export type StyleId = "bold" | "cutout" | "minimal" | "editorial" | "native" | "documentary";
export type Aspect = "9:16" | "4:5" | "1:1" | "16:9" | "original";
/** fill = crop to the frame; blur = the whole picture over a blurred copy of itself (landscape podcasts in a vertical reel); framed = the whole picture in a rounded window on the brand colour (interview clips). */
export type Fit = "fill" | "blur" | "framed";
export type Position = "top" | "middle" | "bottom";

export interface EditSettings {
  style: StyleId;
  position: Position;
  /** Caption size, 0.6-1.6 times the style's own size. */
  size: number;
  /** Words shown at once (word mode) or characters per line (line mode) come from the style; this overrides words. */
  wordsPerCaption: number;
  baseColor: string;
  activeColor: string;
  uppercase: boolean;
  captions: boolean;
  hook: string;
  hookSeconds: number;
  removeFillers: boolean;
  /** Pauses longer than this many seconds are cut down. 0 = keep every pause. */
  maxPause: number;
  trimStart: number;
  trimEnd: number;
  aspect: Aspect;
  fit: Fit;
  /** Horizontal centre of the crop, 0 (left) to 1 (right). */
  focusX: number;
  /** The crop follows the face (faceTrack) instead of focusX. */
  followFace?: boolean;
  /** Where the face is across the source video, found on this device; kept when following is off so it comes straight back. */
  faceTrack?: FaceTrack;
  /** What shows behind the speaker: their own background blurred, a plain colour, or a picture on this device. Unset = as filmed. */
  backdrop?: Backdrop;
  /** Skin smoothed a little and eyes brightened, 0 to 1 (faceVision.ts). Unset or 0 = off. */
  touchUp?: number;
  punchIn: boolean;
  progressBar: boolean;
  grade: boolean;
  /** Numbers, $ and % words shown in the highlight colour and a touch bigger. */
  highlightNumbers: boolean;
  /** Lower-third name tag shown after the hook, e.g. "Leo Tan" / "Financial adviser". Empty = off. */
  nameTag: string;
  roleTag: string;
  nameSeconds: number;
  /** Captions dragged on the preview: vertical centre as a share of the frame height (overrides position). */
  captionY?: number;
  /** Second subtitle line under each caption: "" off, or zh / ms / ta (translations live on the project). */
  subLang: "" | "zh" | "ms" | "ta";
  /** Behind the captions: nothing, a dark box, or a highlight behind the word being said. Unset = the style's own. */
  captionBox?: CaptionBox;
  /** Caption typeface. Unset = the style's own. */
  font?: FontId;
  /** How captions and the hook card come in: pop, slide up, typewriter (words as they're said) or none. Unset = pop for word styles, none for line styles. */
  captionAnim?: CaptionAnim;
  /** Colour look over the style's grade (when grade is on). Unset = the style's own. */
  filter?: FilterId;
  /** What happens at each cut: a hard jump (unset), a quick dip through black, or a white flash. */
  transition?: "soft" | "flash";
  /** A voiceover recorded over the edit: its file on this device, where it starts on the edited timeline and how long it runs (seconds). */
  voiceover?: Voiceover;
  /** Volume of the filmed sound, 0 to 1. Unset = 1. */
  volume?: number;
  /** What Export makes: the video, a smaller video (for WhatsApp), or the sound only (for a podcast feed). Unset = video. */
  exportAs?: "video" | "small" | "audio";
  /** Which app the video is exported for, which sets its size; "small" above is WhatsApp. Unset = Instagram Reels. */
  exportFor?: ExportTarget;
  /** Playback speed, 1 to 1.5 (pitch kept). Unset = 1. */
  speed?: number;
  /** Voice polish: rumble and hum cut, clarity lifted, loudness evened out. */
  voicePolish?: boolean;
  /** Even out loudness to -14 LUFS with peaks under -1 dB, what Instagram and TikTok play at. */
  loudness?: boolean;
  /** The measurement behind it, taken in the browser from this video's sound. */
  level?: Level;
  /** Background music from the user's own file, under the voice. */
  music?: Music;
  /** Stickers placed on this video: text callouts, arrows, circles, underlines. */
  overlays?: Overlay[];
  /** Stretches cut by hand from the transcript, on the source timeline. */
  removed?: { s: number; e: number }[];
  /** Cuts the user reviewed and chose to keep (Cut ids from listCuts). */
  keepCuts?: string[];
  /** The brand kit logo in the top corner. */
  logo?: boolean;
  /** A closing card from the brand kit (photo, name, handle, sign-off line) after the last cut. */
  endCard?: boolean;
  /** B-roll cutaways: stock clips shown full-frame, muted, over stretches of the edit. */
  broll?: Broll[];
  /** Zoom in on the key lines Jev picked (motion) instead of punching in on alternate cuts. */
  keyZooms?: boolean;
  /** The key lines Jev picked, on the source timeline (videoMotion.ts). */
  motion?: { lines: KeyLine[] };
  /** A card in the brand colour counts up to each figure as it is said ($500, 4%, 3 in 10). */
  numberCards?: boolean;
  /** Where the face sits in the source picture, found on this device; null = looked, no face. Keeps cards clear of it. */
  faceBox?: FaceBox | null;
  /** A whoosh on cards, zooms and transitions and a pop on stickers, made on the device, under the voice. */
  sfx?: boolean;
  /** The music drops out for 2 s on the strongest key line. Unset = on, once key lines are picked. */
  musicDrop?: boolean;
  /** A one-line pop-up with an emoji on the top key lines. */
  popups?: boolean;
}

export const END_CARD_SECONDS = 2.5;

/** The edit's full length: what is left after the cuts, plus the end card when it is on and there is a brand to show. */
export function fullLength(total: number, s: Pick<EditSettings, "endCard">, hasBrand: boolean): number {
  return total + (s.endCard && hasBrand ? END_CARD_SECONDS : 0);
}

/** The end card's call to action: the sign-off's first line that isn't only hashtags. */
export function endCardLine(signOff: string | undefined): string {
  const line = (signOff ?? "").split("\n").map((l) => l.trim()).find((l) => l && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(l)) ?? "";
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}...` : line;
}

interface StyleSpec {
  label: string;
  mode: "words" | "line";
  n: number;
  chars: number;
  font: string;
  weight: number;
  base: string;
  active: string;
  uppercase: boolean;
  /** dark pill behind the line, white box, outline only */
  box: "none" | "pill" | "white";
  stroke: boolean;
  /** canvas filter for the grade */
  grade: string;
  punch: number;
  bars: boolean;
  position: Position;
}

const SANS_HEAVY = '900 {px}px "Archivo Black", "Arial Black", Impact, system-ui, sans-serif';
const SANS = '600 {px}px "DM Sans", Inter, system-ui, sans-serif';
const SERIF = '600 {px}px Fraunces, Georgia, "Times New Roman", serif';

export type FilterId = "warm" | "cool" | "vivid" | "mono" | "film";
export const FILTERS: Record<FilterId, { label: string; css: string }> = {
  warm: { label: "Warm", css: "contrast(1.05) saturate(1.1) sepia(0.18) brightness(1.02)" },
  cool: { label: "Cool", css: "contrast(1.04) saturate(0.95) hue-rotate(-8deg) brightness(1.02)" },
  vivid: { label: "Vivid", css: "contrast(1.12) saturate(1.35)" },
  mono: { label: "Black and white", css: "grayscale(1) contrast(1.12)" },
  film: { label: "Film", css: "contrast(0.94) saturate(0.8) sepia(0.12) brightness(1.04)" },
};

/** The canvas filter for the picture: off, the style's own grade, or the chosen look. */
export function gradeOf(s: Pick<EditSettings, "style" | "grade" | "filter">): string {
  if (!s.grade) return "none";
  return s.filter && FILTERS[s.filter] ? FILTERS[s.filter].css : STYLES[s.style].grade;
}

/** Seconds from the output time to the nearest cut (a join between kept segments), or Infinity with none. */
export function distanceToCut(segs: Segment[], out: number): number {
  let acc = 0;
  let best = Infinity;
  for (let i = 0; i < segs.length - 1; i++) {
    acc += segs[i].end - segs[i].start;
    best = Math.min(best, Math.abs(out - acc));
  }
  return best;
}

export type CaptionAnim = "pop" | "slide" | "type" | "none";
export function animOf(s: Pick<EditSettings, "style" | "captionAnim">): CaptionAnim {
  return s.captionAnim ?? (STYLES[s.style].mode === "words" ? "pop" : "none");
}

export type CaptionBox = "none" | "pill" | "word";
export type FontId = "heavy" | "clean" | "serif";
export const FONTS: Record<FontId, { label: string; css: string }> = {
  heavy: { label: "Heavy", css: SANS_HEAVY },
  clean: { label: "Clean", css: SANS },
  serif: { label: "Serif", css: SERIF },
};

/** The caption font template ("{px}" for the size) and box after the user's overrides. */
export function captionFont(s: Pick<EditSettings, "style" | "font">): string {
  return s.font && FONTS[s.font] ? FONTS[s.font].css : STYLES[s.style].font;
}
export function captionBoxOf(s: Pick<EditSettings, "style" | "captionBox">): CaptionBox {
  const own = STYLES[s.style].box === "pill" ? "pill" : "none";
  const box = s.captionBox ?? own;
  // a word highlight needs words lighting up one at a time
  return box === "word" && STYLES[s.style].mode !== "words" ? own : box;
}

export const STYLES: Record<StyleId, StyleSpec> = {
  bold: { label: "Bold", mode: "words", n: 3, chars: 0, font: SANS_HEAVY, weight: 900, base: "#FFFFFF", active: "#FFD92B", uppercase: true, box: "none", stroke: true, grade: "contrast(1.08) saturate(1.15)", punch: 1.15, bars: false, position: "middle" },
  cutout: { label: "Golden", mode: "words", n: 3, chars: 0, font: SERIF, weight: 600, base: "#F7B32B", active: "#F7B32B", uppercase: false, box: "none", stroke: true, grade: "contrast(1.06) saturate(0.95) brightness(0.98)", punch: 1.1, bars: false, position: "middle" },
  minimal: { label: "Minimal", mode: "line", n: 0, chars: 42, font: SANS, weight: 600, base: "#FFFFFF", active: "#FFFFFF", uppercase: false, box: "pill", stroke: false, grade: "contrast(0.95) saturate(0.9) brightness(1.03)", punch: 1.06, bars: false, position: "bottom" },
  editorial: { label: "Editorial", mode: "line", n: 0, chars: 44, font: SERIF, weight: 600, base: "#FFF6E8", active: "#FFF6E8", uppercase: false, box: "none", stroke: true, grade: "contrast(1.06) saturate(0.82) brightness(0.98) sepia(0.12)", punch: 1.05, bars: false, position: "bottom" },
  native: { label: "TikTok", mode: "line", n: 0, chars: 50, font: SANS, weight: 700, base: "#FFFFFF", active: "#FFFFFF", uppercase: false, box: "none", stroke: true, grade: "contrast(1.02) saturate(1.05)", punch: 1.08, bars: false, position: "middle" },
  documentary: { label: "Documentary", mode: "line", n: 0, chars: 60, font: SANS, weight: 500, base: "#FFFFFF", active: "#FFFFFF", uppercase: false, box: "none", stroke: true, grade: "contrast(1.14) saturate(0.86) brightness(0.97)", punch: 1.0, bars: true, position: "bottom" },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

export function defaultSettings(style: StyleId = "bold"): EditSettings {
  const s = STYLES[style];
  return {
    style,
    position: s.position,
    size: 1,
    wordsPerCaption: s.n || 3,
    baseColor: s.base,
    activeColor: s.active,
    uppercase: s.uppercase,
    captions: true,
    hook: "",
    hookSeconds: 3,
    removeFillers: true,
    maxPause: 0.6,
    trimStart: 0,
    trimEnd: 0,
    aspect: "9:16",
    fit: "fill",
    focusX: 0.5,
    punchIn: s.punch > 1,
    progressBar: style === "bold",
    grade: true,
    highlightNumbers: s.mode === "words",
    nameTag: "",
    roleTag: "",
    nameSeconds: 4,
    subLang: "",
    logo: false,
    endCard: false,
  };
}

/** Switching style resets the style's own looks but keeps the user's cuts, hook and frame. */
export function withStyle(s: EditSettings, style: StyleId): EditSettings {
  const d = defaultSettings(style);
  return { ...s, style, position: d.position, wordsPerCaption: d.wordsPerCaption, baseColor: d.baseColor, activeColor: d.activeColor, uppercase: d.uppercase, punchIn: d.punchIn, progressBar: d.progressBar, captionBox: undefined, font: undefined, captionAnim: undefined };
}

const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "ahh", "hmm", "mm", "mhm"]);
export const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");
export const isFiller = (w: string) => FILLERS.has(norm(w));
export const isNumberWord = (w: string) => /\d|[$%]/.test(w);

export interface Segment {
  start: number;
  end: number;
}

/**
 * The parts of the source to keep, in order: inside the trims, minus filler
 * words and minus the excess of any pause longer than maxPause.
 */
export interface Cut {
  /** Stable across edits: "f:" + the filler's start, "p:" + the end of the word before the pause. */
  id: string;
  kind: "filler" | "pause";
  start: number;
  end: number;
  /** The words either side, and the filler itself, for the review list. */
  before: string;
  word: string;
  after: string;
}

type CutSettings = Pick<EditSettings, "trimStart" | "trimEnd" | "removeFillers" | "maxPause" | "keepCuts">;

function window_(words: Word[], duration: number, s: CutSettings) {
  const from = Math.max(0, s.trimStart);
  const to = Math.max(from, duration - Math.max(0, s.trimEnd));
  const kept = new Set(s.keepCuts ?? []);
  const spoken = words.filter((w) => w.e > from && w.s < to);
  // a filler counts as speech when it isn't being cut, including one the user chose to keep
  const isCutFiller = (w: Word) => s.removeFillers && isFiller(w.w) && !kept.has(`f:${w.s.toFixed(2)}`);
  return { from, to, kept, spoken, said: spoken.filter((w) => !isCutFiller(w)), isCutFiller };
}

/** Every filler and long pause the settings would cut, kept ones included (they are listed for review). */
export function listCuts(words: Word[], duration: number, s: CutSettings): Cut[] {
  const { spoken, said } = window_(words, duration, { ...s, keepCuts: (s.keepCuts ?? []).filter((id) => id.startsWith("f:")) });
  const cuts: Cut[] = [];
  const ctx = (i: number) => words[i]?.w ?? "";
  if (s.removeFillers) {
    for (const w of spoken) {
      if (!isFiller(w.w)) continue;
      const i = words.indexOf(w);
      cuts.push({ id: `f:${w.s.toFixed(2)}`, kind: "filler", start: w.s, end: w.e, before: ctx(i - 1), word: w.w, after: ctx(i + 1) });
    }
  }
  if (s.maxPause > 0) {
    for (let i = 1; i < said.length; i++) {
      const a = said[i - 1];
      const b = said[i];
      const cut = b.s - a.e > s.maxPause ? pauseCut(a, b) : null;
      if (cut) cuts.push({ id: `p:${a.e.toFixed(2)}`, kind: "pause", ...cut, before: a.w, word: "", after: b.w });
    }
  }
  return cuts.sort((x, y) => x.start - y.start);
}

export function keepSegments(
  words: Word[],
  duration: number,
  s: Pick<EditSettings, "trimStart" | "trimEnd" | "removeFillers" | "maxPause"> & { keepCuts?: string[]; removed?: { s: number; e: number }[] },
): Segment[] {
  const w = window_(words, duration, s);
  const removed = s.removed ?? [];
  const isRemoved = (x: Word) => removed.some((r) => x.s >= r.s - 0.001 && x.e <= r.e + 0.001);
  let { from, to } = w;
  // With pause cutting on, dead air before the first word and after the last goes too
  // (words cut by hand don't count as said).
  const said = w.said.filter((x) => !isRemoved(x));
  if (s.maxPause > 0 && said.length) {
    from = Math.max(from, said[0].s - 0.25);
    to = Math.min(to, said[said.length - 1].e + 0.35);
  }
  const cuts = [
    ...listCuts(words, duration, s).filter((c) => !w.kept.has(c.id)),
    ...removed.map((r) => ({ start: r.s, end: r.e })),
  ].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = from;
  for (const c of cuts) {
    const cs = Math.max(c.start, from);
    const ce = Math.min(c.end, to);
    if (ce <= cs) continue;
    if (cs > at) out.push({ start: at, end: cs });
    at = Math.max(at, ce);
  }
  if (to > at) out.push({ start: at, end: to });
  return mergeSlivers(out, said).filter((g) => g.end - g.start > 0.04);
}

export const totalLength = (segs: Segment[]) => segs.reduce((t, g) => t + (g.end - g.start), 0);

/** Output time -> source time. Past the end returns the last kept instant. */
export function sourceTime(segs: Segment[], t: number): number {
  let acc = 0;
  for (const g of segs) {
    const len = g.end - g.start;
    if (t < acc + len) return g.start + Math.max(0, t - acc);
    acc += len;
  }
  return segs.length ? segs[segs.length - 1].end : 0;
}

export const SPEEDS = [1, 1.1, 1.2, 1.5] as const;
export const speedOf = (s: Pick<EditSettings, "speed">) => (typeof s.speed === "number" && s.speed >= 1 && s.speed <= 2 ? s.speed : 1);

/** Source time -> seconds into the finished video at this speed, or null inside a cut. */
export function outAt(segs: Segment[], src: number, speed = 1): number | null {
  const o = outputTime(segs, src);
  return o === null ? null : o / speed;
}

/** Seconds into the finished video at this speed -> source time. */
export function srcAt(segs: Segment[], t: number, speed = 1): number {
  return sourceTime(segs, t * speed);
}

/** Source time -> output time, or null inside a cut. */
export function outputTime(segs: Segment[], src: number): number | null {
  let acc = 0;
  for (const g of segs) {
    if (src >= g.start && src < g.end) return acc + (src - g.start);
    acc += g.end - g.start;
  }
  return null;
}

export interface Caption {
  words: Word[];
  s: number;
  e: number;
}

/** Captions on the source timeline: n words at a time, or lines up to chars, breaking at sentence ends. */
export function buildCaptions(words: Word[], s: Pick<EditSettings, "style" | "wordsPerCaption" | "removeFillers">): Caption[] {
  const spec = STYLES[s.style];
  const ws = s.removeFillers ? words.filter((w) => !isFiller(w.w)) : words;
  const out: Caption[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ words: cur, s: cur[0].s, e: cur[cur.length - 1].e });
    cur = [];
  };
  for (const w of ws) {
    const text = [...cur, w].map((x) => x.w).join(" ");
    const full = spec.mode === "words" ? cur.length >= Math.max(1, s.wordsPerCaption) : text.length > spec.chars;
    const gap = cur.length > 0 && w.s - cur[cur.length - 1].e > 0.7;
    if (cur.length && (full || gap)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.w) && (spec.mode === "line" || cur.length >= 2)) flush();
  }
  flush();
  return out;
}

export function captionAt(caps: Caption[], src: number): Caption | null {
  for (const c of caps) if (src >= c.s - 0.05 && src <= c.e + 0.25) return c;
  return null;
}

/** A gentle punch-in on every other kept segment after the first, so each cut reads as a new angle. Zooms on key lines are videoMotion.ts keyZoom. */
export function zoomAt(segs: Segment[], src: number, punch: number): number {
  if (punch <= 1) return 1;
  for (let i = 1; i < segs.length; i++) {
    const g = segs[i];
    if (src >= g.start && src < g.end) return i % 2 ? punch : 1;
  }
  return 1;
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/**
 * Applies a patch from the vibe editor (or anyone) to settings, keeping only
 * known keys with sane values. Unknown keys and bad values are dropped, so a
 * model's reply can never put the editor in a broken state.
 */
export function applyPatch(s: EditSettings, patch: Record<string, unknown>): { next: EditSettings; changed: string[] } {
  let next = { ...s };
  const changed: string[] = [];
  if (typeof patch.style === "string" && STYLE_IDS.includes(patch.style as StyleId) && patch.style !== s.style) {
    next = withStyle(next, patch.style as StyleId);
    changed.push("style");
  }
  const set = <K extends keyof EditSettings>(k: K, v: EditSettings[K] | undefined) => {
    if (v === undefined || v === next[k]) return;
    next[k] = v;
    changed.push(k);
  };
  const p = patch;
  if (["top", "middle", "bottom"].includes(p.position as string)) {
    set("position", p.position as Position);
    if (next.captionY !== undefined) { next.captionY = undefined; changed.push("captionY"); } // a named position replaces a dragged one
  }
  if ("size" in p) set("size", clamp(p.size, 0.6, 1.6, s.size));
  if ("wordsPerCaption" in p) set("wordsPerCaption", Math.round(clamp(p.wordsPerCaption, 1, 6, s.wordsPerCaption)));
  if (typeof p.baseColor === "string" && HEX.test(p.baseColor)) set("baseColor", p.baseColor.toUpperCase());
  if (typeof p.activeColor === "string" && HEX.test(p.activeColor)) set("activeColor", p.activeColor.toUpperCase());
  for (const k of ["uppercase", "captions", "removeFillers", "punchIn", "progressBar", "grade", "highlightNumbers", "logo", "endCard", "voicePolish", "loudness", "keyZooms", "numberCards", "sfx", "musicDrop", "popups"] as const) {
    if (typeof p[k] === "boolean") set(k, p[k] as boolean);
  }
  if (typeof p.hook === "string") set("hook", p.hook.replace(/—/g, ",").slice(0, 90));
  if ("hookSeconds" in p) set("hookSeconds", clamp(p.hookSeconds, 0, 10, s.hookSeconds));
  if ("maxPause" in p) set("maxPause", clamp(p.maxPause, 0, 3, s.maxPause));
  if ("trimStart" in p) set("trimStart", clamp(p.trimStart, 0, 3600, s.trimStart));
  if ("trimEnd" in p) set("trimEnd", clamp(p.trimEnd, 0, 3600, s.trimEnd));
  if (["9:16", "4:5", "1:1", "16:9", "original"].includes(p.aspect as string)) set("aspect", p.aspect as Aspect);
  if (p.fit === "fill" || p.fit === "blur" || p.fit === "framed") set("fit", p.fit);
  if ("focusX" in p) set("focusX", clamp(p.focusX, 0, 1, s.focusX));
  if (typeof p.nameTag === "string") set("nameTag", p.nameTag.slice(0, 40));
  if (typeof p.roleTag === "string") set("roleTag", p.roleTag.slice(0, 50));
  if ("nameSeconds" in p) set("nameSeconds", clamp(p.nameSeconds, 1, 10, s.nameSeconds ?? 4));
  if (typeof p.captionY === "number") set("captionY", clamp(p.captionY, 0.08, 0.92, s.captionY ?? 0.5));
  if (["none", "pill", "word"].includes(p.captionBox as string)) set("captionBox", p.captionBox as CaptionBox);
  if (typeof p.font === "string" && p.font in FONTS) set("font", p.font as FontId);
  if (typeof p.filter === "string" && p.filter in FILTERS) set("filter", p.filter as FilterId);
  if (p.transition === "soft" || p.transition === "flash") set("transition", p.transition);
  if (["pop", "slide", "type", "none"].includes(p.captionAnim as string)) set("captionAnim", p.captionAnim as CaptionAnim);
  if (typeof p.speed === "number") set("speed", Math.round(clamp(p.speed, 1, 1.5, 1) * 20) / 20);
  if (typeof p.volume === "number") set("volume", Math.round(clamp(p.volume, 0, 1, 1) * 100) / 100);
  if (p.exportAs === "video" || p.exportAs === "small" || p.exportAs === "audio") set("exportAs", p.exportAs);
  return { next, changed };
}

// A saved look: everything about how a video looks and is cut, nothing about
// this one video (its hook, trims or framing). New videos start from it.
const LOOK_KEYS = [
  "style", "position", "captionY", "size", "wordsPerCaption", "baseColor", "activeColor", "uppercase", "captions",
  "highlightNumbers", "progressBar", "grade", "punchIn", "removeFillers", "maxPause", "hookSeconds", "aspect", "fit",
  "nameTag", "roleTag", "nameSeconds", "logo", "endCard", "captionBox", "font", "filter", "transition", "voicePolish", "loudness", "speed", "captionAnim", "keyZooms", "numberCards", "sfx", "musicDrop", "popups",
] as const satisfies readonly (keyof EditSettings)[];

export function lookOf(s: EditSettings): Record<string, unknown> {
  const look: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) if (s[k] !== undefined) look[k] = s[k];
  return look;
}

/** Settings with a saved look laid over them, through applyPatch so a bad saved value can't break the editor. */
export function withLook(s: EditSettings, look: Record<string, unknown> | null | undefined): EditSettings {
  return look && typeof look === "object" ? applyPatch(s, look).next : s;
}

export function sameLook(s: EditSettings, look: Record<string, unknown> | null | undefined): boolean {
  return !!look && JSON.stringify(lookOf(withLook(s, look))) === JSON.stringify(lookOf(s));
}

export function aspectSize(aspect: Aspect, srcW: number, srcH: number): [number, number] {
  if (aspect === "original") {
    // a sound-only source has no picture size: it gets the vertical frame
    if (!srcW || !srcH) return [1080, 1920];
    const scale = Math.min(1, 1920 / Math.max(srcW, srcH));
    return [Math.round((srcW * scale) / 2) * 2, Math.round((srcH * scale) / 2) * 2];
  }
  return aspect === "9:16" ? [1080, 1920] : aspect === "4:5" ? [1080, 1350] : aspect === "16:9" ? [1920, 1080] : [1080, 1080];
}

export function fmtTime(t: number): string {
  // round to the tenth first, so 179.99 s reads 3:00.0, not 2:60.0
  const s = Math.round(Math.max(0, t) * 10) / 10;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export interface Sentence {
  s: number;
  e: number;
  text: string;
}

/** Sentences on the source timeline: break at . ! ? or a pause over a second. Feeds clip finding. */
export function sentencesOf(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ s: cur[0].s, e: cur[cur.length - 1].e, text: cur.map((w) => w.w).join(" ") });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && w.s - cur[cur.length - 1].e > 1) flush();
    cur.push(w);
    if (/[.!?]["')\]]?$/.test(w.w)) flush();
  }
  flush();
  return out;
}

export interface Clip {
  start: number;
  end: number;
  title: string;
  hook: string;
  /** Why a viewer would watch it to the end, in one line. */
  reason?: string;
  /** Out of 100, from Jev: stands alone and opens strong. Unset when Jev had no answer. */
  score?: number;
  /** When a clip was asked for by typing: whether Jev reads this one as about it. */
  onTopic?: boolean;
  /** A tangent in the middle the clip leaves out (source seconds), cut like words cut by hand. */
  skip?: { start: number; end: number };
}

/** A clip as its own edit: the same video, trimmed to the clip, hook set, a skipped tangent cut. */
export function clipSettings(base: EditSettings, clip: Clip, duration: number): EditSettings {
  const removed = clip.skip ? [...(base.removed ?? []), { s: clip.skip.start, e: clip.skip.end }] : base.removed;
  return { ...base, trimStart: Math.max(0, clip.start), trimEnd: Math.max(0, duration - clip.end), hook: clip.hook.slice(0, 90), removed };
}

/** When the name tag is on screen: from the end of the hook for nameSeconds. */
export function nameTagVisible(s: Pick<EditSettings, "nameTag" | "hook" | "hookSeconds" | "nameSeconds">, out: number): boolean {
  if (!s.nameTag?.trim()) return false;
  const from = s.hook?.trim() ? s.hookSeconds : 0.3;
  return out >= from && out < from + (s.nameSeconds ?? 4);
}

/** The text a caption is translated by (and looked up by): its words as transcribed. */
export const captionKey = (c: Caption) => c.words.map((w) => w.w).join(" ");

const Y_FOR: Record<Position, number> = { top: 0.26, middle: 0.64, bottom: 0.8 };
/** Where the captions sit, as a share of the frame height. */
export const captionCenter = (s: Pick<EditSettings, "position" | "captionY">) =>
  typeof s.captionY === "number" ? Math.min(0.92, Math.max(0.08, s.captionY)) : Y_FOR[s.position];

/** Caption entrance: 0 -> 1 over the first 150 ms of a caption (eased), for the pop-in. */
export function captionIntro(src: number, capStart: number): number {
  const t = Math.min(1, Math.max(0, (src - capStart) / 0.15));
  return 1 - Math.pow(1 - t, 3);
}

// ---------- subtitle file and transcript search ----------

const srtTime = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export interface Cue {
  s: number;
  e: number;
  text: string;
}

/** Sentence-length lines (the "minimal" style) timed on the output timeline: cut words drop out. */
export function outputCues(words: Word[], segs: Segment[], removeFillers: boolean, speed = 1): Cue[] {
  const lines = buildCaptions(words, { style: "minimal", wordsPerCaption: 3, removeFillers });
  const cues: Cue[] = [];
  for (const c of lines) {
    const kept = c.words.filter((w) => outputTime(segs, w.s) !== null);
    if (!kept.length) continue;
    const last = kept[kept.length - 1];
    const s = outAt(segs, kept[0].s, speed)!;
    const e = outAt(segs, last.s, speed)! + Math.max(0.2, last.e - last.s) / speed;
    cues.push({ s, e, text: kept.map((w) => w.w).join(" ") });
  }
  return cues;
}

/**
 * Where each dubbed line plays: at the moment the original line starts, or
 * straight after the previous dubbed line when that one runs long, so lines
 * never talk over each other. Lines past the end of the video are dropped.
 */
export function dubPlacement(spans: ({ s: number; e: number } | null)[], cues: Pick<Cue, "s">[], total: number): { at: number; from: number; dur: number }[] {
  const out: { at: number; from: number; dur: number }[] = [];
  let free = 0;
  spans.forEach((sp, i) => {
    if (!sp || !cues[i] || sp.e <= sp.s) return;
    const at = Math.max(cues[i].s, free);
    if (at >= total - 0.1) return;
    const dur = Math.min(sp.e - sp.s, total - at);
    out.push({ at, from: sp.s, dur });
    free = at + dur + 0.05;
  });
  return out;
}

/**
 * An .srt file for the edited video: sentence-length lines (the "minimal"
 * line style) timed on the output timeline, so cut words drop out and every
 * line lands where it plays after the cuts.
 */
export function toSrt(words: Word[], segs: Segment[], removeFillers: boolean, speed = 1): string {
  const cues = outputCues(words, segs, removeFillers, speed);
  return cues
    .map((c, i) => {
      const end = Math.min(c.e, cues[i + 1] ? cues[i + 1].s - 0.01 : c.e);
      return `${i + 1}\n${srtTime(c.s)} --> ${srtTime(Math.max(end, c.s + 0.2))}\n${c.text}\n`;
    })
    .join("\n");
}

/** Start indexes of every place the phrase is said (case and punctuation ignored). */
export function findPhrase(words: Word[], query: string): number[] {
  const q = query.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}']/gu, "")).filter(Boolean);
  if (!q.length) return [];
  const ws = words.map((w) => w.w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""));
  const hits: number[] = [];
  for (let i = 0; i + q.length <= ws.length; i++) {
    // the last query word may be half typed: match it as a prefix
    if (q.every((t, j) => (j === q.length - 1 ? ws[i + j].startsWith(t) : ws[i + j] === t))) hits.push(i);
  }
  return hits;
}

// ---------- platform length rules ----------
// As of Oct 2026: Reels upload up to 20 min but over 3 min isn't shown to new
// audiences; Shorts up to 3 min; TikTok up to 10 min for most accounts.
export const PLATFORM_LIMITS = [
  { id: "reels", label: "Reels", reach: 180, max: 1200 },
  { id: "shorts", label: "Shorts", reach: 180, max: 180 },
  { id: "tiktok", label: "TikTok", reach: 600, max: 600 },
] as const;

export type LengthFit = "ok" | "reach" | "over";

/** How a length sits with each platform: fine, posts but loses reach, or too long. */
export function platformFit(seconds: number): { id: string; label: string; fit: LengthFit; limit: number }[] {
  return PLATFORM_LIMITS.map((p) => ({
    id: p.id,
    label: p.label,
    fit: seconds <= p.reach ? "ok" : seconds <= p.max ? "reach" : "over",
    limit: p.reach,
  }));
}

/** The trimEnd that makes the edit end exactly at `limit` seconds, keeping the cuts. */
export function trimToLength(segs: Segment[], duration: number, limit: number, s: Pick<EditSettings, "trimEnd" | "speed">): number {
  const speed = speedOf(s);
  if (totalLength(segs) / speed <= limit) return s.trimEnd;
  // rounded up, so the edit lands on or just under the limit, never a hair over
  return Math.max(s.trimEnd, Math.ceil((duration - srcAt(segs, limit, speed)) * 100) / 100);
}

// ---------- app buttons over a 9:16 video ----------

export type CoverApp = "instagram" | "tiktok";

/** Where each app's own top bar, bottom caption area and button column cover a full-screen
 * 9:16 video, as shares of the frame (from 1080x1920 guides; the apps move them a little). */
export const APP_COVER: Record<CoverApp, { label: string; top: number; bottom: number; right: number }> = {
  instagram: { label: "Instagram", top: 210 / 1920, bottom: 310 / 1920, right: 84 / 1080 },
  tiktok: { label: "TikTok", top: 108 / 1920, bottom: 320 / 1920, right: 120 / 1080 },
};

// about half a caption line's height
const CAPTION_HALF = 0.03;

/** What the app would cover: the captions, and how many stickers. */
export function appCover(s: Pick<EditSettings, "captions" | "position" | "captionY" | "overlays">, app: CoverApp): { captions: boolean; stickers: number } {
  const z = APP_COVER[app];
  const c = captionCenter(s);
  const under = (x: number, y: number) => y < z.top || y > 1 - z.bottom || x > 1 - z.right;
  return {
    captions: s.captions && (c + CAPTION_HALF > 1 - z.bottom || c - CAPTION_HALF < z.top),
    stickers: (s.overlays ?? []).filter((o) => under(o.x, o.y)).length,
  };
}

/** A caption height just clear of the app's covered band nearest to y. */
export function clearOfApp(y: number, app: CoverApp): number {
  const z = APP_COVER[app];
  return y > 0.5 ? 1 - z.bottom - 0.05 : z.top + 0.05;
}

// ---------- checking an exported file ----------

/** How an exported file's sound measures: its length, the level of its sound (dB, null when
 * silent throughout) and the longest silence inside it (silence at either end, such as the
 * end card, doesn't count). */
export function soundStats(samples: Float32Array, rate: number): { seconds: number; level: number | null; gap: { at: number; length: number } | null } {
  const win = Math.max(1, Math.round(rate * 0.05));
  const db: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    db.push(10 * Math.log10(sum / win + 1e-12));
  }
  // the level of the parts with sound in them, so pauses don't drag it down
  const loud = db.filter((d) => d > -50);
  const level = loud.length ? 10 * Math.log10(loud.reduce((a, d) => a + 10 ** (d / 10), 0) / loud.length) : null;
  let gap: { at: number; length: number } | null = null;
  for (let i = 0; i < db.length; ) {
    if (db[i] >= -45) { i++; continue; }
    let j = i;
    while (j < db.length && db[j] < -45) j++;
    const length = (j - i) * 0.05;
    if (i > 0 && j < db.length && (!gap || length > gap.length)) gap = { at: i * 0.05, length };
    i = j;
  }
  return { seconds: samples.length / rate, level, gap };
}

export interface ExportIssue {
  id: "length" | "silent" | "quiet" | "gap" | "captions" | "size";
  text: string;
  /** Where in the file it is, for a silence. */
  at?: number;
}

// ---------- export size per platform ----------
// What one upload can be, as of Oct 2026: WhatsApp plays a video in the chat up
// to 16 MB (bigger goes as a document), TikTok's Android app takes up to 72 MB.
// Instagram, YouTube and LinkedIn take far more than a reel at 8 Mbps comes to.
export const EXPORT_TARGETS = {
  reels: { label: "Instagram", capMB: 0, mbps: 8, short: 0 },
  tiktok: { label: "TikTok", capMB: 72, mbps: 8, short: 0 },
  shorts: { label: "YouTube Shorts", capMB: 0, mbps: 8, short: 0 },
  whatsapp: { label: "WhatsApp", capMB: 16, mbps: 2.5, short: 720 },
  linkedin: { label: "LinkedIn", capMB: 0, mbps: 8, short: 0 },
} as const;
export type ExportTarget = keyof typeof EXPORT_TARGETS;
/** Below this the picture breaks up, so a longer video can't fit the cap. */
export const MIN_VIDEO_BPS = 600_000;

export function targetOf(s: Pick<EditSettings, "exportAs" | "exportFor">): ExportTarget {
  if (s.exportAs === "small") return "whatsapp";
  return s.exportFor && s.exportFor in EXPORT_TARGETS ? s.exportFor : "reels";
}

/**
 * The file an export makes for its platform: frame size, bitrates and the
 * expected bytes, with the bitrate lowered so a capped platform's file lands
 * 10% under its cap (the recorder's rate is a target, not a promise).
 */
export function exportSize(s: Pick<EditSettings, "exportAs" | "exportFor" | "aspect">, seconds: number, srcW: number, srcH: number) {
  const id = targetOf(s);
  const t = EXPORT_TARGETS[id];
  const sec = Math.max(1, seconds);
  if (s.exportAs === "audio") return { id, label: t.label, w: 0, h: 0, videoBps: 0, audioBps: 128_000, bytes: Math.round((128_000 * sec) / 8), capBytes: 0, fits: true, maxSeconds: Infinity };
  let [w, h] = aspectSize(s.aspect ?? "9:16", srcW, srcH);
  if (t.short && Math.min(w, h) > t.short) {
    const k = t.short / Math.min(w, h);
    [w, h] = [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
  }
  const audioBps = id === "whatsapp" ? 96_000 : 128_000;
  const capBytes = t.capMB * 1_000_000;
  const budget = capBytes ? (capBytes * 0.9 * 8) / sec - audioBps : Infinity;
  const videoBps = Math.round(Math.max(MIN_VIDEO_BPS, Math.min(t.mbps * 1_000_000, budget)));
  const bytes = Math.round(((videoBps + audioBps) * sec) / 8);
  const maxSeconds = capBytes ? Math.floor((capBytes * 0.9 * 8) / (MIN_VIDEO_BPS + audioBps)) : Infinity;
  return { id, label: t.label, w, h, videoBps, audioBps, bytes, capBytes, fits: sec <= maxSeconds, maxSeconds };
}

/** Bytes as people read them: 850 KB, 14 MB, 1.2 GB. */
export function fmtBytes(n: number): string {
  if (n < 1_000_000) return `${Math.max(1, Math.round(n / 1000))} KB`;
  if (n < 1_000_000_000) return `${n < 10_000_000 ? (n / 1_000_000).toFixed(1) : Math.round(n / 1_000_000)} MB`;
  return `${(n / 1_000_000_000).toFixed(1)} GB`;
}

/** What is wrong with an exported file, from its measured sound (seconds null = it couldn't be read back). */
export function exportIssues(
  m: { seconds: number | null; level: number | null; gap: { at: number; length: number } | null },
  want: { seconds: number; kind: "video" | "small" | "audio"; captions: boolean; hasWords: boolean; sound: boolean; size?: { bytes: number; cap: number; label: string } },
): ExportIssue[] {
  const out: ExportIssue[] = [];
  if (want.size?.cap && want.size.bytes > want.size.cap)
    out.push({ id: "size", text: `The file is ${fmtBytes(want.size.bytes)}, over the ${fmtBytes(want.size.cap)} ${want.size.label} takes. Trim it, then export again.` });
  if (m.seconds !== null) {
    if (Math.abs(m.seconds - want.seconds) > Math.max(1, want.seconds * 0.05))
      out.push({ id: "length", text: `The file runs ${fmtTime(m.seconds)} but the edit is ${fmtTime(want.seconds)}. Keep this tab in front and export again.` });
    if (want.sound && m.level === null) out.push({ id: "silent", text: "The file has no sound. Check the volume under Cuts, then export again." });
    if (want.sound && m.level !== null && m.level < -32) out.push({ id: "quiet", text: `The sound is quiet (${Math.round(m.level)} dB), so people will turn it up or scroll on.` });
    if (m.gap && m.gap.length >= 2) out.push({ id: "gap", text: `${m.gap.length.toFixed(1)}s of silence at ${fmtTime(m.gap.at)}.`, at: m.gap.at });
  }
  if (want.kind !== "audio" && want.captions && !want.hasWords) out.push({ id: "captions", text: "The video has no captions yet." });
  return out;
}

// ---------- saved caption fixes ----------

/** A word or phrase (up to 4 words) the transcription keeps getting wrong, and what it should say. */
export interface CaptionFix {
  from: string;
  to: string;
}

export const MAX_FIXES = 100;

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
const tail = (w: string) => w.match(/[.,!?;:]+$/)?.[0] ?? "";

/** The saved fixes applied to a transcript: each heard run becomes one word with the right text,
 * the run's first start and last end, and the last word's closing punctuation. */
export function applyFixes(words: Word[], fixes: CaptionFix[]): { words: Word[]; count: number } {
  const rules = fixes
    .map((f) => ({ from: f.from.split(/\s+/).map(bare).filter(Boolean), to: f.to }))
    .filter((r) => r.from.length > 0)
    .sort((a, b) => b.from.length - a.from.length);
  if (!rules.length) return { words, count: 0 };
  const out: Word[] = [];
  let count = 0;
  for (let i = 0; i < words.length; ) {
    const rule = rules.find((r) => r.from.every((t, j) => words[i + j] && bare(words[i + j].w) === t));
    const run = rule ? words.slice(i, i + rule.from.length) : [];
    const last = run[run.length - 1];
    // a run that already reads right is left alone, so a fix that only changes case is not counted again
    if (!rule || run.map((x) => x.w).join(" ").replace(/[.,!?;:]+$/, "") === rule.to) {
      out.push(words[i]);
      i++;
      continue;
    }
    out.push({ w: rule.to + tail(last.w), s: run[0].s, e: last.e });
    count++;
    i += run.length;
  }
  return { words: count ? out : words, count };
}

/** A saved fix from one word fixed by hand, or null when nothing really changed. */
export function fixFromEdit(before: string, after: string): CaptionFix | null {
  const from = before.trim().replace(/[.,!?;:]+$/, "");
  const to = after.trim().replace(/[.,!?;:]+$/, "");
  return from && to && from !== to ? { from, to } : null;
}

/** Saved fixes from storage: strings, at most 4 words heard and 40 characters each, one per heard text. */
export function sanitizeFixes(raw: unknown): CaptionFix[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CaptionFix[] = [];
  for (const f of raw) {
    if (!f || typeof f.from !== "string" || typeof f.to !== "string") continue;
    const from = f.from.trim().replace(/\s+/g, " ").slice(0, 40);
    const to = f.to.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = from.split(" ").map(bare).join(" ");
    if (!from || !to || from.split(" ").length > 4 || !key.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out.slice(0, MAX_FIXES);
}

// ---------- stickers ----------

export type OverlayKind = "text" | "arrow" | "circle" | "underline";

/** A sticker: centre x/y as shares of the frame, size 0.5-2.5, shown from/to on the edited timeline. */
export interface Overlay {
  id: string;
  kind: OverlayKind;
  text: string;
  x: number;
  y: number;
  size: number;
  /** Quarter turns clockwise (arrows point down at 0). */
  turn: number;
  color: string;
  from: number;
  to: number;
}

export const MAX_OVERLAYS = 20;

export function newOverlay(kind: OverlayKind, at: number, color: string): Overlay {
  return {
    id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    kind,
    text: kind === "text" ? "Your text" : "",
    x: 0.5,
    y: kind === "text" ? 0.32 : 0.45,
    size: 1,
    turn: 0,
    color: HEX.test(color) ? color.toUpperCase() : "#FFD92B",
    // rounded down, so it shows on the frame at the playhead (4.9999 s must not start at 5.0)
    from: Math.max(0, Math.floor(at * 10) / 10),
    to: Math.max(0, Math.floor(at * 10) / 10) + 3,
  };
}

/** Stickers from storage, kept only when well formed; positions and sizes are clamped. */
export function sanitizeOverlays(raw: unknown): Overlay[] {
  if (!Array.isArray(raw)) return [];
  const kinds: OverlayKind[] = ["text", "arrow", "circle", "underline"];
  return raw.slice(0, MAX_OVERLAYS).flatMap((o): Overlay[] => {
    if (!o || typeof o !== "object") return [];
    const r = o as Record<string, unknown>;
    if (!kinds.includes(r.kind as OverlayKind) || typeof r.id !== "string") return [];
    const from = clamp(r.from, 0, 36000, 0);
    return [{
      id: r.id.slice(0, 24),
      kind: r.kind as OverlayKind,
      text: typeof r.text === "string" ? r.text.slice(0, 60) : "",
      x: clamp(r.x, 0, 1, 0.5),
      y: clamp(r.y, 0, 1, 0.5),
      size: clamp(r.size, 0.5, 2.5, 1),
      turn: Math.round(clamp(r.turn, 0, 3, 0)),
      color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toUpperCase() : "#FFD92B",
      from,
      to: Math.max(from + 0.3, clamp(r.to, 0, 36000, from + 3)),
    }];
  });
}

export function overlaysAt(list: Overlay[] | undefined, out: number): Overlay[] {
  return (list ?? []).filter((o) => out >= o.from && out < o.to);
}

/** The visible sticker under a point (shares of the frame), topmost first, within a reach that grows with its size. */
export function overlayHit(list: Overlay[] | undefined, out: number, x: number, y: number, aspect: number): Overlay | null {
  const shown = overlaysAt(list, out);
  for (let i = shown.length - 1; i >= 0; i--) {
    const o = shown[i];
    const reach = 0.09 * o.size;
    // distances in frame-height units, so a tall frame doesn't stretch the hit area sideways
    if (Math.hypot((x - o.x) * aspect, y - o.y) <= reach) return o;
  }
  return null;
}

// ---------- cutting words from the transcript ----------

/** The stretch from word a to word b (either order) as a cut, padded a touch so no syllable is left behind. */
export function wordRange(words: Word[], a: number, b: number): { s: number; e: number } {
  const [i, j] = a <= b ? [a, b] : [b, a];
  return { s: Math.max(0, words[i].s - 0.04), e: words[j].e + 0.04 };
}

/** Adds a cut stretch, merging any it overlaps. */
export function addRemoved(list: { s: number; e: number }[] | undefined, r: { s: number; e: number }): { s: number; e: number }[] {
  let merged = { ...r };
  const rest: { s: number; e: number }[] = [];
  for (const x of list ?? []) {
    if (x.e >= merged.s && x.s <= merged.e) merged = { s: Math.min(x.s, merged.s), e: Math.max(x.e, merged.e) };
    else rest.push(x);
  }
  return [...rest, merged].sort((p, q) => p.s - q.s);
}

/** The cut stretch a word sits in, if any. */
export function removedAt(list: { s: number; e: number }[] | undefined, w: Word): { s: number; e: number } | null {
  return (list ?? []).find((r) => w.s >= r.s - 0.001 && w.e <= r.e + 0.001) ?? null;
}

/** Cut stretches from storage: well-formed, in order, at most 200. */
export function sanitizeRemoved(raw: unknown): { s: number; e: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is { s: number; e: number } => !!r && typeof r.s === "number" && typeof r.e === "number" && Number.isFinite(r.s) && r.e > r.s)
    .slice(0, 200)
    .map((r) => ({ s: Math.max(0, r.s), e: r.e }))
    .sort((a, b) => a.s - b.s);
}

// ---------- voiceover ----------

export interface Voiceover {
  key: string;
  start: number;
  length: number;
  /** 0 to 1.5; unset = 1. */
  gain?: number;
}

/** Seconds into the voiceover at this point of the edited video, or null when it isn't playing there. */
export function voiceAt(vo: Voiceover | undefined, out: number): number | null {
  if (!vo) return null;
  const rel = out - vo.start;
  return rel >= 0 && rel < vo.length ? rel : null;
}

/** A stored voiceover, kept only when well formed. */
export function sanitizeVoiceover(raw: unknown): Voiceover | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !/^vo-[a-z0-9-]{4,60}$/i.test(r.key)) return undefined;
  const start = clamp(r.start, 0, 36000, -1);
  const length = clamp(r.length, 0, 3600, 0);
  if (start < 0 || length < 0.3) return undefined;
  return { key: r.key, start, length, ...(typeof r.gain === "number" ? { gain: clamp(r.gain, 0, 1.5, 1) } : {}) };
}

/** Where the framed layout's window sits: full width less a margin, centred a little above the middle. */
export function frameRect(W: number, H: number, srcW: number, srcH: number): { x: number; y: number; w: number; h: number } {
  const w = W * 0.88;
  const h = Math.min(H * 0.6, (w * srcH) / srcW);
  const fw = (h * srcW) / srcH; // a tall source is limited by height
  return { x: (W - fw) / 2, y: H * 0.44 - h / 2, w: fw, h };
}

// ---------- loudness ----------
// Instagram, TikTok and YouTube turn every video to about -14 LUFS: a quieter
// one sounds thin next to the videos around it, a louder one gets turned down.
// Measured per ITU-R BS.1770-4 (the EBU R128 / LUFS standard).

export const LOUDNESS_TARGET = -14;
/** dB true peak: AAC encoding can push a peak above this up past 0 dB, which clips. */
export const PEAK_CEILING = -1;
const MAX_LIFT = 20;

/** The two K-weighting filters for this sample rate (BS.1770's head-related shelf, then a 38 Hz high-pass), as biquad b and a. */
export function kWeighting(rate: number): { b: number[]; a: number[] }[] {
  const shelf = (() => {
    const K = Math.tan((Math.PI * 1681.974450955533) / rate);
    const Q = 0.7071752369554196;
    const Vh = 10 ** (3.999843853973347 / 20);
    const Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  const K = Math.tan((Math.PI * 38.13547087602444) / rate);
  const Q = 0.5003270373238773;
  const a0 = 1 + K / Q + K * K;
  return [shelf, { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] }];
}

/** Integrated loudness in LUFS: K-weighted, 400 ms blocks every 100 ms, gated at -70 LUFS and
 * again 10 LU under the level of what is left, so pauses don't count. Null when silent. */
export function integratedLoudness(channels: Float32Array[], rate: number): number | null {
  const step = Math.round(rate * 0.1);
  const subs = Math.floor((channels[0]?.length ?? 0) / step);
  if (subs < 4) return null;
  const energy = new Float64Array(subs);
  const [sh, hp] = kWeighting(rate);
  for (const ch of channels) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < subs * step; i++) {
      const x = ch[i];
      const y = sh.b[0] * x + sh.b[1] * x1 + sh.b[2] * x2 - sh.a[1] * y1 - sh.a[2] * y2;
      const z = y - 2 * y1 + y2 - hp.a[1] * z1 - hp.a[2] * z2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; z2 = z1; z1 = z;
      energy[(i / step) | 0] += z * z;
    }
  }
  const blocks: number[] = [];
  for (let j = 0; j + 4 <= subs; j++) blocks.push((energy[j] + energy[j + 1] + energy[j + 2] + energy[j + 3]) / (4 * step));
  const lk = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const loud = blocks.filter((z) => z > 0 && lk(z) > -70);
  if (!loud.length) return null;
  const gate = lk(mean(loud)) - 10;
  return lk(mean(loud.filter((z) => lk(z) > gate)));
}

// a Lanczos interpolator, 16 taps, for the points a quarter, a half and three quarters between samples
const TP_TAPS = 8;
const TP_PHASES = [0.25, 0.5, 0.75].map((d) =>
  Array.from({ length: TP_TAPS * 2 }, (_, i) => {
    const t = d - (i - TP_TAPS + 1);
    const sinc = (u: number) => (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u));
    return sinc(t) * sinc(t / TP_TAPS);
  }),
);

/** True peak in dB: the highest point of the wave, between samples too (4x oversampled). -Infinity when silent. */
export function truePeak(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    let sp = 0;
    for (let i = 0; i < ch.length; i++) sp = Math.max(sp, Math.abs(ch[i]));
    peak = Math.max(peak, sp);
    // ponytail: only between samples near the loudest ones; a point between two quiet samples can't top the peak
    for (let i = TP_TAPS - 1; i + TP_TAPS < ch.length; i++) {
      if (Math.abs(ch[i]) < sp / 2 && Math.abs(ch[i + 1]) < sp / 2) continue;
      for (const h of TP_PHASES) {
        let v = 0;
        for (let k = 0; k < h.length; k++) v += ch[i - TP_TAPS + 1 + k] * h[k];
        peak = Math.max(peak, Math.abs(v));
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** The gain (dB) to try next after a render measured `lufs` at `gain`, or null once it lands within half a LU. */
export function nextGain(gain: number, lufs: number): number | null {
  if (Math.abs(lufs - LOUDNESS_TARGET) <= 0.5) return null;
  return Math.min(MAX_LIFT, Math.max(-MAX_LIFT, gain + LOUDNESS_TARGET - lufs));
}

/** "Even out loudness", measured: the level before and after (LUFS), the peak after (dB), the gain
 * into the limiter and the trim after it (dB), and whether voice polish was on when it was measured. */
export interface Level {
  polish: boolean;
  before: number;
  after: number;
  peak: number;
  gain: number;
  trim: number;
}

/** The measurement still fits the edit: taken with voice polish as it is now. */
export const levelFits = (l: Level | undefined, polish: boolean): l is Level => !!l && l.polish === polish;

export function sanitizeLevel(raw: unknown): Level | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const before = n(r.before, -90, 10), after = n(r.after, -90, 10), peak = n(r.peak, -90, 10), gain = n(r.gain, -MAX_LIFT, MAX_LIFT), trim = n(r.trim, -40, 0);
  if (before === null || after === null || peak === null || gain === null || trim === null) return undefined;
  return { polish: r.polish === true, before, after, peak, gain, trim };
}

// ---------- B-roll ----------

/** A stock clip shown full-frame over from-to on the edited timeline; the speaker's sound carries on under it. */
export interface Broll {
  id: string;
  /** The clip's file on this device (deviceFiles). */
  key: string;
  from: number;
  to: number;
  /** The clip's own length in seconds; it loops when the cutaway runs longer. */
  length: number;
  /** Pexels preview picture, for the list. */
  thumb: string;
  /** Who filmed it and the clip's page on Pexels. */
  by: string;
  byUrl: string;
  url: string;
}

export const MAX_BROLL = 10;

/** A cutaway from the playhead for up to 4 seconds (the clip's length if shorter), kept inside the edit. */
export function newBroll(key: string, at: number, length: number, total: number, credit: Pick<Broll, "thumb" | "by" | "byUrl" | "url">): Broll {
  const from = Math.max(0, Math.min(Math.floor(at * 10) / 10, total - 0.5));
  const span = Math.min(4, length > 0.5 ? length : 4);
  return {
    id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    key,
    from,
    to: Math.max(from + 0.5, Math.min(total, from + span)),
    length: Math.max(0.5, length || 4),
    ...credit,
  };
}

/** The cutaway showing at this point of the edit (the later one when two overlap) and the time into its clip. */
export function brollAt(list: Broll[] | undefined, out: number): { b: Broll; t: number } | null {
  const all = list ?? [];
  for (let i = all.length - 1; i >= 0; i--) {
    const b = all[i];
    if (out >= b.from && out < b.to) return { b, t: (out - b.from) % b.length };
  }
  return null;
}

/** Cutaways from storage, kept only when well formed; credit links must point at Pexels. */
export function sanitizeBroll(raw: unknown): Broll[] {
  if (!Array.isArray(raw)) return [];
  const link = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : "");
  return raw.slice(0, MAX_BROLL).flatMap((x): Broll[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.key !== "string" || !/^br-[a-z0-9-]{4,60}$/i.test(r.key)) return [];
    const from = clamp(r.from, 0, 36000, -1);
    if (from < 0) return [];
    return [{
      id: r.id.slice(0, 24),
      key: r.key,
      from,
      to: Math.max(from + 0.5, clamp(r.to, 0, 36000, from + 4)),
      length: clamp(r.length, 0.5, 3600, 4),
      thumb: link(r.thumb, /^https:\/\/images\.pexels\.com\//),
      by: typeof r.by === "string" ? r.by.slice(0, 80) : "",
      byUrl: link(r.byUrl, /^https:\/\/(www\.)?pexels\.com\//),
      url: link(r.url, /^https:\/\/(www\.)?pexels\.com\//),
    }];
  });
}

// ---------- background music ----------

/** A track from the user's own file: its file on this device, its name, and its volume (0 to 1) when no one is talking. */
export interface Music {
  key: string;
  name: string;
  level: number;
}

export const MUSIC_LEVEL = 0.35;
/** Under speech the music drops to a quarter of its level, about 12 dB. */
export const MUSIC_DUCK = 0.25;

/** When someone is talking, on the edited timeline: the words still in the edit, joined across gaps under 0.8 s. */
export function speechSpans(words: Word[], segs: Segment[], speed = 1): { s: number; e: number }[] {
  const out: { s: number; e: number }[] = [];
  for (const w of words) {
    const s = outAt(segs, w.s, speed);
    if (s === null) continue;
    const e = s + (w.e - w.s) / speed;
    const last = out[out.length - 1];
    if (last && s - last.e < 0.8) last.e = Math.max(last.e, e);
    else out.push({ s, e });
  }
  return out;
}

/** Everywhere the music drops: what is said on camera, plus the voiceover, in time order. */
export function duckSpans(words: Word[], segs: Segment[], s: Pick<EditSettings, "speed" | "voiceover">): { s: number; e: number }[] {
  const spans = speechSpans(words, segs, speedOf(s));
  if (s.voiceover) spans.push({ s: s.voiceover.start, e: s.voiceover.start + s.voiceover.length });
  return spans.sort((a, b) => a.s - b.s);
}

/** The music's volume at this point of the edit: its level, dropping to a quarter over 0.15 s before
 * someone talks and coming back over 0.5 s after, faded out over the last second before `end`. */
export function musicGainAt(spans: { s: number; e: number }[], out: number, level: number, end: number): number {
  let duck = 1;
  for (const sp of spans) {
    if (out < sp.s - 0.15) break;
    duck = Math.min(duck, out < sp.s ? (sp.s - out) / 0.15 : out <= sp.e ? 0 : Math.min(1, (out - sp.e) / 0.5));
  }
  return level * (MUSIC_DUCK + (1 - MUSIC_DUCK) * duck) * Math.min(1, Math.max(0, end - out));
}

/** A stored track, kept only when well formed. */
export function sanitizeMusic(raw: unknown): Music | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !/^mu-[a-z0-9-]{4,60}$/i.test(r.key)) return undefined;
  return { key: r.key, name: typeof r.name === "string" ? r.name.slice(0, 80) : "Music", level: clamp(r.level, 0, 1, MUSIC_LEVEL) };
}

// ---------- callouts and cutaways (video-assist "cutaways") ----------

/** A suggested section: a text callout and what to cut away to, on the edited timeline. */
export interface Cutaway {
  at: number;
  until: number;
  callout: string;
  show: string;
}

/** The sentences still in the edit, timed on the edited timeline, which is where stickers sit. */
export function editedSentences(words: Word[], segs: Segment[], speed = 1): Sentence[] {
  return sentencesOf(words.flatMap((w) => {
    const s = outAt(segs, w.s, speed);
    return s === null ? [] : [{ ...w, s, e: s + (w.e - w.s) / speed }];
  }));
}

/** Stored suggestions, kept only when well formed. */
export function sanitizeCutaways(raw: unknown): Cutaway[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).flatMap((r): Cutaway[] => {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const at = clamp(o.at, 0, 36000, -1);
    const callout = typeof o.callout === "string" ? o.callout.slice(0, 60) : "";
    if (at < 0 || !callout) return [];
    return [{ at, until: clamp(o.until, at, 36000, at + 3), callout, show: typeof o.show === "string" ? o.show.slice(0, 160) : "" }];
  });
}

/** Post titles and the cover text for a finished video, and where on the edited timeline to take the cover frame. */
export interface PublishIdea {
  titles: string[];
  cover: string;
  at: number | null;
}

/** A stored idea, kept only when well formed. */
export function sanitizePublish(raw: unknown): PublishIdea | undefined {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const titles = (Array.isArray(o.titles) ? o.titles : []).filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 3).map((t) => t.slice(0, 80));
  const cover = typeof o.cover === "string" ? o.cover.slice(0, 60) : "";
  if (!titles.length || !cover) return undefined;
  return { titles, cover, at: typeof o.at === "number" && Number.isFinite(o.at) && o.at >= 0 ? o.at : null };
}

// ---------- joining takes into one video (rendered on the device, then captioned like an upload) ----------

/** The part of a take that is kept, in seconds of that take. */
export interface Take {
  duration: number;
  start: number;
  end: number;
}
export const MAX_TAKES = 8;
/** The joined video is captioned in one go, and the captioner takes about 12 minutes. */
export const MAX_JOIN_SECONDS = 720;

/** Moves the start or end of a take to `at`, keeping at least half a second and staying inside the take. */
export function trimTake<T extends Take>(t: T, edge: "start" | "end", at: number): T {
  const x = Math.min(t.duration, Math.max(0, at));
  return edge === "start" ? { ...t, start: Math.max(0, Math.min(x, t.end - 0.5)) } : { ...t, end: Math.min(t.duration, Math.max(x, t.start + 0.5)) };
}

export function moveTake<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const joinedLength = (takes: Take[]) => takes.reduce((n, t) => n + Math.max(0, t.end - t.start), 0);

/** Why the takes can't be joined yet, or null. */
export function joinIssue(takes: Take[]): string | null {
  if (takes.length < 2) return "Add at least 2 takes.";
  const len = joinedLength(takes);
  return len > MAX_JOIN_SECONDS ? `Together they run ${fmtTime(len)}. Trim them under 12 minutes so they can be captioned.` : null;
}

// ---------- following the face (auto-reframe; finding it is in faceFollow.ts and faceVision.ts) ----------

/** Where the face is across the source video: its centre, 0 (left) to 1 (right), every `step` seconds from the start. */
export interface FaceTrack {
  step: number;
  x: number[];
}

/** The crop's centre at this point of the source: the face track while following it, else the slider. */
export function focusAt(s: Pick<EditSettings, "focusX" | "followFace" | "faceTrack">, src: number): number {
  const t = s.followFace ? s.faceTrack : undefined;
  if (!t?.x.length) return s.focusX;
  const i = Math.max(0, src / t.step);
  const a = Math.min(t.x.length - 1, Math.floor(i));
  const b = Math.min(t.x.length - 1, a + 1);
  return t.x[a] + (t.x[b] - t.x[a]) * (i - a);
}

/** Behind the speaker, found on this device (faceVision.ts): blur 0-1, a #RRGGBB colour, or a picture's file key. */
export type Backdrop = { kind: "blur"; amount: number } | { kind: "colour"; color: string } | { kind: "picture"; key: string };

// ---------- audio-only sources (a podcast or voice clip turned into a video) ----------

export const PEAKS_PER_SECOND = 20;

/** Loudness per 1/20 s of mono samples, 0 to 1, scaled so the loud end (95th percentile) reads 1. */
export function peaksFrom(pcm: Float32Array, rate: number, perSecond = PEAKS_PER_SECOND): number[] {
  const step = Math.max(1, Math.round(rate / perSecond));
  const raw: number[] = [];
  for (let i = 0; i < pcm.length; i += step) {
    let sum = 0;
    const end = Math.min(pcm.length, i + step);
    for (let j = i; j < end; j++) sum += pcm[j] * pcm[j];
    raw.push(Math.sqrt(sum / (end - i)));
  }
  const loud = [...raw].sort((a, b) => a - b)[Math.floor(raw.length * 0.95)] || 0;
  return raw.map((r) => (loud > 0 ? Math.round(Math.min(1, r / loud) * 100) / 100 : 0));
}

/** n bar heights centred on the moment t: the bars to the left are just said, the right ones coming up. */
export function waveAt(peaks: number[], t: number, n = 41, perSecond = PEAKS_PER_SECOND): number[] {
  const mid = Math.round(t * perSecond);
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => peaks[mid - half + i] ?? 0);
}
