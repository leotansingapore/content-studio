// Videos made without filming, on Edit a video (the ai-video edge function, Higgsfield):
//   avatar: a photo of you, or an AI presenter, speaking your script; Speak animates each slice of the voiceover
//   explainer: a topic becomes scenes, one AI picture each, over one voiceover
// The jobs live outside React, so they carry on while the adviser uses other pages. When the clips or
// pictures are in, they are put together on this device (videoMedia's join job) and Edit a video opens
// the result like an upload, with captions. An avatar video's job tokens stay on this device until it
// is put together, so a reload or a dropped download picks up the paid clips again at no cost.

import { callFn } from "@/lib/edgeFn";
import { planSlices, sceneSeconds } from "@/lib/videoEdit";
import { currentJoin, monoPcm, startJoin, startSlides, encodeWav } from "@/lib/videoMedia";
import { audioSeconds, speak, type VoiceId } from "@/lib/textVoice";
import { MAX_SLICE, type MediaState, type Scene } from "../../supabase/functions/ai-video/logic.ts";

export {
  MAX_AVATAR_SECONDS, MAX_LOOK, MAX_TOPIC, avatarCredits, creditsUsd, explainerCredits, type Scene,
} from "../../supabase/functions/ai-video/logic.ts";

export interface AiJob {
  kind: "presenter" | "avatar" | "explainer";
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

/** Polls until every job is done; the links in order. */
async function waitFor(tokens: string[], progress: (done: number) => void): Promise<string[]> {
  for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
    await sleep(POLL_MS);
    // a dropped status check is retried on the next round, not a failure
    const r = await callFn<{ jobs: MediaState[] }>("ai-video", { mode: "status", tokens }).catch(() => null);
    if (!r) continue;
    const bad = r.jobs.find((j) => j.state === "failed");
    if (bad?.state === "failed") throw new JobFailed(bad.error);
    const urls = r.jobs.flatMap((j) => (j.state === "done" ? [j.url] : []));
    if (urls.length === tokens.length) return urls;
    progress(urls.length);
  }
  throw new JobFailed("It's taking too long. Try again later.");
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

/** A photo as a JPEG at most 1280 px on its long side, the size Speak works from. */
async function toJpeg(photo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(photo).catch(() => {
    throw new Error("Couldn't open that photo. Try a JPG or PNG.");
  });
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.9));
}

const fail = (kind: AiJob["kind"], e: unknown) =>
  set({ kind, state: "failed", step: "", error: (e as Error).message || "That didn't go through. Try again." });

// ---------- AI presenter ----------

export async function makePresenter(look: string): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "presenter", state: "working", step: "Making your presenter..." });
  try {
    const { token } = await callFn<{ token: string }>("ai-video", { mode: "presenter", look }, "Couldn't make the presenter. Try again in a minute.");
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
  slices: { start: number; end: number }[];
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

interface Pending {
  name: string;
  tokens: string[];
  seconds: number[];
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

async function finishAvatar(p: Pending): Promise<void> {
  const n = p.tokens.length;
  set({ kind: "avatar", state: "working", step: `Making your video, 0 of ${n} ${n === 1 ? "part" : "parts"} ready. This takes a few minutes.` });
  try {
    const urls = await waitFor(p.tokens, (d) =>
      set({ kind: "avatar", state: "working", step: `Making your video, ${d} of ${n} ${n === 1 ? "part" : "parts"} ready. This takes a few minutes.` }));
    set({ kind: "avatar", state: "working", step: "Downloading your video..." });
    const clips = await Promise.all(urls.map(download));
    await joinSlot();
    keepPending(null);
    set({ kind: "avatar", state: "done", step: "" });
    void startJoin(p.name, clips.map((file, i) => ({ file, start: 0, end: p.seconds[i] })), "Putting your video together");
  } catch (e) {
    // a job Higgsfield failed is gone; a dropped download can be picked up again
    if (e instanceof JobFailed) keepPending(null);
    fail("avatar", e);
  }
}

export async function makeAvatar(name: string, photo: Blob | string, voice: Voiceover): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "avatar", state: "working", step: "Sending your voiceover and photo..." });
  let p: Pending;
  try {
    const slices = await Promise.all(voice.slices.map(async (s) => ({
      wav: await b64(encodeWav(voice.pcm.subarray(Math.round(s.start * RATE), Math.round(s.end * RATE)), RATE)),
      seconds: Math.round((s.end - s.start) * 1000) / 1000,
    })));
    const face = typeof photo === "string" ? { url: photo } : { jpeg: await b64(await toJpeg(photo)) };
    const { tokens } = await callFn<{ tokens: string[] }>("ai-video", { mode: "avatar", photo: face, slices }, RETRY);
    p = { name, tokens, seconds: slices.map((s) => s.seconds) };
    keepPending(p);
  } catch (e) {
    return fail("avatar", e);
  }
  await finishAvatar(p);
}

/** Picks up an avatar video whose parts were paid for but never put together (a reload, a dropped download). */
export function resumeAvatar(): void {
  const p = pendingAvatar();
  if (p && !aiBusy()) void finishAvatar(p);
}

// ---------- explainer ----------

export async function writeExplainer(topic: string): Promise<Scene[]> {
  const { scenes } = await callFn<{ scenes: Scene[] }>("ai-video", { mode: "script", topic }, "Couldn't write the explainer. Try again in a minute.");
  return scenes;
}

export async function makeExplainer(name: string, scenes: Scene[], voice: VoiceId): Promise<void> {
  if (aiBusy()) return;
  set({ kind: "explainer", state: "working", step: "Making the voiceover..." });
  try {
    // the voiceover first: if it fails, no pictures have been paid for
    const mp3 = await speak(scenes.map((s) => s.say).join(" "), voice);
    const seconds = await audioSeconds(mp3);
    const { tokens } = await callFn<{ tokens: string[] }>("ai-video", { mode: "explainer", pictures: scenes.map((s) => s.picture) }, RETRY);
    const n = tokens.length;
    set({ kind: "explainer", state: "working", step: `Making the pictures, 0 of ${n} ready...` });
    const urls = await waitFor(tokens, (d) => set({ kind: "explainer", state: "working", step: `Making the pictures, ${d} of ${n} ready...` }));
    const images = await Promise.all(urls.map(download));
    const secs = sceneSeconds(scenes.map((s) => s.say), seconds);
    await joinSlot();
    set({ kind: "explainer", state: "done", step: "" });
    void startSlides(name, images.map((image, i) => ({ image, seconds: secs[i] })), mp3, "Putting your explainer together");
  } catch (e) {
    fail("explainer", e);
  }
}
