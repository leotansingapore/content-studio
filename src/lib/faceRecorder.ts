// Recording your face once (people-my-face, Leo only): the front camera, a 10 s take of the consent line read aloud,
// 12 frames looked at on this device, three photos to pick from, and ai-video's consent check. The recording never
// leaves the device: its sound goes to ai-video for Whisper and the picked photo for its hash, and neither is kept
// there. Frames come from the live preview while recording, since a MediaRecorder WebM has no length to seek in.
// getUserMedia as Prompter.tsx does. The check runs here, outside React, so leaving the page doesn't lose it.

import { CONSENT_LINE } from "../../supabase/functions/_shared/consent.ts";
import { MAX_IMAGE_CHARS } from "@/lib/carousel";
import { sharpness } from "@/lib/coverFrame";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { facesIn } from "@/lib/faceVision";
import { FACE_FRAMES, oneFaceIn, oneFaceShown, saveFace, type MyFace } from "@/lib/myFace";
import { extractWav, pickMime } from "@/lib/videoMedia";
import type { FaceBox } from "@/lib/videoMotion";

export { CONSENT_LINE };

// ---------- the camera ----------

export type CameraProblem = "blocked" | "missing";

export class CameraError extends Error {
  constructor(public problem: CameraProblem) {
    super(problem);
  }
}

/** No camera on this device (or none this page may ask for) reads as missing; anything else as blocked. */
export const cameraProblem = (e: unknown): CameraProblem =>
  ["NotFoundError", "OverconstrainedError", "NotSupportedError"].includes((e as DOMException)?.name) ? "missing" : "blocked";

/** The front camera with sound, in portrait where the device can. Throws CameraError. */
export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new CameraError("missing");
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
  } catch (e) {
    throw new CameraError(cameraProblem(e));
  }
}

export const stopCamera = (s: MediaStream | null | undefined) => s?.getTracks().forEach((t) => t.stop());

// ---------- the take ----------

export const TAKE_SECONDS = 10;
/** The recorder stops by itself here, past the 10 s countdown. */
export const TAKE_MAX_SECONDS = 12;
const FRAME_EVERY_MS = 500;
const FRAME_LONG_SIDE = 1280;

export interface Take {
  /** The recording, sound and video: on this device only. */
  blob: Blob;
  /** A JPEG of the preview every half second. */
  frames: Blob[];
  seconds: number;
}

/**
 * Records `stream` and keeps a frame of `video` (showing that stream) every half second; stops by itself at
 * TAKE_MAX_SECONDS. `stop()` ends it early. `onTick` gets the seconds recorded, about 4 times a second.
 */
export function startTake(stream: MediaStream, video: HTMLVideoElement, onTick: (seconds: number) => void): { stop: () => void; done: Promise<Take> } {
  const { mime } = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  const frames: Promise<Blob | null>[] = [];
  const from = performance.now();
  const canvas = document.createElement("canvas");
  const grab = () => {
    if (!video.videoWidth) return;
    const k = Math.min(1, FRAME_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * k);
    canvas.height = Math.round(video.videoHeight * k);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92)));
  };
  const timers = [
    setInterval(grab, FRAME_EVERY_MS),
    setInterval(() => onTick((performance.now() - from) / 1000), 250),
    setTimeout(() => stop(), TAKE_MAX_SECONDS * 1000),
  ];
  const stop = () => rec.state !== "inactive" && rec.stop();
  const done = new Promise<Take>((resolve, reject) => {
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onerror = () => reject(new Error("The recording stopped. Record again."));
    rec.onstop = async () => {
      timers.forEach((t) => clearInterval(t));
      const seconds = (performance.now() - from) / 1000;
      resolve({ blob: new Blob(chunks, { type: mime.split(";")[0] }), frames: (await Promise.all(frames)).filter((b): b is Blob => !!b), seconds });
    };
  });
  rec.start(1000);
  return { stop, done };
}

// ---------- the photos ----------

/** `k` indexes spread evenly over `n` items, first and last included (all of them when there are no more than k). */
export function spread(n: number, k: number): number[] {
  if (n <= k) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1)));
}

/** The 9:16 cut around `face` (shares) in a w x h frame, in pixels: as tall as the frame allows, the face 40% down. */
export function portraitCrop(face: FaceBox, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const ch = Math.min(h, (w * 16) / 9);
  const cw = (ch * 9) / 16;
  const clamp = (v: number, max: number) => Math.round(Math.max(0, Math.min(max, v)));
  return {
    x: clamp(((face.x0 + face.x1) / 2) * w - cw / 2, w - cw),
    y: clamp(((face.y0 + face.y1) / 2) * h - 0.4 * ch, h - ch),
    w: Math.round(cw),
    h: Math.round(ch),
  };
}

/** Steps down the JPEG quality until the data URL fits; null when even the last step doesn't. */
export function jpegUnder(c: HTMLCanvasElement, max = MAX_IMAGE_CHARS): string | null {
  for (const q of [0.85, 0.75, 0.65]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= max) return url;
  }
  return null;
}

const decode = async (frame: Blob) => {
  const bmp = await createImageBitmap(frame);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d", { willReadFrequently: true })!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
};

/** Edges inside the face, measured on a 320 px copy so every frame is judged at one size. */
function faceSharpness(c: HTMLCanvasElement, box: FaceBox): number {
  const s = document.createElement("canvas");
  s.width = 320;
  s.height = Math.max(1, Math.round((320 * c.height) / c.width));
  const g = s.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, s.width, s.height);
  const d = g.getImageData(0, 0, s.width, s.height).data;
  const grey = new Float32Array(s.width * s.height);
  for (let k = 0; k < grey.length; k++) grey[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114;
  return sharpness(grey, s.width, s.height, box);
}

/** The photo: the 9:16 cut, at most 720x1280. */
function cutPhoto(c: HTMLCanvasElement, box: FaceBox): string | null {
  const r = portraitCrop(box, c.width, c.height);
  const k = Math.min(1, 720 / r.w);
  const out = document.createElement("canvas");
  out.width = Math.round(r.w * k);
  out.height = Math.round(r.h * k);
  out.getContext("2d")!.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
  return jpegUnder(out);
}

/**
 * Looks at 12 of the take's frames on this device: one face, big enough, in 9 of them (myFace.ts oneFaceShown),
 * then the three sharpest of those cut to 9:16, sharpest first. Nothing is sent anywhere.
 */
export async function pickPhotos(frames: Blob[]): Promise<{ ok: true; photos: string[] } | { ok: false }> {
  const pics = await Promise.all(spread(frames.length, FACE_FRAMES).map((i) => decode(frames[i])));
  const faces = await facesIn(pics);
  if (!oneFaceShown(faces)) return { ok: false };
  const best = pics
    .map((c, i) => ({ c, box: faces[i][0], one: oneFaceIn(faces[i]) }))
    .filter((p) => p.one)
    .map((p) => ({ ...p, sharp: faceSharpness(p.c, p.box) }))
    .sort((a, b) => b.sharp - a.sharp)
    .slice(0, 3);
  const photos = best.map((p) => cutPhoto(p.c, p.box)).filter((p): p is string => !!p);
  return photos.length ? { ok: true, photos } : { ok: false };
}

// ---------- the consent check (ai-video consent) ----------

export interface CheckInput {
  userId: string;
  take: Blob;
  /** The picked photo, a JPEG data URL. */
  photo: string;
  code: string;
  ticket: string;
}

export type CheckState =
  | { state: "idle" }
  | { state: "checking" }
  /** Whisper or the network never answered: Try again sends the same recording, photo and code. */
  | { state: "failed"; error: string }
  /** A code not heard, an old code, the daily cap: Record again. */
  | { state: "refused"; error: string; code?: string }
  | { state: "done"; face: MyFace };

const FAILED = "Couldn't check the recording. Try again in a minute.";
let check: CheckState = { state: "idle" };
let input: CheckInput | null = null;
const listeners = new Set<() => void>();
const set = (s: CheckState) => {
  check = s;
  listeners.forEach((fn) => fn());
};

export const checkState = () => check;
export function onCheck(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Back to nothing, the recording and photo dropped (Record again, or leaving the recorder). */
export function resetCheck() {
  input = null;
  checked = null;
  set({ state: "idle" });
}

async function b64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What a refusal from ai-video consent means here. */
export function checkOutcome(e: unknown): CheckState {
  if (!(e instanceof EdgeError)) return { state: "failed", error: FAILED };
  if (e.code === "not_heard") return { state: "refused", error: e.message, code: e.code };
  // never answered, or a blip on the way: the same take can go again
  if (e.status === 0 || e.status >= 500) return { state: "failed", error: FAILED };
  return { state: "refused", error: e.message, code: e.code };
}

type Checked = { heard: string; photoHash: string; token: string; at: string };
// a check the server passed but this device couldn't save (out of room): Try again saves it without asking again
let checked: Checked | null = null;

async function run(i: CheckInput): Promise<void> {
  set({ state: "checking" });
  let wav: string;
  try {
    wav = await b64((await extractWav(i.take)).wav);
  } catch {
    input = null;
    return set({ state: "refused", error: "Couldn't read the sound in that recording. Record again." });
  }
  try {
    checked ??= await callFn<Checked>("ai-video", { mode: "consent", kind: "face", wav, code: i.code, ticket: i.ticket, photo: i.photo.replace(/^data:[^,]*,/, "") });
  } catch (e) {
    return set(checkOutcome(e));
  }
  const saved = saveFace(i.userId, { photo: i.photo, photoHash: checked.photoHash, consent: { at: checked.at, line: CONSENT_LINE(i.code), heard: checked.heard, token: checked.token } });
  if (saved.ok === false) return set({ state: "failed", error: saved.error });
  input = null;
  checked = null;
  set({ state: "done", face: saved.face });
}

/** Sends the take's sound and the picked photo for the check, then saves the face. */
export function startCheck(i: CheckInput): Promise<void> {
  if (check.state === "checking") return Promise.resolve();
  input = i;
  checked = null;
  return run(i);
}

/** Try again after a failure: the same recording, photo, code and ticket (the ticket holds for the UTC day). */
export function retryCheck(): Promise<void> {
  return input && check.state !== "checking" ? run(input) : Promise.resolve();
}
