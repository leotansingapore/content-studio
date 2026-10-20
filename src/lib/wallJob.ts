// Make a wall of text (/make/wall-of-text, docs/north-star/items/formats-wall-of-text.md) outside React, so leaving
// the page keeps it going (slideshowJob.ts's shape). One remix make (as "wall") writes the words, the scene behind
// them, a stock search and the caption. Pexels finds portrait clips and Jev picks the one that shows the scene
// (video-assist montage-pick, one beat); the clip loops to the words' reading time and videoMedia's join records it,
// muted, with the words as one block (edit-text-video's wallSettings). The adviser's own clip skips the join: it goes
// to the editor as it is, its first 15 s kept (handToEditor). Never the source's own video or sound.
// In memory only: a reload mid-make loses the run, and the server has given back the use of any write the model
// never answered. The words are kept once written, so finishing again (another clip, the adviser's own) never
// writes, or spends, again.

import { chooseClips } from "@/lib/autoBroll";
import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { callFn } from "@/lib/edgeFn";
import { mediaLength } from "@/lib/longAudio";
import { describe as clipDesc } from "@/lib/montage";
import { stripDashes } from "@/lib/plainText";
import { requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { screenMeasure, type Measure } from "@/lib/slideshowDraw";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { BLOCK_W, FONTS, readSeconds, wallSettings, wrapBlock } from "@/lib/videoEdit";
import { currentJoin, ensureCaptionFonts, handToEditor, startJoin, type JoinExtra } from "@/lib/videoMedia";
import { MAX_CANDIDATES } from "../../supabase/functions/video-assist/montage.ts";

export type WallFrom = "topic" | "remix";
export type WallBg = "stock" | "mine";

export interface WallAsk {
  /** null: written from `about` as a topic. */
  source: RemixSource | null;
  /** What it's about: the topic with no source, else the adviser's steer (the note). */
  about: string;
  mention: boolean;
  bg: WallBg;
  /** The adviser's own clip with bg mine; it stays on this device. */
  file?: File | null;
}

export interface Written {
  text: string;
  caption: string;
  scene: string;
  search: string;
  flags: Flags;
}

export interface WallJob {
  id: number;
  state: "writing" | "finding" | "joining" | "done" | "failed";
  ask: WallAsk;
  /** Kept once the words are written: finishing again reuses them. */
  written?: Written;
  /** What went to the join: the page knows the video waiting for the editor is this one by it. */
  extra?: JoinExtra;
  error?: string;
  /** The writer said no (422): it can't be made safe, or its checks failed twice. The use is kept (the model answered). */
  refused?: boolean;
  /** No stock clip showed the words; they are kept for the adviser's own video. */
  noClip?: boolean;
}

export const WALL_TOAST = "Your wall of text is ready. Export it when it looks right.";
export const WRITE_FAILED = "Couldn't write the text. Try again in a minute.";
export const NO_CLIP = "No stock clip fits these words. Pick your own video or change what it's about.";
export const FINISH_FAILED = "Couldn't finish the video. Try again in a minute.";
/** The editor's own line for a video it can't open (VideoEditPage's WALL_ERROR). */
export const OPEN_FAILED = "That video couldn't be opened. Try an MP4 or MOV.";
/** "My video": only its first 15 s are used. */
export const MINE_SECONDS = 15;
/** Stock clips this short still loop well; anything under 2.5 s would cut every moment. */
const LOOP_NEED = 3;
const JOIN_LABEL = "Putting your wall of text together";

/** A source opens on Remix a trending one, no source on A topic. */
export const startFrom = (source: RemixSource | null): WallFrom => (source ? "remix" : "topic");

export function stepText(j: Pick<WallJob, "state">): string {
  return j.state === "writing" ? "Writing the text..." : j.state === "finding" ? "Finding a clip..." : j.state === "joining" ? "Putting it together..." : "";
}

/** The page's params for a run, defaults left out: the library row and Try again reopen what ran. */
export function wallParams(a: Pick<WallAsk, "source" | "mention" | "bg">): Record<string, string | undefined> {
  return { source: a.source?.key, from: a.source ? undefined : "topic", mention: a.mention ? undefined : "no", bg: a.bg === "mine" ? "mine" : undefined };
}

// ---- the video's length, the clip's loops and the words' size ----

/** How long the video runs: the words' reading time, 6 to 15 s. */
export const wallSeconds = (text: string) => Math.min(15, Math.max(6, readSeconds(text)));

/** One clip played over and over until `total` seconds, the last take cut to fit. A clip of unknown length plays once. */
export function loopTakes(file: Blob, clip: number, total: number): { file: Blob; start: number; end: number }[] {
  const len = clip > 0.5 ? clip : total;
  const takes: { file: Blob; start: number; end: number }[] = [];
  for (let at = 0; total - at > 0.05; at += len) takes.push({ file, start: 0, end: Math.round(Math.min(len, total - at) * 100) / 100 });
  return takes;
}

const SIZES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

/** The block's size, stepped down from 1 until its lines fit 45% of a 1080x1920 frame, as videoMedia's layoutBlock draws it. */
export function wallSize(text: string, measure: Measure): number {
  for (const size of SIZES) {
    const px = 52 * size;
    const css = FONTS.clean.css.replace("{px}", px.toFixed(2));
    const lines = wrapBlock(text, BLOCK_W * 1080, px, (t) => measure(t, css));
    if (lines.length * px * 1.3 <= 0.45 * 1920) return size;
  }
  return SIZES[SIZES.length - 1];
}

/** The editor's line under the toast: where the words came from, then any warning the copy check left. */
export function noteOf(source: RemixSource | null, flags?: Flags): string | undefined {
  const from = source?.author || source?.url ? `Remixed from ${[source.author, source.url].filter(Boolean).join(", ")}` : "";
  const warn = [
    flags?.copied.length ? `These words repeat the original: ${flags.copied.map((c) => `"${c}"`).join(", ")}. Change them before you post.` : "",
    flags?.claim ? "Uses a figure or claim from the original. Check it or take it out." : "",
    flags?.invented ? "Says something about you that isn't in your profile. Check it." : "",
  ];
  return [from && `${from}.`, ...warn].filter(Boolean).join(" ") || undefined;
}

// ---- the job ----

let job: WallJob | null = null;
let seq = 0;
const listeners = new Set<(j: WallJob | null) => void>();
const set = (next: WallJob | null) => {
  job = next;
  listeners.forEach((l) => l(job && { ...job }));
};
export const wallJob = () => job;
export const wallBusy = () => job?.state === "writing" || job?.state === "finding" || job?.state === "joining";
export function onWallJob(fn: (j: WallJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a finished or failed run; a running one stays. */
export const clearWallJob = () => void (job && !wallBusy() && set(null));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startWall(userId: string, ask: WallAsk): Promise<void> {
  if (wallBusy()) return;
  const id = ++seq;
  const mine = (patch: Partial<WallJob>) => job?.id === id && set({ ...job, ...patch });
  set({ id, state: "writing", ask });
  let written: Written;
  try {
    const about = ask.about.trim();
    const res = await requestMake(makeBody(userId, { source: ask.source, topic: ask.source ? "" : about, note: ask.source ? about : "", mention: ask.mention, size: "9x16" }, "wall"));
    if (res?.result?.as !== "wall") throw new Error(WRITE_FAILED);
    const r = res.result;
    written = { text: stripDashes(r.text).trim(), caption: stripDashes(applyBrandRules(r.caption, loadBrand(userId), "tiktok")).trim(), scene: r.scene, search: r.search, flags: res.flags };
  } catch (e) {
    return void mine({ state: "failed", ...failure(e, WRITE_FAILED) });
  }
  mine({ written });
  await finish(id, ask, written);
}

/**
 * After the words are written but the video failed (no clip fit, a download dropped, a file that won't open): the
 * same words over a new background, with no second write. `bg` and `file` replace the run's own.
 */
export function finishAgain(change: Pick<WallAsk, "bg" | "file">): void {
  const j = job;
  if (!j?.written || j.state !== "failed" || wallBusy()) return;
  const id = ++seq;
  const ask = { ...j.ask, ...change };
  set({ id, state: ask.bg === "mine" ? "joining" : "finding", ask, written: j.written });
  void finish(id, ask, j.written);
}

async function finish(id: number, ask: WallAsk, w: Written): Promise<void> {
  const mine = (patch: Partial<WallJob>) => job?.id === id && set({ ...job, ...patch });
  try {
    const seconds = wallSeconds(w.text);
    await ensureCaptionFonts();
    const settings = wallSettings(w.text, seconds, { size: wallSize(w.text, screenMeasure()), font: "clean", box: "none" });
    const extra: JoinExtra = {
      settings,
      caption: w.caption,
      toast: WALL_TOAST,
      note: noteOf(ask.source, w.flags),
      ...(ask.source ? { source: { ...ask.source, remixedAt: new Date().toISOString() } } : {}),
    };
    if (ask.bg === "mine" && ask.file) {
      const length = await mediaLength(ask.file);
      if (!(length > 0)) return void mine({ state: "failed", error: OPEN_FAILED });
      // the editor keeps the whole file and cuts it at 15 s; the words run to the end of what is kept
      extra.settings = { ...settings, trimEnd: Math.max(0, Math.round((length - MINE_SECONDS) * 100) / 100) };
      mine({ state: "joining", extra });
      await handToEditor(ask.file, extra, "Your wall of text");
      return void mine({ state: "done" });
    }
    mine({ state: "finding" });
    const clip = await findClip(w, ask.source?.title || ask.about);
    if (!clip) return void mine({ state: "failed", error: NO_CLIP, noClip: true });
    const blob = await downloadStock(clip.src);
    const length = (await mediaLength(blob)) || clip.duration || seconds;
    mine({ state: "joining", extra });
    // a video the editor hasn't picked up yet (a paid avatar) is never overwritten
    while (currentJoin()) await sleep(1000);
    await startJoin("Wall of text", loopTakes(blob, length, seconds), JOIN_LABEL, { mute: true, extra });
    const joined = currentJoin();
    if (joined?.state === "failed") return void mine({ state: "failed", error: joined.error || FINISH_FAILED });
    mine({ state: "done" });
  } catch (e) {
    mine({ state: "failed", error: e instanceof Error && e.message ? e.message : FINISH_FAILED });
  }
}

// ---- the clip ----

/** Portrait clips long enough to loop, the first 6. A failed search (the stock-search cap, no connection) finds none. */
async function candidates(query: string): Promise<StockItem[]> {
  const q = query.trim();
  if (!q) return [];
  const found = await searchStock("video", q, 1, "portrait").catch(() => null);
  return chooseClips(found?.items ?? [], new Set(), LOOP_NEED, "portrait").slice(0, MAX_CANDIDATES);
}

/** Jev's pick for the scene: its index, -1 when none shows it, null when it gave no answer. */
async function pick(w: Written, items: StockItem[]): Promise<number | null> {
  const r = await callFn<{ picks: (number | null)[] }>("video-assist", {
    mode: "montage-pick",
    theme: w.scene,
    beats: [{ say: w.scene, candidates: items.map((it) => ({ desc: clipDesc(it) })) }],
  }).catch(() => null);
  const p = r?.picks?.[0];
  return typeof p === "number" && p < items.length ? p : null;
}

/**
 * The writer's search, then Jev's pick for the scene. Jev's "none" searches once more with the source's title or
 * the topic and asks again; no answer from Jev takes the first clip that loops. null when nothing fits either time.
 */
async function findClip(w: Written, again: string): Promise<StockItem | null> {
  for (const query of [w.search, simpleQuery(again)]) {
    const items = await candidates(query);
    if (!items.length) continue;
    const p = await pick(w, items);
    if (p === -1) continue;
    return items[p ?? 0];
  }
  return null;
}

/** A title or topic as a stock search: its first 4 plain words. */
export const simpleQuery = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
