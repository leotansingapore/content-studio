// "Make the image" on Write: the ai-image edge function asks Higgsfield for one
// picture from the post's image prompt; this polls until it is ready, keeps it
// in the media library (folder "AI images") and says how it went. The job lives
// outside React, so it carries on while the adviser moves to another page, and
// its paid token waits in a device key until the picture is kept or fails, so a
// reload picks it up again at no cost (resumeImage, as presentersJob does).

import { callFn } from "@/lib/edgeFn";
import { loadBrand } from "@/lib/carousel";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";
import { scoped } from "@/lib/profiles";
import { MAX_PROMPT, type JobState } from "../../supabase/functions/ai-image/logic.ts";

export interface ImageJob {
  prompt: string;
  state: "working" | "saving" | "done" | "failed";
  error?: string;
  /** The picture as kept in Media: its key and a data URL to show. */
  mediaKey?: string;
  preview?: string;
  /** The finished job's signed token and Media name, so "Fix it" can edit this picture. */
  token?: string;
  name?: string;
  /** Set while a fix runs, and why the last fix failed (the picture before it stays). */
  fix?: string;
  fixError?: string;
  /** The /image design that asked for it, so it still drops in there after a reload. */
  designId?: string;
}

export const AI_FOLDER = "AI images";
const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60_000;
const PENDING = "cs-ai-image-making-"; // this device only, on purpose: the token is no use elsewhere

/** A make or fix whose use is spent and whose picture isn't kept yet. */
type Pending = { token: string; prompt: string; name: string; fix?: string; designId?: string };
type Ask = Omit<Pending, "token">;

function readPending(scope: string): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING + scope) ?? "null");
    return p && typeof p.token === "string" && typeof p.prompt === "string" && typeof p.name === "string" ? p : null;
  } catch {
    return null;
  }
}
function keepPending(scope: string, p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING + scope, JSON.stringify(p));
    else localStorage.removeItem(PENDING + scope);
  } catch {
    // storage blocked: the make still runs, it just can't be picked up after a reload
  }
}

let job: ImageJob | null = null;
const listeners = new Set<(j: ImageJob | null) => void>();
const set = (j: ImageJob) => {
  job = j;
  listeners.forEach((l) => l({ ...j }));
};
export const imageJob = () => job;
export function onImageJob(fn: (j: ImageJob | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const imageBusy = () => job?.state === "working" || job?.state === "saving";

/**
 * Leo's facts and learnings for pictures after the prompt (brand-voice-memory), only in the room ai-image's MAX_PROMPT
 * leaves: memoryLine drops the oldest learnings first. Anyone else's prompt goes as typed.
 */
async function withMemory(userId: string, prompt: string): Promise<string> {
  let memory = "";
  try {
    if (await leoUser()) memory = memoryLine(userId, "pictures", MAX_PROMPT - prompt.length - 2);
  } catch {
    // a session that can't be read is not Leo's
  }
  return memory ? `${prompt}\n\n${memory}` : prompt;
}

/** Where the logo sits on a picture: 12% of its width, bottom right, 3% in from the edges. */
export function logoBox(w: number, h: number, logoW: number, logoH: number) {
  const width = Math.round(w * 0.12);
  const height = Math.round((width * logoH) / Math.max(1, logoW));
  const margin = Math.round(w * 0.03);
  return { x: w - margin - width, y: h - margin - height, width, height };
}

async function stampLogo(pic: Blob, logo: string): Promise<Blob> {
  const [img, mark] = await Promise.all([createImageBitmap(pic), fetch(logo).then((r) => r.blob()).then((b) => createImageBitmap(b))]);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  if (!g) return pic;
  g.drawImage(img, 0, 0);
  const box = logoBox(img.width, img.height, mark.width, mark.height);
  g.drawImage(mark, box.x, box.y, box.width, box.height);
  return new Promise((resolve) => c.toBlob((out) => resolve(out ?? pic), "image/png"));
}

/**
 * "Logo on AI pictures" (brand-kit, Leo only): the kit's logo on the picture before it is kept, a fix's result
 * included (Fix it edits Higgsfield's unstamped original). Anyone else's picture, or one the stamp fails on, as it came.
 */
async function withLogo(userId: string, pic: Blob): Promise<Blob> {
  try {
    if (!(await leoUser())) return pic;
    const kit = loadBrand(userId);
    return kit?.logo && kit.stamp?.pictureLogo ? await stampLogo(pic, kit.logo) : pic;
  } catch {
    return pic;
  }
}

export const makeImage = async (userId: string, prompt: string, name: string, designId?: string): Promise<void> =>
  run(userId, { prompt, name: name.slice(0, 80) || "AI image", ...(designId ? { designId } : {}) }, { mode: "start", prompt: await withMemory(userId, prompt) });

/** "Fix it": Qwen Image 3 edits the finished picture; the fixed one is saved to Media beside the original. */
export function fixImage(userId: string, fix: string): Promise<void> {
  const j = job;
  if (!j?.token || j.state !== "done" || imageBusy()) return Promise.resolve();
  return run(userId, { prompt: j.prompt, name: j.name ?? "AI image", fix }, { mode: "fix", token: j.token, fix }, j);
}

async function run(userId: string, ask: Ask, body: Record<string, unknown>, before?: ImageJob): Promise<void> {
  if (imageBusy()) return;
  set({ prompt: ask.prompt, state: "working", fix: ask.fix, designId: ask.designId });
  let token: string;
  try {
    ({ token } = await callFn<{ token: string }>("ai-image", body, "Couldn't make the image right now. Try again in a minute."));
  } catch (e) {
    return failed(ask.prompt, e, before);
  }
  // kept under the brand open now, and cleared from it whichever brand is open when the picture lands
  const scope = scoped(userId);
  keepPending(scope, { ...ask, token });
  await finish(userId, scope, { ...ask, token }, before);
}

/** After a reload: picks up a make or fix whose use was spent and whose picture was never kept. */
export function resumeImage(userId: string): void {
  const scope = scoped(userId);
  const p = imageBusy() ? null : readPending(scope);
  if (!p) return;
  set({ prompt: p.prompt, state: "working", fix: p.fix, designId: p.designId });
  void finish(userId, scope, p);
}

function failed(prompt: string, e: unknown, before?: ImageJob) {
  const error = (e as Error).message || "Couldn't make the image. Try again.";
  // a failed fix keeps the picture the adviser already had
  set(before ? { ...before, fixError: error } : { prompt, state: "failed", error });
}

async function finish(userId: string, scope: string, { token, prompt, name, fix, designId }: Pending, before?: ImageJob): Promise<void> {
  try {
    let url = "";
    for (const until = Date.now() + GIVE_UP_MS; !url && Date.now() < until; ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      // a dropped status check is retried on the next round, not a failure
      const s = await callFn<JobState>("ai-image", { mode: "status", token }).catch((): JobState => ({ state: "working" }));
      if (s.state === "failed") throw new Error(s.error);
      if (s.state === "done") url = s.url;
    }
    if (!url) throw new Error("The image is taking too long. Try again in a few minutes.");
    set({ prompt, state: "saving", fix, designId });
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) throw new Error("The image was made but didn't download. Try again.");
    const pic = await storePicture(await withLogo(userId, await res.blob()));
    const saved = fix ? `${name} (fixed)`.slice(0, 80) : name;
    addMedia(userId, {
      key: pic.key, name: saved, folder: AI_FOLDER, alt: (fix ? `${prompt} Fixed: ${fix}` : prompt).slice(0, 250),
      width: pic.width, height: pic.height, addedAt: new Date().toISOString(),
    });
    keepPending(scope, null);
    set({ prompt, state: "done", mediaKey: pic.key, preview: pic.url, token, name, designId });
  } catch (e) {
    keepPending(scope, null);
    failed(prompt, e, before);
  }
}
