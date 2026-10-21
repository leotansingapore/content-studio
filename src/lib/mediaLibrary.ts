// Media library: photos kept on this device to reuse on carousel slides (and
// anywhere else a picture goes). The files live in IndexedDB (deviceFiles.ts)
// under the same "cimg-" keys carousel pictures use; the index (name, folder,
// alt text) is device-only localStorage per profile, since the files never sync.
//   key: cs-media-${scoped(userId)}
// Videos (brand-media-library step 1, Leo only) keep their own bytes under "cvid-" keys, with a still under the
// "cimg-" key of the same id. Only callers that ask for them get them, so every photo picker reads photos as before.

import { scoped } from "@/lib/profiles";
import { putFile } from "@/lib/deviceFiles";
import { DEMO_FLAGS, MEDIA_TYPES, type DemoFlag, type MediaType } from "../../supabase/functions/media-sort/logic.ts";

export { MEDIA_TYPES, type DemoFlag, type MediaType };

/** The part of a demo video it plays (brand-demo-videos): 3 to 30 seconds inside the file, and what it shows. */
export interface MediaDemo {
  start: number;
  end: number;
  shows: string;
  flags?: DemoFlag[];
}

export interface MediaItem {
  key: string;
  name: string;
  folder: string;
  alt: string;
  width: number;
  height: number;
  addedAt: string;
  /** A free stock photo's credit: who took it and its page on Pexels. */
  credit?: MediaCredit;
  /** Set on files added through Media's upload; missing means a photo. */
  kind?: "photo" | "video";
  seconds?: number;
  bytes?: number;
  type?: MediaType;
  /** Who set the type: a sort answer never replaces one the person picked. */
  typeBy?: "ai" | "you";
  demo?: MediaDemo;
}

export interface MediaCredit {
  by: string;
  byUrl: string;
  url: string;
}

const PEXELS = /^https:\/\/(www\.)?pexels\.com\//;

/** A stored credit, kept only with Pexels links (it is shown as a link). */
export function sanitizeCredit(raw: unknown): MediaCredit | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const by = typeof r.by === "string" ? r.by.slice(0, 80) : "";
  const link = (v: unknown) => (typeof v === "string" && PEXELS.test(v) ? v : "");
  return by ? { by, byUrl: link(r.byUrl), url: link(r.url) } : undefined;
}

export const MAX_MEDIA = 300;
const PREFIX = "cs-media-";
const KEY = /^(cimg|cvid)-[a-z0-9]{6,30}$/;
const round = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A demo's window clamped into the file: start 0 or more, end within its length, 3 to 30 seconds long. */
export function cleanDemo(raw: unknown, length?: number): MediaDemo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const len = length && length > 0 ? length : Infinity;
  let start = Math.max(0, finite(r.start) ?? 0);
  let end = Math.min(finite(r.end) ?? start + 30, len, start + 30);
  if (end - start < 3) {
    end = Math.min(start + 3, len);
    start = Math.max(0, end - 3);
  }
  if (end - start < 3) return undefined;
  const flags = Array.isArray(r.flags) ? DEMO_FLAGS.filter((f) => (r.flags as unknown[]).includes(f)) : [];
  return { start: round(start), end: round(end), shows: typeof r.shows === "string" ? r.shows.slice(0, 120) : "", ...(flags.length ? { flags } : {}) };
}

/** One stored entry as the app reads it; today's photos come back exactly as they always have. */
function clean(m: Record<string, unknown>): MediaItem {
  const key = m.key as string;
  const kind = key.startsWith("cvid-") ? "video" : m.kind === "photo" ? "photo" : undefined;
  const seconds = kind === "video" && (finite(m.seconds) ?? 0) > 0 ? round(m.seconds as number) : undefined;
  const bytes = (finite(m.bytes) ?? 0) > 0 ? Math.round(m.bytes as number) : undefined;
  const type = MEDIA_TYPES.includes(m.type as MediaType) ? (m.type as MediaType) : undefined;
  const demo = kind === "video" ? cleanDemo(m.demo, seconds) : undefined;
  return {
    key,
    name: String(m.name ?? "").slice(0, 80),
    folder: String(m.folder ?? "").slice(0, 40),
    alt: String(m.alt ?? "").slice(0, 250),
    width: Number(m.width) || 0,
    height: Number(m.height) || 0,
    addedAt: String(m.addedAt ?? ""),
    ...(sanitizeCredit(m.credit) ? { credit: sanitizeCredit(m.credit) } : {}),
    ...(kind ? { kind } : {}),
    ...(seconds !== undefined ? { seconds } : {}),
    ...(bytes !== undefined ? { bytes } : {}),
    ...(type ? { type, ...(m.typeBy === "ai" || m.typeBy === "you" ? { typeBy: m.typeBy } : {}) } : {}),
    ...(demo ? { demo } : {}),
  };
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The library, newest first: photos only unless `videos` is asked for (every photo picker leaves it out). */
export function loadMedia(userId: string | null | undefined, o: { videos?: boolean } = {}): MediaItem[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const raw = JSON.parse(s.getItem(PREFIX + scoped(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((m) => !!m && typeof m.key === "string" && KEY.test(m.key) && (o.videos || !m.key.startsWith("cvid-"))).map(clean);
  } catch {
    return [];
  }
}

const all = (userId: string) => loadMedia(userId, { videos: true });

/** At most MAX_MEDIA, as always by dropping the oldest; a file added through Media's upload (it has `kind`) is never the one dropped. */
function capped(list: MediaItem[]): MediaItem[] {
  if (list.length <= MAX_MEDIA) return list;
  const out = [...list];
  for (let i = out.length - 1; i >= 0 && out.length > MAX_MEDIA; i--) if (!out[i].kind) out.splice(i, 1);
  return out;
}

function save(userId: string, list: MediaItem[]): MediaItem[] {
  const kept = capped(list);
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
  } catch {
    // storage full: the list still shows for this visit
  }
  return kept;
}

/** Room left before the library is full: an upload is refused past it, before anything is stored. */
export const mediaRoom = (userId: string): number => Math.max(0, MAX_MEDIA - all(userId).length);

/** Adds a photo, newest first; one already in the library is left as it is. A full library refuses an upload (an item with `kind`). */
export function addMedia(userId: string, item: MediaItem): MediaItem[] {
  const list = all(userId);
  if (list.some((m) => m.key === item.key) || (item.kind && list.length >= MAX_MEDIA)) return list;
  return save(userId, [item, ...list]);
}

export function updateMedia(userId: string, key: string, patch: Partial<Pick<MediaItem, "name" | "folder" | "alt" | "type" | "typeBy" | "demo">>): MediaItem[] {
  return save(userId, all(userId).map((m) => (m.key === key ? clean({ ...m, ...patch }) : m)));
}

/** A sort's answer: the type unless the person picked one, and the alt text only where there is none. */
export function applySort(userId: string, key: string, answer: { type: MediaType; alt?: string }): MediaItem[] {
  return save(
    userId,
    all(userId).map((m) =>
      m.key !== key ? m : clean({ ...m, ...(m.typeBy === "you" ? {} : { type: answer.type, typeBy: "ai" }), ...(!m.alt.trim() && answer.alt ? { alt: answer.alt } : {}) }),
    ),
  );
}

/** Takes a photo off the list (the file stays: saved carousels may still use it). */
export function removeMedia(userId: string, key: string): MediaItem[] {
  return save(userId, all(userId).filter((m) => m.key !== key));
}

/**
 * Photos matching the search (name, folder or alt text) and the folder ("" = all, "-" = no folder), and when asked
 * the kind and the type (a file not sorted yet counts as "other").
 */
export function filterMedia(list: MediaItem[], query: string, folder: string, o: { kind?: "photos" | "videos"; type?: MediaType } = {}): MediaItem[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (m) =>
      (folder === "" || (folder === "-" ? !m.folder : m.folder === folder)) &&
      (!q || `${m.name} ${m.folder} ${m.alt}`.toLowerCase().includes(q)) &&
      (!o.kind || (o.kind === "videos") === (m.kind === "video")) &&
      (!o.type || (m.type ?? "other") === o.type),
  );
}

export function foldersOf(list: MediaItem[]): string[] {
  return [...new Set(list.map((m) => m.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Resizes a picture to at most `maxWidth` wide, keeps it on this device and returns its key and a data URL to draw. */
export async function storePicture(file: Blob, maxWidth = 1080): Promise<{ key: string; url: string; width: number; height: number }> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image this browser can read."));
      i.src = src;
    });
    const k = Math.min(1, maxWidth / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser can't resize images.");
    g.drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.85);
    const blob = await (await fetch(url)).blob();
    const key = `cimg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await putFile(key, blob);
    return { key, url, width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(src);
  }
}
