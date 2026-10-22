// The brand kit's own font (brand-kit, Leo only): one WOFF2, TTF or OTF file per brand, read and checked in the
// browser and kept as a data URL in its own synced key, so editing the kit never re-sends it. Registered as the
// font family "BrandFont" for the /brand sample and the video end card.
//   key: content-studio-brandfont-${scoped(userId)} = { name, data, addedAt }; data "" is a removed font, so the
//   removal syncs (cloudSync has no tombstones).

import { scoped } from "@/lib/profiles";
import { leoUser } from "@/lib/useLeoOnly";

export interface BrandFont {
  name: string;
  /** A base64 data URL of the font file; "" once removed. */
  data: string;
  addedAt: string;
}

export const BRAND_FONT_PREFIX = "content-studio-brandfont-";
export const BRAND_FONT_CHANGED = "content-studio-brandfont-changed";
export const BRAND_FONT_FAMILY = "BrandFont";
/** 300 KB, which is about 400,000 characters as a data URL. */
export const MAX_FONT_BYTES = 300_000;
export const FONT_TYPE_ERROR = "That file isn't a font this browser can read. Use WOFF2, TTF or OTF.";
export const FONT_SIZE_ERROR = "Fonts up to 300 KB. Try the WOFF2 version.";

type Kind = "woff2" | "otf" | "ttf";
const MIME: Record<Kind, string> = { woff2: "font/woff2", otf: "font/otf", ttf: "font/ttf" };

/** The font a file's first 4 bytes say it is: wOF2, OTTO, "true" or 00 01 00 00; null for anything else. */
export function fontKind(head: ArrayLike<number>): Kind | null {
  const tag = String.fromCharCode(...Array.from(head).slice(0, 4));
  if (tag === "wOF2") return "woff2";
  if (tag === "OTTO") return "otf";
  if (tag === "true" || tag === "\u0000\u0001\u0000\u0000") return "ttf";
  return null;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const DATA_URL = /^data:font\/(woff2|otf|ttf);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_DATA_CHARS = Math.ceil(MAX_FONT_BYTES / 3) * 4 + 20;

/** A stored data URL whose bytes still read as a font, under the cap; anything else is no font. */
function goodData(data: unknown): data is string {
  if (typeof data !== "string" || data.length > MAX_DATA_CHARS) return false;
  const m = data.match(DATA_URL);
  if (!m) return false;
  try {
    return fontKind(Array.from(atob(m[2].slice(0, 8)), (c) => c.charCodeAt(0))) !== null;
  } catch {
    return false;
  }
}

/** A picked file as a brand font, or the line saying why not. Checks the size, then the first bytes. */
export async function readFont(file: File, now = new Date()): Promise<{ ok: true; font: BrandFont } | { ok: false; error: string }> {
  if (file.size > MAX_FONT_BYTES) return { ok: false, error: FONT_SIZE_ERROR };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = fontKind(bytes);
  if (!kind) return { ok: false, error: FONT_TYPE_ERROR };
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 60) || "Your font";
  return { ok: true, font: { name, data: `data:${MIME[kind]};base64,${base64(bytes)}`, addedAt: now.toISOString() } };
}

const keyOf = (userId: string) => BRAND_FONT_PREFIX + scoped(userId);

/** This brand's font, or null when it has none, it was removed or it doesn't read. */
export function loadBrandFont(userId: string | null | undefined): BrandFont | null {
  if (!userId) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "null");
    if (!raw || !goodData(raw.data)) return null;
    return { name: String(raw.name ?? "").slice(0, 60) || "Your font", data: raw.data, addedAt: typeof raw.addedAt === "string" ? raw.addedAt : "" };
  } catch {
    return null;
  }
}

/** Saves the font, or removes it with null (kept as an empty record so the removal syncs). */
export function saveBrandFont(userId: string, font: BrandFont | null, now = new Date()): { ok: true } | { ok: false; error: string } {
  const next = font ?? { name: "", data: "", addedAt: now.toISOString() };
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(next));
  } catch {
    return { ok: false, error: "This device is out of room, so the font wasn't saved. Clear some space, then try again." };
  }
  window.dispatchEvent(new Event(BRAND_FONT_CHANGED));
  return { ok: true };
}

let face: { data: string; face: FontFace } | null = null;

/**
 * Makes `font` the page's "BrandFont" (replacing the one before), and says whether the browser could read it.
 * Null takes the family away.
 */
export async function registerBrandFont(font: BrandFont | null): Promise<boolean> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return false;
  if (face && face.data === font?.data) return true;
  if (face) document.fonts.delete(face.face);
  face = null;
  if (!font) return false;
  try {
    const loaded = await new FontFace(BRAND_FONT_FAMILY, await (await fetch(font.data)).arrayBuffer()).load();
    document.fonts.add(loaded);
    face = { data: font.data, face: loaded };
    return true;
  } catch {
    return false;
  }
}

/** For the video end card: "BrandFont" once Leo's brand font is loaded on this page; undefined for everyone else. */
export async function leoBrandFont(): Promise<string | undefined> {
  const leo = await leoUser().catch(() => null);
  if (!leo) return undefined;
  return (await registerBrandFont(loadBrandFont(leo.id))) ? BRAND_FONT_FAMILY : undefined;
}
