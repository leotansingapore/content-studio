// Same edit, your version (/make/same-edit, docs/north-star/items/remix-format-clone.md), outside React so leaving the
// page keeps it going. Two presses, each with its price on the button:
//   Read the edit: the reel's video (clone-reel's style read for a fresh Instagram link, then fetchReelVideo; or an
//     uploaded file, taken only when its sha1 is the source key's), its length and shape, the cuts and one frame a shot
//     (measureReel's per-cut option), the words with their times (Whisper) and the sound (a music bed, drops before a
//     line, effects at the cuts: measured here and thrown away with the track), faces on each frame (countFaces), the
//     teardown (ensureTeardown: a clone's own breakdown costs nothing) and reel-visuals' edit read (edit-read).
//     planFromRead keeps only roles, counts and shares (savePlan, synced); the transcript and the overlays stay in this
//     tab's memory, for the writer's closeness check only.
//   Make my version: remix make as "edit" (one line per beat, a [[k]] marker per event); the version and its
//     short-video draft are saved before anything else is paid for. I'll film it stops there. A face or no face then
//     gets the voiceover with word times (text-voice timestamps), the cutaways (stock, autoBroll's path) and
//     compilePlan's settings in the editor hand-off, then the video: the talking head's Speak run through aiVideo's
//     makeAvatar, with talkingHeadJob's price check (startTalk makes its own voiceover with no word times, so it is not
//     called here), or with no face the stock clips cut at their marked words under the voice (startSlides).
// A paid Speak run resumes from cs-ai-video-pending at no cost (resumeSameEdit, or the editor's AI panel: the hand-off
// rides in the pending run). Each step is mirrored into formatJob.ts for /library's Making now.

import { aiBusy, aiJob, makeAvatar, onAiJob, pendingAvatar, resumeAvatar, sliceVoiceover, type Voiceover } from "@/lib/aiVideo";
import { stockIdOf } from "@/lib/autoBroll";
import { loadBrand } from "@/lib/carousel";
import { newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { callFn, EdgeError } from "@/lib/edgeFn";
import {
  MAX_EVENTS, SPEAKER_FACE, addVersion, compilePlan, loadPlans, planFromRead, savePlan, versionId,
  type CutawayClip, type EditPlan, type PlanEvent, type Version,
} from "@/lib/editPlan";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { stripDashes } from "@/lib/plainText";
import { priceOf, priceText, sumPrices, type Price } from "@/lib/prices";
import { fullText, requestMake, tooLongLine, type Flags } from "@/lib/remix";
import { brandPack } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { ensureTeardown, type Teardown } from "@/lib/remixTeardown";
import { ReelCloneError, invokeFunction, loadSavedClones } from "@/lib/reelClone";
import { fetchReelVideo } from "@/lib/reelFrames";
import { measureReel, type ReelLook } from "@/lib/reelStyle";
import { failure, makeBody } from "@/lib/slideshowJob";
import { downloadStock, searchStock } from "@/lib/stockMedia";
import { presenterVoice } from "@/lib/presenters";
import { aiMark, needsPriceCheck, readWps, speakerFace, speakerOf, speakers, videoEstimate, videoPrice, type Speakers } from "@/lib/talkingHead";
import { JOINING } from "@/lib/talkingHeadJob";
import { audioSeconds, type VoiceId } from "@/lib/textVoice";
import { STYLES, sentencesOf, type Word } from "@/lib/videoEdit";
import { currentJoin, encodeWav, getFile, loadVideo, monoPcm, putFile, seek, startSlides, type JoinExtra } from "@/lib/videoMedia";
import { transcribe } from "@/lib/videoProjects";
import { noteOf } from "@/lib/wallJob";
import { MAX_AVATAR_SECONDS } from "../../supabase/functions/ai-video/logic.ts";
import type { EditShot, EditPicks, EditRead } from "../../supabase/functions/reel-visuals/edit.ts";
import type { FrameInput } from "../../supabase/functions/reel-visuals/logic.ts";
import { FIT_COPY, type Close, type EditBrief, type EditResult } from "../../supabase/functions/remix/logic.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export const SLUG = "same-edit";
export const SAME_EDIT_TOAST = "Your version is ready. Change anything, then export.";
export const READ_STEPS = ["Reading the reel...", "Finding the cuts...", "Hearing the words...", "Reading the shots..."] as const;
export const TIKTOK_LINE = "TikTok doesn't share the video file, so its edit can't be read. Upload the video, or remix its words.";
export const TOO_LONG_LINE = "Pick a reel under 90 seconds.";
export const NO_WORDS_LINE = "This reel has no spoken words to build on. Try Wall of text or Montage for reels like this.";
export const NO_VIDEO_LINE = "This post has no video to read.";
export const CLONE_FIRST_LINE = "Only a cloned reel or an upload has a video to read. Clone this reel first, then tap Rebuild this edit.";
export const NOT_SAME_FILE = "That isn't the video you read. Pick the same file.";
export const TWO_PEOPLE_LINE = "It has two people talking. Your version has one, so their lines become yours.";
export const FILM_LINE = "Film it, then upload the take here.";
export const MUSIC_LINE = "The original has music under the voice. Add yours in Music.";
export const PRESENTER_LINE = "The person is made by AI.";
export const PLAN_GONE = "That edit isn't on this device any more. Read the reel again.";
export const NO_CUTAWAYS = "This edit has no cutaways to show without a face.";
export const NO_STOCK = "No stock clip fit this script, so there's nothing to show under the voice. Pick who's on camera, or I'll film it.";
export const WRITE_FAILED = "Couldn't write your version. Try again in a minute.";
export const READ_FAILED = "Couldn't read that reel. Try again in a minute.";
export const VOICE_FAILED = "Couldn't make the voiceover. Try again in a minute.";
export const START_FAILED = "Couldn't start the video right now. Try again in a minute.";
export const NO_FACE = "Save your face first.";
export const PRESENTER_GONE = "That presenter is no longer here. Pick who's on camera again.";
export const TEXT_HEAVY = FIT_COPY.textHeavy;
export const MAX_SOURCE_SECONDS = 90;
export const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
export const LENGTHS = [15, 30] as const;
export type EditLength = (typeof LENGTHS)[number];
export const CLOSES: Close[] = ["loose", "balanced", "close"];
/** A spoken line's pace: the source's words a second, held to this (remix-format-clone's writing rule). */
export const WPS = { min: 2.4, max: 3.2, fallback: 2.6 } as const;
const WRITING = "Writing your version...";
const VOICE = "Making the voiceover...";
const PUTTING = "Putting it together...";
const PRICED = "Waiting for you to check the price";

/** Who's on camera: your verified face, a kept presenter's id, no face, or you film it. */
export type SameWho = "mine" | "none" | "film" | `pr-${string}`;
const hostOf = (who: SameWho): Version["host"] =>
  who === "mine" ? { kind: "mine" } : who === "none" ? { kind: "none" } : who === "film" ? { kind: "film" } : { kind: "presenter", id: who };
export const isFace = (who: string) => who !== "none" && who !== "film";

export interface MakeAsk {
  planId: string;
  /** The post the plan was read from, for the writer's words, the draft's trail and the editor's note. */
  source: RemixSource | null;
  who: SameWho;
  voice: VoiceId;
  length: EditLength;
  close: Close;
  mention: boolean;
}

export type SameState = "reading" | "read" | "stopped" | "writing" | "voice" | "priced" | "cutaways" | "video" | "joining" | "filmed" | "done" | "failed";

export interface SameEditJob {
  id: number;
  kind: "read" | "make";
  state: SameState;
  step: string;
  /** Read: which of READ_STEPS is running. */
  at?: number;
  /** The page's params, for the library row. */
  params: Record<string, string | undefined>;
  /** The source key read, or the plan made from. */
  source?: string;
  planId?: string;
  versionId?: string;
  ask?: MakeAsk;
  /** A stop before anything paid: its own line on the page. */
  stop?: "tiktok" | "too-long" | "no-words" | "no-video" | "clone-first";
  /** The written script, shown with its warnings while the video is made. */
  script?: string;
  flags?: Flags;
  /** At the price check: how long the voiceover runs and what the video really costs. */
  real?: { seconds: number; price: Price };
  error?: string;
  refused?: boolean;
  capped?: boolean;
  /** A paid video is waiting on this device: Try again at no cost picks it up. */
  waiting?: boolean;
}

let job: SameEditJob | null = null;
let seq = 0;
const listeners = new Set<(j: SameEditJob | null) => void>();
/** What a read heard, this tab only and never saved: the writer's closeness check reads it. */
const heard = new Map<string, { overlays: string[] }>();
/** The source video this tab downloaded or was given, by source key: the plan view plays it. */
const videos = new Map<string, string>();
/** Kept at the price check, so going on never pays for the voiceover again. */
let kept: { id: number; face: Blob | string; voice: Voiceover; mp3: Blob; words: Word[]; version: Version; plan: EditPlan; ask: MakeAsk } | null = null;

function mirror(j: SameEditJob | null) {
  if (!j || j.kind === "read" || j.state === "filmed") return clearFormatJob(SLUG);
  setFormatJob({
    slug: SLUG,
    label: "Same edit",
    format: "video",
    state: j.state === "failed" ? "failed" : j.state === "done" ? "ready" : "working",
    ...(j.state === "failed" ? { error: j.error } : { step: j.state === "priced" ? PRICED : j.step.replace(/\.\.\.$/, "") }),
    href: j.state === "joining" || j.state === "done" ? links.edit() : links.makeFormat(SLUG, j.params),
  });
}
const set = (next: SameEditJob | null) => {
  job = next;
  mirror(job);
  listeners.forEach((l) => l(job && { ...job }));
};
/** A change to run `id`; a newer run is never touched by an older one. */
const mine = (id: number, patch: Partial<SameEditJob>) => void (job?.id === id && set({ ...job, ...patch }));

export const sameEditJob = () => job;
export const sameEditBusy = () => !!job && ["reading", "writing", "voice", "cutaways", "video", "joining"].includes(job.state);
export function onSameEditJob(fn: (j: SameEditJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a run that is not running (a priced one gives up its voiceover). */
export function dropSameEdit(): void {
  if (job && !sameEditBusy()) {
    kept = null;
    set(null);
  }
}
/** The source video for the plan view, while this tab has it. */
export const sourceVideo = (key: string | undefined) => (key ? videos.get(key) ?? null : null);
/** A paid video this page made, waiting on this device. */
export const ownsPending = () => pendingAvatar()?.extra?.toast === SAME_EDIT_TOAST;

// ---------- pure parts (tested) ----------

/** The plan's shape from the video's size: the nearest of the four the editor exports. */
export function aspectOf(w: number, h: number): EditPlan["read"]["aspect"] {
  const r = w / Math.max(1, h);
  const all = [["9:16", 9 / 16], ["4:5", 0.8], ["1:1", 1], ["16:9", 16 / 9]] as const;
  return all.reduce((best, a) => (Math.abs(a[1] - r) < Math.abs(best[1] - r) ? a : best))[0];
}

/**
 * The reel's sound, measured on its decoded track (mono at `rate`) against Whisper's word times: a music bed when the
 * gaps between words stay above a tenth of the speech level, a drop for each line the bed falls silent before (0.4 s
 * at least), and sound effects when most cuts carry a sharp peak within 0.15 s.
 */
export function soundOf(pcm: Float32Array, rate: number, words: Word[], cuts: number[]): { bed: boolean; drops: number; sfx: boolean } {
  const rms = (a: number, b: number) => {
    const i0 = Math.max(0, Math.floor(a * rate));
    const i1 = Math.min(pcm.length, Math.floor(b * rate));
    if (i1 - i0 < rate * 0.01) return 0;
    let s = 0;
    for (let i = i0; i < i1; i++) s += pcm[i] * pcm[i];
    return Math.sqrt(s / (i1 - i0));
  };
  const end = pcm.length / rate;
  const speech = words.length ? words.reduce((t, w) => t + rms(w.s, w.e), 0) / words.length : 0;
  const edges = [0, ...words.flatMap((w) => [w.s, w.e]), end];
  let gapTime = 0;
  let gapSum = 0;
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i] + 0.05;
    const b = edges[i + 1] - 0.05;
    if (b - a < 0.2) continue;
    gapTime += b - a;
    gapSum += rms(a, b) * (b - a);
  }
  const bedLevel = gapTime ? gapSum / gapTime : 0;
  const bed = gapTime >= 1 && speech > 0 && bedLevel >= speech * 0.1 && bedLevel > 0.003;
  let drops = 0;
  if (bed) {
    const starts = sentencesOf(words).map((s) => s.s).slice(1);
    for (const s of starts) {
      const before = words.filter((w) => w.e <= s).at(-1)?.e ?? 0;
      if (s - before >= 0.4 && rms(s - 0.4, s - 0.02) < bedLevel * 0.3) drops++;
    }
  }
  let hits = 0;
  for (const c of cuts) {
    let peak = 0;
    for (let t = c - 0.15; t < c + 0.15; t += 0.02) peak = Math.max(peak, rms(t, t + 0.02));
    if (peak > 0.02 && peak >= 2.5 * rms(c - 1, c + 1)) hits++;
  }
  return { bed, drops, sfx: cuts.length > 0 && hits >= Math.min(2, cuts.length) && hits / cuts.length >= 0.3 };
}

/** The teardown's beats as the edit read takes them, 2 to 8: a one-beat teardown gets its payoff or CTA as the close. */
export function teardownBeats(t: Pick<Teardown, "beats" | "payoff" | "cta">): string[] {
  const beats = t.beats.map((b) => b.trim()).filter(Boolean).slice(0, 8);
  if (beats.length >= 2) return beats;
  const close = [t.payoff, /^none\.?$/i.test(t.cta.trim()) ? "" : t.cta].map((x) => x?.trim()).find(Boolean) || "The close";
  return beats.length ? [beats[0], close] : ["The opening", close];
}

/** One shot per frame: whether a face was counted on it (and how many), and the words said from its cut to the next. */
export function shotsFor(frames: { t: number }[], cuts: number[], faces: number[], words: Word[], seconds: number): EditShot[] {
  const starts = [0, ...cuts];
  return frames.map((f, i) => {
    const s = Math.max(...starts.filter((c) => c <= f.t + 1e-6));
    const e = starts.find((c) => c > f.t + 1e-6) ?? seconds;
    return { face: (faces[i] ?? 0) >= 1, faces: faces[i] ?? 0, said: words.filter((w) => w.s >= s - 0.05 && w.s < e).map((w) => w.w).join(" ") };
  });
}

/**
 * Words a second for the new script: the source's, held to WPS, and never faster than `voice` reads at its slowest
 * measured (readWps, the rule a campaign's AI video is priced by), so the version runs its length (live-p7a D1).
 */
export const wpsOf = (plan: Pick<EditPlan, "read">, voice: VoiceId) =>
  Math.min(readWps(voice), WPS.max, Math.max(WPS.min, plan.read.wpm ? plan.read.wpm / 60 : WPS.fallback));

/** The writer's brief: each beat's role, its share of `length` and its word budget in `voice`, and every event as its marker. */
export function editBrief(plan: EditPlan, length: number, voice: VoiceId): EditBrief {
  const total = plan.beats.reduce((t, b) => t + b.share, 0) || 1;
  const wps = wpsOf(plan, voice);
  // whole words carried from beat to beat, so the beats' sum never reads past the length (rounding each beat added one)
  let due = 0;
  let given = 0;
  return {
    beats: plan.beats.map((b) => {
      const seconds = Math.min(60, Math.max(0.5, Math.round(((b.share / total) * length) * 10) / 10));
      due += seconds * wps;
      const words = Math.min(200, Math.max(1, Math.floor(due + 1e-9) - given));
      given += words;
      return { role: b.role, seconds, words };
    }),
    events: plan.events.slice(0, MAX_EVENTS).map((e) => ({
      b: Math.min(plan.beats.length - 1, Math.max(0, e.place.b)),
      kind: e.kind,
      ...(e.kind === "text" ? { role: e.role, words: Math.min(20, Math.max(1, e.words)) } : {}),
    })),
  };
}

/** The made version: the writer's lines and marks (markers already out), dashes taken out of every word shown. */
export function versionOf(r: EditResult, ask: Pick<MakeAsk, "who" | "voice">, now = new Date()): Version {
  return {
    id: versionId(now),
    host: hostOf(ask.who),
    voice: ask.voice,
    lang: "en",
    offer: null,
    lines: r.lines.map((l) => stripDashes(l).trim()),
    marks: r.marks,
    texts: r.texts.map((t) => ({ ...t, text: stripDashes(t.text).trim() })),
    searches: r.searches,
    caption: stripDashes(r.caption).trim(),
    at: now.toISOString(),
  };
}

/** What a voice says: the lines with one space between, so text-voice's word times line up with the lines' words. */
export const spoken = (v: Pick<Version, "lines">) => v.lines.join(" ").replace(/\s+/g, " ").trim();

/**
 * With no face, the footage under the voice is the cutaways themselves: one scene per clip, cut at its marked word,
 * the first from 0, the last to the end. A clip used twice loops as a scene does.
 */
export function cutawayScenes(broll: { key: string; from: number }[], total: number): { key: string; seconds: number }[] {
  const sorted = [...broll].sort((a, b) => a.from - b.from);
  const out: { key: string; seconds: number }[] = [];
  sorted.forEach((b, i) => {
    const from = i === 0 ? 0 : b.from;
    const to = i + 1 < sorted.length ? sorted[i + 1].from : total;
    if (to - from >= 0.3) out.push({ key: b.key, seconds: Math.round((to - from) * 1000) / 1000 });
    else if (out.length) out[out.length - 1].seconds = Math.round((out[out.length - 1].seconds + Math.max(0, to - from)) * 1000) / 1000;
  });
  return out;
}

const SHOT_WORDS: Record<EditPlan["beats"][number]["shots"][number]["kind"], string> = {
  speaker: "speaker", cutaway: "cutaway", screen: "screen", text_card: "text card", product: "product",
};

/** The plan view's rows: when each beat starts in the source, its name, and its shots and moments in order. */
export function planRows(plan: EditPlan): { at: number; label: string; parts: string[] }[] {
  let t = 0;
  let points = 0;
  return plan.beats.map((b, i) => {
    const at = t;
    t += b.share * plan.read.seconds;
    const label = b.role === "hook" ? "Hook" : b.role === "ask" ? "Ask" : b.role === "proof" ? "Proof" : b.role === "product" ? "Product" : `Point ${++points}`;
    const moments = plan.events
      .filter((e) => e.place.b === i)
      .flatMap((e: PlanEvent) =>
        e.kind === "text" ? [e.role === "number" ? "number card" : `text: ${e.role}, ${e.words} ${e.words === 1 ? "word" : "words"}`]
        : e.kind === "zoom" ? ["zoom"]
        : e.kind === "popup" ? ["pop-up"]
        : []);
    return { at, label, parts: [...b.shots.map((s) => SHOT_WORDS[s.kind]), ...moments] };
  });
}

/** 0:38 */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** "Captions: Bold, 3 words, bottom, box.  22 cuts a minute.  Music under the voice." */
export function lookLine(read: EditPlan["read"]): string {
  const l: ReelLook | null = read.look;
  const caps = !l ? "" : l.captions === false ? "No captions." : `Captions: ${[
    l.style ? STYLES[l.style].label : "",
    l.words ? (l.words === "line" ? "a line at a time" : `${l.words} ${l.words === "1" ? "word" : "words"}`) : "",
    l.position ?? "",
    l.captionBox === "pill" ? "box" : l.captionBox === "word" ? "word highlight" : "",
  ].filter(Boolean).join(", ") || "as the reel has them"}.`;
  return [
    caps,
    read.cutsPerMin !== null ? `${read.cutsPerMin} ${read.cutsPerMin === 1 ? "cut" : "cuts"} a minute.` : "",
    read.music?.bed ? "Music under the voice." : "",
    read.sfx ? "Sound effects on the cuts." : "",
  ].filter(Boolean).join("  ");
}

/** The length row's line, when the chosen length differs from the original's. */
export function lengthLine(seconds: number, length: number): string | null {
  if (Math.abs(seconds - length) < 1) return null;
  return `The original is ${clock(seconds)}, so each beat gets a ${seconds > length ? "shorter" : "longer"} share.`;
}

/** Text in most shots: the fit check's warning shows above the button, and the press still works. */
export const textHeavy = (plan: EditPlan) => {
  const shots = plan.beats.reduce((n, b) => n + b.shots.length, 0);
  return shots > 0 && plan.events.filter((e) => e.kind === "text").length * 2 > shots;
};

/** Reading the edit: the post read (a clone's), the transcribe, the edit read, and the breakdown when this device has none. */
export const readPrice = (o: { clone: boolean; seconds: number | null; teardown: boolean }) =>
  sumPrices(o.clone ? priceOf("reel-style") : null, priceOf("video-transcribe", { minutes: (o.seconds ?? 60) / 60 }), priceOf("edit-read"), o.teardown ? null : priceOf("remix-teardown"));
export const readCaps = (o: { clone: boolean; teardown: boolean }): UsageFeature[] =>
  [...(o.clone ? ["reel-style" as const] : []), "video-transcribe", ...(o.teardown ? [] : ["remix-teardown" as const])];

/** The first version: the script, then the voice and the Speak run (a face), the voice (no face), or the take's transcribe later (film). */
export function makePrice(who: string, length: EditLength): Price | "pick" | null {
  if (who === "film") return sumPrices(priceOf("remix-make"), priceOf("video-transcribe", { minutes: length / 60 }));
  if (who === "none") return sumPrices(priceOf("remix-make"), priceOf("ai-voice"));
  return sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: length }), priceOf("ai-voice"));
}
/** The footer's cap (its uses left on the chip) and the others the press spends. */
export const makeCaps = (who: string): { cap: UsageFeature; caps: UsageFeature[] } =>
  who === "film" ? { cap: "remix-make", caps: [] } : who === "none" ? { cap: "ai-voice", caps: ["remix-make"] } : { cap: "ai-video", caps: ["remix-make", "ai-voice"] };

/** Leo's rule: a press that makes a video asks first. */
export function askLine(who: string, price: Price | "pick" | null): string {
  // the chip's own words, so the ask and the chip never disagree
  const usd = price && price !== "pick" ? priceText(price).replace(/^\w/, (c) => c.toLowerCase()) : "a little";
  if (who === "film") return `This writes your script and uses ${usd}. Make it?`;
  return isFace(who) ? `This makes a video and uses ${usd} of video credit. Make it?` : `This makes a video and uses ${usd}. Make it?`;
}

/**
 * The version as a short video in My posts: the script with its caption under it in Clone a reel's shape, inside the
 * plan's set (kind versions, from its source), carrying the source it was remixed from (remix-source-trail).
 */
export function draftOf(plan: Pick<EditPlan, "id" | "source">, v: Version, source: RemixSource | null, now = new Date()): DraftEntry {
  const script = v.lines.join("\n\n");
  return {
    id: newDraftId(),
    createdAt: now.toISOString(),
    hook: v.lines[0] ?? "",
    draft: v.caption ? `${script}\n\n---\n\nCAPTION:\n${v.caption}` : script,
    pillar: "",
    pillarDetail: "",
    audience: "general",
    format: "short-video",
    platform: "instagram",
    ctaType: "",
    status: "draft",
    set: { id: plan.id, kind: "versions", from: plan.source },
    ...(source ? { source: { ...source, remixedAt: now.toISOString() } } : {}),
  };
}

/** You when your face is verified, else I'll film it; an AI presenter is never picked for you. */
export const defaultWho = (face: boolean): SameWho => (face ? "mine" : "film");

/** The voice a pick speaks in: a presenter's own, one that fits their look (presenterVoice, as the agent and a campaign pick it), else the remembered one. */
export function voiceFor(people: Pick<Speakers, "presenters"> | null, who: string, remembered: VoiceId): VoiceId {
  const p = people?.presenters.find((x) => x.id === who);
  return p ? presenterVoice(p, remembered) : remembered;
}

export async function sha1Of(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** An upload source takes only the file it was read from. */
export const sameFile = async (file: Blob, key: string) => key === `upload:${await sha1Of(file)}`;

/** A clone's own reel, when this device has it. */
export const cloneOf = (userId: string, s: Pick<RemixSource, "key">) => loadSavedClones(userId).find((c) => `clone:${c.id}` === s.key) ?? null;

/**
 * What a source can't be read for, before anything is paid: TikTok shares no file, a photo has none, an Instagram video
 * read any other way is cloned first (only a clone's read fetches the file, live-p7a D20), a known length over 90 s.
 */
export function sourceStop(userId: string, s: RemixSource): SameEditJob["stop"] | null {
  if (s.platform === "tiktok") return "tiktok";
  if (s.kind === "upload") return null;
  if (s.kind !== "clone" && s.format === "video" && s.platform === "instagram" && s.url) return "clone-first";
  if (s.kind !== "clone" || s.format === "image") return "no-video";
  const secs = cloneOf(userId, s)?.result.source.durationSec;
  return secs && secs > MAX_SOURCE_SECONDS + 0.5 ? "too-long" : null;
}

// ---------- reading ----------

class Stop extends Error {
  constructor(public why: NonNullable<SameEditJob["stop"]>) {
    super(why);
  }
}
const STOP_LINES: Record<NonNullable<SameEditJob["stop"]>, string> = { tiktok: TIKTOK_LINE, "too-long": TOO_LONG_LINE, "no-words": NO_WORDS_LINE, "no-video": NO_VIDEO_LINE, "clone-first": CLONE_FIRST_LINE };
export const stopLine = (why: NonNullable<SameEditJob["stop"]>) => STOP_LINES[why];

/** Faces over SPEAKER_FACE on each frame; a frame (or a detector) that can't be read counts none. */
async function facesOn(frames: FrameInput[]): Promise<number[]> {
  const count = await import("@/lib/faceVision").then((m) => m.countFaces, () => null);
  const out: number[] = [];
  for (const f of frames) {
    try {
      const img = new Image();
      img.src = f.image;
      await img.decode();
      out.push(count ? await count(img, SPEAKER_FACE) : 0);
    } catch {
      out.push(0);
    }
  }
  return out;
}

/** The edit read takes 2 frames at least: a reel with no cut gets a second one from its middle. */
async function twoFrames(blob: Blob, frames: FrameInput[], duration: number): Promise<FrameInput[]> {
  if (frames.length >= 2) return frames;
  const v = await loadVideo(blob);
  try {
    const t = Math.round(Math.min(duration - 0.2, Math.max((frames[0]?.t ?? 0) + 0.5, duration / 2)) * 10) / 10;
    await seek(v, t);
    const c = document.createElement("canvas");
    c.width = 432;
    c.height = Math.round((432 * v.videoHeight) / Math.max(1, v.videoWidth));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return [...frames, { t, image: c.toDataURL("image/jpeg", 0.72) }];
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

/** "Read the edit": every read step, the plan saved at the end. `file` is the upload's own video. */
export async function startRead(userId: string, source: RemixSource, file?: Blob, params: Record<string, string | undefined> = {}): Promise<void> {
  if (sameEditBusy()) return;
  const id = ++seq;
  const step = (at: number) => mine(id, { at, step: READ_STEPS[at] });
  set({ id, kind: "read", state: "reading", step: READ_STEPS[0], at: 0, params, source: source.key });
  try {
    const early = sourceStop(userId, source);
    if (early) throw new Stop(early);
    let blob: Blob;
    if (source.kind === "upload") {
      if (!file) throw new Error("Pick the video you read first.");
      if (!(await sameFile(file, source.key))) throw new Error(NOT_SAME_FILE);
      blob = file;
    } else {
      const data = (await invokeFunction("clone-reel", { url: source.url, style: true })) as { source?: { videoUrl?: string | null; durationSec?: number | null } } | null;
      if ((data?.source?.durationSec ?? 0) > MAX_SOURCE_SECONDS + 0.5) throw new Stop("too-long");
      if (!data?.source?.videoUrl) throw new Stop("no-video");
      blob = await fetchReelVideo(data.source.videoUrl).catch((e) => {
        throw e instanceof RangeError ? new Stop("too-long") : new Error("Couldn't download the reel. Try again in a minute.");
      });
    }
    if (blob.size > MAX_SOURCE_BYTES) throw new Stop("too-long");
    const v = await loadVideo(blob);
    const [w, h, length] = [v.videoWidth, v.videoHeight, v.duration];
    URL.revokeObjectURL(v.src);
    if (length > MAX_SOURCE_SECONDS + 0.5) throw new Stop("too-long");

    step(1);
    const measured = await measureReel(blob, () => {}, { perCut: true });
    const m = { ...measured, frames: await twoFrames(blob, measured.frames, measured.duration) };
    step(2);
    const sound = await monoPcm(blob, 16000).catch(() => null);
    if (!sound) throw new Stop("no-words");
    const heardWords = (await transcribe(encodeWav(sound.pcm, 16000))).words.filter((x) => x.w.trim());
    if (!heardWords.length) throw new Stop("no-words");

    step(3);
    const faces = await facesOn(m.frames);
    const teardown = await ensureTeardown(userId, source, fullText(source, userId) || heardWords.map((x) => x.w).join(" "));
    const sentences = sentencesOf(heardWords).map((s) => s.text).slice(0, 60);
    const reply = await callFn<{ read: EditRead; look: ReelLook | null; picks: EditPicks }>(
      "reel-visuals",
      { mode: "edit", frames: m.frames, pacing: m.pacing, shots: shotsFor(m.frames, m.cuts, faces, heardWords, m.duration), sentences, beats: teardownBeats(teardown), cta: teardown.cta || "None" },
      READ_FAILED,
    );
    if (!reply?.read?.frames) throw new Error(READ_FAILED);
    const plan = planFromRead({
      source: source.key,
      seconds: m.duration,
      aspect: aspectOf(w, h),
      cuts: m.cuts,
      cutKinds: m.cutKinds,
      zooms: m.zooms,
      faces,
      words: heardWords,
      sound: soundOf(sound.pcm, 16000, heardWords, m.cuts),
      teardown: { beats: teardownBeats(teardown), cta: teardown.cta || "None" },
      reply,
    });
    const full = savePlan(userId, plan);
    if (full) throw new Error(full);
    heard.set(plan.id, { overlays: reply.read.frames.flatMap((f) => f.texts.map((x) => x.text)) });
    const old = videos.get(source.key);
    if (old) URL.revokeObjectURL(old);
    videos.set(source.key, URL.createObjectURL(blob));
    mine(id, { state: "read", step: "", planId: plan.id });
  } catch (e) {
    if (e instanceof Stop) return mine(id, { state: "stopped", step: "", stop: e.why });
    // the server's own words (failure), or a line this file or measureReel wrote for showing
    const shown = e instanceof Error && !(e instanceof EdgeError) && (e.constructor === Error || e instanceof ReelCloneError) && e.message;
    mine(id, { state: "failed", step: "", ...failure(e, READ_FAILED), ...(shown ? { error: shown } : {}) });
  }
}

// ---------- making ----------

/** Each cutaway's stock clip, kept on this device the way Add B-roll for me keeps one; a cutaway with none is left out. */
/** The plan's cutaways found by the version's searches, kept on this device as Add B-roll for me keeps them. */
export async function findCutaways(plan: EditPlan, v: Version, onStep: (done: number, of: number) => void = () => undefined): Promise<{ clips: Record<number, CutawayClip>; missed: number }> {
  const want = plan.events.flatMap((e, k) => (e.kind === "cutaway" ? [{ k, search: v.searches.find((s) => s.k === k)?.search ?? "" }] : []));
  const clips: Record<number, CutawayClip> = {};
  const used = new Set<string>();
  let missed = 0;
  const orientation = plan.read.aspect === "16:9" ? "landscape" : plan.read.aspect === "1:1" ? "square" : "portrait";
  for (let i = 0; i < want.length; i++) {
    onStep(i, want.length);
    const { k, search } = want[i];
    const items = search ? await searchStock("video", search, 1, orientation).then((r) => r.items, () => []) : [];
    const it = items.find((x) => !used.has(x.id));
    const blob = it ? await downloadStock(it.src).catch(() => null) : null;
    if (!it || !blob) {
      missed++;
      continue;
    }
    const probe = await loadVideo(blob).catch(() => null);
    const length = probe && Number.isFinite(probe.duration) ? probe.duration : it.duration ?? 4;
    if (probe) URL.revokeObjectURL(probe.src);
    const key = `br-${it.id}-${Date.now().toString(36)}`;
    if (!(await putFile(key, blob).then(() => true, () => false))) {
      missed++;
      continue;
    }
    used.add(stockIdOf(key) ?? it.id);
    clips[k] = { key, length: Math.max(0.5, length), thumb: it.thumb, by: it.by, byUrl: it.byUrl, url: it.url };
  }
  onStep(want.length, want.length);
  return { clips, missed };
}

/** The toast's line under it: what was left out and what to add by hand, the source and the writer's flags. */
function noteFor(plan: EditPlan, source: RemixSource | null, flags: Flags | undefined, missed: number): string | undefined {
  return [
    noteOf(source, flags),
    missed ? `${missed} ${missed === 1 ? "cutaway" : "cutaways"} had no stock clip. Add ${missed === 1 ? "it" : "them"} in B-roll.` : "",
    plan.read.music?.bed ? MUSIC_LINE : "",
  ].filter(Boolean).join(" ") || undefined;
}

/** "Make my version": every step in order, stopping before Speak is paid for when the real price is higher than the chip's. */
export async function startMake(userId: string, a: MakeAsk, params: Record<string, string | undefined> = {}): Promise<void> {
  if (sameEditBusy() || (isFace(a.who) && aiBusy())) return;
  const id = ++seq;
  const fail = (patch: Partial<SameEditJob>) => mine(id, { state: "failed", step: "", ...patch });
  set({ id, kind: "make", state: "writing", step: WRITING, params, ask: a, planId: a.planId, source: a.source?.key });
  kept = null;
  const entry = loadPlans(userId).find((e) => e.plan.id === a.planId);
  if (!entry) return fail({ error: PLAN_GONE });
  const plan = entry.plan;
  // the face is read before anything is paid, so a face turned off or a presenter deleted stops here
  let face: Blob | string | null = null;
  const sp = isFace(a.who) ? speakerOf(speakers(userId), a.who) : null;
  if (isFace(a.who)) {
    face = sp ? await speakerFace(sp).catch(() => null) : null;
    if (!face) return fail({ error: a.who === "mine" ? NO_FACE : PRESENTER_GONE });
  }
  if (a.who === "none" && !plan.events.some((e) => e.kind === "cutaway")) return fail({ error: NO_CUTAWAYS });

  let version: Version;
  let flags: Flags | undefined;
  try {
    const overlays = heard.get(plan.id)?.overlays ?? [];
    const edit = Object.assign(editBrief(plan, a.length, a.voice), overlays.length ? { overlays } : {});
    const body = { ...makeBody(userId, { source: a.source, topic: "", note: "", mention: a.mention, size: "9x16" }, "speaking"), as: "edit" as const, close: a.close, edit };
    const res = await requestMake(body);
    const r = res?.result as unknown as EditResult | undefined;
    if (r?.as !== "edit" || !Array.isArray(r.lines)) throw new Error(WRITE_FAILED);
    version = versionOf(r, a);
    flags = res.flags;
  } catch (e) {
    return fail(failure(e, WRITE_FAILED));
  }
  // saved before anything else is paid for: a reload keeps the script, in the plan and in My posts
  const draft = draftOf(plan, version, a.source);
  upsertDraft(userId, draft);
  version = { ...version, draft: draft.id };
  const full = addVersion(userId, plan.id, version);
  if (full) return fail({ error: full });
  mine(id, { versionId: version.id, script: version.lines.join("\n"), flags });
  if (a.who === "film") return mine(id, { state: "filmed", step: "" });

  mine(id, { state: "voice", step: VOICE });
  let mp3: Blob;
  let words: Word[];
  try {
    const r = await callFn<{ audio?: string; words?: Word[] } | Blob>("text-voice", { text: spoken(version), voice: a.voice, timestamps: true }, VOICE_FAILED);
    if (r instanceof Blob) {
      // shortcut: a voice with no word times (text-voice answered plain MP3) lays every event by its share of the beat
      mp3 = r;
      words = [];
    } else {
      const bytes = Uint8Array.from(atob(r?.audio ?? ""), (c) => c.charCodeAt(0));
      mp3 = new Blob([bytes], { type: "audio/mpeg" });
      words = Array.isArray(r?.words) ? r.words : [];
    }
    if (mp3.size < 1000) throw new Error("The voiceover came back empty. Try again.");
  } catch (e) {
    return fail({ error: (e as Error).message || VOICE_FAILED });
  }

  if (isFace(a.who)) {
    let voice: Voiceover;
    try {
      voice = await sliceVoiceover(mp3);
    } catch {
      return fail({ error: VOICE_FAILED });
    }
    if (voice.seconds > MAX_AVATAR_SECONDS + 0.5) return fail({ error: tooLongLine(voice.seconds) });
    const real = videoPrice(voice.slices.map((s) => s.end - s.start));
    kept = { id, face: face!, voice, mp3, words, version, plan, ask: a };
    if (needsPriceCheck(videoEstimate(a.length).usd, real.usd)) return mine(id, { state: "priced", step: "", real: { seconds: voice.seconds, price: real } });
    return finishFace(userId, id);
  }
  await finishNoFace(userId, id, { plan, version, mp3, words, ask: a, flags });
}

/** "Make it for US$x" at the price check: the kept voiceover and face go on to the cutaways and Speak. */
export function goOnAtPrice(userId: string): Promise<void> {
  if (job?.state !== "priced" || kept?.id !== job.id || aiBusy()) return Promise.resolve();
  return finishFace(userId, job.id);
}

async function laid(userId: string, id: number, plan: EditPlan, version: Version, words: Word[], seconds: number) {
  mine(id, { state: "cutaways", step: "Finding the cutaways..." });
  const { clips, missed } = await findCutaways(plan, version, (d, n) => mine(id, { step: `Finding the cutaways, ${Math.min(n, d + 1)} of ${n}...` }));
  const facts = brandPack(userId, { platform: "tiktok", mention: true, offer: null }).facts;
  return { settings: compilePlan(plan, version, words, seconds, { clips, facts, color: loadBrand(userId)?.color }), missed };
}

/** The editor's hand-off: the toast and note, the caption, what is said and when, the settings, the AI mark, the post and the plan. */
function handOff(plan: EditPlan, version: Version, a: MakeAsk, flags: Flags | undefined, s: { settings: JoinExtra["settings"]; missed: number }, words: Word[], ai: JoinExtra["ai"]): JoinExtra {
  const note = noteFor(plan, a.source, flags, s.missed);
  return {
    toast: SAME_EDIT_TOAST,
    ...(note ? { note } : {}),
    ...(version.caption ? { caption: version.caption } : {}),
    said: spoken(version),
    ...(words.length ? { words } : {}),
    settings: s.settings,
    ...(a.source ? { source: { ...a.source, remixedAt: new Date().toISOString() } } : {}),
    ...(ai ? { ai } : {}),
    ...(version.draft ? { draftId: version.draft } : {}),
    plan: { id: plan.id, version: version.id },
  };
}

async function finishFace(userId: string, id: number): Promise<void> {
  const k = kept;
  if (!k || k.id !== id) return;
  const { plan, version, voice, words, ask: a } = k;
  const s = await laid(userId, id, plan, version, words, voice.seconds);
  const sp = speakerOf(speakers(userId), a.who);
  const extra = handOff(plan, version, a, job?.flags, s, words, aiMark("avatar", sp ?? "generated", a.voice));
  kept = null;
  mine(id, { state: "video", step: "Sending your voiceover and photo...", real: undefined });
  await follow(id, () => void makeAvatar(version.lines[0]?.slice(0, 40) || "Same edit", k.face, voice, extra));
}

async function finishNoFace(userId: string, id: number, k: { plan: EditPlan; version: Version; mp3: Blob; words: Word[]; ask: MakeAsk; flags?: Flags }): Promise<void> {
  const seconds = await audioSeconds(k.mp3).catch(() => k.words.at(-1)?.e ?? k.ask.length);
  const s = await laid(userId, id, k.plan, k.version, k.words, seconds);
  const scenes = cutawayScenes(s.settings.broll ?? [], seconds);
  if (!scenes.length) return mine(id, { state: "failed", step: "", error: NO_STOCK });
  // the cutaways are the footage here, so they aren't laid over it a second time
  const settings = { ...s.settings, broll: undefined, brollLayout: undefined };
  const extra = handOff(k.plan, k.version, k.ask, k.flags, { settings, missed: s.missed }, k.words, aiMark("voiceover", null, k.ask.voice));
  mine(id, { state: "joining", step: PUTTING });
  try {
    const files = await Promise.all(scenes.map((x) => getFile(x.key)));
    if (files.some((f) => !f)) throw new Error(NO_STOCK);
    // waits only while another video is being put together; a finished one waiting for the editor moves aside (videoMedia)
    while (currentJoin()?.state === "running") await new Promise((r) => setTimeout(r, 1000));
    await startSlides(k.version.lines[0]?.slice(0, 40) || "Same edit", scenes.map((x, i) => ({ video: files[i]!, seconds: x.seconds })), k.mp3, "Putting your version together", { extra });
    if (currentJoin()?.state === "failed") throw new Error(currentJoin()?.error || "Couldn't put the video together. Try again.");
    mine(id, { state: "done", step: "" });
  } catch (e) {
    mine(id, { state: "failed", step: "", error: (e as Error).message || START_FAILED });
  }
}

/** Mirrors the avatar job's steps until it ends; the run is done once the editor has the video to open. */
function follow(id: number, start: () => void): Promise<void> {
  return new Promise((resolve) => {
    const off = onAiJob((j) => {
      if (j?.kind !== "avatar") return;
      if (j.state === "working") return void mine(id, { state: j.step === JOINING ? "joining" : "video", step: j.step });
      off();
      if (j.state === "done") mine(id, { state: "done", step: "" });
      else mine(id, { state: "failed", step: "", error: j.error || START_FAILED, waiting: ownsPending() });
      resolve();
    });
    start();
    // the avatar job starts at once or not at all (another AI video took the slot first)
    const j = aiJob();
    if (j?.kind !== "avatar" || j.state !== "working") {
      off();
      mine(id, { state: "failed", step: "", error: START_FAILED, waiting: ownsPending() });
      resolve();
    }
  });
}

/** A version paid for but never put together (a reload, a dropped download): picked up at no cost. True when it started. */
export function resumeSameEdit(params: Record<string, string | undefined> = {}): boolean {
  if (sameEditBusy() || aiBusy() || !ownsPending()) return false;
  const id = ++seq;
  set({ id, kind: "make", state: "video", step: "", params: job?.params ?? params, ...(job?.ask ? { ask: job.ask } : {}) });
  void follow(id, resumeAvatar);
  return true;
}

/** Test hook: forgets the run and what this tab heard. */
export function resetSameEdit(): void {
  job = null;
  kept = null;
  heard.clear();
  videos.clear();
  listeners.clear();
}

