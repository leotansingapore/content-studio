// Make a talking head (/make/talking-head, docs/north-star/items/formats-talking-head.md) outside React, so leaving the
// page keeps it going. One press runs every step in order: the script (remix make "speaking" with the length's
// seconds, only when the box holds a topic or the page has a post to write from; a Clone a reel result keeps its own),
// the AI presenter (makePresenter with the setting, once per look and setting this session), the voiceover (speak,
// then sliceVoiceover), the price check (the real slices against the chip's estimate: dearer stops here, keeping the
// voiceover, until "Make it for US$x"), then makeAvatar with the toast in its extra. aiVideo.ts keeps the paid Speak
// tokens in cs-ai-video-pending, so a reload resumes the video at no cost (resumeTalk). Each step is mirrored into
// formatJob.ts for /library's Making now.

import { aiBusy, aiJob, makeAvatar, makePresenter, onAiJob, pendingAvatar, resumeAvatar, sliceVoiceover, type Pending, type Voiceover } from "@/lib/aiVideo";
import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { stripDashes } from "@/lib/plainText";
import type { Price } from "@/lib/prices";
import { requestMake, tooLongLine, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import {
  TALK_TOAST, asTopic, clearScript, loadTyped, needsPriceCheck, saveTyped, talkParams, videoEstimate, videoPrice, writePlan,
  type TalkLength, type TalkSetting, type TalkWho,
} from "@/lib/talkingHead";
import { speak, type VoiceId } from "@/lib/textVoice";
import type { JoinExtra } from "@/lib/videoMedia";
import { noteOf } from "@/lib/wallJob";
import { MAX_AVATAR_SECONDS } from "../../supabase/functions/ai-video/logic.ts";

export interface TalkAsk {
  /** The post the script is written from; a clone's own script is already in `text`. */
  source: RemixSource | null;
  /** The script box: the script, or a topic to write it from. */
  text: string;
  who: TalkWho;
  /** My photo, picked on this visit. */
  photo: Blob | null;
  look: string;
  setting: TalkSetting;
  voice: VoiceId;
  length: TalkLength;
  mention: boolean;
  /** A Clone a reel result's own caption, carried to the editor with its script. */
  caption?: string;
}

export type TalkState = "writing" | "written" | "presenter" | "voice" | "priced" | "video" | "joining" | "done" | "failed";

export interface TalkJob {
  id: number;
  state: TalkState;
  step: string;
  /** "Write it for me": the run stops once the script is in the box. */
  writeOnly?: boolean;
  /** The page's params for the run (the library row reopens them); empty for a run picked up after a reload. */
  params: Record<string, string | undefined>;
  ask?: TalkAsk;
  /** What is said, written or typed. */
  script?: string;
  caption?: string;
  flags?: Flags;
  /** Kept at the price check, so going on never pays for them again. */
  face?: Blob | string;
  voice?: Voiceover;
  /** At the price check: how long the voiceover runs and what the video really costs. */
  real?: { seconds: number; price: Price };
  error?: string;
  /** The writer said no (422): the use is kept, and Try again would only be refused again. */
  refused?: boolean;
  capped?: boolean;
  /** A paid video is waiting on this device: Try again at no cost picks it up. */
  waiting?: boolean;
}

export const SLUG = "talking-head";
export const WRITE_FAILED = "Couldn't write the script. Try again in a minute.";
export const PRESENTER_FAILED = "Couldn't make the presenter. Try again in a minute.";
export const VOICE_FAILED = "Couldn't make the voiceover. Try again in a minute.";
export const START_FAILED = "Couldn't start the video right now. Try again in a minute.";
const WRITING = "Writing your script...";
const PRESENTER = "Making your presenter...";
const VOICE = "Making the voiceover...";
const SENDING = "Sending your voiceover and photo...";
/** aiVideo's own step once the clips are in; the page opens the editor here. */
export const JOINING = "Putting your video together...";
const PRICED = "Waiting for you to check the price";

let job: TalkJob | null = null;
let seq = 0;
/** The AI presenter made this session, reused while its look and setting stay the same. */
let presenter: { url: string; look: string; setting: TalkSetting } | null = null;
const listeners = new Set<(j: TalkJob | null) => void>();

function mirror(j: TalkJob | null) {
  if (!j || j.state === "written" || (j.writeOnly && j.state === "failed")) return clearFormatJob(SLUG);
  setFormatJob({
    slug: SLUG,
    label: "Talking head",
    format: "video",
    state: j.state === "failed" ? "failed" : j.state === "done" ? "ready" : "working",
    ...(j.state === "failed" ? { error: j.error } : { step: j.state === "priced" ? PRICED : j.step.replace(/\.\.\.$/, "") }),
    href: j.state === "joining" || j.state === "done" ? links.edit() : links.makeFormat(SLUG, j.params),
  });
}
const set = (next: TalkJob | null) => {
  job = next;
  mirror(job);
  listeners.forEach((l) => l(job && { ...job }));
};
/** A change to the run `id`; a newer run is never touched by an older one. */
const mine = (id: number, patch: Partial<TalkJob>) => void (job?.id === id && set({ ...job, ...patch }));

export const talkJob = () => job;
export const talkBusy = () => !!job && ["writing", "presenter", "voice", "video", "joining"].includes(job.state);
export function onTalkJob(fn: (j: TalkJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a run that is not running (a priced one gives up its voiceover: "Shorten the script"). */
export const dropTalk = () => void (job && !talkBusy() && set(null));

/** The presenter's picture when one is made for this look and setting. */
export const madePresenter = (look: string, setting: TalkSetting) =>
  presenter && presenter.look === look.trim() && presenter.setting === setting ? presenter.url : null;

/** A paid video this page made, waiting on this device (its toast is the talking head's). */
export const ownsPending = (p: Pick<Pending, "extra"> | null) => p?.extra?.toast === TALK_TOAST;

const paramsOf = (a: TalkAsk) => talkParams({ source: a.source?.key, who: a.who, setting: a.setting, length: a.length, voice: a.voice });

/** Writes the script: from the post (the box as a steer when it is short), or from the box as a topic. */
async function write(userId: string, a: TalkAsk, from: "source" | "topic"): Promise<{ script: string; caption: string; flags: Flags }> {
  const t = a.text.trim();
  const res = await requestMake(
    makeBody(
      userId,
      { source: from === "source" ? a.source : null, topic: from === "topic" ? t : "", note: from === "source" && asTopic(t, a.length) ? t : "", mention: a.mention, size: "9x16" },
      "speaking",
      { seconds: a.length },
    ),
  );
  if (res?.result?.as !== "speaking") throw new Error(WRITE_FAILED);
  const script = stripDashes(res.result.script).trim();
  // the box shows it now, and a reload or another page keeps it
  saveTyped(userId, { ...loadTyped(userId), script });
  return { script, caption: stripDashes(applyBrandRules(res.result.caption, loadBrand(userId), "tiktok")).trim(), flags: res.flags };
}

/** "Write it for me": the script only, into the box. */
export async function writeTalk(userId: string, a: TalkAsk): Promise<void> {
  if (talkBusy()) return;
  const id = ++seq;
  set({ id, state: "writing", step: WRITING, writeOnly: true, params: paramsOf(a), ask: a });
  try {
    const w = await write(userId, a, a.source ? "source" : "topic");
    mine(id, { state: "written", step: "", ...w });
  } catch (e) {
    mine(id, { state: "failed", step: "", ...failure(e, WRITE_FAILED) });
  }
}

/** One press: every step in order, stopping before Speak is paid for when the real price is higher than the chip's. */
export async function startTalk(userId: string, a: TalkAsk): Promise<void> {
  if (talkBusy() || aiBusy()) return;
  const id = ++seq;
  const fail = (patch: Partial<TalkJob>) => mine(id, { state: "failed", step: "", ...patch });
  const from = writePlan(a.text, a.length, a.source);
  let said = { script: a.text.trim(), caption: a.caption ?? "", flags: undefined as Flags | undefined };
  let face: Blob | string | null = a.who === "photo" ? a.photo : madePresenter(a.look, a.setting);
  const first: Pick<TalkJob, "state" | "step"> =
    from ? { state: "writing", step: WRITING } : a.who === "presenter" && !face ? { state: "presenter", step: PRESENTER } : { state: "voice", step: VOICE };
  set({ id, ...first, params: paramsOf(a), ask: a, ...(from ? {} : { script: said.script, caption: said.caption }) });
  if (from) {
    try {
      said = await write(userId, a, from);
    } catch (e) {
      return fail(failure(e, WRITE_FAILED));
    }
    mine(id, said);
  }

  if (a.who === "presenter" && !face) {
    mine(id, { state: "presenter", step: PRESENTER });
    await makePresenter(a.look.trim(), a.setting);
    const p = aiJob();
    if (p?.kind !== "presenter" || p.state !== "done" || !p.url) return fail({ error: p?.error || PRESENTER_FAILED });
    presenter = { url: p.url, look: a.look.trim(), setting: a.setting };
    face = p.url;
  }
  if (!face) return fail({ error: "Pick a photo first." });

  mine(id, { state: "voice", step: VOICE });
  let voice: Voiceover;
  try {
    voice = await sliceVoiceover(await speak(said.script, a.voice));
  } catch (e) {
    return fail({ error: (e as Error).message || VOICE_FAILED });
  }
  if (voice.seconds > MAX_AVATAR_SECONDS + 0.5) return fail({ error: tooLongLine(voice.seconds) });
  const real = videoPrice(voice.slices.map((s) => s.end - s.start));
  if (needsPriceCheck(videoEstimate(a.length).usd, real.usd)) {
    return mine(id, { state: "priced", step: "", face, voice, real: { seconds: voice.seconds, price: real } });
  }
  await video(userId, id, face, voice, said.script, extraOf(a.source, said));
}

/** "Make it for US$x" at the price check: the kept voiceover and face go to Speak. */
export function goOnAtPrice(userId: string): Promise<void> {
  const j = job;
  if (j?.state !== "priced" || !j.face || !j.voice || aiBusy()) return Promise.resolve();
  return video(userId, j.id, j.face, j.voice, j.script ?? "", extraOf(j.ask?.source ?? null, { caption: j.caption ?? j.ask?.caption ?? "", flags: j.flags }));
}

function extraOf(source: RemixSource | null, w: { caption: string; flags?: Flags }): JoinExtra {
  return {
    toast: TALK_TOAST,
    ...(w.caption ? { caption: w.caption } : {}),
    ...(noteOf(source, w.flags) ? { note: noteOf(source, w.flags) } : {}),
    ...(source ? { source: { ...source, remixedAt: new Date().toISOString() } } : {}),
  };
}

function video(userId: string, id: number, face: Blob | string, voice: Voiceover, script: string, extra: JoinExtra): Promise<void> {
  mine(id, { state: "video", step: SENDING, real: undefined });
  return follow(userId, id, () => void makeAvatar(script.slice(0, 40) || "Talking head", face, voice, extra));
}

/** Mirrors the avatar job's steps until it ends; the run is done once the editor has the video to open. */
function follow(userId: string, id: number, start: () => void): Promise<void> {
  return new Promise((resolve) => {
    const off = onAiJob((j) => {
      if (j?.kind !== "avatar") return;
      if (j.state === "working") return void mine(id, { state: j.step === JOINING ? "joining" : "video", step: j.step });
      off();
      if (j.state === "done") {
        clearScript(userId);
        mine(id, { state: "done", step: "" });
      } else mine(id, { state: "failed", step: "", error: j.error || START_FAILED, waiting: !!pendingAvatar() });
      resolve();
    });
    start();
    // the avatar job starts at once or not at all (another AI video took the slot first)
    const j = aiJob();
    if (j?.kind !== "avatar" || j.state !== "working") {
      off();
      mine(id, { state: "failed", step: "", error: START_FAILED, waiting: !!pendingAvatar() });
      resolve();
    }
  });
}

/**
 * A talking head paid for but never put together (a reload, a dropped download): picked up at no cost, its steps shown
 * here again. True when it started.
 */
export function resumeTalk(userId: string): boolean {
  if (talkBusy() || aiBusy() || !ownsPending(pendingAvatar())) return false;
  const id = ++seq;
  set({ id, state: "video", step: "", params: job?.params ?? {}, ...(job?.ask ? { ask: job.ask } : {}) });
  void follow(userId, id, resumeAvatar);
  return true;
}
