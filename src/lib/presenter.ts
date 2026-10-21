// The presenter formats (docs/north-star/items/formats-presenter.md): You speaking's Format row, for Leo. News anchor,
// Stage talk and Spokesperson each pick the AI presenter's setting, the script "Write it for me" writes (ai-video
// talk-script) and what the editor adds: the news banner, an empty set behind your own photo, the offer's picture
// across the top or its name tag. Unboxing opens the Creator review template with the offer filled in once.
//   synced: content-studio-presenter-talk-<scoped uid>: { talk, offer? } the last format and offer (its place in the
//           brand kit, which gives offers no ids) per brand
//   device: cs-presenter-set-<news|stage>: the bd- file key of the empty set made for your own photo, reused free
// The script write and the set run here, outside React, so closing the AI panel keeps what they bring back.

import { loadBrand, MAX_OFFERS } from "@/lib/carousel";
import type { ComplianceFlag } from "@/lib/compliance";
import { putFile } from "@/lib/deviceFiles";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";
import { BANNER_MAX, newOverlay, type EditSettings } from "@/lib/videoEdit";
import type { JoinExtra } from "@/lib/videoMedia";
import { MAX_NOTES, type MediaState, type SetTalk, type SettingId, type Talk as ScriptTalk } from "../../supabase/functions/ai-video/logic.ts";

export type Talk = "plain" | ScriptTalk;
export type { SetTalk };
export const TALKS: Talk[] = ["plain", "news", "stage", "spokesperson"];
export const TALK_LABELS: Record<Talk, string> = { plain: "Plain", news: "News anchor", stage: "Stage talk", spokesperson: "Spokesperson" };
/** The template Unboxing opens. */
export const UNBOXING = "ugc-creator-review";
/** The AI presenter's setting per format (ai-video SETTINGS); Plain sends none, today's office. */
export const TALK_SETTING: Record<Talk, SettingId | undefined> = { plain: undefined, news: "news", stage: "stage", spokesperson: "bright" };
export const SET_LABELS: Record<SetTalk, string> = { news: "News studio", stage: "Stage" };
export const isSetTalk = (t: Talk): t is SetTalk => t === "news" || t === "stage";
/** The banner's block colour; the adviser can change it on the Stickers tab. */
export const BANNER_RED = "#D62828";

// ---------- the last format per brand (synced) ----------

export interface TalkPick {
  talk: Talk;
  offer?: number;
}

const talkKey = (userId: string) => `content-studio-presenter-talk-${scoped(userId)}`;
const isOffer = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < MAX_OFFERS;

export function loadTalk(userId: string): TalkPick {
  try {
    const r = JSON.parse(localStorage.getItem(talkKey(userId)) ?? "{}") ?? {};
    return { talk: TALKS.includes(r.talk) ? r.talk : "plain", ...(isOffer(r.offer) ? { offer: r.offer } : {}) };
  } catch {
    return { talk: "plain" };
  }
}

export function saveTalk(userId: string, p: TalkPick): void {
  try {
    localStorage.setItem(talkKey(userId), JSON.stringify({ talk: p.talk, ...(isOffer(p.offer) ? { offer: p.offer } : {}) }));
    globalThis.window?.dispatchEvent(new Event("content-studio-presenter-talk-changed"));
  } catch {
    // full storage: the pick holds for this visit
  }
}

// ---------- the brand kit's offers ----------

/** The offers' names by their place in the brand kit ("" where one has no name), so a place stays a place. */
export const offerNames = (userId: string): string[] => (loadBrand(userId)?.offers ?? []).map((o) => o.name.trim());

/** ?offer=<n>: the offer's name at that place, or null for anything else. */
export function offerAt(names: string[], raw: string | null): string | null {
  return raw !== null && /^\d$/.test(raw) ? names[Number(raw)] || null : null;
}

/** Spokesperson's offer: the link's, else the brand's last pick, else the first with a name; null with none. */
export function pickOffer(names: string[], raw: string | null, kept?: number): number | null {
  if (offerAt(names, raw)) return Number(raw);
  if (kept !== undefined && names[kept]) return kept;
  const first = names.findIndex(Boolean);
  return first < 0 ? null : first;
}

// ---------- what the editor adds ----------

/**
 * The hand-off for a format: the news banner from 0 to 4 s, the empty set behind your own photo, and the offer's
 * picture across the top (its device file key) or, without one, its name as the name tag's second line. Plain, or
 * nothing to add, hands nothing: today's video.
 */
export function talkExtra(a: { talk: Talk; headline?: string; setKey?: string | null; offer?: string | null; brand?: string; topKey?: string }): JoinExtra | undefined {
  const settings: Partial<EditSettings> = {};
  const headline = a.headline?.trim();
  if (a.talk === "news" && headline) settings.overlays = [{ ...newOverlay("banner", 0, BANNER_RED), text: headline.slice(0, BANNER_MAX) }];
  if (isSetTalk(a.talk) && a.setKey) settings.backdrop = { kind: "picture", key: a.setKey };
  const offer = a.offer?.trim();
  const band = a.talk === "spokesperson" && !!a.topKey;
  if (a.talk === "spokesperson" && !band && offer) {
    const brand = a.brand?.trim();
    Object.assign(settings, brand ? { nameTag: brand.slice(0, 40), roleTag: offer.slice(0, 50) } : { nameTag: offer.slice(0, 40) });
  }
  const extra: JoinExtra = { ...(Object.keys(settings).length ? { settings } : {}), ...(band ? { topKey: a.topKey } : {}) };
  return Object.keys(extra).length ? extra : undefined;
}

/** Jev's MAS answer as a warn chip beside scanCompliance's, which stays the check when Jev gave nothing. */
export const MAS_FLAG: ComplianceFlag = {
  id: "mas",
  ruleId: "mas",
  severity: "warn",
  match: "MAS",
  message: "A line may promise a result, name an insurer or tell the viewer what to buy. Read it before you post.",
};

/** The setting the last presenter picture was made in, so one from another format is never used for this one. */
let madeIn: SettingId = "office";
export const notePresenter = (setting: SettingId | undefined) => void (madeIn = setting ?? "office");
export const presenterFits = (talk: Talk) => madeIn === (TALK_SETTING[talk] ?? "office");

// ---------- jobs outside React: the script and the set ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function store<T>() {
  let value: T | null = null;
  const listeners = new Set<(v: T | null) => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      listeners.forEach((l) => l(value));
    },
    on: (fn: (v: T | null) => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export const WRITE_FAILED = "Couldn't write the script. Try again in a minute.";

export interface TalkScript {
  id: number;
  talk: ScriptTalk;
  state: "writing" | "done" | "failed";
  /** The topic it was written from, so Write it again writes from the same one. */
  topic: string;
  say?: string;
  headline?: string;
  /** Jev's MAS answer: true warns, null means no answer (scanCompliance alone). */
  mas?: boolean | null;
  error?: string;
}

const scripts = store<TalkScript>();
let seq = 0;
let taken = 0;
export const talkScript = scripts.get;
export const onTalkScript = scripts.on;
/** A finished script not yet put in a script box, once: the box open now, or the next one if the panel was closed. */
export function takeScript(): TalkScript | null {
  const s = scripts.get();
  if (s?.state !== "done" || s.id === taken) return null;
  taken = s.id;
  return s;
}

/** "Write it for me": the format's script from a topic, with the offer's name for Spokesperson. */
export async function writeTalkScript(a: { talk: ScriptTalk; topic: string; offer?: string | null }): Promise<void> {
  if (scripts.get()?.state === "writing") return;
  const id = ++seq;
  const base = { id, talk: a.talk, topic: a.topic };
  scripts.set({ ...base, state: "writing" });
  // Leo's facts and learnings for videos (brand-voice-memory); ai-video prints them after the topic
  let notes = "";
  try {
    const me = await leoUser();
    notes = me ? memoryLine(me.id, "videos", MAX_NOTES) : "";
  } catch {
    // a session that can't be read is not Leo's
  }
  try {
    const r = await callFn<{ say: string; headline?: string; mas?: boolean | null }>(
      "ai-video",
      { mode: "talk-script", talk: a.talk, topic: a.topic, ...(a.talk === "spokesperson" && a.offer ? { offer: { name: a.offer } } : {}), ...(notes ? { notes } : {}) },
      WRITE_FAILED,
    );
    scripts.set({ ...base, state: "done", say: r.say, headline: r.headline ?? "", mas: r.mas ?? null });
  } catch (e) {
    scripts.set({ ...base, state: "failed", error: (e as Error).message || WRITE_FAILED });
  }
}

export const SET_FAILED = "Couldn't make the set. Your own background stays.";

export interface SetJob {
  talk: SetTalk;
  state: "working" | "done" | "failed";
  key?: string;
  error?: string;
}

const sets = store<SetJob>();
export const presenterSet = sets.get;
export const onPresenterSet = sets.on;

const setKey = (t: SetTalk) => `cs-presenter-set-${t}`;
/** The empty set made before for this format on this device, as a backdrop file key. */
export function savedSet(t: SetTalk): string | null {
  try {
    const k = localStorage.getItem(setKey(t));
    return k && /^bd-[a-z0-9-]{4,60}$/.test(k) ? k : null;
  } catch {
    return null;
  }
}

/** The set's picture link once Higgsfield has made it (a few seconds to a minute). */
async function pictureOf(token: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    // a dropped status check is retried on the next round
    const r = await callFn<{ jobs: MediaState[] }>("ai-video", { mode: "status", tokens: [token] }).catch(() => null);
    const j = r?.jobs?.[0];
    if (j?.state === "done") return j.url;
    if (j?.state === "failed") throw new Error(SET_FAILED);
  }
  throw new Error(SET_FAILED);
}

/** One empty news studio or stage, kept on this device under a bd- key so the next one is free. */
export async function makeSet(talk: SetTalk): Promise<void> {
  if (sets.get()?.state === "working") return;
  sets.set({ talk, state: "working" });
  try {
    const { token } = await callFn<{ token: string }>("ai-video", { mode: "set", talk }, SET_FAILED);
    const res = await fetch(await pictureOf(token)).catch(() => null);
    if (!res?.ok) throw new Error(SET_FAILED);
    const key = `bd-set-${talk}-${Date.now().toString(36)}`;
    await putFile(key, await res.blob());
    try {
      localStorage.setItem(setKey(talk), key);
    } catch {
      // the set still goes behind this video; the next one makes it again
    }
    sets.set({ talk, state: "done", key });
  } catch (e) {
    // the server's own words for a used-up cap or a refusal; anything else is the set's line
    const own = e instanceof EdgeError && (e.status === 429 || e.status === 403);
    sets.set({ talk, state: "failed", error: own ? e.message : SET_FAILED });
  }
}
