// "Make the image" on Write: the ai-image edge function asks GPT Image 2.6 Flare for one
// picture from the post's image prompt; this polls until it is ready, keeps it
// in the media library (folder "AI images") and says how it went. The job lives
// outside React, so it carries on while the adviser moves to another page, and
// its paid token waits in a device key until the picture is kept or fails, so a
// reload picks it up again at no cost (resumeImage, as presentersJob does).

import { callFn } from "@/lib/edgeFn";
import { deleteFile, getFile } from "@/lib/deviceFiles";
import { getDraftById, loadDrafts, setDraftAttached } from "@/lib/draftHistory";
import { loadBrand } from "@/lib/carousel";
import { addMedia, centerCrop, storePicture } from "@/lib/mediaLibrary";
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
  /** The agent's chat that asked for it: Activity logs it as the agent's (live-p6replay D6). */
  agent?: { thread: string; msg: string };
  /** The shape it is kept in (width / height), cut from the middle: a photo ad's 4:5. A fix keeps it too. */
  ratio?: number;
  /** The model was handed the brand's logo to place itself, so the logo stamp stays off it and its fixes. */
  bare?: true;
  attached?: { draft: string; key: string };
}

export const AI_FOLDER = "AI images";
const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60_000;
const PENDING = "cs-ai-image-making-"; // this device only, on purpose: the token is no use elsewhere

/** A make or fix whose use is spent and whose picture isn't kept yet. */
type Pending = { token: string; prompt: string; name: string; fix?: string; designId?: string; agent?: ImageJob["agent"]; ratio?: number; bare?: true; attachTo?: string; replace?: string };
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
let attachNext: string | undefined;
/** Who started the make now going (one runs at a time): every state it emits carries it, and its end clears it. */
let by: ImageJob["agent"];
const listeners = new Set<(j: ImageJob | null) => void>();
const set = (j: ImageJob) => {
  const next = by ? { ...j, agent: by } : j;
  if (j.state === "done" || j.state === "failed") by = undefined;
  job = next;
  listeners.forEach((l) => l({ ...next }));
};
export const imageJob = () => job;
export function onImageJob(fn: (j: ImageJob | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const imageBusy = () => job?.state === "working" || job?.state === "saving";

/**
 * Their facts and learnings for pictures after the prompt (brand-voice-memory), only in the room ai-image's MAX_PROMPT
 * leaves: memoryLine drops the oldest learnings first. With none saved the prompt goes as typed.
 */
function withMemory(userId: string, prompt: string): string {
  const memory = memoryLine(userId, "pictures", MAX_PROMPT - prompt.length - 2);
  return memory ? `${prompt}\n\n${memory}` : prompt;
}

/** Where the logo sits on a picture: 12% of its width, bottom right, 3% in from the edges; of the part kept, when a ratio cuts it. */
export function logoBox(w: number, h: number, logoW: number, logoH: number, ratio?: number) {
  const area = ratio ? centerCrop(w, h, ratio) : { x: 0, y: 0, w, h };
  const width = Math.round(area.w * 0.12);
  const height = Math.round((width * logoH) / Math.max(1, logoW));
  const margin = Math.round(area.w * 0.03);
  return { x: area.x + area.w - margin - width, y: area.y + area.h - margin - height, width, height };
}

async function stampLogo(pic: Blob, logo: string, ratio?: number): Promise<Blob> {
  const [img, mark] = await Promise.all([createImageBitmap(pic), fetch(logo).then((r) => r.blob()).then((b) => createImageBitmap(b))]);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  if (!g) return pic;
  g.drawImage(img, 0, 0);
  const box = logoBox(img.width, img.height, mark.width, mark.height, ratio);
  g.drawImage(mark, box.x, box.y, box.width, box.height);
  return new Promise((resolve) => c.toBlob((out) => resolve(out ?? pic), "image/png"));
}

/**
 * "Logo on AI pictures" (brand-kit, Leo only): the kit's logo on the picture before it is kept, a fix's result
 * included (Fix it edits the unstamped original). Anyone else's picture, or one the stamp fails on, as it came.
 */
async function withLogo(userId: string, pic: Blob, ratio?: number): Promise<Blob> {
  try {
    if (!(await leoUser())) return pic;
    const kit = loadBrand(userId);
    return kit?.logo && kit.stamp?.pictureLogo ? await stampLogo(pic, kit.logo, ratio) : pic;
  } catch {
    return pic;
  }
}

/**
 * o.words: the picture prints the prompt's quoted lines (ai-image's words flag); o.ratio: kept cut to that shape (width /
 * height); o.refs (with words): pictures the model puts in the ad, the brand's logo (then never stamped on too) and the
 * product's picture.
 */
export const makeImage = async (userId: string, prompt: string, name: string, designId?: string, agent?: ImageJob["agent"], o: { words?: true; ratio?: number; refs?: { logo?: string; product?: string } } = {}): Promise<void> =>
  run(
    userId,
    { prompt, name: name.slice(0, 80) || "AI image", ...(designId ? { designId } : {}), ...(agent ? { agent } : {}), ...(o.ratio ? { ratio: o.ratio } : {}), ...(o.words && o.refs?.logo ? { bare: true as const } : {}) },
    { mode: "start", prompt: withMemory(userId, prompt), ...(o.words ? { words: true, ...(o.refs?.logo || o.refs?.product ? { refs: o.refs } : {}) } : {}) },
  );

export const brandLine = (kit: { color?: string; palette?: { hex?: string }[] } | null): string => {
  const hexes = [kit?.color, ...(kit?.palette ?? []).map((p) => p.hex)].filter((h): h is string => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h));
  const colours = [...new Set(hexes.map((h) => h.toUpperCase()))];
  return colours.length ? `Where it suits the scene, use the brand's colours as accents: ${colours.join(", ")}.` : "";
};

const withBrand = (userId: string, prompt: string): string => {
  const line = brandLine(loadBrand(userId));
  return line && prompt.length + line.length + 2 <= MAX_PROMPT ? `${prompt}\n\n${line}` : prompt;
};

export const autoImage = async (userId: string, prompt: string, name: string, attachTo?: string): Promise<void> =>
  run(userId, { prompt, name: name.slice(0, 80) || "AI image", ...(attachTo ? { attachTo } : {}) }, { mode: "start", prompt: withMemory(userId, withBrand(userId, prompt)) });

export const attachImageTo = async (userId: string, draft: string, prompt: string): Promise<void> => {
  const j = job;
  if (!j || j.prompt !== prompt || j.fix) return;
  if (imageBusy()) {
    attachNext = draft;
    const scope = scoped(userId);
    const p = readPending(scope);
    if (p && p.prompt === prompt) keepPending(scope, { ...p, attachTo: draft });
    return;
  }
  if (j.state !== "done" || !j.mediaKey || j.attached?.draft === draft) return;
  const pic = await getFile(j.mediaKey).catch(() => undefined);
  const attached = pic ? await attachPicture(userId, draft, pic) : undefined;
  if (attached && job === j) set({ ...j, attached });
};

/** "Fix it": GPT Image 2.6 Flare edits the finished picture; the fixed one is saved to Media beside the original. */
export function fixImage(userId: string, fix: string): Promise<void> {
  const j = job;
  if (!j?.token || j.state !== "done" || imageBusy()) return Promise.resolve();
  const swap = j.attached ? { attachTo: j.attached.draft, replace: j.attached.key } : {};
  return run(userId, { prompt: j.prompt, name: j.name ?? "AI image", fix, ...(j.ratio ? { ratio: j.ratio } : {}), ...(j.bare ? { bare: true as const } : {}), ...swap }, { mode: "fix", token: j.token, fix }, j);
}

const attachPicture = async (userId: string, draft: string, pic: Blob, replace?: string): Promise<ImageJob["attached"]> => {
  const entry = getDraftById(userId, draft);
  const now = entry?.attached ?? [];
  if (!entry || (replace ? !now.includes(replace) : now.length > 0)) return undefined;
  const { key } = await storePicture(pic);
  setDraftAttached(userId, draft, replace ? now.map((k) => (k === replace ? key : k)) : [key]);
  if (replace && !loadDrafts(userId).some((d) => d.attached?.includes(replace))) void deleteFile(replace).catch(() => {});
  return { draft, key };
};

async function run(userId: string, ask: Ask, body: Record<string, unknown>, before?: ImageJob): Promise<void> {
  if (imageBusy()) return;
  by = ask.agent;
  attachNext = undefined;
  set({ prompt: ask.prompt, state: "working", fix: ask.fix, designId: ask.designId });
  let token: string;
  try {
    ({ token } = await callFn<{ token: string }>("ai-image", body, "Couldn't make the image right now. Try again in a minute."));
  } catch (e) {
    return failed(ask.prompt, e, before);
  }
  // kept under the brand open now, and cleared from it whichever brand is open when the picture lands
  const scope = scoped(userId);
  const p = { ...ask, token, ...(attachNext ? { attachTo: attachNext } : {}) };
  keepPending(scope, p);
  await finish(userId, scope, p, before);
}

/** After a reload: picks up a make or fix whose use was spent and whose picture was never kept. */
export function resumeImage(userId: string): void {
  const scope = scoped(userId);
  const p = imageBusy() ? null : readPending(scope);
  if (!p) return;
  by = p.agent && typeof p.agent.thread === "string" && typeof p.agent.msg === "string" ? { thread: p.agent.thread, msg: p.agent.msg } : undefined;
  attachNext = undefined;
  set({ prompt: p.prompt, state: "working", fix: p.fix, designId: p.designId });
  void finish(userId, scope, p);
}

function failed(prompt: string, e: unknown, before?: ImageJob) {
  const error = (e as Error).message || "Couldn't make the image. Try again.";
  // a failed fix keeps the picture the adviser already had
  set(before ? { ...before, fixError: error } : { prompt, state: "failed", error });
}

async function finish(userId: string, scope: string, { token, prompt, name, fix, designId, ratio: asked, bare, attachTo, replace }: Pending, before?: ImageJob): Promise<void> {
  // read back from this device after a reload, so only a real shape counts
  const ratio = typeof asked === "number" && asked > 0 ? asked : undefined;
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
    const raw = await res.blob();
    const blob = bare === true ? raw : await withLogo(userId, raw, ratio);
    const pic = await storePicture(blob, undefined, ratio);
    const saved = fix ? `${name} (fixed)`.slice(0, 80) : name;
    addMedia(userId, {
      key: pic.key, name: saved, folder: AI_FOLDER, alt: (fix ? `${prompt} Fixed: ${fix}` : prompt).slice(0, 250),
      width: pic.width, height: pic.height, addedAt: new Date().toISOString(),
    });
    const target = attachNext ?? attachTo;
    attachNext = undefined;
    const attached = target ? await attachPicture(userId, target, blob, replace) : undefined;
    keepPending(scope, null);
    set({ prompt, state: "done", mediaKey: pic.key, preview: pic.url, token, name, designId, ...(ratio ? { ratio } : {}), ...(bare === true ? { bare } : {}), ...(attached ? { attached } : {}) });
  } catch (e) {
    keepPending(scope, null);
    failed(prompt, e, before);
  }
}
