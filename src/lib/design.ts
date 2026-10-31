// Design (/design): a slideshow made of free layers (text, image, shape, fade) on a 1080-wide frame, the editor
// Volume (tryvolume.app) built, folded in with its founders' permission (Leo, 31 Oct 2026). The document shape
// matches Volume's own, so its templates load as they are. Everything here is pure apart from load and save;
// drawing is components/design/SlideView.tsx and export is designExport.ts.
//   synced: content-studio-designs-${scoped(userId)}, newest MAX_DESIGNS, sanitized on read
//   synced: content-studio-design-templates-${scoped(userId)}, the "Save as template" ones

import { scoped } from "@/lib/profiles";

export type DesignFormat = "tiktok" | "instagram";
export const FRAME_W = 1080;
export const FORMAT_H: Record<DesignFormat, number> = { tiktok: 1920, instagram: 1350 };
export const FORMAT_LABEL: Record<DesignFormat, string> = { tiktok: "TikTok 9:16", instagram: "Instagram 4:5" };

interface LayerBase {
  id: string;
  name: string;
  /** Pixels on the 1080-wide frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
}
export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export interface TextLayer extends LayerBase {
  type: "text";
  /** Words between [[ and ]] take the accent. */
  text: string;
  font: string;
  weight: number;
  italic: boolean;
  /** The size, or the largest it may grow to when auto_fit is on. */
  size: number;
  color: string;
  align: Align;
  valign: VAlign;
  direction: "auto" | "ltr" | "rtl";
  line_height: number;
  /** In em. */
  letter_spacing: number;
  caps: boolean;
  auto_fit: boolean;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; x: number; y: number; blur: number } | null;
  /** A highlight behind each line. */
  fill: { color: string; padding: number; radius: number } | null;
  strike: { color: string } | null;
  underline: { color: string } | null;
  accent: { color: string; font?: string; weight?: number; italic?: boolean; underline?: boolean } | null;
}
export interface ImageLayer extends LayerBase {
  type: "image";
  /** A web address, a device key (cimg-...) for a picture kept on this device, or brand:logo / brand:photo from the
   *  brand kit (they sync with the kit). Empty shows a placeholder. */
  src: string;
  fit: "cover" | "contain";
  focus_x: number;
  focus_y: number;
  mask: "none" | "ellipse" | "rounded";
  radius: number;
  border: { color: string; width: number } | null;
  look: Look;
  look_strength: number;
  /** A cut-out of the person in another image layer, drawn above the words (Volume's "Behind the subject"). */
  cutout: { of: string; src: string } | null;
}
export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: "rect" | "ellipse" | "line";
  color: string;
  radius: number;
  border: { color: string; width: number } | null;
}
export interface GradientLayer extends LayerBase {
  type: "gradient";
  angle: number;
  stops: { at: number; color: string; opacity: number }[];
}
export type Layer = TextLayer | ImageLayer | ShapeLayer | GradientLayer;
export type LayerType = Layer["type"];
export interface DesignSlide {
  id: string;
  background: string;
  layers: Layer[];
}
export interface Design {
  id: string;
  title: string;
  caption: string;
  format: DesignFormat;
  slides: DesignSlide[];
  /** The My posts entry it was saved or scheduled as. */
  draftId?: string;
  updatedAt: string;
}

export const MAX_DESIGNS = 40;
export const MAX_TEMPLATES = 20;
export const MAX_SLIDES = 20;
export const MAX_LAYERS = 60;
export const MAX_TEXT = 2000;
export const MAX_CAPTION = 2200;

// ---- fonts: the 18 Volume ships, with the weights and italics each has ----
export const FONTS: Record<string, { weights: number[]; italic: boolean }> = {
  Inter: { weights: [400, 500, 600, 700, 800], italic: true },
  "Inter Tight": { weights: [400, 500, 600, 700, 800, 900], italic: true },
  "DM Sans": { weights: [400, 500, 700], italic: true },
  Poppins: { weights: [400, 500, 600, 700, 800], italic: true },
  Montserrat: { weights: [400, 600, 800, 900], italic: true },
  Nunito: { weights: [400, 600, 700, 800, 900], italic: true },
  "Open Sans": { weights: [400, 600, 700, 800], italic: true },
  Oswald: { weights: [400, 500, 600, 700], italic: false },
  Anton: { weights: [400], italic: false },
  "Bebas Neue": { weights: [400], italic: false },
  "League Gothic": { weights: [400], italic: false },
  "Archivo Black": { weights: [400], italic: false },
  "Playfair Display": { weights: [400, 600, 700, 900], italic: true },
  Lora: { weights: [400, 500, 600, 700], italic: true },
  Merriweather: { weights: [400, 700, 900], italic: true },
  "PT Serif": { weights: [400, 700], italic: true },
  Caveat: { weights: [400, 600, 700], italic: false },
  "Courier Prime": { weights: [400, 700], italic: true },
};
export const FONT_NAMES = Object.keys(FONTS);
/** The brand kit's uploaded font (brandFont.ts registers it under this family). */
export const BRAND_FONT = "BrandFont";
export const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=League+Gothic&family=Archivo+Black" +
  "&family=Montserrat:ital,wght@0,400;0,600;0,800;0,900;1,400;1,600;1,800;1,900&family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800" +
  "&family=Inter+Tight:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800" +
  "&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,600;1,700;1,800;1,900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700" +
  "&family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600;1,700;1,800&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600;1,700;1,900" +
  "&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Merriweather:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900" +
  "&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&family=Caveat:wght@400;600;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap";

/** The nearest weight the font has (Anton only comes in 400, so a 700 asks for 400 rather than a smeared bold). */
export function fontWeight(font: string, weight: number): number {
  const ws = FONTS[font]?.weights;
  if (!ws) return weight;
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}
export const fontStack = (font: string) => `"${font}", "Noto Sans Symbols", system-ui, sans-serif`;

/** Loads the editor's fonts once (a stylesheet link, like the caption fonts). */
export function ensureDesignFonts(): void {
  if (typeof document === "undefined" || document.getElementById("design-fonts")) return;
  const link = document.createElement("link");
  link.id = "design-fonts";
  link.rel = "stylesheet";
  link.href = FONTS_CSS;
  document.head.appendChild(link);
}

// ---- photo looks: Volume's table, scaled by strength (50 = as listed, 100 = twice as strong) ----
export const LOOKS = [
  { value: "none", label: "None" },
  { value: "warm", label: "Warm" },
  { value: "golden", label: "Golden hour" },
  { value: "grainy", label: "Grainy" },
  { value: "film", label: "35mm" },
  { value: "cinematic", label: "Cinematic" },
  { value: "matte", label: "Soft matte" },
  { value: "faded", label: "Faded" },
  { value: "bleach", label: "Sun-bleached" },
  { value: "nordic", label: "Nordic" },
  { value: "moody", label: "Moody" },
  { value: "vivid", label: "Vivid" },
  { value: "bw", label: "B&W" },
  { value: "noir", label: "Noir" },
] as const;
export type Look = (typeof LOOKS)[number]["value"];
type LookMix = { sepia: number; saturate: number; grayscale: number; brightness: number; contrast: number; grain: boolean };
const PLAIN: LookMix = { sepia: 0, saturate: 1, grayscale: 0, brightness: 1, contrast: 1, grain: false };
const mix = (m: Partial<LookMix>): LookMix => ({ ...PLAIN, ...m });
const LOOK_MIX: Record<Look, LookMix> = {
  none: PLAIN,
  grainy: mix({ contrast: 1.06, saturate: 0.9, brightness: 0.98, grain: true }),
  cinematic: mix({ contrast: 1.14, saturate: 1.18, brightness: 0.97 }),
  bw: mix({ grayscale: 1, contrast: 1.08 }),
  warm: mix({ sepia: 0.24, saturate: 1.15, contrast: 1.02 }),
  faded: mix({ contrast: 0.88, brightness: 1.07, saturate: 0.8 }),
  golden: mix({ sepia: 0.35, saturate: 1.25, brightness: 1.05, contrast: 0.98 }),
  film: mix({ sepia: 0.12, saturate: 1.1, contrast: 1.08, brightness: 0.99, grain: true }),
  matte: mix({ sepia: 0.06, saturate: 0.9, contrast: 0.85, brightness: 1.05 }),
  nordic: mix({ saturate: 0.75, contrast: 1.03, brightness: 1.04 }),
  moody: mix({ saturate: 0.85, contrast: 1.18, brightness: 0.9 }),
  bleach: mix({ sepia: 0.15, saturate: 0.85, contrast: 0.82, brightness: 1.12 }),
  noir: mix({ grayscale: 1, contrast: 1.25, brightness: 0.95, grain: true }),
  vivid: mix({ saturate: 1.4, contrast: 1.08 }),
};
const isLook = (v: unknown): v is Look => LOOKS.some((l) => l.value === v);
const strengthOf = (s: number) => clamp(s, 0, 100) / 50;
const r4 = (n: number) => Number(n.toFixed(4));

/** The CSS filter for a look at a strength, or undefined for none. */
export function lookFilter(look: Look, strength = 50): string | undefined {
  const k = strengthOf(strength);
  const m = LOOK_MIX[look] ?? PLAIN;
  const parts: string[] = [];
  const sepia = Math.min(1, m.sepia * k);
  const sat = Math.max(0, 1 + (m.saturate - 1) * k);
  const gray = Math.min(1, m.grayscale * k);
  const bright = Math.max(0, 1 + (m.brightness - 1) * k);
  const con = Math.max(0, 1 + (m.contrast - 1) * k);
  if (sepia > 0) parts.push(`sepia(${r4(sepia)})`);
  if (sat !== 1) parts.push(`saturate(${r4(sat)})`);
  if (gray > 0) parts.push(`grayscale(${r4(gray)})`);
  if (bright !== 1) parts.push(`brightness(${r4(bright)})`);
  if (con !== 1) parts.push(`contrast(${r4(con)})`);
  return parts.length ? parts.join(" ") : undefined;
}
/** How strongly the film grain shows over a picture, 0 when the look has none. */
export const grainOpacity = (look: Look, strength = 50) => (LOOK_MIX[look]?.grain ? Math.min(0.85, 0.25 * strengthOf(strength) ** 1.5) : 0);
export const GRAIN =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="128" height="128" filter="url(#n)" opacity="0.55"/></svg>',
  );

// ---- small pure helpers the renderer uses ----
const ACCENT = /\[\[([\s\S]+?)\]\]/g;
/** Splits words into plain and accent runs: "a [[b]] c" is a, b (accent), c. */
export function accentRuns(text: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(ACCENT)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), accent: false });
    out.push({ text: m[1] ?? "", accent: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), accent: false });
  return out;
}
/** The words as they read, accent marks removed (for captions, names and checks). */
export const plainText = (text: string) => text.replace(ACCENT, "$1");

function hexRgb(hex: string): [number, number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) h = "000000";
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}
/** A fade layer's CSS background. */
export function gradientCss(angle: number, stops: GradientLayer["stops"]): string {
  const parts = stops.map((s) => {
    const [r, g, b, a] = hexRgb(s.color);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * s.opacity * 1e4) / 1e4}) ${s.at}%`;
  });
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}

// ---- ids and new layers (Volume's defaults) ----
let seq = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const base = (name: string, x: number, y: number, w: number, h: number): LayerBase => ({ id: "", name, x, y, w, h, rotation: 0, opacity: 1, hidden: false, locked: false });

export function newLayer(type: LayerType, format: DesignFormat): Layer {
  const H = FORMAT_H[format];
  switch (type) {
    case "text":
      return {
        ...base("Text", 80, Math.round(0.4 * H), 920, 260),
        id: newId("txt"),
        type,
        text: "Your text",
        font: "Inter",
        weight: 600,
        italic: false,
        size: 72,
        color: "#ffffff",
        align: "left",
        valign: "top",
        direction: "auto",
        line_height: 1.15,
        letter_spacing: 0,
        caps: false,
        auto_fit: false,
        stroke: null,
        shadow: null,
        fill: null,
        strike: null,
        underline: null,
        accent: null,
      };
    case "image":
      return { ...base("Image", 0, 0, FRAME_W, H), id: newId("img"), type, src: "", fit: "cover", focus_x: 50, focus_y: 50, mask: "none", radius: 0, border: null, look: "none", look_strength: 50, cutout: null };
    case "shape":
      return { ...base("Shape", 340, Math.round(H / 2 - 200), 400, 400), id: newId("shp"), type, shape: "rect", color: "#ffffff", radius: 0, border: null };
    case "gradient": {
      const y = Math.round(0.35 * H);
      return {
        ...base("Fade", 0, y, FRAME_W, H - y),
        id: newId("grd"),
        type,
        angle: 180,
        stops: [
          { at: 0, color: "#000000", opacity: 0 },
          { at: 45, color: "#000000", opacity: 0.85 },
          { at: 100, color: "#000000", opacity: 1 },
        ],
      };
    }
  }
}
export const newSlide = (background = "#000000"): DesignSlide => ({ id: newId("sld"), background, layers: [] });

/** A copy with fresh ids, so a duplicated slide or template never shares a layer id. */
export function freshSlide(s: DesignSlide): DesignSlide {
  const ids = new Map(s.layers.map((l) => [l.id, newId(l.id.split("_")[0] || "lyr")]));
  return {
    id: newId("sld"),
    background: s.background,
    layers: s.layers.map((l) => {
      const id = ids.get(l.id)!;
      return l.type === "image" && l.cutout ? { ...l, id, cutout: { ...l.cutout, of: ids.get(l.cutout.of) ?? l.cutout.of } } : { ...l, id };
    }),
  };
}

export function newDesign(format: DesignFormat, title = "Untitled slideshow", slides?: DesignSlide[]): Design {
  return { id: newId("dsg"), title, caption: "", format, slides: slides?.length ? slides.map(freshSlide) : [newSlide()], updatedAt: new Date().toISOString() };
}

// ---- sanitizing (synced data comes back from other devices and older versions) ----
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
const HEX = /^#[0-9a-f]{3,8}$/i;
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
/** Pictures may be https links, same-site paths (the template photos), device keys or the brand kit's logo and headshot. */
const SRC = /^(https:\/\/|\/templates\/|cimg-|brand:(logo|photo)$)/;
const border = (v: unknown) => (obj(v) ? { color: color(v.color, "#ffffff"), width: num(v.width, 2, 0, 200) } : null);

export function sanitizeLayer(raw: unknown, format: DesignFormat): Layer | null {
  if (!obj(raw)) return null;
  const type = raw.type;
  if (type !== "text" && type !== "image" && type !== "shape" && type !== "gradient") return null;
  const d = newLayer(type, format);
  const H = FORMAT_H[format];
  const b: LayerBase = {
    id: str(raw.id, 40) || d.id,
    name: str(raw.name, 80) || d.name,
    x: num(raw.x, d.x, -FRAME_W, 2 * FRAME_W),
    y: num(raw.y, d.y, -H, 2 * H),
    w: num(raw.w, d.w, 1, 3 * FRAME_W),
    h: num(raw.h, d.h, 1, 3 * H),
    rotation: num(raw.rotation, 0, -360, 360),
    opacity: num(raw.opacity, 1, 0, 1),
    hidden: raw.hidden === true,
    locked: raw.locked === true,
  };
  if (d.type === "text") {
    const deco = (v: unknown) => (obj(v) ? { color: color(v.color, color(raw.color, d.color)) } : v === true ? { color: color(raw.color, d.color) } : null);
    const a = raw.accent;
    return {
      ...d,
      ...b,
      text: str(raw.text, MAX_TEXT, d.text),
      font: str(raw.font, 80) || d.font,
      weight: num(raw.weight, d.weight, 100, 900),
      italic: raw.italic === true,
      size: num(raw.size, d.size, 8, 600),
      color: color(raw.color, d.color),
      align: pick(raw.align, ["left", "center", "right"] as const, d.align),
      valign: pick(raw.valign, ["top", "middle", "bottom"] as const, d.valign),
      direction: pick(raw.direction, ["auto", "ltr", "rtl"] as const, "auto"),
      line_height: num(raw.line_height, d.line_height, 0.6, 3),
      letter_spacing: num(raw.letter_spacing, 0, -0.2, 1),
      caps: raw.caps === true,
      auto_fit: raw.auto_fit === true,
      stroke: obj(raw.stroke) ? { color: color(raw.stroke.color, "#000000"), width: num(raw.stroke.width, 6, 0, 80) } : null,
      shadow: obj(raw.shadow) ? { color: color(raw.shadow.color, "#000000"), x: num(raw.shadow.x, 0, -200, 200), y: num(raw.shadow.y, 4, -200, 200), blur: num(raw.shadow.blur, 12, 0, 200) } : null,
      fill: obj(raw.fill) ? { color: color(raw.fill.color, "#000000"), padding: num(raw.fill.padding, 16, 0, 200), radius: num(raw.fill.radius, 0, 0, 400) } : null,
      strike: deco(raw.strike),
      underline: deco(raw.underline),
      accent: obj(a)
        ? {
            color: color(a.color, "#00e676"),
            ...(typeof a.weight === "number" ? { weight: num(a.weight, 700, 100, 900) } : {}),
            ...(a.underline === true ? { underline: true } : {}),
            ...(typeof a.italic === "boolean" ? { italic: a.italic } : {}),
            ...(typeof a.font === "string" && a.font.trim() ? { font: a.font.trim().slice(0, 80) } : {}),
          }
        : null,
    };
  }
  if (d.type === "image") {
    const src = typeof raw.src === "string" && SRC.test(raw.src) ? raw.src.slice(0, 2000) : "";
    const cut = raw.cutout;
    return {
      ...d,
      ...b,
      src,
      fit: pick(raw.fit, ["cover", "contain"] as const, "cover"),
      focus_x: num(raw.focus_x, 50, 0, 100),
      focus_y: num(raw.focus_y, 50, 0, 100),
      mask: pick(raw.mask, ["none", "ellipse", "rounded"] as const, "none"),
      radius: num(raw.radius, 0, 0, 2000),
      border: border(raw.border),
      look: isLook(raw.look) ? raw.look : "none",
      look_strength: num(raw.look_strength, 50, 0, 100),
      cutout: obj(cut) && typeof cut.of === "string" && cut.of && typeof cut.src === "string" && SRC.test(cut.src) ? { of: cut.of.slice(0, 40), src: cut.src.slice(0, 2000) } : null,
    };
  }
  if (d.type === "shape") {
    return { ...d, ...b, shape: pick(raw.shape, ["rect", "ellipse", "line"] as const, "rect"), color: color(raw.color, d.color), radius: num(raw.radius, 0, 0, 2000), border: border(raw.border) };
  }
  const stops = (Array.isArray(raw.stops) ? raw.stops : [])
    .filter(obj)
    .slice(0, 8)
    .map((s) => ({ at: num(s.at, 0, 0, 100), color: color(s.color, "#000000"), opacity: num(s.opacity, 1, 0, 1) }))
    .sort((p, q) => p.at - q.at);
  return { ...d, ...b, angle: num(raw.angle, 180, 0, 360), stops: stops.length >= 2 ? stops : d.stops };
}

export function sanitizeDesign(raw: unknown): Design | null {
  if (!obj(raw) || typeof raw.id !== "string") return null;
  const format = pick(raw.format, ["tiktok", "instagram"] as const, "tiktok");
  const slides = (Array.isArray(raw.slides) ? raw.slides : [])
    .filter(obj)
    .slice(0, MAX_SLIDES)
    .map((s) => ({
      id: str(s.id, 40) || newId("sld"),
      background: color(s.background, "#000000"),
      layers: (Array.isArray(s.layers) ? s.layers : [])
        .slice(0, MAX_LAYERS)
        .map((l) => sanitizeLayer(l, format))
        .filter((l): l is Layer => !!l),
    }));
  if (!slides.length) return null;
  return {
    id: raw.id.slice(0, 40),
    title: str(raw.title, 120) || "Untitled slideshow",
    caption: str(raw.caption, MAX_CAPTION),
    format,
    slides,
    ...(typeof raw.draftId === "string" ? { draftId: raw.draftId.slice(0, 60) } : {}),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

// ---- load and save ----
const PREFIX = "content-studio-designs-";
const TEMPLATES_PREFIX = "content-studio-design-templates-";
export const DESIGNS_CHANGED = "content-studio-designs-changed";
const storage = () => (typeof localStorage === "undefined" ? null : localStorage);

function read(key: string): Design[] {
  try {
    const raw = JSON.parse(storage()?.getItem(key) ?? "[]");
    return (Array.isArray(raw) ? raw : []).map(sanitizeDesign).filter((d): d is Design => !!d);
  } catch {
    return [];
  }
}
function write(key: string, list: Design[]): Design[] {
  try {
    storage()?.setItem(key, JSON.stringify(list));
  } catch {
    // storage full or blocked: the list still shows for this visit
  }
  globalThis.dispatchEvent?.(new Event(DESIGNS_CHANGED));
  return list;
}

export const loadDesigns = (userId: string | null | undefined): Design[] => (userId ? read(PREFIX + scoped(userId)) : []);
export const designById = (userId: string | null | undefined, id: string | undefined) => (id ? (loadDesigns(userId).find((d) => d.id === id) ?? null) : null);
/** Saves (or replaces) one design, newest first, keeping the latest MAX_DESIGNS. */
export function saveDesign(userId: string, d: Design, now = new Date()): Design[] {
  return write(PREFIX + scoped(userId), [{ ...d, updatedAt: now.toISOString() }, ...loadDesigns(userId).filter((x) => x.id !== d.id)].slice(0, MAX_DESIGNS));
}
export const removeDesign = (userId: string, id: string) => write(PREFIX + scoped(userId), loadDesigns(userId).filter((x) => x.id !== id));

export const loadOwnTemplates = (userId: string | null | undefined): Design[] => (userId ? read(TEMPLATES_PREFIX + scoped(userId)) : []);
/** "Save as template": a copy anyone on this account can start from. */
export function saveOwnTemplate(userId: string, d: Design, now = new Date()): Design[] {
  const t = { ...d, id: newId("tpl"), draftId: undefined, updatedAt: now.toISOString() };
  return write(TEMPLATES_PREFIX + scoped(userId), [t, ...loadOwnTemplates(userId)].slice(0, MAX_TEMPLATES));
}
export const removeOwnTemplate = (userId: string, id: string) => write(TEMPLATES_PREFIX + scoped(userId), loadOwnTemplates(userId).filter((x) => x.id !== id));

// ---- the built-in templates (Volume's 16, src/data/designTemplates.json, loaded when the gallery opens) ----
export interface DesignTemplate {
  id: string;
  name: string;
  blurb: string;
  docs: Partial<Record<DesignFormat, { slides: DesignSlide[] }>>;
}
export async function loadTemplates(): Promise<DesignTemplate[]> {
  const raw = (await import("@/data/designTemplates.json")).default as unknown[];
  return raw.flatMap((t) => {
    if (!obj(t) || typeof t.id !== "string" || !obj(t.docs)) return [];
    const docs: DesignTemplate["docs"] = {};
    for (const f of ["tiktok", "instagram"] as const) {
      const d = sanitizeDesign({ id: t.id, format: f, slides: (t.docs[f] as { slides?: unknown } | undefined)?.slides });
      if (d) docs[f] = { slides: d.slides };
    }
    return [{ id: t.id, name: str(t.name, 80), blurb: str(t.blurb, 200), docs }];
  });
}
