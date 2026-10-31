// Drawing one campaign slide (Volume's campaign renderer, folded in): the text styles, looks and overlays, and the
// slide laid out as SVG by a Satori the caller passes in. Imports nothing, so the Supabase function (Deno,
// slideRender.ts) and the Vercel drawer (Node, api/slide-render.ts) share it; the client imports its styles.

export type SlideFormat = "tiktok" | "instagram";
export const FRAME_W = 1080;
export const FRAME_H: Record<SlideFormat, number> = { tiktok: 1920, instagram: 1350 };

export const CAMPAIGN_FONTS = ["TikTok Sans", "Inter", "DM Sans", "Montserrat", "Poppins", "Anton", "Bebas Neue", "Playfair Display", "Courier Prime"] as const;
export type CampaignFont = (typeof CAMPAIGN_FONTS)[number];
export type TextBg = "none" | "bar" | "soft" | "outline" | "snap";
export interface TextStyle {
  v: "top" | "middle" | "bottom";
  h: "left" | "center" | "right";
  size: "sm" | "md" | "lg";
  font: CampaignFont;
  italic: boolean;
  caps: boolean;
  bg: TextBg;
  /** #rrggbb */
  color: string;
}
export const DEFAULT_STYLE: TextStyle = { v: "middle", h: "center", size: "md", font: "TikTok Sans", italic: false, caps: false, bg: "none", color: "#ffffff" };
export interface Overlay {
  kind: "none" | "dim" | "bottom" | "top";
  /** 0-100 */
  strength: number;
}
export const SIZE_PX: Record<TextStyle["size"], number> = { sm: 46, md: 58, lg: 76 };
export const SAFE_TOP = 200;
export const SAFE_BOTTOM = 320;

// ---- looks, as in the editor (src/lib/design.ts LOOK_MIX) ----
type Mix = { sepia: number; saturate: number; grayscale: number; brightness: number; contrast: number };
const P: Mix = { sepia: 0, saturate: 1, grayscale: 0, brightness: 1, contrast: 1 };
export const LOOK_MIX: Record<string, Mix> = {
  none: P,
  grainy: { ...P, contrast: 1.06, saturate: 0.9, brightness: 0.98 },
  cinematic: { ...P, contrast: 1.14, saturate: 1.18, brightness: 0.97 },
  bw: { ...P, grayscale: 1, contrast: 1.08 },
  warm: { ...P, sepia: 0.24, saturate: 1.15, contrast: 1.02 },
  faded: { ...P, contrast: 0.88, brightness: 1.07, saturate: 0.8 },
  golden: { ...P, sepia: 0.35, saturate: 1.25, brightness: 1.05, contrast: 0.98 },
  film: { ...P, sepia: 0.12, saturate: 1.1, contrast: 1.08, brightness: 0.99 },
  matte: { ...P, sepia: 0.06, saturate: 0.9, contrast: 0.85, brightness: 1.05 },
  nordic: { ...P, saturate: 0.75, contrast: 1.03, brightness: 1.04 },
  moody: { ...P, saturate: 0.85, contrast: 1.18, brightness: 0.9 },
  bleach: { ...P, sepia: 0.15, saturate: 0.85, contrast: 0.82, brightness: 1.12 },
  noir: { ...P, grayscale: 1, contrast: 1.25, brightness: 0.95 },
  vivid: { ...P, saturate: 1.4, contrast: 1.08 },
};

/** The look as SVG filter primitives, the same maths as CSS sepia/saturate/grayscale/brightness/contrast. */
export function lookFilterSvg(look: string, strength = 50): string | null {
  const m = LOOK_MIX[look];
  if (!m || look === "none") return null;
  const k = Math.min(100, Math.max(0, strength)) / 50;
  const sepia = Math.min(1, m.sepia * k);
  const sat = Math.max(0, 1 + (m.saturate - 1) * k);
  const gray = Math.min(1, m.grayscale * k);
  const b = Math.max(0, 1 + (m.brightness - 1) * k);
  const c = Math.max(0, 1 + (m.contrast - 1) * k);
  const f = (n: number) => Number(n.toFixed(4));
  const out: string[] = [];
  if (sepia > 0) {
    const s = sepia;
    // CSS sepia(s): the W3C filter-effects matrix, mixed with identity by s
    const M = [
      [0.393 + 0.607 * (1 - s), 0.769 - 0.769 * (1 - s), 0.189 - 0.189 * (1 - s)],
      [0.349 - 0.349 * (1 - s), 0.686 + 0.314 * (1 - s), 0.168 - 0.168 * (1 - s)],
      [0.272 - 0.272 * (1 - s), 0.534 - 0.534 * (1 - s), 0.131 + 0.869 * (1 - s)],
    ];
    out.push(`<feColorMatrix type="matrix" values="${M.map((r) => `${r.map(f).join(" ")} 0 0`).join(" ")} 0 0 0 1 0"/>`);
  }
  if (sat !== 1) out.push(`<feColorMatrix type="saturate" values="${f(sat)}"/>`);
  if (gray > 0) out.push(`<feColorMatrix type="saturate" values="${f(1 - gray)}"/>`);
  if (b !== 1) out.push(`<feComponentTransfer><feFuncR type="linear" slope="${f(b)}"/><feFuncG type="linear" slope="${f(b)}"/><feFuncB type="linear" slope="${f(b)}"/></feComponentTransfer>`);
  if (c !== 1) {
    const i = f(-(0.5 * c) + 0.5);
    out.push(`<feComponentTransfer><feFuncR type="linear" slope="${f(c)}" intercept="${i}"/><feFuncG type="linear" slope="${f(c)}" intercept="${i}"/><feFuncB type="linear" slope="${f(c)}" intercept="${i}"/></feComponentTransfer>`);
  }
  return out.length ? out.join("") : null;
}

/** Volume's overlay: an even dim, or a fade from clear to dark over the lower or upper part. */
export function overlayCss(o: Overlay, heightPct = 65): string | null {
  if (o.kind === "none" || o.strength <= 0) return null;
  const a = Math.min(100, o.strength) / 100;
  const clear = 100 - heightPct;
  if (o.kind === "dim") return `rgba(0,0,0,${a})`;
  return `linear-gradient(to ${o.kind === "bottom" ? "bottom" : "top"}, rgba(0,0,0,0) ${clear}%, rgba(0,0,0,${a}) 100%)`;
}

// ---- fonts ----
const fontCache = new Map<string, Promise<ArrayBuffer>>();
async function fontData(family: string, weight: number, italic: boolean): Promise<ArrayBuffer> {
  const key = `${family}|${weight}|${italic}`;
  if (!fontCache.has(key)) {
    const q = `${family.replace(/ /g, "+")}:${italic ? "ital," : ""}wght@${italic ? "1," : ""}${weight}`;
    const p = fetch(`https://fonts.googleapis.com/css2?family=${q}`, { headers: { "user-agent": "curl/8" } })
      .then((r) => r.text())
      .then((css) => {
        const url = /src:\s*url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
        if (!url) throw new Error(`no TTF for ${family} ${weight}`);
        return fetch(url).then((r) => r.arrayBuffer());
      })
      .catch((e) => (fontCache.delete(key), Promise.reject(e)));
    fontCache.set(key, p);
  }
  return fontCache.get(key)!;
}
// Anton, Bebas Neue: one weight only
const WEIGHT: Partial<Record<CampaignFont, number>> = { Anton: 400, "Bebas Neue": 400, "Courier Prime": 700, "Playfair Display": 700 };
const weightOf = (f: CampaignFont) => WEIGHT[f] ?? 700;
const ITALICS = new Set<CampaignFont>(["Inter", "DM Sans", "Montserrat", "Poppins", "Playfair Display", "Courier Prime"]);

// ---- layout ----
type El = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): El => ({ type, props: { style, children } });

const luminance = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The words block in a text style: each word its own box so Bar and Soft read as boxes behind each line. */
function wordsBlock(text: string, s: TextStyle, px: number): El {
  const plain = text.replace(/\[\[([\s\S]+?)\]\]/g, "$1");
  const words = (s.caps ? plain.toUpperCase() : plain).split(/\s+/).filter(Boolean);
  const dark = luminance(s.color) < 0.5;
  const ink = s.bg === "bar" ? (dark ? "#ffffff" : "#000000") : s.color;
  const base: Record<string, unknown> = {
    fontFamily: s.font,
    fontWeight: weightOf(s.font),
    fontStyle: s.italic && ITALICS.has(s.font) ? "italic" : "normal",
    fontSize: px,
    lineHeight: 1.2,
    color: ink,
  };
  if (s.bg === "none") base.textShadow = "0px 3px 12px rgba(0,0,0,0.6)";
  if (s.bg === "outline") {
    // a ring of hard shadows reads as an outline (Satori draws no text stroke)
    const o = Math.max(2, Math.round(px * 0.06));
    base.textShadow = [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, -o], [o, -o], [-o, o]].map(([x, y]) => `${x}px ${y}px 0px #000000`).join(", ");
  }
  const box = s.bg === "bar" ? s.color : s.bg === "soft" ? "rgba(0,0,0,0.55)" : null;
  const items = words.map((w) =>
    el("span", { ...base, ...(box ? { backgroundColor: box, padding: `${Math.round(px * 0.08)}px ${Math.round(px * 0.18)}px` } : { padding: `0 ${Math.round(px * 0.13)}px` }) }, w),
  );
  const justify = s.h === "left" ? "flex-start" : s.h === "right" ? "flex-end" : "center";
  const block = el("div", { display: "flex", flexWrap: "wrap", justifyContent: justify, rowGap: box ? Math.round(px * 0.12) : 0, maxWidth: FRAME_W - 2 * 84 }, items);
  return s.bg === "snap" ? el("div", { display: "flex", width: FRAME_W, justifyContent: justify, backgroundColor: "rgba(0,0,0,0.6)", padding: `${Math.round(px * 0.4)}px 84px` }, [block]) : block;
}

export interface SlideInput {
  format: SlideFormat;
  /** A data: URL, or an https link fetched when drawing; null for a plain background. */
  photo: string | null;
  background?: string;
  text: string;
  style: TextStyle;
  look?: string;
  lookStrength?: number;
  overlay: Overlay;
  /** "Download on the App Store" badge under the words (CTA slides). */
  badge?: boolean;
}

/** One slide as SVG (exposed for tests) and PNG. */
/** A Satori-compatible layout function: the caller brings it, so this file imports nothing and runs in Deno and Node. */
export type Satori = (el: unknown, o: { width: number; height: number; fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" | "italic" }[] }) => Promise<string>;

/** One slide as SVG. */
export async function slideSvg(s: SlideInput, satori: Satori): Promise<string> {
  const H = FRAME_H[s.format];
  const px = SIZE_PX[s.style.size];
  const want: { name: string; weight: number; italic: boolean }[] = [{ name: s.style.font, weight: weightOf(s.style.font), italic: false }];
  if (s.style.italic && ITALICS.has(s.style.font)) want.push({ name: s.style.font, weight: weightOf(s.style.font), italic: true });
  if (s.badge) want.push({ name: "Inter", weight: 400, italic: false }, { name: "Inter", weight: 700, italic: false });
  const fonts = await Promise.all(
    want.map(async (w) => ({ name: w.name, data: await fontData(w.name, w.weight, w.italic), weight: w.weight as 400 | 700, style: (w.italic ? "italic" : "normal") as "italic" | "normal" })),
  );
  // a link is fetched here; a data URL is drawn as it is
  const photo = s.photo && !s.photo.startsWith("data:") ? await photoData(s.photo) : s.photo;
  const shade = overlayCss(s.overlay);
  const align = s.style.v === "top" ? "flex-start" : s.style.v === "bottom" ? "flex-end" : "center";
  const children: unknown[] = [];
  if (photo) children.push({ type: "img", props: { src: photo, width: FRAME_W, height: H, style: { position: "absolute", left: 0, top: 0, width: FRAME_W, height: H, objectFit: "cover" } } });
  if (shade) children.push(el("div", { position: "absolute", left: 0, top: 0, width: FRAME_W, height: H, ...(shade.startsWith("rgba") ? { backgroundColor: shade } : { backgroundImage: shade }) }));
  const words = [wordsBlock(s.text, s.style, px)];
  if (s.badge) words.push(appStoreBadge());
  children.push(
    el(
      "div",
      // the safe area: clear of TikTok's top bar and caption, inset 84 px a side (none for a full-width snap band)
      { position: "absolute", left: s.style.bg === "snap" ? 0 : 84, top: SAFE_TOP, width: s.style.bg === "snap" ? FRAME_W : FRAME_W - 168, height: H - SAFE_TOP - SAFE_BOTTOM, display: "flex", flexDirection: "column", justifyContent: align, alignItems: s.style.h === "left" ? "flex-start" : s.style.h === "right" ? "flex-end" : "center", gap: 36 },
      words,
    ),
  );
  let svg = await satori(el("div", { display: "flex", position: "relative", width: FRAME_W, height: H, backgroundColor: s.background ?? "#000000" }, children), { width: FRAME_W, height: H, fonts });
  const look = photo ? lookFilterSvg(s.look ?? "none", s.lookStrength ?? 50) : null;
  if (look) {
    // the photo is Satori's first <image>: put the look on it alone
    svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs><filter id="look" color-interpolation-filters="sRGB">${look}</filter></defs>`).replace(/<image /, '<image filter="url(#look)" ');
  }
  return svg;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** A photo as a data URL Satori can draw, or null when it can't be fetched. */
export async function photoData(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    return `data:${type};base64,${b64(new Uint8Array(await r.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

/** A plain black "Download on the App Store" badge (drawn, not Apple's artwork). */
function appStoreBadge(): El {
  return el("div", { display: "flex", flexDirection: "column", backgroundColor: "#000000", border: "3px solid #a6a6a6", borderRadius: 22, padding: "14px 36px", color: "#ffffff" }, [
    el("span", { fontFamily: "Inter", fontSize: 26, lineHeight: 1.1 }, "Download on the"),
    el("span", { fontFamily: "Inter", fontSize: 52, fontWeight: 700, lineHeight: 1.05 }, "App Store"),
  ]);
}
