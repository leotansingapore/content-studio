// Media library: photos kept on this device to reuse on carousel slides (and
// anywhere else a picture goes). The files live in IndexedDB (deviceFiles.ts)
// under the same "cimg-" keys carousel pictures use; the index (name, folder,
// alt text) is device-only localStorage per profile, since the files never sync.
//   key: cs-media-${scoped(userId)}

import { scoped } from "@/lib/profiles";
import { putFile } from "@/lib/deviceFiles";

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

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadMedia(userId: string | null | undefined): MediaItem[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const raw = JSON.parse(s.getItem(PREFIX + scoped(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((m): m is MediaItem => !!m && typeof m.key === "string" && /^cimg-[a-z0-9]{6,30}$/.test(m.key)).map((m) => ({
      key: m.key,
      name: String(m.name ?? "").slice(0, 80),
      folder: String(m.folder ?? "").slice(0, 40),
      alt: String(m.alt ?? "").slice(0, 250),
      width: Number(m.width) || 0,
      height: Number(m.height) || 0,
      addedAt: String(m.addedAt ?? ""),
      ...(sanitizeCredit(m.credit) ? { credit: sanitizeCredit(m.credit) } : {}),
    }));
  } catch {
    return [];
  }
}

function save(userId: string, list: MediaItem[]): MediaItem[] {
  const kept = list.slice(0, MAX_MEDIA);
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
  } catch {
    // storage full: the list still shows for this visit
  }
  return kept;
}

/** Adds a photo, newest first; one already in the library is left as it is. */
export function addMedia(userId: string, item: MediaItem): MediaItem[] {
  const list = loadMedia(userId);
  if (list.some((m) => m.key === item.key)) return list;
  return save(userId, [item, ...list]);
}

export function updateMedia(userId: string, key: string, patch: Partial<Pick<MediaItem, "name" | "folder" | "alt">>): MediaItem[] {
  return save(userId, loadMedia(userId).map((m) => (m.key === key ? { ...m, ...patch } : m)));
}

/** Takes a photo off the list (the file stays: saved carousels may still use it). */
export function removeMedia(userId: string, key: string): MediaItem[] {
  return save(userId, loadMedia(userId).filter((m) => m.key !== key));
}

/** Photos matching the search (name, folder or alt text) and the folder ("" = all, "-" = no folder). */
export function filterMedia(list: MediaItem[], query: string, folder: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (m) =>
      (folder === "" || (folder === "-" ? !m.folder : m.folder === folder)) &&
      (!q || `${m.name} ${m.folder} ${m.alt}`.toLowerCase().includes(q)),
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
