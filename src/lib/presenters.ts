// Saved AI presenters per brand (people-presenters, Leo only): up to 4 invented Singaporeans made by ai-video mode
// presenters, the brand's "Who appears" choice and the chips a new presenter starts from. Synced per brand. Each
// presenter keeps Higgsfield's link and a 540x960 JPEG copy for when the link stops answering (decision 10). Removing
// one writes status "off" and drops its picture: the name and look stay, so a label can still name it, and the row
// stays small (cloudSync has no tombstones, so a deletion is never the only record).

import { scoped } from "@/lib/profiles";
import { MAX_EXTRA, PRESENTER_PREFS, type PresenterPrefs } from "../../supabase/functions/ai-video/logic.ts";

export { MAX_EXTRA, PRESENTER_PREFS, type PresenterPrefs } from "../../supabase/functions/ai-video/logic.ts";

export const PRESENTERS_PREFIX = "content-studio-presenters-";
export const PRESENTERS_CHANGED = "content-studio-presenters-changed";
const keyOf = (userId: string) => `${PRESENTERS_PREFIX}${scoped(userId)}`;

export const MAX_ON = 4;
export const MAX_NAME = 24;
/** Four of these share one synced row per brand. */
export const MAX_PHOTO = 120_000;
/** Removed presenters kept for their names; the oldest go first. */
const MAX_OFF = 20;

export interface Presenter {
  /** "pr-<base36 time>" */
  id: string;
  name: string;
  /** The prompt text it was made from. */
  look: string;
  /** Higgsfield's https link. */
  url: string;
  /** A 540x960 JPEG data URL; "" once removed. */
  photo: string;
  createdAt: string;
  status: "on" | "off";
}

export interface Presenters {
  /** A presenter id, "me" (your saved face) or "ask". */
  who: string;
  prefs: PresenterPrefs & { extra?: string };
  items: Presenter[];
}

const EMPTY: Presenters = { who: "ask", prefs: {}, items: [] };
const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

function readItem(raw: Record<string, unknown>): Presenter | null {
  const p = {
    id: str(raw?.id, 40),
    name: str(raw?.name, MAX_NAME),
    look: str(raw?.look, 500),
    url: str(raw?.url, 1000),
    photo: typeof raw?.photo === "string" && (raw.photo === "" || (raw.photo.length <= MAX_PHOTO && JPEG_URL.test(raw.photo))) ? raw.photo : null,
    createdAt: str(raw?.createdAt, 40),
    status: raw?.status === "on" || raw?.status === "off" ? raw.status : null,
  };
  if (!p.id || !/^pr-[a-z0-9]+$/.test(p.id) || !p.name?.trim() || !p.look || !p.url || !/^https:\/\//.test(p.url) || p.photo === null || !p.createdAt || !p.status) return null;
  if (p.status === "on" && !p.photo) return null;
  return p as Presenter;
}

/** This brand's presenters; the empty record when there are none or they don't read. */
export function loadPresenters(userId: string): Presenters {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "null");
  } catch {
    return EMPTY;
  }
  if (!raw || typeof raw !== "object") return EMPTY;
  const items = (Array.isArray(raw.items) ? raw.items : []).map(readItem).filter((p): p is Presenter => p !== null);
  const on = items.filter((p) => p.status === "on").slice(0, MAX_ON);
  const kept = items.filter((p) => p.status === "off" || on.includes(p));
  const given = (raw.prefs ?? {}) as Record<string, unknown>;
  const prefs: Presenters["prefs"] = {};
  for (const [k, values] of Object.entries(PRESENTER_PREFS)) if ((values as readonly unknown[]).includes(given[k])) (prefs as Record<string, unknown>)[k] = given[k];
  const extra = str(given.extra, MAX_EXTRA);
  if (extra) prefs.extra = extra;
  const who = typeof raw.who === "string" && (raw.who === "me" || on.some((p) => p.id === raw.who)) ? raw.who : "ask";
  return { who, prefs, items: kept };
}

/** The presenters to offer: on, oldest first. */
export const onPresenters = (p: Presenters) => p.items.filter((x) => x.status === "on");

type Saved = { ok: true; presenters: Presenters } | { ok: false; error: string };

function write(userId: string, p: Presenters): Saved {
  const off = p.items.filter((x) => x.status === "off");
  const next = { ...p, items: p.items.filter((x) => x.status === "on" || off.indexOf(x) >= off.length - MAX_OFF) };
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(next));
  } catch {
    return { ok: false, error: "This device is out of room, so that wasn't saved. Clear some space, then try again." };
  }
  window.dispatchEvent(new Event(PRESENTERS_CHANGED));
  return { ok: true, presenters: next };
}

export const FULL = `You have ${MAX_ON} presenters. Remove one to make another.`;

/** Keeps a picked presenter. The brand's first one becomes its "Who appears" choice, unless that is your own face. */
export function keepPresenter(userId: string, x: { name: string; look: string; url: string; photo: string }, now = new Date()): Saved & { presenter?: Presenter } {
  const p = loadPresenters(userId);
  const on = onPresenters(p);
  if (on.length >= MAX_ON) return { ok: false, error: FULL };
  if (x.photo.length > MAX_PHOTO || !JPEG_URL.test(x.photo)) return { ok: false, error: "That picture is too big to save. Make it again." };
  const presenter: Presenter = {
    id: `pr-${now.getTime().toString(36)}`,
    name: x.name.trim().slice(0, MAX_NAME) || "Presenter",
    look: x.look,
    url: x.url,
    photo: x.photo,
    createdAt: now.toISOString(),
    status: "on",
  };
  const who = !on.length && p.who !== "me" ? presenter.id : p.who;
  const saved = write(userId, { ...p, who, items: [...p.items, presenter] });
  return saved.ok ? { ...saved, presenter } : saved;
}

export function renamePresenter(userId: string, id: string, name: string): Saved {
  const p = loadPresenters(userId);
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) return { ok: false, error: "Give your presenter a name." };
  return write(userId, { ...p, items: p.items.map((x) => (x.id === id ? { ...x, name: clean } : x)) });
}

/** Off, with its picture dropped; the brand's choice falls back to Ask each time when it was this one. */
export function removePresenter(userId: string, id: string): Saved {
  const p = loadPresenters(userId);
  return write(userId, {
    ...p,
    who: p.who === id ? "ask" : p.who,
    items: p.items.map((x) => (x.id === id ? { ...x, status: "off" as const, photo: "" } : x)),
  });
}

/** The brand's "Who appears": a presenter that is on, "me" or "ask". */
export function setWho(userId: string, who: string): Saved {
  const p = loadPresenters(userId);
  if (who !== "me" && who !== "ask" && !onPresenters(p).some((x) => x.id === who)) return { ok: false, error: "That presenter is no longer here." };
  return write(userId, { ...p, who });
}

export function savePrefs(userId: string, prefs: Presenters["prefs"]): Saved {
  return write(userId, { ...loadPresenters(userId), prefs });
}

/** Re-reads on a save here, in another tab or from sync. */
export function onPresentersChanged(fn: () => void): () => void {
  const storage = (e: StorageEvent) => (e.key === null || e.key.startsWith(PRESENTERS_PREFIX)) && fn();
  window.addEventListener(PRESENTERS_CHANGED, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(PRESENTERS_CHANGED, fn);
    window.removeEventListener("storage", storage);
  };
}

// ---------- a name to start from ----------

const NAMES: Record<string, Record<"woman" | "man", string[]>> = {
  Chinese: { woman: ["Mei", "Hui Min", "Jia Yi"], man: ["Wei Jie", "Jun Hao", "Kai"] },
  Malay: { woman: ["Aisha", "Nurul", "Siti"], man: ["Hafiz", "Irfan", "Danial"] },
  Indian: { woman: ["Priya", "Kavya", "Divya"], man: ["Raj", "Arjun", "Vikram"] },
  Eurasian: { woman: ["Sarah", "Chloe", "Natalie"], man: ["Daniel", "Marcus", "Ryan"] },
};

/** A Singaporean first name that fits the look and isn't already one of this brand's presenters. */
export function nameFor(look: string, taken: string[]): string {
  const m = /^An? (Chinese|Malay|Indian|Eurasian) Singaporean (woman|man)\b/.exec(look);
  const list = m ? NAMES[m[1]][m[2] as "woman" | "man"] : ["Mei", "Raj", "Aisha", "Daniel"];
  return list.find((n) => !taken.includes(n)) ?? list[0];
}
