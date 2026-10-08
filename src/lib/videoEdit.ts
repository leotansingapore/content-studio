// Video editor: the edit is data. A project is the source video (kept on the
// device), its word-timed transcript, and EditSettings; preview and export both
// draw from the same settings, and a "vibe edit" is a patch to them. Nothing
// here touches the DOM, so it is all unit-tested.
//
// Caption styles mirror Leo's talking-head-reel signatures (picked 2026-10-04):
// bold (Hormozi), cutout (Kallaway gold), minimal (Ali Abdaal pill), editorial,
// native (TikTok) and documentary.

export interface Word {
  w: string;
  s: number;
  e: number;
}

export type StyleId = "bold" | "cutout" | "minimal" | "editorial" | "native" | "documentary";
export type Aspect = "9:16" | "4:5" | "1:1" | "16:9" | "original";
/** fill = crop to the frame; blur = the whole picture over a blurred copy of itself (landscape podcasts in a vertical reel). */
export type Fit = "fill" | "blur";
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
  /** The brand kit logo in the top corner. */
  logo?: boolean;
  /** A closing card from the brand kit (photo, name, handle, sign-off line) after the last cut. */
  endCard?: boolean;
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
  return { ...s, style, position: d.position, wordsPerCaption: d.wordsPerCaption, baseColor: d.baseColor, activeColor: d.activeColor, uppercase: d.uppercase, punchIn: d.punchIn, progressBar: d.progressBar };
}

const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "ahh", "hmm", "mm", "mhm"]);
export const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");
export const isFiller = (w: string) => FILLERS.has(norm(w));
export const isNumberWord = (w: string) => /\d|[$%]/.test(w);

export interface Segment {
  start: number;
  end: number;
}

const PAD = 0.08;

/**
 * The parts of the source to keep, in order: inside the trims, minus filler
 * words and minus the excess of any pause longer than maxPause.
 */
export function keepSegments(words: Word[], duration: number, s: Pick<EditSettings, "trimStart" | "trimEnd" | "removeFillers" | "maxPause">): Segment[] {
  let from = Math.max(0, s.trimStart);
  let to = Math.max(from, duration - Math.max(0, s.trimEnd));
  const cuts: Segment[] = [];
  const spoken = words.filter((w) => w.e > from && w.s < to);
  // With pause cutting on, dead air before the first word and after the last goes too.
  const said = spoken.filter((w) => !(s.removeFillers && isFiller(w.w)));
  if (s.maxPause > 0 && said.length) {
    from = Math.max(from, said[0].s - 0.25);
    to = Math.min(to, said[said.length - 1].e + 0.35);
  }
  if (s.removeFillers) for (const w of spoken) if (isFiller(w.w)) cuts.push({ start: w.s, end: w.e });
  if (s.maxPause > 0) {
    const real = spoken.filter((w) => !(s.removeFillers && isFiller(w.w)));
    for (let i = 1; i < real.length; i++) {
      const gap = real[i].s - real[i - 1].e;
      if (gap > s.maxPause) cuts.push({ start: real[i - 1].e + PAD, end: real[i].s - PAD });
    }
  }
  cuts.sort((a, b) => a.start - b.start);
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
  return out.filter((g) => g.end - g.start > 0.04);
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

/** A gentle punch-in on the first moment of each kept segment after the first (a cut) and on emphasised words. */
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
  for (const k of ["uppercase", "captions", "removeFillers", "punchIn", "progressBar", "grade", "highlightNumbers", "logo", "endCard"] as const) {
    if (typeof p[k] === "boolean") set(k, p[k] as boolean);
  }
  if (typeof p.hook === "string") set("hook", p.hook.replace(/—/g, ",").slice(0, 90));
  if ("hookSeconds" in p) set("hookSeconds", clamp(p.hookSeconds, 0, 10, s.hookSeconds));
  if ("maxPause" in p) set("maxPause", clamp(p.maxPause, 0, 3, s.maxPause));
  if ("trimStart" in p) set("trimStart", clamp(p.trimStart, 0, 3600, s.trimStart));
  if ("trimEnd" in p) set("trimEnd", clamp(p.trimEnd, 0, 3600, s.trimEnd));
  if (["9:16", "4:5", "1:1", "16:9", "original"].includes(p.aspect as string)) set("aspect", p.aspect as Aspect);
  if (p.fit === "fill" || p.fit === "blur") set("fit", p.fit);
  if ("focusX" in p) set("focusX", clamp(p.focusX, 0, 1, s.focusX));
  if (typeof p.nameTag === "string") set("nameTag", p.nameTag.slice(0, 40));
  if (typeof p.roleTag === "string") set("roleTag", p.roleTag.slice(0, 50));
  if ("nameSeconds" in p) set("nameSeconds", clamp(p.nameSeconds, 1, 10, s.nameSeconds ?? 4));
  if (typeof p.captionY === "number") set("captionY", clamp(p.captionY, 0.08, 0.92, s.captionY ?? 0.5));
  return { next, changed };
}

// A saved look: everything about how a video looks and is cut, nothing about
// this one video (its hook, trims or framing). New videos start from it.
const LOOK_KEYS = [
  "style", "position", "captionY", "size", "wordsPerCaption", "baseColor", "activeColor", "uppercase", "captions",
  "highlightNumbers", "progressBar", "grade", "punchIn", "removeFillers", "maxPause", "hookSeconds", "aspect", "fit",
  "nameTag", "roleTag", "nameSeconds", "logo", "endCard",
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
    const scale = Math.min(1, 1920 / Math.max(srcW, srcH));
    return [Math.round((srcW * scale) / 2) * 2, Math.round((srcH * scale) / 2) * 2];
  }
  return aspect === "9:16" ? [1080, 1920] : aspect === "4:5" ? [1080, 1350] : aspect === "16:9" ? [1920, 1080] : [1080, 1080];
}

export function fmtTime(t: number): string {
  const s = Math.max(0, t);
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
}

/** A clip as its own edit: the same video, trimmed to the clip, hook set. */
export function clipSettings(base: EditSettings, clip: Clip, duration: number): EditSettings {
  return { ...base, trimStart: Math.max(0, clip.start), trimEnd: Math.max(0, duration - clip.end), hook: clip.hook.slice(0, 90) };
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
