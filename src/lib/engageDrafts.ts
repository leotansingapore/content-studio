// Engage (/recruit/engage), the drafts: comments and messages the consultant
// pastes in and copies out (src/lib/engage.ts is the separate "Engage this
// week" list on Following). The app never posts, comments or messages
// (docs/social-api-app-review.md). Server: supabase/functions/engage-assist.
//
// The last run of each tool, with what was pasted, stays on this device only
// (it holds other people's names and words):
//   key: cs-engage-${tool}-${scoped(userId)}
// A run keeps going when the page is left, and lands in storage when it ends.
//
// Who you commented on (a comment copied from Engage counts), per profile and
// synced across devices, so the same few people don't get a comment every day:
//   key: content-studio-commentlog-${scoped(userId)}

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { addDays, localDateKey, weekOf } from "@/lib/dueDates";
import { MAX_ITEMS, MAX_POSTS, type Pasted } from "../../supabase/functions/engage-assist/logic.ts";

export {
  MAX_ITEMS,
  MAX_ITEM_CHARS,
  MAX_POST_CHARS,
  MAX_POSTS,
  NOTE_MAX,
  type CommentItem,
  type CommentKind,
  type CommentType,
  type ConnectDrafts,
  type ConnectGoal,
  type DmItem,
  type DmKind,
  type Pasted,
  type ReplyItem,
} from "../../supabase/functions/engage-assist/logic.ts";

/**
 * Pasted text as separate comments: split on blank lines, or on every line
 * when there are none. "Name: text" gives the name when the part before the
 * colon looks like one (a capital, a letter with no case such as Chinese, or @
 * first; four words at most).
 */
export function splitPasted(raw: string): Pasted[] {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return [];
  const blocks = /\n[ \t]*\n/.test(text) ? text.split(/\n[ \t]*\n/) : text.split("\n");
  return blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      // a colon straight before a digit or "//" is a time (3:30) or a link (https://), not a name
      const m = /^([^:\n]{1,40}):(?!\d|\/\/)[ \t]*(\S[\s\S]*)$/.exec(b);
      const name = m?.[1].trim() ?? "";
      if (m && /^[@\p{Lu}\p{Lo}]/u.test(name) && name.split(/\s+/).length <= 4) return { name: name.replace(/^@/, ""), text: m[2].trim() };
      return { name: "", text: b };
    });
}

export type EngageTool = "replies" | "dms" | "comments" | "connect";

/** A tool's last run: what was pasted and the drafts that came back. */
export interface Run<T> {
  /** The post the comments sit under (replies only). */
  post: string;
  pasted: string;
  /** The posts to comment on, one slot each (comments only). */
  posts: Pasted[];
  /** Named fields (connect: name, about, reason, goal, accepted). */
  form: Record<string, string>;
  items: T[];
  /** When the drafts came back; "" before the first run. */
  at: string;
}

const emptyRun = { post: "", pasted: "", posts: [], form: {}, items: [], at: "" };

const keyFor = (tool: EngageTool, userId: string) => `cs-engage-${tool}-${scoped(userId)}`;

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadRun<T>(tool: EngageTool, userId: string | null | undefined): Run<T> {
  if (!userId) return emptyRun;
  try {
    const v = JSON.parse(store()?.getItem(keyFor(tool, userId)) ?? "null");
    if (!v || typeof v !== "object") return emptyRun;
    return {
      post: typeof v.post === "string" ? v.post : "",
      pasted: typeof v.pasted === "string" ? v.pasted : "",
      posts: Array.isArray(v.posts) ? v.posts.filter((p: Pasted) => p && typeof p.text === "string").map((p: Pasted) => ({ name: String(p.name ?? ""), text: p.text })) : [],
      form: v.form && typeof v.form === "object" ? Object.fromEntries(Object.entries(v.form).filter(([, x]) => typeof x === "string")) as Record<string, string> : {},
      items: Array.isArray(v.items) ? v.items : [],
      at: typeof v.at === "string" ? v.at : "",
    };
  } catch {
    return emptyRun;
  }
}

export function saveRun<T>(tool: EngageTool, userId: string, run: Run<T>): Run<T> {
  try {
    store()?.setItem(keyFor(tool, userId), JSON.stringify(run));
  } catch {
    // storage full: the run still shows for this visit
  }
  return run;
}

export type EngageOutcome = { kind: "ok" } | { kind: "limit" | "error"; message: string };

const running = new Map<string, Promise<EngageOutcome>>();

/** The run still going for this tool, if one is. */
export const runningJob = (tool: EngageTool, userId: string) => running.get(keyFor(tool, userId));

const FAILED = "Couldn't write the replies right now. Try again in a minute.";

/** What a tool sends: the pasted text split into items, or the filled post slots. */
export function requestBody(tool: EngageTool, input: Pick<Run<unknown>, "post" | "pasted" | "posts" | "form">) {
  if (tool === "connect") {
    const f = input.form;
    return { mode: tool, name: f.name ?? "", about: f.about ?? "", reason: f.reason ?? "", goal: f.goal ?? "know" };
  }
  if (tool === "comments") return { mode: tool, posts: input.posts.filter((p) => p.text.trim()).slice(0, MAX_POSTS) };
  const list = splitPasted(input.pasted).slice(0, MAX_ITEMS);
  return tool === "replies" ? { mode: tool, post: input.post, comments: list } : { mode: tool, messages: list };
}

/** Sorts and drafts what was pasted; the result is saved even if the page was left meanwhile. */
export function startRun(tool: EngageTool, userId: string, input: Pick<Run<unknown>, "post" | "pasted" | "posts" | "form">): Promise<EngageOutcome> {
  const key = keyFor(tool, userId);
  const body = requestBody(tool, input);
  const job = callFn<{ items?: unknown[]; drafts?: unknown }>("engage-assist", body, FAILED)
    .then((res): EngageOutcome => {
      // connect answers with one set of drafts, the rest with a list
      const items = tool === "connect" ? (res?.drafts && typeof res.drafts === "object" ? [res.drafts] : null) : res?.items;
      if (!Array.isArray(items)) return { kind: "error", message: FAILED };
      saveRun(tool, userId, { ...loadRun(tool, userId), items, at: new Date().toISOString() });
      return { kind: "ok" };
    })
    .catch((e): EngageOutcome => {
      const limit = e instanceof EdgeError && (e.status === 429 || e.code === "daily_limit");
      return { kind: limit ? "limit" : "error", message: e instanceof Error ? e.message : FAILED };
    })
    .finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

// ---- Who you commented on this week ---------------------------------------------

export interface LogEntry {
  id: string;
  /** Whose post, as typed ("" when no name was given). */
  name: string;
  /** The post's first words, to tell entries apart. */
  post: string;
  at: string;
}

const LOG_KEY = "content-studio-commentlog-";
const LOG_KEEP_DAYS = 56;
const LOG_MAX = 300;

export function loadLog(userId: string | null | undefined): LogEntry[] {
  if (!userId) return [];
  try {
    const v = JSON.parse(store()?.getItem(LOG_KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.at === "string" && typeof e.name === "string") : [];
  } catch {
    return [];
  }
}

function saveLog(userId: string, entries: LogEntry[]): LogEntry[] {
  try {
    store()?.setItem(LOG_KEY + scoped(userId), JSON.stringify(entries));
  } catch {
    // storage full: the log still shows for this visit
  }
  return entries;
}

const sameName = (a: string, b: string) => a.trim().replace(/^@/, "").toLowerCase() === b.trim().replace(/^@/, "").toLowerCase();

/**
 * Notes a comment copied for someone's post. Copying a second option for the
 * same post the same day is not a second comment. Entries older than 8 weeks go.
 */
export function logComment(userId: string, name: string, post: string, now = new Date()): LogEntry[] {
  const snippet = post.trim().replace(/\s+/g, " ").slice(0, 80);
  const today = localDateKey(now);
  const cutoff = now.getTime() - LOG_KEEP_DAYS * 86_400_000;
  const kept = loadLog(userId).filter((e) => new Date(e.at).getTime() >= cutoff);
  if (kept.some((e) => sameName(e.name, name) && e.post === snippet && localDateKey(new Date(e.at)) === today)) return kept;
  const entry: LogEntry = { id: `c${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim().slice(0, 60), post: snippet, at: now.toISOString() };
  return saveLog(userId, [entry, ...kept].slice(0, LOG_MAX));
}

export const unlog = (userId: string, id: string) => saveLog(userId, loadLog(userId).filter((e) => e.id !== id));

/** This week's entries (Monday first, the consultant's own days), newest first. */
export function thisWeek(entries: LogEntry[], now = new Date()): LogEntry[] {
  const days = new Set(weekOf(localDateKey(now)));
  return entries.filter((e) => days.has(localDateKey(new Date(e.at)))).sort((a, b) => b.at.localeCompare(a.at));
}

/** How many times this week you commented on this name's posts. */
export const timesThisWeek = (entries: LogEntry[], name: string, now = new Date()) =>
  name.trim() ? thisWeek(entries, now).filter((e) => sameName(e.name, name)).length : 0;

// ---- Connection note follow-ups ---------------------------------------------------

/** The first message goes a day after they accept; the follow-ups 4 and 10 days after that. */
export function followUpDates(accepted: string): { first: string; day4: string; day10: string } {
  const first = addDays(accepted, 1);
  return { first, day4: addDays(first, 4), day10: addDays(first, 10) };
}

/** The calendar note for a follow-up, e.g. "Follow up with Sarah Chen (1 of 2)". */
export const followUpTitle = (name: string, n: 1 | 2) => `Follow up with ${name.trim().slice(0, 50)} (${n} of 2)`;
