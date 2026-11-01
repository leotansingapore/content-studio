// The brand kit's own fonts (brand-kit, Leo only): up to five WOFF2, TTF or OTF files per brand, as Volume
// (tryvolume.app) allows several (Leo, 1 Nov 2026). Each is read and checked in the browser and kept as a data URL in
// its own synced key, so editing the kit never re-sends one. Each draws as its own family, BRAND_FAMILIES: the /brand
// sample, the slideshow editor and its PNG export, and the video end card (the first font).
//   keys: content-studio-brandfont-${scoped(userId)} (the one key the single font always had) and
//   content-studio-brandfont{2-5}-${scoped(userId)}, each { name, data, addedAt, family }; data "" is a removed font,
//   so the removal syncs (cloudSync has no tombstones). A font saved before 1 Nov has no family: it is "BrandFont",
//   so layers naming it keep drawing it. The first key always holds a font while the brand has one, so a reader of
//   the old one-font shape still gets a font.

import { scoped } from "@/lib/profiles";
import { leoUser } from "@/lib/useLeoOnly";

export interface BrandFont {
  name: string;
  /** A base64 data URL of the font file; "" once removed. */
  data: string;
  addedAt: string;
  /** The family it draws as (BRAND_FAMILIES); missing on a font saved before several were allowed. */
  family?: string;
}
/** A stored font, with the family layers name it by. */
export type UploadedFont = BrandFont & { family: string };

export const BRAND_FONT_PREFIX = "content-studio-brandfont-";
export const BRAND_FONT_CHANGED = "content-studio-brandfont-changed";
export const BRAND_FONT_FAMILY = "BrandFont";
export const MAX_BRAND_FONTS = 5;
/** One family per uploaded font; plain identifiers, so FontFace and CSS take them unquoted. */
export const BRAND_FAMILIES = [BRAND_FONT_FAMILY, "BrandFont2", "BrandFont3", "BrandFont4", "BrandFont5"];
/** 300 KB, which is about 400,000 characters as a data URL. */
export const MAX_FONT_BYTES = 300_000;
export const FONT_TYPE_ERROR = "That file isn't a font this browser can read. Use WOFF2, TTF or OTF.";
export const FONT_SIZE_ERROR = "Fonts up to 300 KB. Try the WOFF2 version.";
export const FONT_LIMIT_ERROR = "Up to 5 fonts per brand. Remove one to add another.";
const FULL_ERROR = "This device is out of room, so the font wasn't saved. Clear some space, then try again.";

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

const keyOf = (userId: string, slot: number) => (slot === 0 ? BRAND_FONT_PREFIX : `content-studio-brandfont${slot + 1}-`) + scoped(userId);

function readSlot(userId: string, slot: number): BrandFont | null {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(userId, slot)) ?? "null");
    if (!raw || !goodData(raw.data)) return null;
    return {
      name: String(raw.name ?? "").slice(0, 60) || "Your font",
      data: raw.data,
      addedAt: typeof raw.addedAt === "string" ? raw.addedAt : "",
      ...(typeof raw.family === "string" ? { family: raw.family } : {}),
    };
  } catch {
    return null;
  }
}

/** The brand's fonts with the slot each is kept in, in slot order, each family used once. */
function stored(userId: string): { slot: number; font: UploadedFont }[] {
  const used = new Set<string>();
  const out: { slot: number; font: UploadedFont }[] = [];
  for (let slot = 0; slot < MAX_BRAND_FONTS; slot++) {
    const f = readSlot(userId, slot);
    if (!f) continue;
    const want = f.family ?? (slot === 0 ? BRAND_FONT_FAMILY : "");
    const family = BRAND_FAMILIES.includes(want) && !used.has(want) ? want : BRAND_FAMILIES.find((x) => !used.has(x))!;
    used.add(family);
    out.push({ slot, font: { ...f, family } });
  }
  return out;
}

/** This brand's fonts, none when it has none or none of them read. */
export function loadBrandFonts(userId: string | null | undefined): UploadedFont[] {
  return userId ? stored(userId).map((s) => s.font) : [];
}

/** The brand's first font (the video end card's), or null. */
export const loadBrandFont = (userId: string | null | undefined): UploadedFont | null => loadBrandFonts(userId)[0] ?? null;

function write(writes: [string, BrandFont][]): { ok: true } | { ok: false; error: string } {
  try {
    for (const [k, v] of writes) localStorage.setItem(k, JSON.stringify(v));
  } catch {
    return { ok: false, error: FULL_ERROR };
  }
  window.dispatchEvent(new Event(BRAND_FONT_CHANGED));
  return { ok: true };
}

/** Adds a read font in the first free slot under the first free family; refused past MAX_BRAND_FONTS. */
export function addBrandFont(userId: string, font: BrandFont): { ok: true; font: UploadedFont } | { ok: false; error: string } {
  const all = stored(userId);
  if (all.length >= MAX_BRAND_FONTS) return { ok: false, error: FONT_LIMIT_ERROR };
  const family = BRAND_FAMILIES.find((f) => !all.some((s) => s.font.family === f))!;
  const slot = Array.from({ length: MAX_BRAND_FONTS }, (_, i) => i).find((i) => !all.some((s) => s.slot === i))!;
  const next = { name: font.name, data: font.data, addedAt: font.addedAt, family };
  const saved = write([[keyOf(userId, slot), next]]);
  return "error" in saved ? saved : { ok: true, font: next };
}

/** Removes the font drawn as `family`, kept as an empty record so the removal syncs. */
export function removeBrandFont(userId: string, family: string, now = new Date()): { ok: true } | { ok: false; error: string } {
  const all = stored(userId);
  const gone = all.find((s) => s.font.family === family);
  if (!gone) return { ok: true };
  const empty = { name: "", data: "", addedAt: now.toISOString() };
  const last = all[all.length - 1];
  // the first key is what a reader of the one-font shape opens, so the last font moves into it rather than leave it empty
  if (gone.slot === 0 && last !== gone) return write([[keyOf(userId, 0), last.font], [keyOf(userId, last.slot), empty]]);
  return write([[keyOf(userId, gone.slot), empty]]);
}

/** @font-face rules, data inlined, for the uploaded fonts among `families` (the slideshow PNG export). */
export const brandFontFaces = (fonts: UploadedFont[], families: Set<string>): string[] =>
  fonts.filter((f) => families.has(f.family)).map((f) => `@font-face{font-family:'${f.family}';src:url(${f.data})}`);

/** Whether this browser can draw a read font: its first bytes can pass and the file still not load. */
export async function fontLoads(font: BrandFont): Promise<boolean> {
  if (typeof FontFace === "undefined") return false;
  try {
    // never added to the page, so it draws nothing
    await new FontFace("BrandFontCheck", await (await fetch(font.data)).arrayBuffer()).load();
    return true;
  } catch {
    return false;
  }
}

const faces = new Map<string, { data: string; face: FontFace }>();

/**
 * Makes each font the page's face for its family, takes away the families no longer listed, and gives back the
 * families the browser could read.
 */
export async function registerBrandFonts(fonts: UploadedFont[]): Promise<Set<string>> {
  const ok = new Set<string>();
  if (typeof document === "undefined" || typeof FontFace === "undefined") return ok;
  for (const [family, f] of [...faces]) {
    if (fonts.some((x) => x.family === family && x.data === f.data)) continue;
    document.fonts.delete(f.face);
    faces.delete(family);
  }
  await Promise.all(
    fonts.map(async (font) => {
      if (faces.get(font.family)?.data === font.data) return void ok.add(font.family);
      try {
        const loaded = await new FontFace(font.family, await (await fetch(font.data)).arrayBuffer()).load();
        // another call may have registered this family while the file loaded
        const before = faces.get(font.family);
        if (before) document.fonts.delete(before.face);
        document.fonts.add(loaded);
        faces.set(font.family, { data: font.data, face: loaded });
        ok.add(font.family);
      } catch {
        // not a font this browser reads: the family stays unset
      }
    }),
  );
  return ok;
}

/** For the video end card: the family of Leo's first brand font once it is loaded on this page; undefined for everyone else. */
export async function leoBrandFont(): Promise<string | undefined> {
  const leo = await leoUser().catch(() => null);
  if (!leo) return undefined;
  const fonts = loadBrandFonts(leo.id);
  const first = fonts[0]?.family;
  return first && (await registerBrandFonts(fonts)).has(first) ? first : undefined;
}
