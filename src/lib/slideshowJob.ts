// Make a slideshow (/make/slideshow, docs/north-star/items/formats-slideshow.md) outside React, so leaving the page
// keeps it going (montage.ts's shape). One remix make (as "slideshow") writes the slides, a stock search per slide
// and the caption; Pexels finds photos, or the brand's own media stands in; Jev picks one per slide (video-assist
// montage-pick, noun "photo"); the words are sized to fit the frame and the result is saved as a Slideshow
// (src/lib/slideshow.ts) that /slideshow edits. In memory only: a reload mid-make loses the run, and the server has
// given back the use of any write the model never answered.
//   synced: content-studio-slideshow-photos-${scoped(userId)}: the Pexels ids each of this brand's last 5 made
//   slideshows used, so the next one never repeats them (Fastlane reused 11 photos across 12 slideshows).

import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { loadMedia, storePicture, type MediaItem } from "@/lib/mediaLibrary";
import { stripDashes } from "@/lib/plainText";
import { scoped } from "@/lib/profiles";
import { voiceForClone, winnersFor } from "@/lib/reelClone";
import { fullText, requestMake, type MakeRequest, type RemixAs } from "@/lib/remix";
import { brandPack, loadRemixPrefs } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { localTeardown } from "@/lib/remixTeardown";
import { blankSlideshow, frameHeight, makeBox, newId, saveSlideshow, type ShowSize, type ShowSlide, type Slideshow, type TextBox } from "@/lib/slideshow";
import { layoutBoxes, screenMeasure, type Measure } from "@/lib/slideshowDraw";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { MAX_CANDIDATES } from "../../supabase/functions/video-assist/montage.ts";

export type ShowFrom = "topic" | "remix";
export type ShowPictures = "stock" | "mine";

export interface SlideshowAsk {
  /** null: made from `topic`. */
  source: RemixSource | null;
  topic: string;
  mention: boolean;
  note: string;
  size: Extract<ShowSize, "4x5" | "9x16">;
  pictures: ShowPictures;
  /** The agent's chat that asked for it: Activity logs the run as the agent's (live-p6replay D6). */
  agent?: { thread: string; msg: string };
}

export interface SlideshowJob {
  id: number;
  state: "writing" | "finding" | "drawing" | "done" | "failed";
  done: number;
  of: number;
  ask: SlideshowAsk;
  showId?: string;
  error?: string;
  /** The writer said no (422): it can't be made safe, or its checks failed twice. The use is kept (the model answered). */
  refused?: boolean;
  /** Today's uses are gone (429 daily_limit): Try again would only hit the cap again. */
  capped?: boolean;
}

export const WRITE_FAILED = "Couldn't write the slides. Try again in a minute.";
export const FINISH_FAILED = "Couldn't finish the slides. Try again in a minute.";

/** A source opens on Remix a trending one, no source on A topic. */
export const startFrom = (source: RemixSource | null): ShowFrom => (source ? "remix" : "topic");

export function stepText(j: Pick<SlideshowJob, "state" | "done" | "of">): string {
  if (j.state === "writing") return "Writing the slides...";
  if (j.state === "finding") return `Finding pictures, ${j.done} of ${j.of}...`;
  return j.state === "drawing" ? "Drawing the slides..." : "";
}

/** The page's params for a run, defaults left out: the library row and Try again reopen what ran. */
export function askParams(a: SlideshowAsk): Record<string, string | undefined> {
  return {
    source: a.source?.key,
    from: a.source ? undefined : "topic",
    mention: a.mention ? undefined : "no",
    size: a.size === "9x16" ? "9x16" : undefined,
    pictures: a.pictures === "mine" ? "mine" : undefined,
  };
}

// ---- the job ----

let job: SlideshowJob | null = null;
let seq = 0;
const listeners = new Set<(j: SlideshowJob | null) => void>();
const set = (next: SlideshowJob | null) => {
  job = next;
  listeners.forEach((l) => l(job && { ...job }));
};
export const slideshowJob = () => job;
export const slideshowBusy = () => job?.state === "writing" || job?.state === "finding" || job?.state === "drawing";
export function onSlideshowJob(fn: (j: SlideshowJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a finished or failed run; a running one stays. */
export const clearSlideshowJob = () => void (job && !slideshowBusy() && set(null));

/** A failed make call in the adviser's words; `fallback` is the format's own "couldn't write" line. */
export function failure(e: unknown, fallback = WRITE_FAILED): Pick<SlideshowJob, "error" | "refused" | "capped"> {
  if (e instanceof EdgeError) {
    if (e.status === 422) return { error: e.message, refused: true };
    if (e.code === "daily_limit") return { error: e.message, capped: true };
    // the server's own words: the daily limit, not switched on, a topic too long
    if (e.code === "daily_limit" || e.code === "usage_unavailable" || e.status === 400 || e.status === 403) return { error: e.message };
  }
  return { error: fallback };
}

/**
 * The make call: the source's words read on this device, or the topic, with this brand and voice. The wall of text
 * (wallJob.ts) sends the same body as "wall", and phase 3's format pages as their own shape with its options in `more`.
 */
export function makeBody(
  userId: string,
  a: Pick<SlideshowAsk, "source" | "topic" | "mention" | "note" | "size">,
  as: RemixAs = "slideshow",
  more: Partial<Pick<MakeRequest, "seconds" | "scene" | "maxWords" | "formulas" | "demo" | "layout" | "shows">> = {},
): MakeRequest {
  const s = a.source;
  const t = s ? localTeardown(userId, s) : null;
  // no breakdown on this device: the snapshot's own idea stands in (a swipe carousel's idea.hook, format and why)
  const idea = s && !t ? s.teardown : undefined;
  const teardown = t
    ? { hookPattern: t.hook.pattern || undefined, beats: t.beats, dontReuse: t.dontReuse }
    : idea?.hook || idea?.structure || idea?.why
      ? { hookPattern: idea.hook || undefined, beats: [idea.structure && `Format: ${idea.structure}`, idea.why && `Why it worked: ${idea.why}`].filter((b): b is string => !!b) }
      : undefined;
  return {
    mode: "make",
    as,
    ...(s
      ? { source: { key: s.key, kind: s.kind, format: s.format, platform: s.platform, title: s.title, author: s.author, url: s.url, text: fullText(s, userId) } }
      : { topic: a.topic.trim() }),
    note: a.note.trim() || undefined,
    voice: voiceForClone(loadVoiceProfile(userId), winnersFor(userId)),
    brand: brandPack(userId, { platform: a.size === "9x16" ? "tiktok" : "instagram", mention: a.mention, offer: null, speaker: loadRemixPrefs(userId).speaker }),
    teardown,
    ...more,
  };
}

/** A campaign's own media so far: every picture key its made slideshows used (repeats count), and where to start in media order. */
export interface MediaSpread {
  used: string[];
  start: number;
}

export async function startSlideshow(userId: string, ask: SlideshowAsk, spread?: MediaSpread): Promise<void> {
  if (slideshowBusy()) return;
  const id = ++seq;
  const mine = (patch: Partial<SlideshowJob>) => job?.id === id && set({ ...job, ...patch });
  set({ id, state: "writing", done: 0, of: 0, ask });
  let wrote = false;
  try {
    const res = await requestMake(makeBody(userId, ask));
    if (res?.result?.as !== "slideshow") throw new Error(WRITE_FAILED);
    wrote = true;
    const slides = res.result.slides.map((s) => ({ ...s, title: stripDashes(s.title).trim(), sub: stripDashes(s.sub).trim() }));
    mine({ state: "finding", done: 0, of: slides.length });
    const progress = (n: number) => mine({ done: n });
    const pictures = ask.pictures === "mine" ? await minePictures(loadMedia(userId), slides, spread) : await stockPictures(userId, slides, progress);
    progress(slides.length);
    mine({ state: "drawing" });
    await ensureCaptionFonts();
    const kit = loadBrand(userId);
    const show = buildShow({
      slides,
      caption: stripDashes(applyBrandRules(res.result.caption, kit, ask.size === "9x16" ? "tiktok" : "instagram")).trim(),
      ask,
      pictures,
      fill: kit?.color,
      flags: res.flags,
      measure: screenMeasure(),
      now: new Date(),
    });
    saveSlideshow(userId, show);
    const ids = pictures.flatMap((p) => (p?.stockId ? [p.stockId] : []));
    if (ids.length) saveUsed(userId, addUsed(loadUsed(userId), show.id, ids));
    mine({ state: "done", showId: show.id });
  } catch (e) {
    mine({ state: "failed", ...(wrote ? { error: FINISH_FAILED } : failure(e)) });
  }
}

// ---- pictures ----

/** A slide's picture: a Pexels photo (kept on this device when it downloaded) or one of the brand's own. */
export interface Picture {
  image?: string;
  photo?: ShowSlide["photo"];
  /** The Pexels id, kept so the next slideshows skip it. */
  stockId?: string;
}

/** What Jev reads for a stock photo: its alt text, else its Pexels page name. */
export const photoDesc = (it: Pick<StockItem, "alt" | "url">) =>
  it.alt.trim() || (/\/photo\/(.+?)-\d+\/?$/.exec(it.url)?.[1] ?? "").replace(/-/g, " ");

/** Up to 6 results this brand hasn't used lately, each once. */
export function freshPhotos(items: StockItem[], skip: Set<string>): StockItem[] {
  const seen = new Set<string>();
  const out: StockItem[] = [];
  for (const it of items) {
    if (skip.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * One picture per slide in slide order, never the same one twice (`taken` grows as slides take theirs): Jev's pick
 * when it is free, else the first free candidate (Jev had no answer, or an earlier slide took its pick). Jev's
 * "none" (-1) gives null so stock can try the next page; with `noneFalls` (the brand's own media) it falls back too.
 */
export function resolvePicks<T>(lists: T[][], picks: (number | null)[], idOf: (t: T) => string, taken: Set<string>, noneFalls = false): (T | null)[] {
  return lists.map((list, i) => {
    const p = picks[i];
    if (p === -1 && !noneFalls) return null;
    const free = (t: T | undefined): t is T => t !== undefined && !taken.has(idOf(t));
    const pick = typeof p === "number" && p >= 0 && free(list[p]) ? list[p] : (list.find(free) ?? null);
    if (pick) taken.add(idOf(pick));
    return pick;
  });
}

type SlideCopy = { title: string; sub: string; search: string };

/** One montage-pick call for every slide with candidates; null per slide when Jev has no answer or the call fails. */
async function askJev(slides: SlideCopy[], descs: string[][]): Promise<(number | null)[]> {
  if (!descs.some((d) => d.length)) return slides.map(() => null);
  const r = await callFn<{ picks: (number | null)[] }>("video-assist", {
    mode: "montage-pick",
    noun: "photo",
    theme: slides[0].title.slice(0, 80),
    beats: slides.map((s, i) => ({ say: s.title, candidates: descs[i].map((desc) => ({ desc })) })),
  }).catch(() => null);
  return slides.map((_, i) => (typeof r?.picks?.[i] === "number" ? r.picks[i] : null));
}

/** Pexels, page 1 for every slide, then page 2 once for a slide Jev said none to or that found nothing free, then the first free photo. */
async function stockPictures(userId: string, slides: SlideCopy[], progress: (n: number) => void): Promise<(Picture | null)[]> {
  const skip = new Set(loadUsed(userId).flatMap((u) => u.ids));
  const taken = new Set<string>();
  // a failed search (the stock-search cap, no connection) is no results: that slide gets the brand colour
  const find = async (q: string, page: number) => freshPhotos((await searchStock("photo", q, page, "portrait").catch(() => null))?.items ?? [], skip);
  const first: StockItem[][] = [];
  for (const [i, s] of slides.entries()) {
    first.push(await find(s.search, 1));
    progress(i + 1);
  }
  const chosen = resolvePicks(first, await askJev(slides, first.map((l) => l.map(photoDesc))), (it) => it.id, taken);
  const again = chosen.flatMap((c, i) => (c ? [] : [i]));
  const second: StockItem[][] = slides.map(() => []);
  if (again.length) {
    for (const i of again) second[i] = await find(slides[i].search, 2);
    const more = resolvePicks(second, await askJev(slides, second.map((l) => l.map(photoDesc))), (it) => it.id, taken);
    for (const i of again) chosen[i] = more[i];
  }
  // Jev's none on both pages still gets the first free photo: a blank slide, a cover above all, read as broken next
  // to Fastlane's in the ActivityTracker dogfood (20 Oct 2026, 10 of 79 slides). Only a slide with nothing new stays blank.
  for (const i of again) chosen[i] ??= resolvePicks([[...first[i], ...second[i]]], [null], (it) => it.id, taken)[0];
  const out: (Picture | null)[] = [];
  for (const it of chosen) {
    if (!it) {
      out.push(null);
      continue;
    }
    // kept on this device when it downloads; the synced Pexels link lets any device fetch it again
    const blob = await downloadStock(it.src).catch(() => null);
    const pic = blob ? await storePicture(blob).catch(() => null) : null;
    out.push({ ...(pic ? { image: pic.key } : {}), photo: { src: it.src, by: it.by, byUrl: it.byUrl }, stockId: it.id });
  }
  return out;
}

/**
 * Each slide's candidates: the 6 items from its place in an order, which is also the fallback. With no spread that is
 * media order. A campaign's spread starts media order at `start` and puts the items its slideshows used least first, so
 * the first screens no longer win every slideshow (live-p5dog D7: one screen in 12 of 12, two never used).
 */
export function mediaWindows<T extends { key: string }>(media: T[], slides: number, spread: MediaSpread = { used: [], start: 0 }): T[][] {
  const uses = (m: T) => spread.used.filter((k) => k === m.key).length;
  // a stable sort, so equal uses keep the rotated media order
  const order = media.map((_, k) => media[(spread.start + k) % media.length]).sort((a, b) => uses(a) - uses(b));
  return Array.from({ length: slides }, (_, i) => Array.from({ length: Math.min(MAX_CANDIDATES, order.length) }, (_, k) => order[(i + k) % order.length]));
}

/** The brand's own media: Jev picks per slide from its window (mediaWindows). */
async function minePictures(media: MediaItem[], slides: SlideCopy[], spread?: MediaSpread): Promise<(Picture | null)[]> {
  const windows = mediaWindows(media, slides.length, spread);
  const picks = await askJev(slides, windows.map((w) => w.map((m) => m.alt || m.name)));
  return resolvePicks(windows, picks, (m) => m.key, new Set(), true).map((m) => (m ? { image: m.key } : null));
}

// ---- the slides ----

const LOOK = { font: "heavy", bg: "white", color: "#111111", stroke: 0, strokeColor: "#FFFFFF", w: 0.84 } as const;
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

/**
 * A title box and a sub box in the white-box look, the title's middle in the top third and the sub under it. The
 * sizes step down until both sit inside the frame (4:5 or 9:16), so no word is ever cut off.
 */
export function fitSlide(text: { title: string; sub: string }, hook: boolean, size: ShowSize, measure: Measure): TextBox[] {
  const H = frameHeight(size);
  const gap = 0.025 * H;
  let boxes: TextBox[] = [];
  for (const k of SCALES) {
    boxes = [makeBox(text.title, { ...LOOK, size: Math.round((hook ? 72 : 60) * k) }), ...(text.sub ? [makeBox(text.sub, { ...LOOK, size: Math.round(40 * k) })] : [])];
    const [t, s] = layoutBoxes({ id: "fit", boxes }, size, measure).boxes;
    const total = t.rect.h + (s ? gap + s.rect.h : 0);
    const top = Math.max(0.06 * H, Math.min(H / 3 - t.rect.h / 2, 0.92 * H - total));
    boxes[0] = { ...boxes[0], y: (top + t.rect.h / 2) / H };
    if (s) boxes[1] = { ...boxes[1], y: (top + t.rect.h + gap + s.rect.h / 2) / H };
    if (!layoutBoxes({ id: "fit", boxes }, size, measure).overflow && top + total <= 0.94 * H) return boxes;
  }
  return boxes;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The made slideshow: one slide per written slide, its picture or the brand colour, the caption, source and flags. */
export function buildShow(a: { slides: { title: string; sub: string }[]; caption: string; ask: SlideshowAsk; pictures: (Picture | null)[]; fill?: string; flags?: Slideshow["flags"]; measure: Measure; now: Date }): Slideshow {
  const fill = a.fill && HEX.test(a.fill) ? a.fill : undefined;
  return {
    ...blankSlideshow({}, a.now),
    title: (a.slides[0]?.title || "Slideshow").slice(0, 120),
    size: a.ask.size,
    slides: a.slides.map((s, i) => {
      const p = a.pictures[i];
      return {
        id: newId("s"),
        ...(p?.image ? { image: p.image } : {}),
        ...(p?.photo ? { photo: p.photo } : {}),
        ...(!p && fill ? { fill } : {}),
        boxes: fitSlide(s, i === 0, a.ask.size, a.measure),
      };
    }),
    caption: a.caption,
    ...(a.ask.source ? { source: { ...a.ask.source, remixedAt: a.now.toISOString() } } : {}),
    ...(a.flags ? { flags: a.flags } : {}),
  };
}

// ---- photos this brand used lately ----

const USED = "content-studio-slideshow-photos-";
export const USED_SHOWS = 5;
export interface UsedPhotos {
  show: string;
  ids: string[];
}

/** The newest slideshow's photos first, one entry per slideshow, the last 5 kept. */
export const addUsed = (list: UsedPhotos[], show: string, ids: string[]): UsedPhotos[] =>
  [{ show, ids }, ...list.filter((u) => u.show !== show)].slice(0, USED_SHOWS);

export function loadUsed(userId: string): UsedPhotos[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(USED + scoped(userId)) ?? "[]");
    return (Array.isArray(raw) ? raw : [])
      .filter((u): u is UsedPhotos => !!u && typeof u.show === "string" && Array.isArray(u.ids))
      .map((u) => ({ show: u.show, ids: u.ids.filter((x): x is string => typeof x === "string").slice(0, 20) }))
      .slice(0, USED_SHOWS);
  } catch {
    return [];
  }
}

function saveUsed(userId: string, list: UsedPhotos[]): void {
  try {
    globalThis.localStorage?.setItem(USED + scoped(userId), JSON.stringify(list));
  } catch {
    // storage full: the next slideshow may repeat a photo, nothing else breaks
  }
}
