// Draws one campaign slide to a PNG on the server: a photo, the campaign's look and overlay, and the slide's words in
// the role's text style (Volume's campaign renderer, folded in). Satori lays the slide out as SVG, the look is added
// as SVG colour filters (Satori has no CSS filter), and resvg paints the PNG. Fonts come from Google Fonts as TTF and
// are kept for the life of the worker.

import satori from "npm:satori@0.63.2";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";

import {
  CAMPAIGN_FONTS,
  FRAME_H,
  FRAME_W,
  SAFE_BOTTOM,
  SAFE_TOP,
  SIZE_PX,
  lookFilterSvg,
  overlayCss,
  type CampaignFont,
  type Overlay,
  type SlideFormat,
  type TextStyle,
} from "./slideStyle.ts";

export * from "./slideStyle.ts";

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

let wasm: Promise<void> | null = null;
function ensureWasm() {
  wasm ??= initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")).catch((e) => ((wasm = null), Promise.reject(e)));
  return wasm;
}

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
  /** A data: URL or https link (Satori fetches it), or null for a plain background. */
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
export async function slideSvg(s: SlideInput): Promise<string> {
  const H = FRAME_H[s.format];
  const px = SIZE_PX[s.style.size];
  const want: { name: string; weight: number; italic: boolean }[] = [{ name: s.style.font, weight: weightOf(s.style.font), italic: false }];
  if (s.style.italic && ITALICS.has(s.style.font)) want.push({ name: s.style.font, weight: weightOf(s.style.font), italic: true });
  if (s.badge) want.push({ name: "Inter", weight: 400, italic: false }, { name: "Inter", weight: 700, italic: false });
  const fonts = await Promise.all(
    want.map(async (w) => ({ name: w.name, data: await fontData(w.name, w.weight, w.italic), weight: w.weight as 400 | 700, style: (w.italic ? "italic" : "normal") as "italic" | "normal" })),
  );
  const shade = overlayCss(s.overlay);
  const align = s.style.v === "top" ? "flex-start" : s.style.v === "bottom" ? "flex-end" : "center";
  const children: unknown[] = [];
  if (s.photo) children.push({ type: "img", props: { src: s.photo, width: FRAME_W, height: H, style: { position: "absolute", left: 0, top: 0, width: FRAME_W, height: H, objectFit: "cover" } } });
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
  let svg = await satori(el("div", { display: "flex", position: "relative", width: FRAME_W, height: H, backgroundColor: s.background ?? "#000000" }, children) as never, { width: FRAME_W, height: H, fonts });
  const look = s.photo ? lookFilterSvg(s.look ?? "none", s.lookStrength ?? 50) : null;
  if (look) {
    // the photo is Satori's first <image>: put the look on it alone
    svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs><filter id="look" color-interpolation-filters="sRGB">${look}</filter></defs>`).replace(/<image /, '<image filter="url(#look)" ');
  }
  return svg;
}

export async function renderSlide(s: SlideInput): Promise<Uint8Array> {
  const [svg] = await Promise.all([slideSvg(s), ensureWasm()]);
  return new Resvg(svg, { fitTo: { mode: "width", value: FRAME_W } }).render().asPng();
}

/** A plain black "Download on the App Store" badge (drawn, not Apple's artwork). */
function appStoreBadge(): El {
  return el("div", { display: "flex", flexDirection: "column", backgroundColor: "#000000", border: "3px solid #a6a6a6", borderRadius: 22, padding: "14px 36px", color: "#ffffff" }, [
    el("span", { fontFamily: "Inter", fontSize: 26, lineHeight: 1.1 }, "Download on the"),
    el("span", { fontFamily: "Inter", fontSize: 52, fontWeight: 700, lineHeight: 1.05 }, "App Store"),
  ]);
}
