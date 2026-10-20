// Paste any link to remix (docs/north-star/items/remix-any-link.md), the browser half: the device list of sources
// read from links and uploads, the upload checks and picture scaler, and the read runner. The runner lives outside
// React (the startVisualsJob shape in reelClone.ts), so leaving /clone mid-read keeps it going and the result waits
// in the list. It never imports resolveSource.ts, which carries the data drops, so /clone stays small.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { sampleVideoFrames } from "@/lib/reelFrames";
import { extractWav } from "@/lib/videoMedia";
import type { LinkedSource } from "@/lib/resolveSource";
import { LINK_COPY, MAX_PICTURE_CHARS, parseRemixLink } from "../../supabase/functions/remix-link/logic.ts";

// REMIX_LINKS_PREFIX in resolveSource.ts (the test holds them equal); synced by cloudSync, per brand.
const PREFIX = "content-studio-remix-links-";
const MAX_SAVED = 20;

const isLinked = (s: unknown): s is LinkedSource =>
  Boolean(s) && typeof (s as LinkedSource).key === "string" && typeof (s as LinkedSource).kind === "string";

/** Sources read on this brand, newest first. */
export function savedLinks(userId: string): LinkedSource[] {
  try {
    const list = JSON.parse(globalThis.window?.localStorage?.getItem(PREFIX + scoped(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter(isLinked) : [];
  } catch {
    return [];
  }
}

/** Keeps a read source, newest first, at most 20; reading the same key again moves it to the top. */
export function saveLinkedSource(userId: string, s: LinkedSource): LinkedSource[] {
  const list = [s, ...savedLinks(userId).filter((x) => x.key !== s.key)].slice(0, MAX_SAVED);
  try {
    globalThis.window?.localStorage?.setItem(PREFIX + scoped(userId), JSON.stringify(list));
  } catch {
    // full or blocked storage: the result still shows, it just isn't kept
  }
  return list;
}

// ---- uploads ----------------------------------------------------------------------------------

const PICTURES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VIDEOS: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
const MB = 1024 * 1024;

/** What a picked file is, or the reason it is refused, before anything is read or sent. */
export function checkUpload(f: { type: string; size: number; name?: string }): { kind: "image" | "video" } | { error: string } {
  const ext = (f.name ?? "").toLowerCase().split(".").pop() ?? "";
  const type = f.type.toLowerCase();
  const image = type in PICTURES || (!type && ["jpg", "jpeg", "png", "webp"].includes(ext));
  const video = type in VIDEOS || (!type && ["mp4", "mov"].includes(ext));
  if (!image && !video) return { error: LINK_COPY.fileType };
  const max = image ? 8 : 80;
  if (f.size > max * MB) return { error: LINK_COPY.tooBig(max) };
  return { kind: image ? "image" : "video" };
}

/** The picture's size scaled to fit `max` on its long side, never enlarged. */
export function fitInside(w: number, h: number, max = 1280): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A JPEG data URL at most 1280 px on the long side, within remix-link's size limit. */
export async function scalePicture(file: Blob): Promise<string> {
  const img = await createImageBitmap(file).catch(() => {
    throw new Error("That picture couldn't be opened. Try a JPG or PNG.");
  });
  const { w, h } = fitInside(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  img.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= MAX_PICTURE_CHARS) return url;
  }
  throw new Error(LINK_COPY.tooBig(8));
}

async function sha1Of(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- the read runner --------------------------------------------------------------------------

export type LinkReadInput = { url: string } | { file: File };

export interface LinkRead {
  id: number;
  state: "working" | "done" | "failed";
  step: string;
  startedAt: number;
  input: LinkReadInput;
  /** Done: the saved source's key. */
  key?: string;
  error?: string;
  code?: string;
}

let read: LinkRead | null = null;
let seq = 0;
const listeners = new Set<(r: LinkRead | null) => void>();

export const linkRead = () => read;

export function onLinkRead(fn: (r: LinkRead | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(next: LinkRead | null) {
  read = next;
  listeners.forEach((fn) => fn(next));
}

/** Drops the read on screen. A request already sent still lands in the saved list, because it was paid for. */
export const clearLinkRead = () => emit(null);

type Answer = { source: LinkedSource };

/** The source for one input, from the device list when it was read before (free), else from remix-link. */
async function readOne(userId: string, input: LinkReadInput, live: () => boolean): Promise<LinkedSource | null> {
  const saved = (key: string) => savedLinks(userId).find((s) => s.key === key) ?? null;
  if ("url" in input) {
    const link = parseRemixLink(input.url);
    const known = link.ok && link.id ? saved(`link:${link.kind}:${link.id}`) : null;
    return known ?? (await callFn<Answer>("remix-link", { mode: "link", url: link.ok ? link.url : input.url })).source;
  }
  const check = checkUpload(input.file);
  if ("error" in check) throw new Error(check.error);
  const sha1 = await sha1Of(input.file);
  const known = saved(`upload:${sha1}`);
  if (known) return known;
  if (check.kind === "image") {
    const image = await scalePicture(input.file);
    return (await callFn<Answer>("remix-link", { mode: "image", image, sha1 })).source;
  }
  const { frames } = await sampleVideoFrames(input.file, () => {});
  if (!live()) return null;
  // A video with no sound track can't be decoded for audio; its on-screen words stand in for the transcript.
  const transcript = await extractWav(input.file)
    .then(async ({ wav }) => (await import("@/lib/videoProjects")).transcribe(wav))
    .then((t) => t.text ?? "")
    .catch(() => "");
  if (!live()) return null;
  return (await callFn<Answer>("remix-link", { mode: "frames", frames: frames.map((f) => f.image), sha1, transcript })).source;
}

/** Reads a link or a file into a saved source. Starting another replaces the one on screen. */
export async function startLinkRead(userId: string, input: LinkReadInput): Promise<void> {
  const id = ++seq;
  const base: LinkRead = { id, state: "working", step: "Reading the post", startedAt: Date.now(), input };
  emit(base);
  const live = () => read?.id === id;
  try {
    const source = await readOne(userId, input, live);
    if (!source) return;
    // Kept even when cancelled: the read was counted, so it waits in Recent reads instead of costing another.
    saveLinkedSource(userId, { ...source, remixedAt: "" });
    if (!live()) return emit(read);
    emit({ ...base, state: "done", key: source.key });
  } catch (e) {
    if (!live()) return;
    const message = e instanceof Error && e.message ? e.message : LINK_COPY.failed;
    emit({ ...base, state: "failed", error: message, code: e instanceof EdgeError ? e.code : undefined });
  }
}
