// Make a green screen (/make/green-screen, docs/north-star/items/formats-green-screen.md): you, or an AI presenter,
// standing in front of a note list, your demo video or a picture. The page gathers the parts and the editor does the
// compositing (faceVision.ts cuts the person out on this device; Behind you and Where you stand in VideoEditPage), so
// the preview, both exports and later edits share one path. The run is here, outside React, so leaving the page keeps
// it going:
//   mine:      the list (written first by remix make "notes" when no item is typed), drawn to a PNG under a bd- device
//              key, then handToEditor(your video) with the backdrop, the stand, the 9:16 frame and tab "face"
//   presenter: the same backdrop, then the talking head's own run (talkingHeadJob.ts, imported as it is). Once its paid
//              clip is pending, addToJoin lays this page's extra over that clip's join, so a reload that resumes the
//              clip at no cost still opens it as a green screen
// Each step is mirrored into formatJob.ts for /library's Making now.
//   device: cs-make-green-screen-<scoped uid>: { title, items, behind? } (the typed note, and the demo or picture
//   picked, by its bd- key). The presenter's script and look are the talking head page's (talkingHead.ts).

import { aiBusy, pendingAvatar } from "@/lib/aiVideo";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { EdgeError } from "@/lib/edgeFn";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { NOTE_H, NOTE_ITEMS, NOTE_W, layoutNote, noteSvg } from "@/lib/notesCard";
import { stripDashes } from "@/lib/plainText";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { TALK_TOAST, talkCaps, talkPrice, type TalkSpend } from "@/lib/talkingHead";
import { goOnAtPrice, onTalkJob, ownsPending, resumeTalk, startTalk, talkBusy, talkJob, type TalkAsk, type TalkJob } from "@/lib/talkingHeadJob";
import type { Backdrop, Stand } from "@/lib/videoEdit";
import { addToJoin, dropJoinAdd, getFile, handToEditor, joinAdd, putFile, type JoinExtra } from "@/lib/videoMedia";
import { noteOf } from "@/lib/wallJob";
import { MAX_TOPIC } from "../../supabase/functions/remix/logic.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export type GreenWho = "mine" | "presenter";
export type GreenBehind = "notes" | "demo" | "picture";
export const GREEN_WHO: GreenWho[] = ["mine", "presenter"];
export const GREEN_BEHIND: GreenBehind[] = ["notes", "demo", "picture"];
export const STANDS: Stand[] = ["bottom", "corner"];

export const SLUG = "green-screen";
export const GREEN_TOAST = "Your green screen is ready. Export it when it looks right.";
export const NO_PERSON = "We couldn't find a person in this video. Use a clip with one person facing the camera.";
export const LIST_FAILED = "Couldn't write the list. Try again in a minute.";
export const LIST_REFUSED = "That topic can't be turned into a list that's safe to post. Try another.";
export const CUTOUT_LOADING = "Getting the cut-out ready on this device...";
export const LOOKING = "Looking for you in the video...";
export const BEHIND_GONE = "That file isn't on this device any more. Pick it again.";
export const DRAW_FAILED = "Couldn't draw your note. Try again.";
export const OTHER_VIDEO = "Your last AI video isn't finished yet. Open the editor to finish it.";
const WRITING = "Writing your list...";
const DRAWING = "Drawing your note...";
const JOINING = "Putting it together...";

/** A demo video or a picture picked for behind you, kept on this device under its bd- key. */
export interface BehindPick {
  kind: "demo" | "picture";
  key: string;
  name: string;
}

// ---- the rules (pure) ----

/** The items that say something, at most the card's 6. */
export const noteItems = (items: string[]) => items.map((i) => i.trim()).filter(Boolean).slice(0, NOTE_ITEMS);

/**
 * What a press writes before drawing the note: nothing while any item is typed; else the list from the post (the
 * title as a steer), or from the title as a topic (3 to 200 characters); null when there is nothing to write from.
 */
export function listPlan(note: { title: string; items: string[] }, source: RemixSource | null): "source" | "topic" | null {
  if (noteItems(note.items).length) return null;
  if (source) return "source";
  const t = note.title.trim();
  return t.length >= 3 && t.length <= MAX_TOPIC ? "topic" : null;
}

/** "Write it for me": from the post, or from the title as a topic. */
export const canWriteList = (title: string, source: RemixSource | null) => !!source || (title.trim().length >= 3 && title.trim().length <= MAX_TOPIC);

/** A device key for something behind you: the editor's backdrops take bd- keys only. */
export const bdKey = (now = Date.now(), rand = Math.random()) => `bd-gs-${now.toString(36)}${Math.floor(rand * 1296).toString(36).padStart(2, "0")}`;

export const backdropOf = (behind: GreenBehind, key: string): Backdrop => ({ kind: behind === "demo" ? "video" : "picture", key });

/** What the editor opens with: the backdrop and the stand in the 9:16 frame, on its face tab, with this format's toast. */
export function greenExtra(o: { backdrop: Backdrop; stand: Stand; caption?: string; note?: string; source?: RemixSource | null }): JoinExtra {
  return {
    settings: { backdrop: o.backdrop, stand: o.stand, aspect: "9:16" },
    tab: "face",
    toast: GREEN_TOAST,
    ...(o.caption ? { caption: o.caption } : {}),
    ...(o.note ? { note: o.note } : {}),
    ...(o.source ? { source: { ...o.source, remixedAt: new Date().toISOString() } } : {}),
  };
}

/** What a talking head's join gets from this page: its own caption, note and source stay. */
export const greenAdd = (e: JoinExtra): JoinExtra => ({ settings: e.settings, tab: e.tab, toast: e.toast });

/** What one press spends: the list's write; then your video's captions, or the talking head's parts for a presenter. */
export interface GreenSpend {
  write: boolean;
  /** The presenter's run, as the talking head page prices it; null for your own video. */
  talk: TalkSpend | null;
  /** Your video's length, for its captions; null until it is read. */
  minutes: number | null;
}

export const greenPrice = (o: GreenSpend): Price | "pick" | null =>
  sumPrices(o.write ? priceOf("remix-make") : null, o.talk ? talkPrice(o.talk) : o.minutes ? priceOf("video-transcribe", { minutes: o.minutes }) : null);

/** The footer's main cap and the others the press spends, so the button is off when any is used up. */
export function greenCaps(o: GreenSpend): { cap: UsageFeature; caps: UsageFeature[] } {
  if (o.talk) return { cap: "ai-video", caps: [...new Set<UsageFeature>([...(o.write ? ["remix-make" as const] : []), ...talkCaps(o.talk)])] };
  return o.write ? { cap: "remix-make", caps: ["video-transcribe"] } : { cap: "video-transcribe", caps: [] };
}

/** Why Make the video is off, before anything is spent; null when it can run. The presenter's own reasons come in `talk`. */
export function greenReason(o: {
  who: GreenWho;
  behind: GreenBehind;
  /** Your video: none picked, being checked (with the model loading the first time), nobody found, or a person in it. */
  person: "none" | "loading" | "looking" | "nobody" | "found";
  note: { title: string; items: string[] };
  source: RemixSource | null;
  pick: BehindPick | null;
  talk: string | null;
}): string | null {
  if (o.who === "mine") {
    if (o.person === "none") return "Pick a video of you first.";
    if (o.person === "loading") return CUTOUT_LOADING;
    if (o.person === "looking") return LOOKING;
    if (o.person === "nobody") return NO_PERSON;
  } else if (o.talk) return o.talk;
  if (o.behind === "notes") return noteItems(o.note.items).length || listPlan(o.note, o.source) ? null : "Type the items, or a title to write them from.";
  if (o.pick?.kind !== o.behind) return o.behind === "demo" ? "Pick your demo video first." : "Pick a picture first.";
  return null;
}

/** The page's params for a run, defaults left out: the library row reopens what ran. */
export const greenParams = (a: Pick<GreenAsk, "source" | "who" | "behind" | "stand" | "mention">): Record<string, string | undefined> => ({
  source: a.source?.key,
  mention: a.mention ? undefined : "no",
  who: a.who === "presenter" ? "presenter" : undefined,
  behind: a.behind === "notes" ? undefined : a.behind,
  stand: a.stand === "bottom" ? undefined : a.stand,
});

// ---- what was typed and picked, kept on this device ----

export interface Typed {
  title: string;
  items: string[];
  behind?: BehindPick;
}

const typedKey = (userId: string) => `cs-make-green-screen-${scoped(userId)}`;

export function loadTyped(userId: string): Typed {
  try {
    const t = JSON.parse(localStorage.getItem(typedKey(userId)) ?? "{}");
    const b = t?.behind;
    return {
      title: typeof t?.title === "string" ? t.title : "",
      items: Array.isArray(t?.items) ? t.items.filter((i: unknown): i is string => typeof i === "string").slice(0, NOTE_ITEMS) : [],
      ...(b && (b.kind === "demo" || b.kind === "picture") && typeof b.key === "string" && b.key.startsWith("bd-") && typeof b.name === "string" ? { behind: { kind: b.kind, key: b.key, name: b.name } } : {}),
    };
  } catch {
    return { title: "", items: [] };
  }
}

export function saveTyped(userId: string, t: Typed): void {
  try {
    localStorage.setItem(typedKey(userId), JSON.stringify(t));
  } catch {
    // the page still holds it for this visit
  }
}

// ---- the run ----

export interface GreenAsk {
  source: RemixSource | null;
  mention: boolean;
  who: GreenWho;
  behind: GreenBehind;
  stand: Stand;
  title: string;
  items: string[];
  pick: BehindPick | null;
  /** Your video, picked on this visit. */
  mine: File | null;
  /** The presenter's run: the talking head page's script, look, setting, voice and length. */
  talk: Pick<TalkAsk, "text" | "look" | "setting" | "voice" | "length">;
}

export type GreenState = "writing" | "written" | "drawing" | "joining" | "talking" | "priced" | "done" | "failed";

export interface GreenJob {
  id: number;
  state: GreenState;
  step: string;
  /** "Write it for me": the run stops once the list is written. */
  writeOnly?: boolean;
  params: Record<string, string | undefined>;
  /** The list a write made, for the page to put in its boxes. */
  written?: { title: string; items: string[] };
  /** Your video or the presenter's: Open the editor finds it there. */
  who?: GreenWho;
  error?: string;
  refused?: boolean;
  capped?: boolean;
  /** A paid presenter video is waiting on this device: Try again at no cost picks it up. */
  waiting?: boolean;
  /** The demo or picture left this device. */
  gone?: boolean;
}

let job: GreenJob | null = null;
let seq = 0;
const listeners = new Set<(j: GreenJob | null) => void>();

function mirror(j: GreenJob | null) {
  if (!j || j.state === "written" || (j.writeOnly && j.state === "failed")) return clearFormatJob(SLUG);
  setFormatJob({
    slug: SLUG,
    label: "Green screen",
    format: "video",
    state: j.state === "failed" ? "failed" : j.state === "done" ? "ready" : "working",
    ...(j.state === "failed" ? { error: j.error } : { step: j.state === "priced" ? "Waiting for you to check the price" : j.step.replace(/\.\.\.$/, "") }),
    href: j.state === "joining" || j.state === "done" ? links.edit() : links.makeFormat(SLUG, j.params),
  });
}
const set = (next: GreenJob | null) => {
  job = next;
  mirror(job);
  listeners.forEach((l) => l(job && { ...job }));
};
const mine = (id: number, patch: Partial<GreenJob>) => void (job?.id === id && set({ ...job, ...patch }));

export const greenJob = () => job;
export const greenBusy = () => !!job && ["writing", "drawing", "joining", "talking"].includes(job.state);
export function onGreenJob(fn: (j: GreenJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** A failed write's line: the spec's own for a refusal, the server's for the cap or the gate, else Try again. */
function listFailure(e: unknown): Pick<GreenJob, "error" | "refused" | "capped"> {
  if (e instanceof EdgeError && e.status === 422 && e.code === "refused") return { error: LIST_REFUSED, refused: true };
  return failure(e, LIST_FAILED);
}

async function write(userId: string, a: Pick<GreenAsk, "source" | "title" | "mention">, from: "source" | "topic"): Promise<{ title: string; items: string[]; caption: string; flags: Flags }> {
  const t = a.title.trim();
  const res = await requestMake(makeBody(userId, { source: from === "source" ? a.source : null, topic: from === "topic" ? t : "", note: from === "source" ? t : "", mention: a.mention, size: "9x16" }, "notes"));
  if (res?.result?.as !== "notes") throw new Error(LIST_FAILED);
  const out = { title: stripDashes(res.result.title).trim(), items: res.result.items.map((i) => stripDashes(i).trim()).slice(0, NOTE_ITEMS) };
  // the boxes show it now, and a reload or another page keeps it
  saveTyped(userId, { ...loadTyped(userId), ...out });
  return { ...out, caption: stripDashes(res.result.caption).trim(), flags: res.flags };
}

/** "Write it for me": the list only, into the boxes. */
export async function writeList(userId: string, a: Pick<GreenAsk, "source" | "title" | "mention" | "who" | "behind" | "stand">): Promise<void> {
  if (greenBusy() || !canWriteList(a.title, a.source)) return;
  const id = ++seq;
  set({ id, state: "writing", step: WRITING, writeOnly: true, params: greenParams(a) });
  try {
    const w = await write(userId, a, a.source ? "source" : "topic");
    mine(id, { state: "written", step: "", written: { title: w.title, items: w.items } });
  } catch (e) {
    mine(id, { state: "failed", step: "", ...listFailure(e) });
  }
}

/** The note as a PNG at 1080x1920, drawn on this device. */
async function drawNote(note: { title: string; items: string[] }): Promise<Blob> {
  const img = new Image();
  img.src = svgDataUrl(noteSvg(layoutNote(note, createCanvasMeasure())));
  await img.decode();
  const c = document.createElement("canvas");
  c.width = NOTE_W;
  c.height = NOTE_H;
  c.getContext("2d")!.drawImage(img, 0, 0, NOTE_W, NOTE_H);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(DRAW_FAILED))), "image/png"));
}

/** One press: the list (written when empty), what goes behind, then your video to the editor or the presenter's run. */
export async function startGreen(userId: string, a: GreenAsk): Promise<void> {
  if (greenBusy()) return;
  const id = ++seq;
  const params = greenParams(a);
  const fail = (patch: Partial<GreenJob>) => mine(id, { state: "failed", step: "", ...patch });
  const plan = a.behind === "notes" ? listPlan(a, a.source) : null;
  // the first step shown: a presenter's run is "talking" until its clip is being put together, which opens the editor
  const first: Pick<GreenJob, "state" | "step"> =
    plan ? { state: "writing", step: WRITING }
    : a.behind === "notes" ? { state: "drawing", step: DRAWING }
    : a.who === "presenter" ? { state: "talking", step: "" }
    : { state: "joining", step: JOINING };
  set({ id, ...first, params, who: a.who });
  if (a.who === "presenter" && (talkBusy() || aiBusy() || pendingAvatar())) return fail({ error: OTHER_VIDEO });

  let key = a.pick?.key ?? "";
  let said: { caption?: string; flags?: Flags } = {};
  if (a.behind === "notes") {
    let note = { title: a.title.trim(), items: noteItems(a.items) };
    if (plan) {
      try {
        const w = await write(userId, a, plan);
        note = { title: w.title, items: w.items };
        said = w;
        mine(id, { written: note });
      } catch (e) {
        return fail(listFailure(e));
      }
    }
    mine(id, { state: "drawing", step: DRAWING });
    try {
      key = bdKey();
      await putFile(key, await drawNote(note));
    } catch {
      return fail({ error: DRAW_FAILED });
    }
  } else if (a.pick?.kind !== a.behind || !(await getFile(key).catch(() => undefined))) {
    return fail({ error: BEHIND_GONE, gone: true });
  }

  const extra = greenExtra({ backdrop: backdropOf(a.behind, key), stand: a.stand, caption: said.caption, note: noteOf(a.source, said.flags), source: a.source });
  if (a.who === "mine") {
    if (!a.mine) return fail({ error: "Pick a video of you first." });
    mine(id, { state: "joining", step: JOINING });
    await handToEditor(a.mine, extra, "Putting your green screen together");
    return mine(id, { state: "done", step: "" });
  }
  mine(id, { state: "talking", step: "" });
  const t: TalkAsk = { source: a.source, text: a.talk.text, who: "presenter", photo: null, look: a.talk.look, setting: a.talk.setting, voice: a.talk.voice, length: a.talk.length, mention: a.mention };
  follow(id, greenAdd(extra), () => void startTalk(userId, t));
}

/** "Make it for US$x" at the talking head's price check. */
export const goOn = (userId: string) => (job?.state === "priced" ? goOnAtPrice(userId) : Promise.resolve());

/**
 * Mirrors the presenter's talking head run until it ends. Once its paid clip is pending on this device, this page's
 * extra goes onto that clip's join (addToJoin), so the editor opens it as a green screen even after a reload.
 */
function follow(id: number, add: JoinExtra, start: () => void): void {
  const before = talkJob()?.id ?? -1;
  const off = onTalkJob((t: TalkJob | null) => {
    if (job?.id !== id) return off();
    // the run was given up at its price check (Shorten the script): this one goes too
    if (!t) return void (off(), set(null));
    if (t.id <= before || t.writeOnly) return;
    const p = pendingAvatar();
    if (p && ownsPending(p) && joinAdd()?.name !== p.name) addToJoin(p.name, TALK_TOAST, add);
    if (t.state === "failed") {
      off();
      // nothing paid is waiting: the add would only land on someone's next talking head
      if (!t.waiting && joinAdd()?.extra.toast === GREEN_TOAST) dropJoinAdd();
      return mine(id, { state: "failed", step: "", error: t.error, refused: t.refused, capped: t.capped, waiting: t.waiting });
    }
    if (t.state === "done") return void (off(), mine(id, { state: "done", step: "" }));
    mine(id, t.state === "priced" ? { state: "priced", step: "" } : { state: t.state === "joining" ? "joining" : "talking", step: t.step });
  });
  start();
}

/** A presenter green screen paid for but never put together (a reload): picked up at no cost. True when it started. */
export function resumeGreen(userId: string, params: Record<string, string | undefined> = {}): boolean {
  const p = pendingAvatar();
  const add = joinAdd();
  if (greenBusy() || talkBusy() || aiBusy() || !p || !ownsPending(p) || add?.name !== p.name || add.extra.toast !== GREEN_TOAST) return false;
  const id = ++seq;
  set({ id, state: "talking", step: "", params, who: "presenter" });
  follow(id, add.extra, () => {
    if (!resumeTalk(userId)) mine(id, { state: "failed", step: "", error: OTHER_VIDEO, waiting: true });
  });
  return true;
}
