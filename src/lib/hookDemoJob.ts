// Make a hook plus demo (/make/hook-demo, docs/north-star/items/formats-hook-demo.md) outside React, so leaving the
// page keeps it going. One remix make (as "hooks", three formulas from hookFormulas.ts) writes three hooks and Jev
// marks one (writing-judge hooks); then the hook plays one of three ways before the demo:
//   stock:  Pexels finds a portrait clip and Jev picks the one that fits the hook (wallJob's findClip), cut to 3 s
//   mine:   the adviser's own upright clip, 2 to 5 s
//   spoken: ai-video's hidden spoken-hook template, a 4 s AI person saying it; the demo rides in the paid clip's
//           Pending.after, so a reload joins it at no cost
// The hook goes on screen as one block sticker from 0 to the hook's end, on the editor's no-captions path (never a
// wall, which would mute the demo and stretch the words over it). The demo is a device file (putFile), never a link
// and never synced; its key and name ride in sessionStorage for this tab. The written hooks live in memory here.
// The run's steps show in /library through formatJob.

import { aiBusy, pendingAvatar, makeTemplateClip, resumeAvatar, DEMO_GONE } from "@/lib/aiVideo";
import { EdgeError } from "@/lib/edgeFn";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { hookFormulaSet } from "@/lib/hookFormulas";
import { joinPlan, SPOKEN_HOOK_SECONDS, SPOKEN_HOOK_WORDS, STOCK_HOOK_SECONDS, type HookPlay, type JoinPlan } from "@/lib/hookDemo";
import { links } from "@/lib/links";
import { mediaLength } from "@/lib/longAudio";
import { stripDashes } from "@/lib/plainText";
import { requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { downloadStock } from "@/lib/stockMedia";
import { newOverlay, type Overlay } from "@/lib/videoEdit";
import { currentJoin, getFile, putFile, startJoin, type JoinExtra } from "@/lib/videoMedia";
import { JOIN_STEP, findClip, followClip, noteOf, paidClipBlock, simpleQuery } from "@/lib/wallJob";
import { pickHook } from "@/lib/writingJudge";

export interface DemoRef {
  /** The device file key (putFile) the demo is kept under. */
  key: string;
  name: string;
  seconds: number;
  /** A small still for the demo card. */
  thumb?: string;
}

export interface HookDemoAsk {
  /** A post to write the hooks from its opening; null: from `topic`. */
  source: RemixSource | null;
  /** What the demo shows (the steer with a source). */
  topic: string;
  mention: boolean;
  play: HookPlay;
  /** The hook as picked or typed; empty writes three and takes Jev's pick. */
  hook: string;
  demo: DemoRef;
  /** play mine: the adviser's own hook clip, in memory only. */
  mine?: { file: Blob; seconds: number } | null;
}

export interface HookSet {
  hooks: { text: string; formula: string }[];
  /** Jev's recommended hook, or null when it had no clear answer. */
  pick: number | null;
  /** hookFormulaSet's index: Write 3 more asks for the next one. */
  set: number;
  flags: Flags;
  /** What they were written for (hooksFor): a new topic or post writes anew. */
  for: string;
}

export interface HookDemoJob {
  id: number;
  /** clip: ai-video is making the spoken hook (step says how far). */
  state: "writing" | "finding" | "clip" | "joining" | "done" | "failed";
  step?: string;
  ask: HookDemoAsk;
  error?: string;
  /** The writer said no (422); the use is kept. */
  refused?: boolean;
  capped?: boolean;
  /** No stock clip fit the hook. */
  noClip?: boolean;
  /** The demo file is gone from this device: pick it again. */
  demoGone?: boolean;
}

export const SLUG = "hook-demo";
export const LABEL = "Hook plus demo";
/** The paid clip's name in cs-ai-video-pending, and the joined file's: how a reload knows the waiting clip is a spoken hook. */
export const HOOK_NAME = "Hook plus demo";
export const HOOK_TOAST = "Your hook and demo are ready. Export it when it looks right.";
export const HOOKS_FAILED = "Couldn't write the hooks. Try again in a minute.";
export const HOOK_REFUSED = "That can't be turned into a hook that's safe to post. Try another topic.";
export const NO_HOOK_CLIP = "No stock clip fits this hook. Try another hook or say it yourself.";
export const JOIN_FAILED = "Couldn't put the video together. Try again.";
export const NO_SPOKEN_FIT = "None of these hooks fits in 4 seconds. Pick a shorter one or type your own.";
const JOIN_LABEL = "Putting your hook and demo together";
const DEMO_KEY = "cs-make-hook-demo-file";

/** The words a hook set belongs to: a post's key, else the typed topic. */
export const hooksFor = (a: Pick<HookDemoAsk, "source" | "topic">) => (a.source ? a.source.key : a.topic.trim().toLowerCase());

export function stepText(j: Pick<HookDemoJob, "state" | "step">): string {
  if (j.step && (j.state === "clip" || j.state === "joining")) return j.step;
  return j.state === "writing" ? "Writing the hooks..." : j.state === "finding" ? "Finding a clip..." : j.state === "joining" ? "Putting it together..." : "";
}

/** The page's params for a run, defaults left out: the library row reopens what ran. */
export const hookParams = (a: Pick<HookDemoAsk, "source" | "mention" | "play">): Record<string, string | undefined> => ({
  source: a.source?.key,
  mention: a.mention ? undefined : "no",
  play: a.play === "stock" ? undefined : a.play,
});

// ---- the demo, kept on this device for the session ----

export function loadDemo(): DemoRef | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DEMO_KEY) ?? "null");
    return d && typeof d.key === "string" && typeof d.name === "string" && Number(d.seconds) > 0 ? { key: d.key, name: d.name, seconds: Number(d.seconds), thumb: typeof d.thumb === "string" ? d.thumb : undefined } : null;
  } catch {
    return null;
  }
}

export function saveDemo(d: DemoRef): void {
  try {
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(d));
  } catch {
    // the page still holds it for this visit
  }
}

export const newDemoKey = () => `hd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- the store ----

let job: HookDemoJob | null = null;
let hooks: HookSet | null = null;
let writing = false;
let hooksError: Pick<HookDemoJob, "error" | "refused" | "capped"> | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const hookDemoJob = () => job;
export const hookSet = () => hooks;
export const hooksWriting = () => writing;
export const hooksFailure = () => hooksError;
export const hookDemoBusy = () => job?.state === "writing" || job?.state === "finding" || job?.state === "clip" || job?.state === "joining";
export function onHookDemo(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a finished or failed run and the hooks; a running one stays. */
export function clearHookDemo(): void {
  if (hookDemoBusy() || writing) return;
  job = null;
  hooks = null;
  hooksError = null;
  mirror();
  emit();
}

const setJob = (next: HookDemoJob) => {
  job = next;
  mirror();
  emit();
};
const patcher = (id: number) => (patch: Partial<HookDemoJob>) => {
  if (job?.id === id) setJob({ ...job, ...patch });
};

/** The run's step on /library's Making now (phase 3 decision 8); the editor opens it once it is put together. */
function mirror(): void {
  const j = job;
  if (!j || j.state === "done") return clearFormatJob(SLUG);
  const href = j.state === "joining" ? links.edit() : links.makeFormat(SLUG, hookParams(j.ask));
  if (j.state === "failed") return setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "failed", error: j.error, href });
  setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "working", step: stepText(j).replace(/\.\.\.$/, ""), href });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the hooks ----

/** A failed write in the adviser's words: a refusal says to try another topic. */
function writeFailure(e: unknown): Pick<HookDemoJob, "error" | "refused" | "capped"> {
  const f = failure(e, HOOKS_FAILED);
  return f.refused && e instanceof EdgeError && e.code === "refused" ? { ...f, error: HOOK_REFUSED } : f;
}

/** Three hooks in the next formula set, and Jev's pick of them for this brand's audience. Throws as the make does. */
async function write(userId: string, a: Pick<HookDemoAsk, "source" | "topic" | "mention" | "demo">): Promise<HookSet> {
  const key = hooksFor(a);
  const set = hooks && hooks.for === key ? hooks.set + 1 : 0;
  const formulas = hookFormulaSet(set).map(({ id, name, template, example, trap }) => ({ id, name, template, example, trap }));
  const about = a.topic.trim();
  const body = makeBody(userId, { source: a.source, topic: a.source ? "" : about, note: a.source ? about : "", mention: a.mention, size: "9x16" }, "hooks", {
    formulas,
    demo: { name: a.demo.name, seconds: Math.round(a.demo.seconds * 10) / 10 },
  });
  const res = await requestMake(body);
  if (res?.result?.as !== "hooks" || !res.result.hooks.length) throw new Error(HOOKS_FAILED);
  const list = res.result.hooks.map((h) => ({ text: stripDashes(h.text).trim(), formula: h.formula })).filter((h) => h.text);
  const pick = await pickHook(list.map((h) => h.text), body.brand.audience, about || a.source?.title || "", "tiktok");
  return { hooks: list, pick, set, flags: res.flags, for: key };
}

/** Writes three hooks (Write 3 more: the next three formulas) for the page to pick from. */
export async function writeHooks(userId: string, a: Pick<HookDemoAsk, "source" | "topic" | "mention" | "demo">): Promise<void> {
  if (writing || hookDemoBusy()) return;
  writing = true;
  hooksError = null;
  emit();
  try {
    hooks = await write(userId, a);
  } catch (e) {
    hooksError = writeFailure(e);
  } finally {
    writing = false;
    emit();
  }
}

/** The hook a make takes when none was picked: Jev's, else the first, so long as it fits how it plays. */
export function chooseHook(set: Pick<HookSet, "hooks" | "pick">, play: HookPlay): string | null {
  const fits = (t: string) => play !== "spoken" || t.split(/\s+/).filter(Boolean).length <= SPOKEN_HOOK_WORDS;
  const order = set.pick !== null && set.hooks[set.pick] ? [set.hooks[set.pick], ...set.hooks.filter((_, i) => i !== set.pick)] : set.hooks;
  return order.find((h) => fits(h.text))?.text ?? null;
}

// ---- the video ----

/** The hook on screen: dark words on white boxes in the top third, from 0 to the hook's end. */
export function hookOverlay(text: string, plan: JoinPlan): Overlay {
  return { ...newOverlay("block", 0, "#FFFFFF", plan.overlay.to), text, from: plan.overlay.from, to: plan.overlay.to, y: 0.25, box: "white", font: "heavy" };
}

/** What the joined video carries to the editor: the hook sticker, no captions (the demo's words are its own), the note. */
export function hookExtra(text: string, plan: JoinPlan, source: RemixSource | null, flags?: Flags): JoinExtra {
  return {
    settings: { captions: false, overlays: [hookOverlay(text, plan)] },
    toast: HOOK_TOAST,
    note: noteOf(source, flags),
    ...(source ? { source: { ...source, remixedAt: new Date().toISOString() } } : {}),
  };
}

export async function makeHookDemo(userId: string, ask: HookDemoAsk): Promise<void> {
  if (hookDemoBusy() || writing) return;
  const id = ++seq;
  const mine = patcher(id);
  // the first step it shows: writing when no hook is picked, else how the hook plays
  setJob({ id, state: !ask.hook.trim() ? "writing" : ask.play === "stock" ? "finding" : ask.play === "spoken" ? "clip" : "joining", ask });
  // everything that stops it before a cent is spent: the demo gone from this device, a paid clip running or waiting
  const demo = await getFile(ask.demo.key).catch(() => undefined);
  if (!demo) return mine({ state: "failed", error: DEMO_GONE, demoGone: true });
  const blocked = ask.play === "spoken" ? paidClipBlock() : null;
  if (blocked) return mine({ state: "failed", error: blocked });
  let hook = ask.hook.trim();
  let flags = hooks?.for === hooksFor(ask) ? hooks.flags : undefined;
  if (!hook) {
    mine({ state: "writing" });
    try {
      hooks = await write(userId, ask);
      emit();
    } catch (e) {
      return mine({ state: "failed", ...writeFailure(e) });
    }
    flags = hooks.flags;
    const chosen = chooseHook(hooks, ask.play);
    if (!chosen) return mine({ state: "failed", error: NO_SPOKEN_FIT });
    hook = chosen;
    mine({ ask: { ...ask, hook } });
  }
  try {
    if (ask.play === "spoken") return await spoken(id, ask, hook, flags);
    let first: Blob;
    let length: number;
    if (ask.play === "mine" && ask.mine) {
      first = ask.mine.file;
      length = ask.mine.seconds;
    } else {
      mine({ state: "finding" });
      const clip = await findClip({ scene: hook, search: simpleQuery(ask.topic || ask.source?.title || hook) }, hook);
      if (!clip) return mine({ state: "failed", error: NO_HOOK_CLIP, noClip: true });
      first = await downloadStock(clip.src);
      length = (await mediaLength(first)) || clip.duration || STOCK_HOOK_SECONDS;
    }
    const plan = joinPlan(ask.play === "mine" ? "mine" : "stock", length, ask.demo.seconds);
    const extra = hookExtra(hook, plan, ask.source, flags);
    mine({ state: "joining" });
    // a video the editor hasn't picked up yet (a paid avatar) is never overwritten
    while (currentJoin()) await sleep(1000);
    const files = { hook: first, demo };
    await startJoin(HOOK_NAME, plan.takes.map((t) => ({ file: files[t.take], start: t.start, end: t.end })), JOIN_LABEL, { extra });
    const joined = currentJoin();
    if (joined?.state === "failed") return mine({ state: "failed", error: joined.error || JOIN_FAILED });
    mine({ state: "done" });
  } catch (e) {
    mine({ state: "failed", error: e instanceof Error && e.message ? e.message : JOIN_FAILED });
  }
}

/** The spoken hook: a paid 4 s clip, the demo joined after it from this device (Pending.after), so a reload still joins it. */
async function spoken(id: number, ask: HookDemoAsk, hook: string, flags?: Flags): Promise<void> {
  const plan = joinPlan("spoken", SPOKEN_HOOK_SECONDS, ask.demo.seconds);
  const extra = hookExtra(hook, plan, ask.source, flags);
  const mine = patcher(id);
  mine({ state: "clip", step: "Writing the shots..." });
  await follow(id, () =>
    makeTemplateClip(HOOK_NAME, { template: "spoken-hook", seconds: SPOKEN_HOOK_SECONDS, quality: "480p", fields: { line: hook }, photo: null }, {
      extra,
      after: [{ key: ask.demo.key, end: plan.takes[1].end }],
    }),
  );
}

async function follow(id: number, run: () => Promise<void> | void): Promise<void> {
  const mine = patcher(id);
  const j = await followClip((step) => mine({ state: step === JOIN_STEP ? "joining" : "clip", step }), run);
  if (j?.kind === "template" && j.state === "done") return mine({ state: "done", step: undefined });
  const error = j?.state === "failed" && j.error ? j.error : JOIN_FAILED;
  mine({ state: "failed", step: undefined, error, demoGone: error === DEMO_GONE });
}

/** The clip waiting on this device is a spoken hook's (cs-ai-video-pending). */
export const pendingHook = (): boolean => {
  const p = pendingAvatar();
  return p?.kind === "template" && p.name === HOOK_NAME;
};

/** The waiting spoken hook's demo key: a demo picked again goes under it, so the paid clip joins it. */
export const pendingDemoKey = (): string | null => (pendingHook() ? (pendingAvatar()?.after?.[0]?.key ?? null) : null);

/** Picks up a spoken hook paid for but never put together (a reload, a dropped download, a demo picked again) at no cost. */
export function resumeHookDemo(ask: HookDemoAsk): void {
  if (hookDemoBusy() || aiBusy() || !pendingHook()) return;
  const id = ++seq;
  setJob({ id, state: "clip", step: "Making your video...", ask });
  void follow(id, resumeAvatar);
}

/** The demo is gone from this device while a spoken hook waits: the file picked again goes under the waiting clip's key, then it joins. */
export async function repickDemo(file: Blob, ask: HookDemoAsk): Promise<void> {
  const key = pendingDemoKey();
  if (!key) return;
  await putFile(key, file);
  resumeHookDemo(ask);
}
