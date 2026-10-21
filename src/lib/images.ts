// The Image page's designs and its "Write it for me" run (docs/north-star/items/formats-static-ad.md; formats-memes
// saves its memes here too in wave 5). Designs are per brand and synced:
//   content-studio-images-${scoped(userId)}: SavedImage[], newest first, the latest 20
// Pictures stay on the device that holds them (deviceFiles, under media library keys), so a design opened on another
// device shows without its picture and says so.
//
// The run lives outside React, so leaving the page keeps it. A swipe ad's own picture is read first (remix-link image
// mode, one remix-image use, only when /ads/<id>.jpg really answers image/jpeg: the SPA answers 200 with index.html
// for a missing file); its `shows` sentence steers Jev's layout pick and is kept on this device
// (cs-image-shows, newest 30), so writing it again reads nothing. Then one remix make "image" writes the words into
// the design, and the run mirrors its step into formatJob for /library's Making now.

import { callFn } from "@/lib/edgeFn";
import { SLIDE_FONTS, type SlideFont, type SlidePaper } from "@/lib/carouselLayout";
import { setFormatJob } from "@/lib/formatJob";
import { IMAGE_SIZES, type ImageSize } from "@/lib/imageLayout";
import { IMAGE_LAYOUTS, links, type ImageLayout } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { requestMake, type Flags, type MakeResult } from "@/lib/remix";
import { scalePicture } from "@/lib/remixLink";
import type { RemixSource } from "@/lib/remixSource";
import type { DraftEntry } from "@/lib/draftHistory";
import { failure, makeBody } from "@/lib/slideshowJob";
import type { LinkedSource } from "@/lib/resolveSource";
import type { AdLayout } from "../../supabase/functions/remix/logic.ts";

export interface SavedImage {
  id: string;
  layout: ImageLayout;
  size: ImageSize;
  /** Each field's words by key (imageLayout.ts IMAGE_FIELDS), plus the post's caption. */
  words: Record<string, string>;
  font: SlideFont;
  paper: SlidePaper;
  align: "left" | "center";
  /** A media library key (cimg-...), or "headshot" for the brand kit's photo. */
  pictureKey?: string;
  /** What it was remixed from: the source's key, and a line naming it ("Singlife, 40 days running"). */
  source?: { key: string; label: string };
  /** Its post in My posts, once Post it for me saved one (as carousels and slideshows keep theirs). */
  draftId?: string;
  updatedAt: string;
}

export const MAX_IMAGES = 20;
export const HEADSHOT = "headshot";
const PREFIX = "content-studio-images-";
const CHANGED = "content-studio-images-changed";
const PICTURE_KEY = /^cimg-[a-z0-9]{6,30}$/;
const WORD_KEY = /^[a-zA-Z]{1,20}$/;
const MAX_WORDS_CHARS = 2200;

let seq = 0;
export const newImageId = () => `img-${Date.now().toString(36)}${(seq++ % 36).toString(36)}${Math.random().toString(36).slice(2, 4)}`;

export function blankImage(o: Partial<Pick<SavedImage, "layout" | "size" | "font" | "paper" | "align" | "source">> = {}): SavedImage {
  return { id: newImageId(), layout: o.layout ?? "headline", size: o.size ?? "4x5", words: {}, font: o.font ?? "classic", paper: o.paper ?? "light", align: o.align ?? "left", ...(o.source ? { source: o.source } : {}), updatedAt: "" };
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** One saved design as it should be, or null. Unknown words, bad keys and anything not text are dropped. */
export function sanitizeSavedImage(raw: unknown): SavedImage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^img-[a-z0-9]{4,30}$/.test(r.id)) return null;
  const w = r.words && typeof r.words === "object" ? (r.words as Record<string, unknown>) : {};
  const words = Object.fromEntries(
    Object.entries(w)
      .filter((e): e is [string, string] => WORD_KEY.test(e[0]) && typeof e[1] === "string")
      .slice(0, 16)
      .map(([k, v]) => [k, v.slice(0, MAX_WORDS_CHARS)]),
  );
  const s = r.source && typeof r.source === "object" ? (r.source as Record<string, unknown>) : null;
  const key = line(s?.key, 200);
  const pictureKey = typeof r.pictureKey === "string" && (r.pictureKey === HEADSHOT || PICTURE_KEY.test(r.pictureKey)) ? r.pictureKey : undefined;
  return {
    id: r.id,
    layout: oneOf(IMAGE_LAYOUTS, r.layout, "headline"),
    size: oneOf(IMAGE_SIZES, r.size, "4x5"),
    words,
    font: oneOf(Object.keys(SLIDE_FONTS) as SlideFont[], r.font, "classic"),
    paper: oneOf(["light", "dark", "tint"] as const, r.paper, "light"),
    align: r.align === "center" ? "center" : "left",
    ...(pictureKey ? { pictureKey } : {}),
    ...(key ? { source: { key, label: line(s?.label, 120) } } : {}),
    ...(typeof r.draftId === "string" && r.draftId.length <= 80 ? { draftId: r.draftId } : {}),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadImages(userId: string | null | undefined): SavedImage[] {
  if (!userId) return [];
  try {
    const raw = JSON.parse(storage()?.getItem(PREFIX + scoped(userId)) ?? "[]");
    return (Array.isArray(raw) ? raw : []).map(sanitizeSavedImage).filter((x): x is SavedImage => !!x).slice(0, MAX_IMAGES);
  } catch {
    return [];
  }
}

export const imageById = (userId: string, id: string | null | undefined) => (id ? (loadImages(userId).find((x) => x.id === id) ?? null) : null);

/** Calls `cb` whenever a design is saved on this device (the page, or a run that finished while it was closed). */
export function onImagesChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** Saves (or replaces) one design, newest first, keeping the latest 20; on a full device the oldest go first. */
export function saveImage(userId: string, img: SavedImage, now = new Date()): SavedImage[] {
  let list = [{ ...img, updatedAt: now.toISOString() }, ...loadImages(userId).filter((x) => x.id !== img.id)].slice(0, MAX_IMAGES);
  const s = storage();
  for (; s && list.length; list = list.slice(0, -1)) {
    try {
      s.setItem(PREFIX + scoped(userId), JSON.stringify(list));
      break;
    } catch {
      // storage full: try again without the oldest design
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return list;
}

/** The line under a design whose picture this device doesn't hold. */
export function pictureLine(img: Pick<SavedImage, "pictureKey">, found: boolean | undefined): string | null {
  return img.pictureKey && img.pictureKey !== HEADSHOT && found === false ? "The picture is on another device." : null;
}

/** The device file a design's PNG is kept under for Post it for me: one per design, so posting again replaces it. */
export const postFileKey = (img: Pick<SavedImage, "id">) => `cimg-p${img.id.slice(4)}`.slice(0, 35);

/** Its post in My posts: the caption as the text (else the main words), the PNG attached by the caller. */
export function imageDraft(img: SavedImage, main: string, o: { id: string; now: string; prev: DraftEntry | null; source: RemixSource | null }): DraftEntry {
  const hook = main.replace(/\s+/g, " ").trim().slice(0, 200) || "Image";
  const text = img.words.caption?.trim() || main.trim() || hook;
  if (o.prev) return { ...o.prev, hook, draft: text, pillarDetail: hook };
  return {
    id: o.id,
    createdAt: o.now,
    hook,
    draft: text,
    pillar: "topic",
    pillarDetail: hook,
    audience: "general",
    format: "text-post",
    platform: "instagram",
    ctaType: "save-share",
    status: "draft",
    ...(o.source ? { source: { ...o.source, remixedAt: o.now } } : {}),
  };
}

// ---- Write it for me --------------------------------------------------------------------------

/** A swipe ad's own copy of its picture (/ads/<id>.jpg); a competitor's Meta link expires, so it is never read. */
export const swipePicture = (s: Pick<RemixSource, "kind" | "cover"> | null): string | null =>
  s?.kind === "ad" && s.cover && /^\/ads\/\d{5,25}\.jpg$/.test(s.cover) ? s.cover : null;

const SHOWS_KEY = "cs-image-shows";

/** What a source's picture shows, as read before on this device, or "". */
export function cachedShows(key: string): string {
  try {
    const v = JSON.parse(storage()?.getItem(SHOWS_KEY) ?? "{}")?.[key];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function keepShows(key: string, shows: string): void {
  try {
    const all = JSON.parse(storage()?.getItem(SHOWS_KEY) ?? "{}") as Record<string, string>;
    const next = Object.fromEntries([[key, shows], ...Object.entries(all && typeof all === "object" ? all : {}).filter(([k]) => k !== key)].slice(0, 30));
    storage()?.setItem(SHOWS_KEY, JSON.stringify(next));
  } catch {
    // a hint only: the next write reads the picture again
  }
}

async function sha1Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The picture read in one sentence, or "" when it isn't a real JPEG or the read failed (the words then steer the layout). */
async function readShows(path: string): Promise<string> {
  const res = await fetch(path).catch(() => null);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").startsWith("image/jpeg")) return "";
  const blob = await res.blob();
  const answer = await callFn<{ source: LinkedSource }>("remix-link", { mode: "image", image: await scalePicture(blob), sha1: await sha1Hex(blob) });
  return answer.source?.teardown?.structure?.trim() ?? "";
}

/** The words a make wrote, over the design's own: the layout's fields replaced, a testimonial's into clientWords. */
export function wordsFromMake(prev: Record<string, string>, r: Extract<MakeResult, { as: "image" }>): Record<string, string> {
  const next = { ...prev, caption: r.caption };
  const own: Record<AdLayout, string[]> = { headline: ["headline", "line", "button"], quote: ["quote"], stat: ["statLabel"], testimonial: ["quote"] };
  for (const k of own[r.layout]) next[r.layout === "testimonial" ? "clientWords" : k] = r.words[k as keyof typeof r.words] ?? "";
  return next;
}

export interface ImageWriteAsk {
  /** The design the words go into; saved before the run starts. */
  designId: string;
  source: RemixSource | null;
  topic: string;
  /** null: Jev picks it from the ad (Headline ad when it can't). */
  layout: AdLayout | null;
  mention: boolean;
  note: string;
  size: ImageSize;
  /** Read a swipe ad's picture first (the page says no when remix-image has no uses left). */
  read: boolean;
}

export interface ImageWrite {
  id: number;
  designId: string;
  state: "reading" | "writing" | "done" | "failed";
  error?: string;
  /** The writer said no (422): the use is kept. */
  refused?: boolean;
  capped?: boolean;
  /** Done: the layout written for, and whether Jev picked it from the ad. */
  layout?: AdLayout;
  layoutBy?: "jev" | "default";
  flags?: Flags;
}

export const WRITE_FAILED = "Couldn't write it right now. Try again in a minute.";
export const writeStep = (w: Pick<ImageWrite, "state">) => (w.state === "reading" ? "Reading the ad's picture..." : "Writing your words...");

let run: ImageWrite | null = null;
let runs = 0;
const listeners = new Set<(w: ImageWrite | null) => void>();
const set = (next: ImageWrite) => {
  run = next;
  listeners.forEach((l) => l({ ...next }));
  const href = links.image({ image: next.designId });
  if (next.state === "done") setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "ready", href });
  else if (next.state === "failed") setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "failed", error: next.error, href });
  else setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "working", step: writeStep(next), href });
};
export const imageWrite = () => run;
export const imageWriteBusy = () => run?.state === "reading" || run?.state === "writing";
export function onImageWrite(fn: (w: ImageWrite | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export async function startImageWrite(userId: string, ask: ImageWriteAsk): Promise<void> {
  if (imageWriteBusy()) return;
  const id = ++runs;
  const base = { id, designId: ask.designId };
  const s = ask.source;
  let shows = s ? cachedShows(s.key) : "";
  const picture = swipePicture(s);
  try {
    if (s && picture && !shows && ask.read) {
      set({ ...base, state: "reading" });
      // a failed read costs the write nothing: Jev picks from the ad's words instead
      shows = await readShows(picture).catch(() => "");
      if (shows) keepShows(s.key, shows);
    }
    set({ ...base, state: "writing" });
    const body = makeBody(userId, { source: s, topic: ask.topic, mention: ask.mention, note: ask.note, size: ask.size === "9x16" ? "9x16" : "4x5" }, "image", {
      ...(ask.layout ? { layout: ask.layout } : {}),
      ...(shows ? { shows } : {}),
    });
    const res = await requestMake(body);
    if (res?.result?.as !== "image") throw new Error(WRITE_FAILED);
    const result = res.result;
    const design = loadImages(userId).find((x) => x.id === ask.designId);
    if (design) saveImage(userId, { ...design, layout: result.layout, words: wordsFromMake(design.words, result) });
    set({ ...base, state: "done", layout: result.layout, layoutBy: result.layoutBy, flags: res.flags });
  } catch (e) {
    set({ ...base, state: "failed", ...failure(e, WRITE_FAILED) });
  }
}
