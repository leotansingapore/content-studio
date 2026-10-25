// Make a wall of text (/make/wall-of-text, docs/north-star/items/formats-wall-of-text.md) outside React, so leaving
// the page keeps it going (slideshowJob.ts's shape). One remix make (as "wall") writes the words, the scene behind
// them, a stock search and the caption. Pexels finds portrait clips and Jev picks the one that shows the scene
// (video-assist montage-pick, one beat); the clip loops to the words' reading time and videoMedia's join records it,
// muted, with the words as one block (edit-text-video's wallSettings). The adviser's own clip skips the join: it goes
// to the editor as it is, its first 15 s kept (handToEditor). Never the source's own video or sound.
// In memory only: a reload mid-make loses the run, and the server has given back the use of any write the model
// never answered. The words are kept once written, so finishing again (another clip, the adviser's own) never
// writes, or spends, again.
// Words over a made scene (/make/text-over-clip, docs/north-star/items/formats-text-over-clip.md) runs here too, in
// its own slot so a wall and a scene never share a run: the same write (as "wall" with the scene and 30 words) comes
// first, so a refusal pays for no clip; then ai-video makes the 8 s scene (aiVideo.ts makeTemplateClip) and joins it
// with the words riding in its extra, sound kept. That paid clip waits in cs-ai-video-pending with its extra, so a
// reload picks it up at no cost and still puts the words on it. The scene's steps show in /library through formatJob.

import { chooseClips } from "@/lib/autoBroll";
import { aiBusy, aiJob, makeTemplateClip, onAiJob, pendingAvatar, resumeAvatar, type AiJob, type ClipQuality } from "@/lib/aiVideo";
import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { callFn } from "@/lib/edgeFn";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { mediaLength } from "@/lib/longAudio";
import { describe as clipDesc } from "@/lib/montage";
import { stripDashes } from "@/lib/plainText";
import { VIDEO_LIMITS, requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { screenMeasure, type Measure } from "@/lib/slideshowDraw";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { BLOCK_W, FONTS, readSeconds, wallSettings, wrapBlock } from "@/lib/videoEdit";
import { currentJoin, ensureCaptionFonts, handToEditor, startJoin, type JoinExtra } from "@/lib/videoMedia";
import { MADE_SCENE_WORDS, type WallScene } from "../../supabase/functions/remix/logic.ts";
import { MAX_CANDIDATES } from "../../supabase/functions/video-assist/montage.ts";

export type WallFrom = "topic" | "remix";
export type WallBg = "stock" | "mine";

export interface WallAsk {
  /** null: written from `about` as a topic. */
  source: RemixSource | null;
  /** What it's about: the topic with no source, else the adviser's steer (the note). */
  about: string;
  /** The steer beside a topic (a campaign post's brief): the topic is held to 200 characters, the note to 300. */
  note?: string;
  mention: boolean;
  bg: WallBg;
  /** The adviser's own clip with bg mine; it stays on this device. */
  file?: File | null;
  /** Words over a made scene: ai-video makes this clip behind the words, and bg is not used. */
  scene?: SceneAsk;
  /** The My posts entry this wall is made for (a campaign post): the editor's Save to your post updates it. */
  draftId?: string;
  /** The agent's chat that asked for it: Activity logs the run as the agent's (live-p6replay D6). */
  agent?: { thread: string; msg: string };
}

export type { WallScene };
export interface SceneAsk {
  id: WallScene;
  quality: ClipQuality;
  /** Who is in it, as typed; empty lets the writer pick a Singaporean. */
  person: string;
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
  /** clip: ai-video is making a scene (step says how far). */
  state: "writing" | "finding" | "clip" | "joining" | "done" | "failed";
  /** A scene's own step while ai-video makes and joins it. */
  step?: string;
  ask: WallAsk;
  /** Kept once the words are written: finishing again reuses them. */
  written?: Written;
  /** What went to the join: the page knows the video waiting for the editor is this one by it. */
  extra?: JoinExtra;
  error?: string;
  /** The writer said no (422): it can't be made safe, or its checks failed twice. The use is kept (the model answered). */
  refused?: boolean;
  /** Today's uses are gone: see SlideshowJob.capped. */
  capped?: boolean;
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

export const SCENE_SLUG = "text-over-clip";
export const SCENE_LABEL = "Words over a made scene";
/** The paid clip's name in cs-ai-video-pending: how a reload knows the waiting clip is a scene. */
export const SCENE_NAME = "Words over a made scene";
export const SCENE_TOAST = "Your video is ready. Export it when it looks right.";
/** ai-video's clip lengths are 4 or 8 s (CLIP_SECONDS); 30 words read in 8. */
export const SCENE_SECONDS = 8;
/** ai-video's step once the paid clip is downloaded and being put together: the editor takes over from here. */
export const JOIN_STEP = "Putting your video together...";

/** A source opens on Remix a trending one, no source on A topic. */
export const startFrom = (source: RemixSource | null): WallFrom => (source ? "remix" : "topic");

export function stepText(j: Pick<WallJob, "state" | "step">): string {
  if (j.step && (j.state === "clip" || j.state === "joining")) return j.step;
  return j.state === "writing" ? "Writing the text..." : j.state === "finding" ? "Finding a clip..." : j.state === "joining" ? "Putting it together..." : "";
}

/** The page's params for a run, defaults left out: the library row and Try again reopen what ran. */
export function wallParams(a: Pick<WallAsk, "source" | "mention" | "bg" | "scene">): Record<string, string | undefined> {
  const base = { source: a.source?.key, from: a.source ? undefined : "topic", mention: a.mention ? undefined : "no" };
  if (a.scene) return { ...base, scene: a.scene.id === "kitchen" ? undefined : a.scene.id, quality: a.scene.quality === "480p" ? undefined : a.scene.quality };
  return { ...base, bg: a.bg === "mine" ? "mine" : undefined };
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
  const warns = warn.filter(Boolean);
  // no stop glued to the link unless a warning follows it
  return [from && (warns.length ? `${from}.` : from), ...warns].filter(Boolean).join(" ") || undefined;
}

// ---- the job ----

/** A wall and a scene each have their own run: /library lists the wall's here and the scene's through formatJob. */
export type WallSlot = "wall" | "scene";
const slotOf = (ask: Pick<WallAsk, "scene">): WallSlot => (ask.scene ? "scene" : "wall");
const jobs: Record<WallSlot, WallJob | null> = { wall: null, scene: null };
let seq = 0;
const listeners: Record<WallSlot, Set<(j: WallJob | null) => void>> = { wall: new Set(), scene: new Set() };
const set = (slot: WallSlot, next: WallJob | null) => {
  jobs[slot] = next;
  if (slot === "scene") mirror(next);
  listeners[slot].forEach((l) => l(next && { ...next }));
};
const busyJob = (j: WallJob | null) => j?.state === "writing" || j?.state === "finding" || j?.state === "clip" || j?.state === "joining";
export const wallJob = (slot: WallSlot = "wall") => jobs[slot];
export const wallBusy = (slot: WallSlot = "wall") => busyJob(jobs[slot]);
export function onWallJob(fn: (j: WallJob | null) => void, slot: WallSlot = "wall"): () => void {
  listeners[slot].add(fn);
  return () => void listeners[slot].delete(fn);
}
/** Clears a finished or failed run; a running one stays. */
export const clearWallJob = (slot: WallSlot = "wall") => void (jobs[slot] && !wallBusy(slot) && set(slot, null));
/** A patch for run `id` only: a newer run in the slot is never touched by an older one finishing. */
const patcher = (slot: WallSlot, id: number) => (patch: Partial<WallJob>) => {
  const j = jobs[slot];
  if (j?.id === id) set(slot, { ...j, ...patch });
};

/** The scene's step on /library's Making now (phase 3 decision 8); the editor opens it once it is put together. */
function mirror(j: WallJob | null): void {
  if (!j || j.state === "done") return clearFormatJob(SCENE_SLUG);
  const href = j.state === "joining" ? links.edit() : links.makeFormat(SCENE_SLUG, wallParams(j.ask));
  if (j.state === "failed") return setFormatJob({ slug: SCENE_SLUG, label: SCENE_LABEL, format: "video", state: "failed", error: j.error, href });
  setFormatJob({ slug: SCENE_SLUG, label: SCENE_LABEL, format: "video", state: "working", step: stepText(j).replace(/\.\.\.$/, ""), href });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startWall(userId: string, ask: WallAsk): Promise<void> {
  const slot = slotOf(ask);
  if (wallBusy(slot)) return;
  const id = ++seq;
  const mine = patcher(slot, id);
  set(slot, { id, state: "writing", ask });
  // a scene pays for a clip after the words: one that can't be ordered now stops before the write spends anything
  const blocked = ask.scene ? paidClipBlock() : null;
  if (blocked) return void mine({ state: "failed", error: blocked });
  let written: Written;
  try {
    const about = ask.about.trim();
    const more: Parameters<typeof makeBody>[3] = ask.scene ? { scene: ask.scene.id, maxWords: MADE_SCENE_WORDS } : {};
    const res = await requestMake(makeBody(userId, { source: ask.source, topic: ask.source ? "" : about, note: ask.source ? about : (ask.note?.trim() ?? ""), mention: ask.mention, size: "9x16" }, "wall", more));
    if (res?.result?.as !== "wall") throw new Error(WRITE_FAILED);
    const r = res.result;
    written = { text: stripDashes(r.text).trim(), caption: stripDashes(applyBrandRules(r.caption, loadBrand(userId), "tiktok")).trim(), scene: r.scene, search: r.search, flags: res.flags };
  } catch (e) {
    return void mine({ state: "failed", ...failure(e, WRITE_FAILED) });
  }
  mine({ written });
  await (ask.scene ? sceneClip(id, ask, written) : finish(id, ask, written));
}

/**
 * After the words are written but the video failed (no clip fit, a download dropped, a file that won't open): the
 * same words over a new background, with no second write. `bg` and `file` replace the run's own. A scene orders a
 * new clip (paid again, so its page asks first); a clip paid for and waiting is resumeScene's, at no cost.
 */
export function finishAgain(change: Partial<Pick<WallAsk, "bg" | "file">>, slot: WallSlot = "wall"): void {
  const j = jobs[slot];
  if (!j?.written || j.state !== "failed" || wallBusy(slot)) return;
  const id = ++seq;
  const ask = { ...j.ask, ...change };
  if (ask.scene) {
    set(slot, { id, state: "clip", ask, written: j.written });
    void sceneClip(id, ask, j.written);
    return;
  }
  set(slot, { id, state: ask.bg === "mine" ? "joining" : "finding", ask, written: j.written });
  void finish(id, ask, j.written);
}

async function finish(id: number, ask: WallAsk, w: Written): Promise<void> {
  const mine = patcher("wall", id);
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
      ...(ask.draftId ? { draftId: ask.draftId } : {}),
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
    // only a join still running waits: a video the editor hasn't picked up yet (a paid avatar) moves aside, never overwritten
    while (currentJoin()?.state === "running") await sleep(1000);
    await startJoin("Wall of text", loopTakes(blob, length, seconds), JOIN_LABEL, { mute: true, extra });
    const joined = currentJoin();
    if (joined?.state === "failed") return void mine({ state: "failed", error: joined.error || FINISH_FAILED });
    mine({ state: "done" });
  } catch (e) {
    mine({ state: "failed", error: e instanceof Error && e.message ? e.message : FINISH_FAILED });
  }
}

// ---- a made scene ----

/** Why a paid clip (a scene, a spoken hook) can't be ordered now: another AI video running, or one paid for and waiting (a new one would write over it). */
export function paidClipBlock(): string | null {
  return aiBusy() ? VIDEO_LIMITS.busy : pendingAvatar() ? VIDEO_LIMITS.waiting : null;
}

/** The clip waiting on this device is a scene's (cs-ai-video-pending), so this page can pick it up at no cost. */
export const pendingScene = (): boolean => {
  const p = pendingAvatar();
  return p?.kind === "template" && p.name === SCENE_NAME;
};

/** What the scene's clip carries to the editor: the words as one block over the whole clip, with its own sound. */
export function sceneExtra(ask: WallAsk, w: Pick<Written, "text" | "caption" | "flags">): JoinExtra {
  const settings = wallSettings(w.text, SCENE_SECONDS, { size: wallSize(w.text, screenMeasure()), font: "clean", box: "none" });
  return {
    // the scene's room or street sound plays: a wall's stock clip is muted, a made scene is not
    settings: { ...settings, volume: 1 },
    caption: w.caption,
    toast: SCENE_TOAST,
    note: noteOf(ask.source, w.flags),
    tab: "stickers",
    ...(ask.source ? { source: { ...ask.source, remixedAt: new Date().toISOString() } } : {}),
  };
}

/** Resolves once no AI video is working: aiVideo's jobs never throw, so its job is read after. */
const aiSettled = () =>
  new Promise<void>((resolve) => {
    if (!aiBusy()) return resolve();
    const off = onAiJob((j) => {
      if (j?.state !== "working") {
        off();
        resolve();
      }
    });
  });

/**
 * Runs a paid template clip (`run` orders it, or resumes the one waiting) and reports ai-video's steps, from writing
 * the shots to putting it together (JOIN_STEP). Resolves with ai-video's job once it stops working.
 */
export async function followClip(onStep: (step: string) => void, run: () => Promise<void> | void): Promise<AiJob | null> {
  const relay = onAiJob((j) => {
    if (j?.kind === "template" && j.state === "working") onStep(j.step);
  });
  try {
    await run();
    await aiSettled();
  } finally {
    relay();
  }
  return aiJob();
}

/** The scene's run from ai-video's clip: its steps, then done, or failed in ai-video's words. */
async function sceneFollow(id: number, run: () => Promise<void> | void): Promise<void> {
  const mine = patcher("scene", id);
  const j = await followClip((step) => mine({ state: step === JOIN_STEP ? "joining" : "clip", step }), run);
  if (j?.kind === "template" && j.state === "done") return void mine({ state: "done", step: undefined });
  mine({ state: "failed", step: undefined, error: j?.state === "failed" && j.error ? j.error : FINISH_FAILED });
}

async function sceneClip(id: number, ask: WallAsk, w: Written): Promise<void> {
  const mine = patcher("scene", id);
  const s = ask.scene!;
  try {
    await ensureCaptionFonts();
    const extra = sceneExtra(ask, w);
    // checked again right before paying: a video started elsewhere while the words were written
    const blocked = paidClipBlock();
    if (blocked) return void mine({ state: "failed", error: blocked });
    mine({ state: "clip", step: "Writing the shots...", extra });
    const person = s.person.trim();
    await sceneFollow(id, () =>
      makeTemplateClip(SCENE_NAME, { template: `scene-${s.id}`, seconds: SCENE_SECONDS, quality: s.quality, fields: person ? { person } : {}, photo: null }, { extra }),
    );
  } catch (e) {
    mine({ state: "failed", step: undefined, error: e instanceof Error && e.message ? e.message : FINISH_FAILED });
  }
}

/**
 * Picks up a scene paid for but never put together (a reload, a dropped download, a failed join) at no cost: the
 * words ride in the waiting clip's extra. `ask` is the page's, for its links; the video keeps the clip's own source.
 */
export function resumeScene(ask: WallAsk): void {
  if (wallBusy("scene") || aiBusy() || !pendingScene()) return;
  const p = pendingAvatar()!;
  const block = p.extra?.settings?.overlays?.find((o) => o.kind === "block");
  const written: Written = { text: block?.text ?? "", caption: p.extra?.caption ?? "", scene: "", search: "", flags: { copied: [], claim: false, invented: false } };
  const id = ++seq;
  set("scene", { id, state: "clip", step: "Making your video...", ask, written, extra: p.extra });
  void sceneFollow(id, resumeAvatar);
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
async function pick(w: Pick<Written, "scene">, items: StockItem[]): Promise<number | null> {
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
export async function findClip(w: Pick<Written, "scene" | "search">, again: string): Promise<StockItem | null> {
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
