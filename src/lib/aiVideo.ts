// Videos made without filming, on Edit a video (the ai-video edge function, Higgsfield):
//   avatar: a photo of you, or an AI presenter, speaking your script; Speak animates each slice of the voiceover
//   explainer: a topic becomes scenes, one AI picture each, over one voiceover
//   template: a look from the gallery (supabase/functions/ai-video/templates.ts) with the adviser's blanks
//     and optional photos becomes one Seedance clip
// The jobs live outside React, so they carry on while the adviser uses other pages. When the clips or
// pictures are in, they are put together on this device (videoMedia's join job) and Edit a video opens
// the result like an upload, with captions. An avatar video's or a template clip's job tokens stay on this
// device until it is put together, so a reload, a dropped download or a failed join picks up the paid clips again at no cost.
// A narrated video (Leo's explainer with opts: stock clips, a look, moving scenes) is kept the same way, under its own key
// with its voiceover as a device file; today's explainer (no opts) runs exactly as before and is not kept.
// An avatar video of your face or a saved presenter (people-dub-lipsync, Leo's) also keeps each Speak part on this device,
// so a changed line is made again on its own parts (remakeParts) and the same face can speak another language (makeInLanguage).

import { callFn } from "@/lib/edgeFn";
import { planSlices, sceneSeconds } from "@/lib/videoEdit";
import { currentJoin, deleteFile, endJoin, getFile, monoPcm, putFile, startJoin, startSlides, encodeWav, type JoinExtra } from "@/lib/videoMedia";
import { DUB_LANGS, audioSeconds, speak, speakDub, type DubLang, type VoiceId } from "@/lib/textVoice";
import { textsFromSpans } from "@/lib/avatarScript";
import type { AiPart } from "@/lib/videoEdit";
import { MAX_AVATAR_SECONDS, MAX_SLICE, type ClipQuality, type ClipSeconds, type MediaState, type Scene } from "../../supabase/functions/ai-video/logic.ts";
import type { FieldKey, PhotoRole } from "../../supabase/functions/ai-video/templates.ts";

export {
  CLIP_QUALITIES, CLIP_SECONDS, MAX_AVATAR_SECONDS, MAX_FIELD, MAX_LOOK, MAX_TOPIC, MIN_SCENES, avatarCredits, clipCredits, creditsUsd,
  explainerCredits, sceneReady, type ClipQuality, type ClipSeconds, type Scene,
} from "../../supabase/functions/ai-video/logic.ts";
export { TEMPLATES, TEMPLATE_CREDIT, TEMPLATE_SOURCE, examplesUrl, type VideoTemplate, type PhotoRole, type FieldKey } from "../../supabase/functions/ai-video/templates.ts";

export interface AiJob {
  kind: "presenter" | "avatar" | "explainer" | "template";
  state: "working" | "done" | "failed";
  step: string;
  error?: string;
  /** The presenter picture's link, once made. */
  url?: string;
}

/** Each one a different Singaporean, so no two presenters share a face (Leo's rule). */
export const LOOKS = [
  "A Chinese Singaporean woman in her early 30s, shoulder-length black hair, light make-up, navy blazer over a white blouse",
  "A Malay Singaporean man in his late 30s, short neat hair, trimmed beard, light blue shirt with the top button open",
  "An Indian Singaporean woman in her 40s, long dark hair tied back, small gold earrings, maroon blouse",
  "A Eurasian Singaporean man in his late 20s, wavy brown hair, clean-shaven, grey blazer over a white T-shirt",
  "A Chinese Singaporean man in his 50s, short greying hair, rimless glasses, dark green polo shirt",
  "A Malay Singaporean woman in her 30s, light grey hijab, cream blouse, warm smile",
];

const RATE = 24000; // the WAV Speak lip-syncs to, and the sound the finished clips carry
const POLL_MS = 5000;
const GIVE_UP_MS = 20 * 60_000;
const PENDING = "cs-ai-video-pending"; // this device only, on purpose: the tokens are no use elsewhere
const RETRY = "Couldn't start the video right now. Try again in a minute.";
export const DEMO_GONE = "Your demo isn't on this device any more. Pick it again.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let job: AiJob | null = null;
const listeners = new Set<(j: AiJob | null) => void>();
const set = (j: AiJob) => {
  job = j;
  listeners.forEach((l) => l({ ...j }));
};
export const aiJob = () => job;
export function onAiJob(fn: (j: AiJob | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const aiBusy = () => job?.state === "working";

class JobFailed extends Error {}

/** Polls until every job is done; the links in order. With the start's refund ticket, a failed job gives the use back. */
async function waitFor(tokens: string[], progress: (done: number) => void, refund?: string): Promise<string[]> {
  // the most parts seen done: one status check can answer behind the last, and the count never steps back
  let most = 0;
  for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
    await sleep(POLL_MS);
    // a dropped status check is retried on the next round, not a failure
    const r = await callFn<{ jobs: MediaState[] }>("ai-video", { mode: "status", tokens, refund }).catch(() => null);
    if (!r) continue;
    const bad = r.jobs.find((j) => j.state === "failed");
    if (bad?.state === "failed") throw new JobFailed(bad.error);
    const urls = r.jobs.flatMap((j) => (j.state === "done" ? [j.url] : []));
    if (urls.length === tokens.length) return urls;
    progress((most = Math.max(most, urls.length)));
  }
  // not a JobFailed: Higgsfield hasn't failed it, so the paid job is kept for Try again at no cost
  throw new Error("It's taking too long. Try again later.");
}

/**
 * Polls moving clips until each is done or failed, with no refund ticket (a failed move keeps the video's use): the
 * links in order, null for a clip that failed or was still not done after 20 minutes, whose scene stays a still.
 */
async function settle(tokens: string[], progress: (done: number) => void): Promise<(string | null)[]> {
  let last: MediaState[] = [];
  let most = 0;
  for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
    await sleep(POLL_MS);
    const r = await callFn<{ jobs: MediaState[] }>("ai-video", { mode: "status", tokens }).catch(() => null);
    if (!r) continue;
    last = r.jobs;
    if (last.every((j) => j.state !== "working")) break;
    progress((most = Math.max(most, last.filter((j) => j.state === "done").length)));
  }
  return tokens.map((_, i) => {
    const j = last[i];
    return j?.state === "done" ? j.url : null;
  });
}

async function download(url: string): Promise<Blob> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) throw new Error("It was made but didn't download. Try again.");
  return res.blob();
}

/** Waits for the device to finish putting the last video together, and for the editor to take it. */
async function joinSlot() {
  while (currentJoin()) await sleep(1000);
}

const b64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(blob);
  });

/** A photo as a JPEG at most 1280 px on its long side, the size Speak works from. `vertical` cuts it to 9:16 around
 * its middle first: a template clip that starts on a person's photo takes that photo's shape. */
async function toJpeg(photo: Blob, vertical = false): Promise<Blob> {
  const bmp = await createImageBitmap(photo).catch(() => {
    throw new Error("Couldn't open that photo. Try a JPG or PNG.");
  });
  const sw = vertical ? Math.min(bmp.width, (bmp.height * 9) / 16) : bmp.width;
  const sh = vertical ? Math.min(bmp.height, (bmp.width * 16) / 9) : bmp.height;
  const k = Math.min(1, 1280 / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * k);
  c.height = Math.round(sh * k);
  c.getContext("2d")!.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.9));
}

const fail = (kind: AiJob["kind"], e: unknown) =>
  set({ kind, state: "failed", step: "", error: (e as Error).message || "That didn't go through. Try again." });

// ---------- AI presenter ----------

/** `setting` is one of ai-video's presenter settings (logic.ts SETTINGS); none is today's office. */
export async function makePresenter(look: string, setting?: string): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "presenter", state: "working", step: "Making your presenter..." });
  try {
    const { token } = await callFn<{ token: string }>("ai-video", { mode: "presenter", look, ...(setting ? { setting } : {}) }, "Couldn't make the presenter. Try again in a minute.");
    const [url] = await waitFor([token], () => {});
    set({ kind: "presenter", state: "done", step: "", url });
  } catch (e) {
    fail("presenter", e);
  }
}

// ---------- avatar video ----------

export interface Voiceover {
  pcm: Float32Array;
  seconds: number;
  /** `text`: what the slice says, when the maker knows it (a translated video). */
  slices: { start: number; end: number; text?: string }[];
}

/** The voiceover cut into Speak slices at its quiet moments. */
export async function sliceVoiceover(mp3: Blob): Promise<Voiceover> {
  const { pcm, duration } = await monoPcm(mp3, RATE);
  const n = Math.round(0.02 * RATE);
  const energy = new Float32Array(Math.ceil(pcm.length / n));
  for (let f = 0; f < energy.length; f++) {
    let e = 0;
    for (let i = f * n; i < Math.min(pcm.length, (f + 1) * n); i++) e += pcm[i] * pcm[i];
    energy[f] = e;
  }
  return { pcm, seconds: duration, slices: planSlices(energy, 0.02, duration, MAX_SLICE) };
}

export interface Pending {
  name: string;
  tokens: string[];
  seconds: number[];
  /** A template clip; an avatar video when missing. */
  kind?: "template";
  /** Gives the day's use back if Higgsfield fails a job (missing on jobs started before it existed). */
  refund?: string;
  /** Handed to the editor with the joined video (a format's toast, caption, source, draft, tab). */
  extra?: JoinExtra;
  /** Device file takes (putFile keys) joined after the clip, each from `start` (0 when missing) to `end`: a demo after a spoken hook. */
  after?: { key: string; start?: number; end: number }[];
}
export function pendingAvatar(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) ?? "null");
    return p && Array.isArray(p.tokens) && Array.isArray(p.seconds) && typeof p.name === "string" ? p : null;
  } catch {
    return null;
  }
}
const keepPending = (p: Pending | null) => {
  try {
    if (p) localStorage.setItem(PENDING, JSON.stringify(p));
    else localStorage.removeItem(PENDING);
  } catch {
    /* storage blocked: the job still runs, it just can't be picked up after a reload */
  }
};

/** Your face or a saved presenter: the video keeps each Speak part, so a line can be made again on that face (people-dub-lipsync). */
const keepsParts = (e?: JoinExtra) => e?.ai?.person === "mine" || e?.ai?.person === "presenter";

/** The mark with each part's words, place in the joined video and device key, "ai-slice-<job>-<i>-0". */
function withParts(extra: JoinExtra, seconds: number[], texts: string[]): JoinExtra {
  const job = Date.now().toString(36);
  let at = 0;
  const slices = seconds.map((s, i) => ({ text: texts[i] ?? "", start: Math.round(at * 1000) / 1000, end: Math.round((at += s) * 1000) / 1000, clip: `ai-slice-${job}-${i}-0` }));
  return { ...extra, ai: { ...extra.ai!, slices } };
}

/** Each part saved under its key before the join; a part that can't be kept leaves a video with no parts to fix. */
async function keepParts(p: Pending, clips: Blob[]): Promise<JoinExtra | undefined> {
  const parts = p.kind ? undefined : p.extra?.ai?.slices;
  if (!parts?.length) return p.extra;
  const kept = parts.length === clips.length && (await Promise.all(parts.map((s, i) => putFile(s.clip, clips[i]))).then(() => true, () => false));
  return kept ? p.extra : { ...p.extra, ai: { ...p.extra!.ai!, slices: undefined } };
}

async function finishAvatar(p: Pending): Promise<void> {
  const n = p.tokens.length;
  const kind = p.kind ?? "avatar";
  set({ kind, state: "working", step: `Making your video, 0 of ${n} ${n === 1 ? "part" : "parts"} ready. This takes a few minutes.` });
  try {
    const urls = await waitFor(p.tokens, (d) =>
      set({ kind, state: "working", step: `Making your video, ${d} of ${n} ${n === 1 ? "part" : "parts"} ready. This takes a few minutes.` }), p.refund);
    set({ kind, state: "working", step: "Downloading your video..." });
    const clips = await Promise.all(urls.map(download));
    const extra = await keepParts(p, clips);
    // a take that left this device keeps the paid clip pending: putting the file back under its key and trying again joins it
    // a start that isn't a place before the end (junk read back from JSON) plays the take from 0, as before starts existed
    const from = (a: { start?: number; end: number }) => (typeof a.start === "number" && a.start > 0 && a.start < a.end ? a.start : 0);
    const after = await Promise.all((Array.isArray(p.after) ? p.after : []).map(async (a) => ({ file: await getFile(a.key).catch(() => undefined), start: from(a), end: a.end })));
    if (after.some((a) => !a.file)) throw new Error(DEMO_GONE);
    await joinSlot();
    // the job stays working (so a remount can't start a second join) and paid for until the join is done
    set({ kind, state: "working", step: "Putting your video together..." });
    const takes = [...clips.map((file, i) => ({ file, start: 0, end: p.seconds[i] })), ...after.map((a) => ({ ...a, file: a.file! }))];
    await startJoin(p.name, takes, "Putting your video together", { extra });
    const joined = currentJoin();
    if (joined?.state === "failed") throw new Error(joined.error || "Couldn't put the video together. Try again.");
    keepPending(null);
    set({ kind, state: "done", step: "" });
  } catch (e) {
    // a job Higgsfield failed is gone; a dropped download can be picked up again
    if (e instanceof JobFailed) keepPending(null);
    fail(kind, e);
  }
}

/** Speak's slices of a voiceover, as WAVs at the rate it lip-syncs to. */
const wavSlices = (voice: Voiceover) =>
  Promise.all(voice.slices.map(async (s) => ({
    wav: await b64(encodeWav(voice.pcm.subarray(Math.round(s.start * RATE), Math.round(s.end * RATE)), RATE)),
    seconds: Math.round((s.end - s.start) * 1000) / 1000,
  })));
const faceBody = async (photo: Blob | string) => (typeof photo === "string" ? { url: photo } : { jpeg: await b64(await toJpeg(photo)) });

export async function makeAvatar(name: string, photo: Blob | string, voice: Voiceover, extra?: JoinExtra): Promise<void> {
  if (aiBusy()) return;
  await startAvatar(name, photo, voice, extra);
}

async function startAvatar(name: string, photo: Blob | string, voice: Voiceover, extra?: JoinExtra): Promise<void> {
  set({ kind: "avatar", state: "working", step: "Sending your voiceover and photo..." });
  let p: Pending;
  try {
    const slices = await wavSlices(voice);
    const { tokens, refund } = await callFn<{ tokens: string[]; refund?: string }>("ai-video", { mode: "avatar", photo: await faceBody(photo), slices }, RETRY);
    const seconds = slices.map((s) => s.seconds);
    p = { name, tokens, seconds, refund, extra: keepsParts(extra) ? withParts(extra!, seconds, voice.slices.map((s) => s.text ?? "")) : extra };
    keepPending(p);
  } catch (e) {
    return fail("avatar", e);
  }
  await finishAvatar(p);
}

export interface TemplateAsk {
  template: string;
  seconds: ClipSeconds;
  quality: ClipQuality;
  fields: Partial<Record<FieldKey, string>>;
  /** One at most: a person is the clip's first frame, a product its reference. */
  photo: { role: PhotoRole; file: Blob } | null;
}

/** One template clip: the server writes the shots and Seedance makes it; it opens in the editor like an avatar video. */
export async function makeTemplateClip(name: string, ask: TemplateAsk, more?: { extra?: JoinExtra; after?: Pending["after"] }): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "template", state: "working", step: "Writing the shots..." });
  let p: Pending;
  try {
    const ph = ask.photo;
    const photos = ph ? [{ role: ph.role, jpeg: await b64(await toJpeg(ph.file, ph.role === "person")) }] : [];
    const { tokens, refund } = await callFn<{ tokens: string[]; refund?: string }>("ai-video", { mode: "template", template: ask.template, seconds: ask.seconds, quality: ask.quality, fields: ask.fields, photos }, RETRY);
    p = { name, tokens, seconds: [ask.seconds], kind: "template", refund, extra: more?.extra, after: more?.after };
    keepPending(p);
  } catch (e) {
    return fail("template", e);
  }
  await finishAvatar(p);
}

/** Picks up an avatar video or template clip that was paid for but never put together (a reload, a dropped download). */
export function resumeAvatar(): void {
  const p = pendingAvatar();
  if (p && !aiBusy()) void finishAvatar(p);
}

// ---------- the same face in another language (people-dub-lipsync part B) ----------

/**
 * The reviewed lines spoken in `lang` in one call with when each is said, cut into Speak parts like any voiceover, each
 * part's words from those times, then made on the same face as a new avatar video that opens as its own project.
 */
export async function makeInLanguage(name: string, photo: Blob | string, lines: string[], voice: VoiceId, lang: DubLang, extra: JoinExtra): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "avatar", state: "working", step: `Making the ${DUB_LANGS[lang]} voice...` });
  let vo: Voiceover;
  try {
    const { audio, spans } = await speakDub(lines, voice, lang);
    const cut = await sliceVoiceover(audio);
    if (cut.seconds > MAX_AVATAR_SECONDS + 0.5) throw new Error(`It runs ${Math.round(cut.seconds)} seconds in ${DUB_LANGS[lang]}. Shorten a line to keep it under ${MAX_AVATAR_SECONDS}.`);
    const texts = textsFromSpans(spans, lines, cut.slices, lang);
    vo = { ...cut, slices: cut.slices.map((s, i) => ({ ...s, text: texts[i] })) };
  } catch (e) {
    return fail("avatar", e);
  }
  await startAvatar(name, photo, vo, extra);
}

// ---------- fixing a line: only the changed parts made again (people-dub-lipsync part A) ----------

export interface RemakeJob {
  projectId: string;
  state: "working" | "ready" | "failed";
  step: string;
  error?: string;
}

/** A fix paid for, kept on this device until the editor lays it in (a reload or leaving the page picks it up at no cost). */
export interface Remake {
  projectId: string;
  /** The video file the fix was made on: a fix is never laid on a video swapped since. */
  base: string;
  /** The video's parts when the fix began, with their words. */
  parts: AiPart[];
  /** The changed parts in order: which, the new words and the new voice's length. */
  changes: { i: number; text: string; seconds: number }[];
  tokens: string[];
  refund?: string;
  /** Once put together: the new video's device key and size, and each new part's clip key. */
  done?: { fileId: string; size: number; clips: string[] };
}
const REMAKE = "cs-ai-video-remake";
export const REMAKE_FAILED = "Couldn't remake that part. Try again.";
const GONE = "The parts are on the device you made it on.";

let remake: RemakeJob | null = null;
const remakeListeners = new Set<(j: RemakeJob | null) => void>();
const setRemake = (j: RemakeJob | null) => {
  remake = j;
  remakeListeners.forEach((l) => l(j && { ...j }));
};
export const remakeJob = () => remake;
export function onRemake(fn: (j: RemakeJob | null) => void): () => void {
  remakeListeners.add(fn);
  return () => remakeListeners.delete(fn);
}
export const remakeBusy = () => remake?.state === "working";

export function pendingRemake(): Remake | null {
  try {
    const r = JSON.parse(localStorage.getItem(REMAKE) ?? "null");
    return r && typeof r.projectId === "string" && typeof r.base === "string" && Array.isArray(r.parts) && Array.isArray(r.changes) && Array.isArray(r.tokens) ? r : null;
  } catch {
    return null;
  }
}
const keepRemake = (r: Remake | null) => {
  try {
    if (r) localStorage.setItem(REMAKE, JSON.stringify(r));
    else localStorage.removeItem(REMAKE);
  } catch {
    /* storage blocked: the fix still runs, it just can't be picked up after a reload */
  }
};

/** A part's next version key: ai-slice-<job>-<i>-<v + 1>. */
const nextClip = (clip: string) => clip.replace(/-(\d+)$/, (_, v) => `-${Number(v) + 1}`);

/**
 * Sends only the changed parts to Speak on the same face (one ai-video use), then puts the video together again on this
 * device from the new parts and the kept ones. The result waits as "ready" until the open editor lays it in (takeRemake).
 * `parts` are the video's parts with their words; each change's voice is one part (the card refuses a longer line).
 */
export async function remakeParts(project: { id: string; fileId?: string }, parts: AiPart[], photo: Blob | string, changes: { i: number; text: string; voice: Voiceover }[]): Promise<void> {
  if (remakeBusy() || !changes.length) return;
  const k = changes.length;
  setRemake({ projectId: project.id, state: "working", step: `Remaking part 1 of ${k}...` });
  let r: Remake;
  try {
    const slices = await Promise.all(changes.map(async (c) => (await wavSlices({ ...c.voice, slices: [{ start: 0, end: c.voice.seconds }] }))[0]));
    const { tokens, refund } = await callFn<{ tokens: string[]; refund?: string }>("ai-video", { mode: "avatar", photo: await faceBody(photo), slices }, RETRY);
    r = { projectId: project.id, base: project.fileId ?? project.id, parts, changes: changes.map((c, j) => ({ i: c.i, text: c.text, seconds: slices[j].seconds })), tokens, ...(refund ? { refund } : {}) };
    keepRemake(r);
  } catch (e) {
    return setRemake({ projectId: project.id, state: "failed", step: "", error: (e as Error).message || REMAKE_FAILED });
  }
  await finishRemake(r);
}

async function finishRemake(r: Remake): Promise<void> {
  const k = r.changes.length;
  const step = (s: string) => setRemake({ projectId: r.projectId, state: "working", step: s });
  try {
    if (!r.done) {
      step(`Remaking part 1 of ${k}...`);
      const urls = await waitFor(r.tokens, (d) => step(`Remaking part ${Math.min(d + 1, k)} of ${k}...`), r.refund);
      step("Downloading the new parts...");
      const fresh = await Promise.all(urls.map(download));
      const clips = r.changes.map((c) => nextClip(r.parts[c.i].clip));
      await Promise.all(clips.map((key, j) => putFile(key, fresh[j])));
      const takes = await Promise.all(r.parts.map(async (s, i) => {
        const j = r.changes.findIndex((c) => c.i === i);
        const file = j >= 0 ? fresh[j] : await getFile(s.clip).catch(() => undefined);
        if (!file) throw new Error(GONE);
        return { file, start: 0, end: j >= 0 ? r.changes[j].seconds : s.end - s.start };
      }));
      await joinSlot();
      step("Putting your video together...");
      await startJoin(r.projectId, takes, "Putting your fixed video together");
      // claimed here at once, before /edit's pickup can open it as a new video (that runs on React's next render, after this)
      const joined = endJoin();
      if (!joined?.file) throw new Error(joined?.error || "Couldn't put the video together. Try again.");
      // the project's next swap key (videoProjects.ts swapNo), so deleting the project deletes it too
      const n = r.base.startsWith(`${r.projectId}-s`) ? Number(r.base.slice(r.projectId.length + 2)) || 0 : 0;
      const fileId = `${r.projectId}-s${n + 1}`;
      await putFile(fileId, joined.file);
      r = { ...r, done: { fileId, size: joined.file.size, clips } };
      keepRemake(r);
    }
    setRemake({ projectId: r.projectId, state: "ready", step: "" });
  } catch (e) {
    // a part Higgsfield failed is gone, and its use came back; anything else can be picked up again at no cost
    if (e instanceof JobFailed) keepRemake(null);
    setRemake({ projectId: r.projectId, state: "failed", step: "", error: e instanceof JobFailed ? REMAKE_FAILED : (e as Error).message || REMAKE_FAILED });
  }
}

/** Picks up a fix paid for but not laid in (a reload, leaving the page, a dropped download). */
export function resumeRemake(): void {
  const r = pendingRemake();
  if (r && !remakeBusy()) void finishRemake(r);
}

/** The finished fix for this project, once: the device copy is dropped, so a second editor can't lay it in again. */
export function takeRemake(projectId: string): Remake | null {
  const r = pendingRemake();
  if (!r?.done || r.projectId !== projectId) return null;
  keepRemake(null);
  setRemake(null);
  return r;
}

// ---------- explainer ----------

export async function writeExplainer(topic: string): Promise<Scene[]> {
  const { scenes } = await callFn<{ scenes: Scene[] }>("ai-video", { mode: "script", topic }, "Couldn't write the explainer. Try again in a minute.");
  return scenes;
}

/** A narrated video's choices (Leo's panel). Today's explainer passes none. */
export interface ExplainerOpts {
  /** The AI pictures' look (ai-video EXPLAINER_LOOKS; photo or none is today's). */
  look?: string;
  /** DoP lite moves each AI picture for 5 s (ai-video move). */
  move?: boolean;
  /** Per scene, a stock clip's file link that stands in for its AI picture, or null. */
  stock?: (string | null)[];
}

/** A narrated video with paid pictures, kept on this device until it is put together (see the header). */
export interface ExplainerPending {
  name: string;
  /** The voiceover: a device file key (putFile). */
  voice: string;
  says: string[];
  /** Per scene, its stock clip's link, or null for an AI picture. */
  stock: (string | null)[];
  /** The AI pictures' jobs, in scene order. */
  tokens: string[];
  refund?: string;
  look?: string;
  move?: boolean;
  /** The moving clips' jobs once asked for, per AI picture (null: Higgsfield didn't take it, so it stays a still). */
  moved?: (string | null)[];
  extra?: JoinExtra;
}
const EXPLAINER_PENDING = "cs-ai-video-explainer-pending";
export const VOICE_GONE = "Your voiceover isn't on this device any more. Make the video again.";
const JOIN_LABEL = "Putting your explainer together";

export function pendingExplainer(): ExplainerPending | null {
  try {
    const p = JSON.parse(localStorage.getItem(EXPLAINER_PENDING) ?? "null");
    return p && typeof p.name === "string" && typeof p.voice === "string" && Array.isArray(p.says) && Array.isArray(p.stock) && Array.isArray(p.tokens) ? p : null;
  } catch {
    return null;
  }
}
const keepExplainer = (p: ExplainerPending | null) => {
  try {
    if (p) localStorage.setItem(EXPLAINER_PENDING, JSON.stringify(p));
    else localStorage.removeItem(EXPLAINER_PENDING);
  } catch {
    /* storage blocked: the video still gets made, it just can't be picked up after a reload */
  }
};

/** "Scene 3 stayed still; ..." for each scene that was to move and didn't. */
export const stillNote = (scenes: number[]) =>
  scenes.map((n) => `Scene ${n} stayed still; it didn't come through as a moving clip.`).join(" ");

/**
 * Today's explainer (no opts): the voiceover, one AI picture per scene, then the slides. A narrated video (opts) also
 * takes a stock clip for a scene that has one (a clip that won't download gets an AI picture instead, before anything
 * is paid for), its look, and its scenes moved; with no AI picture it takes no ai-video use at all.
 */
export async function makeExplainer(name: string, scenes: Scene[], voice: VoiceId, extra?: JoinExtra, opts?: ExplainerOpts): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "explainer", state: "working", step: "Making the voiceover..." });
  try {
    // the voiceover first: if it fails, no pictures have been paid for
    const mp3 = await speak(scenes.map((s) => s.say).join(" "), voice);
    if (!opts) {
      const seconds = await audioSeconds(mp3);
      const { tokens, refund } = await callFn<{ tokens: string[]; refund?: string }>("ai-video", { mode: "explainer", pictures: scenes.map((s) => s.picture) }, RETRY);
      const n = tokens.length;
      set({ kind: "explainer", state: "working", step: `Making the pictures, 0 of ${n} ready...` });
      const urls = await waitFor(tokens, (d) => set({ kind: "explainer", state: "working", step: `Making the pictures, ${d} of ${n} ready...` }), refund);
      const images = await Promise.all(urls.map(download));
      const secs = sceneSeconds(scenes.map((s) => s.say), seconds);
      await joinSlot();
      set({ kind: "explainer", state: "done", step: "" });
      void startSlides(name, images.map((image, i) => ({ image, seconds: secs[i] })), mp3, JOIN_LABEL, { extra });
      return;
    }
    const clips = await Promise.all(scenes.map(async (_, i) => {
      const url = opts.stock?.[i];
      return url ? { url, file: await download(url).catch(() => null) } : null;
    }));
    const stock = clips.map((c) => (c?.file ? c.url : null));
    const pictures = scenes.flatMap((s, i) => (stock[i] ? [] : [s.picture]));
    const look = opts.look && opts.look !== "photo" ? opts.look : undefined;
    let p: ExplainerPending = { name, voice: "", says: scenes.map((s) => s.say), stock, tokens: [], ...(look ? { look } : {}), ...(opts.move ? { move: true } : {}), ...(extra ? { extra } : {}) };
    if (pictures.length) {
      const { tokens, refund } = await callFn<{ tokens: string[]; refund?: string }>("ai-video", { mode: "explainer", pictures, ...(look ? { look } : {}) }, RETRY);
      const key = `vo-explainer-${Date.now().toString(36)}`;
      // a voiceover that can't be kept still makes this video; only a reload can't pick it up
      const kept = await putFile(key, mp3).then(() => true, () => false);
      p = { ...p, voice: kept ? key : "", tokens, ...(refund ? { refund } : {}) };
      if (kept) keepExplainer(p);
    }
    await finishExplainer(p, { mp3, clips: clips.map((c) => c?.file ?? null) });
  } catch (e) {
    fail("explainer", e);
  }
}

/** Waits for a narrated video's paid parts, moves them when asked, and puts it together; kept until the join is done. */
async function finishExplainer(p: ExplainerPending, have: { mp3?: Blob; clips?: (Blob | null)[] } = {}): Promise<void> {
  const step = (s: string) => set({ kind: "explainer", state: "working", step: s });
  try {
    const mp3 = have.mp3 ?? (await getFile(p.voice).catch(() => undefined));
    if (!mp3) {
      keepExplainer(null);
      throw new Error(VOICE_GONE);
    }
    const n = p.tokens.length;
    let urls: string[] = [];
    if (n) {
      step(`Making the pictures, 0 of ${n} ready...`);
      urls = await waitFor(p.tokens, (d) => step(`Making the pictures, ${d} of ${n} ready...`), p.refund);
    }
    let movedUrls: (string | null)[] = urls.map(() => null);
    if (p.move && n) {
      if (!p.moved) {
        step("Making the scenes move...");
        // a refusal (already moving, no connection) leaves every scene a still: the video is still made
        const r = await callFn<{ tokens: (string | null)[] }>("ai-video", { mode: "move", tokens: p.tokens, ...(p.look ? { look: p.look } : {}) }).catch(() => null);
        p = { ...p, moved: p.tokens.map((_, i) => (typeof r?.tokens?.[i] === "string" ? r.tokens[i] : null)) };
        // only a video whose voiceover is kept on this device can be picked up again
        if (p.voice) keepExplainer(p);
      }
      const asked = p.moved!.flatMap((t) => (t ? [t] : []));
      step(`Making the scenes move, 0 of ${asked.length}...`);
      const got = asked.length ? await settle(asked, (d) => step(`Making the scenes move, ${d} of ${asked.length}...`)) : [];
      let k = 0;
      movedUrls = p.moved!.map((t) => (t ? got[k++] : null));
    }
    step("Downloading your video...");
    const moving = await Promise.all(movedUrls.map((u) => (u ? download(u).catch(() => null) : null)));
    const stills = await Promise.all(urls.map((u, i) => (moving[i] ? null : download(u))));
    const clips = await Promise.all(p.stock.map((u, i) => have.clips?.[i] ?? (u ? download(u) : null)));
    const secs = sceneSeconds(p.says, await audioSeconds(mp3));
    let a = 0;
    const still: number[] = [];
    const slides = p.says.map((_, i) => {
      if (clips[i]) return { video: clips[i]!, seconds: secs[i] };
      const j = a++;
      if (moving[j]) return { video: moving[j]!, seconds: secs[i] };
      if (p.move) still.push(i + 1);
      return { image: stills[j]!, seconds: secs[i] };
    });
    const note = [p.extra?.note, stillNote(still)].filter(Boolean).join(" ");
    const extra: JoinExtra | undefined = note ? { ...p.extra, note, toast: p.extra?.toast ?? "Your narrated video is ready" } : p.extra;
    await joinSlot();
    // working until the join is done, so a remount can't start a second one, and paid for until then
    step("Putting your video together...");
    await startSlides(p.name, slides, mp3, JOIN_LABEL, { extra });
    const joined = currentJoin();
    if (joined?.state === "failed") throw new Error(joined.error || "Couldn't put the video together. Try again.");
    keepExplainer(null);
    if (p.voice) void deleteFile(p.voice).catch(() => {});
    set({ kind: "explainer", state: "done", step: "" });
  } catch (e) {
    // pictures Higgsfield failed are gone (their use came back); anything else can be picked up again
    if (e instanceof JobFailed) {
      keepExplainer(null);
      if (p.voice) void deleteFile(p.voice).catch(() => {});
    }
    fail("explainer", e);
  }
}

/** Picks up a narrated video whose pictures were paid for but never put together (a reload, a dropped download). */
export function resumeExplainer(): void {
  const p = pendingExplainer();
  if (p && !aiBusy()) void finishExplainer(p);
}
