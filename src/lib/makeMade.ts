// The Made line in the agent's thread when a maker opened beside the chat saves (makeSkills.ts). The makers share no save
// event, so two signals are read and each new item lands once: Activity's log, where ActivityRecorder writes a row when
// a job someone ran ends (a remix, a picture, a slideshow, a video), and the maker's own address taking the id of what
// it saved (?draft=, ?image=, ?s=...), as the app's deep links do ("the address follows the post as it is saved").
// A watch lives for this tab, outside React, so a video that finishes after the panel closes still lands.

import { ACTIVITY_CHANGED, loadActivity, type ActivityEvent } from "@/lib/activity";
import { appendMsg, newMsg, newThread, type AgentMsg, type JobKind } from "@/lib/agentThreads";
import { getDraftById } from "@/lib/draftHistory";

/** The params a maker's address takes once it has saved something, in the order they name it. */
const ITEM_PARAMS = ["draft", "carousel", "image", "s", "clone", "p"];
const KINDS: ActivityEvent["kind"][] = ["make", "remix", "post"];
/** How long after the panel opened a make still counts as its own. */
export const WATCH_FOR = 30 * 60_000;

/** "draft=abc" for an address naming a saved item, else null. */
export function itemKey(path: string): string | null {
  const q = new URLSearchParams(path.split("?")[1] ?? "");
  const k = ITEM_PARAMS.find((p) => q.get(p));
  return k ? `${k}=${q.get(k)}` : null;
}

/** The item a maker's address gained since it opened, or null. */
export function savedItem(opened: string, now: string): string | null {
  const k = itemKey(now);
  return k && k !== itemKey(opened) ? k : null;
}

/** The job kind the thread draws a Made block with, by the skill's kind and where Open goes. */
export function jobKindOf(kind: string, open: string): JobKind {
  if (kind === "Video" || open.startsWith("/edit")) return "video";
  if (kind === "Static ads" || open.startsWith("/image") || open.startsWith("/media")) return "image";
  if (open.startsWith("/slideshow") || open.startsWith("/make/slideshow")) return "slideshow";
  return "remix";
}

export function madeMsg(s: { name: string; kind: string }, title: string, open: string, startedAt: string, now = new Date()): AgentMsg {
  const draft = new URLSearchParams(open.split("?")[1] ?? "").get("draft");
  return newMsg("agent", { job: { kind: jobKindOf(s.kind, open), state: "done", open, title: title || s.name, startedAt, endedAt: now.toISOString(), ...(draft ? { drafts: [draft] } : {}) } }, now);
}

interface Watch {
  userId: string;
  thread: string | null;
  skill: { name: string; kind: string };
  since: string;
  seen: Set<string>;
}
let watch: Watch | null = null;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
let listening = false;

function land(w: Watch, title: string, open: string, key: string, now = new Date()) {
  if (w.seen.has(key)) return;
  w.seen.add(key);
  const msg = madeMsg(w.skill, title, open, w.since, now);
  if (w.thread) {
    appendMsg(w.userId, w.thread, msg, now);
    return;
  }
  const t = newThread(w.userId, [msg], now, w.skill.name);
  if (t.ok) w.thread = t.item.id;
}

function onActivity() {
  const w = watch;
  if (!w) return;
  const now = Date.now();
  if (now - Date.parse(w.since) > WATCH_FOR) return void (watch = null);
  const months = [...new Set([w.since.slice(0, 7), new Date(now).toISOString().slice(0, 7)])];
  // what you ran; the agent's own makes already land as its cards' Made blocks
  for (const e of loadActivity(w.userId, months))
    if (e.who === "you" && KINDS.includes(e.kind) && e.link && e.at >= w.since) land(w, cap(e.title.replace(/^Made an? /, "")), e.link, itemKey(e.link) ?? e.id);
}

/** From now, a make you run lands in `thread` (a new chat when null) as a Made line. One watch at a time. */
export function watchMade(userId: string, thread: string | null, skill: { name: string; kind: string }, now = new Date()): void {
  watch = { userId, thread, skill, since: now.toISOString(), seen: watch?.thread === thread && watch.userId === userId ? watch.seen : new Set() };
  if (!listening && typeof window !== "undefined") {
    window.addEventListener(ACTIVITY_CHANGED, onActivity);
    listening = true;
  }
}

/** The maker's address moved: when it now names a saved item it didn't name on opening, that item lands. */
export function noteAddress(userId: string, opened: string, now: string): void {
  const w = watch;
  const key = savedItem(opened, now);
  if (!w || w.userId !== userId || !key) return;
  const draft = key.startsWith("draft=") ? getDraftById(userId, key.slice(6)) : null;
  land(w, draft?.hook?.trim() || w.skill.name, now, key);
}

/** For tests. */
export const watching = () => watch;
export const stopWatching = () => void (watch = null);
