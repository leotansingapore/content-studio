// Slideshow campaign slide styles (Volume's campaign text styles, looks and overlays): pure, shared by the server
// renderer (slideRender.ts) and the campaign logic, and tested in vitest.

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
