// Engage (/recruit/engage), the drafts: comments and messages the consultant
// pastes in and copies out (src/lib/engage.ts is the separate "Engage this
// week" list on Following). The app never posts, comments or messages
// (docs/social-api-app-review.md). Server: supabase/functions/engage-assist.
//
// The last run of each tool, with what was pasted, stays on this device only
// (it holds other people's names and words):
//   key: cs-engage-${tool}-${scoped(userId)}
// A run keeps going when the page is left, and lands in storage when it ends.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { MAX_ITEMS, type Pasted } from "../../supabase/functions/engage-assist/logic.ts";

export {
  MAX_ITEMS,
  MAX_ITEM_CHARS,
  MAX_POST_CHARS,
  type CommentKind,
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
      const m = /^([^:\n]{1,40}):[ \t]*(\S[\s\S]*)$/.exec(b);
      const name = m?.[1].trim() ?? "";
      if (m && /^[@\p{Lu}\p{Lo}]/u.test(name) && name.split(/\s+/).length <= 4) return { name: name.replace(/^@/, ""), text: m[2].trim() };
      return { name: "", text: b };
    });
}

export type EngageTool = "replies" | "dms";

/** A tool's last run: what was pasted and the drafts that came back. */
export interface Run<T> {
  /** The post the comments sit under (replies only). */
  post: string;
  pasted: string;
  items: T[];
  /** When the drafts came back; "" before the first run. */
  at: string;
}

const emptyRun = { post: "", pasted: "", items: [], at: "" };

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

/** Sorts and drafts what was pasted; the result is saved even if the page was left meanwhile. */
export function startRun(tool: EngageTool, userId: string, pasted: string, post = ""): Promise<EngageOutcome> {
  const key = keyFor(tool, userId);
  const list = splitPasted(pasted).slice(0, MAX_ITEMS);
  const body = tool === "replies" ? { mode: tool, post, comments: list } : { mode: tool, messages: list };
  const job = callFn<{ items?: unknown[] }>("engage-assist", body, FAILED)
    .then((res): EngageOutcome => {
      if (!Array.isArray(res?.items)) return { kind: "error", message: FAILED };
      saveRun(tool, userId, { ...loadRun(tool, userId), items: res.items, at: new Date().toISOString() });
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
