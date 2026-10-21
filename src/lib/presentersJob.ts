// Making three presenter options (people-presenters, Leo only): ai-video mode presenters, the three Soul pictures
// polled by today's status mode, then a pick and a name. It runs here, outside React, so closing the sheet or leaving
// /people loses nothing, and the tokens wait in a device key until a pick is kept or dropped, so a reload picks the
// paid pictures up again at no cost. Keeping one saves Higgsfield's link and a 540x960 JPEG copy (decision 10).

import { EdgeError, callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { MAX_PHOTO, keepPresenter, type Presenter, type PresenterPrefs } from "@/lib/presenters";
import type { MediaState } from "../../supabase/functions/ai-video/logic.ts";

export type MakeState =
  | { state: "idle" }
  | { state: "making"; scope: string }
  /** Only the pictures that came back, with the look each was made from. */
  | { state: "pick"; scope: string; looks: string[]; urls: string[] }
  | { state: "refused"; scope: string; error: string }
  | { state: "failed"; scope: string; error: string };

export const FAILED = "Couldn't make the presenters. Try again in a minute.";
const SLOW = "It's taking too long. Try again later.";
const SAVE_FAILED = "Couldn't save the picture. Try again.";
/** Server refusals that keep the sheet's choices for another try: a look, a cap, the gate, the chips. */
const REFUSED = ["real_person", "minor", "daily_limit", "global_limit", "usage_unavailable", "not_enabled", "bad_request"];
const PENDING = "cs-presenters-making-"; // this device only, on purpose: the tokens are no use elsewhere
const POLL_MS = 4000;
const GIVE_UP_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pending = { tokens: string[]; looks: string[] };

let job: MakeState = { state: "idle" };
const listeners = new Set<() => void>();
const set = (s: MakeState) => {
  job = s;
  listeners.forEach((l) => l());
};
/** For useSyncExternalStore: the same object until it changes. */
export const makeState = () => job;
export function onMake(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readPending(scope: string): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING + scope) ?? "null");
    return p && Array.isArray(p.tokens) && Array.isArray(p.looks) && p.tokens.length === p.looks.length && p.tokens.length ? p : null;
  } catch {
    return null;
  }
}
function keepPending(scope: string, p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING + scope, JSON.stringify(p));
    else localStorage.removeItem(PENDING + scope);
  } catch {
    /* storage blocked: the make still runs, it just can't be picked up after a reload */
  }
}

/** Starts a make for this brand, unless one is already going. Shows "making" at once. */
export async function startMake(userId: string, prefs: PresenterPrefs, extra?: string): Promise<void> {
  if (job.state === "making") return;
  const scope = scoped(userId);
  set({ state: "making", scope });
  let made: Pending;
  try {
    made = await callFn<Pending>("ai-video", { mode: "presenters", prefs, ...(extra ? { extra } : {}) }, FAILED);
  } catch (e) {
    const refused = e instanceof EdgeError && REFUSED.includes(e.code);
    return set({ state: refused ? "refused" : "failed", scope, error: refused ? e.message : e instanceof EdgeError && e.code === "failed" ? e.message : FAILED });
  }
  keepPending(scope, { tokens: made.tokens, looks: made.looks });
  await poll(scope, made);
}

/** After a reload, or on opening /people: picks up a make whose pictures were paid for and not yet kept or dropped. */
export function resumeMake(userId: string): void {
  const scope = scoped(userId);
  const p = job.state === "idle" ? readPending(scope) : null;
  if (!p) return;
  set({ state: "making", scope });
  void poll(scope, p);
}

async function poll(scope: string, p: Pending): Promise<void> {
  let last: MediaState[] = [];
  for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
    await sleep(POLL_MS);
    // a dropped status check is tried again on the next round
    const r = await callFn<{ jobs: MediaState[] }>("ai-video", { mode: "status", tokens: p.tokens }).catch(() => null);
    if (!r) continue;
    last = r.jobs;
    if (last.every((j) => j.state !== "working")) break;
  }
  const done = p.tokens.flatMap((_, i) => (last[i]?.state === "done" ? [i] : []));
  if (!done.length) {
    keepPending(scope, null);
    return set({ state: "failed", scope, error: last.some((j) => j.state === "working") || !last.length ? SLOW : FAILED });
  }
  set({ state: "pick", scope, looks: done.map((i) => p.looks[i]), urls: done.map((i) => (last[i] as { url: string }).url) });
}

/**
 * Keeps picture `i` of the pick under `name`: its link and a 540x960 copy. The make is done when it saves; when it
 * can't (4 already on, the copy failed, a full device) the pick stays and the line says why.
 */
export async function keepPick(userId: string, i: number, name: string, copy = copyPicture): Promise<{ ok: true; presenter: Presenter } | { ok: false; error: string }> {
  if (job.state !== "pick" || !job.urls[i]) return { ok: false, error: SAVE_FAILED };
  const { scope, looks, urls } = job;
  const photo = await copy(urls[i]).catch(() => null);
  if (!photo) return { ok: false, error: SAVE_FAILED };
  const saved = keepPresenter(userId, { name, look: looks[i], url: urls[i], photo });
  if (!saved.ok || !saved.presenter) return { ok: false, error: saved.ok ? SAVE_FAILED : saved.error };
  keepPending(scope, null);
  set({ state: "idle" });
  return { ok: true, presenter: saved.presenter };
}

/** Drops the pick (none kept) or clears a refusal or failure, back to the sheet. */
export function clearMake(): void {
  if (job.state === "making") return;
  if (job.state !== "idle") keepPending(job.scope, null);
  set({ state: "idle" });
}

/** A 540x960 JPEG data URL of the picture, cut to 9:16 around its middle, at most MAX_PHOTO characters. */
export async function copyPicture(url: string): Promise<string> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) throw new Error(SAVE_FAILED);
  const bmp = await createImageBitmap(await res.blob());
  const c = document.createElement("canvas");
  c.width = 540;
  c.height = 960;
  const k = Math.max(c.width / bmp.width, c.height / bmp.height);
  const w = c.width / k;
  const h = c.height / k;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, 0, 0, c.width, c.height);
  bmp.close();
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    const data = c.toDataURL("image/jpeg", q);
    if (data.length <= MAX_PHOTO) return data;
  }
  throw new Error(SAVE_FAILED);
}
