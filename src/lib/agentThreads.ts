// The agent's chats (docs/north-star/items/agent-chat.md, "Data"): one synced array per brand, newest first, written
// whole, with the cards and receipts inside the messages (agentCards.ts).
//   content-studio-agent-threads-<scoped uid>: AgentThread[], at most MAX_THREADS threads of MAX_MSGS messages each and
//   MAX_CHARS of JSON in all (the oldest threads go first), so the synced row stays small.
// shortcut: one synced array, last write wins across devices; split per thread if Leo uses two devices at once.

import { newId, type AgentCard, type Receipt } from "@/lib/agentCards";
import { scoped } from "@/lib/profiles";
import { SAVE_FAILED, type Saved } from "@/lib/voiceMemory";

export const MAX_THREADS = 20;
export const MAX_MSGS = 60;
export const MAX_CHARS = 300_000;
export const MAX_TEXT = 2_000;
export const TITLE_CHARS = 48;
export const THREADS_CHANGED = "content-studio-agent-threads-changed";
export const GONE_LINE = "That chat was deleted.";
const PREFIX = "content-studio-agent-threads-";

export const threadsKey = (userId: string) => PREFIX + scoped(userId);

export type TurnState = "starting" | "thinking" | "writing" | "making" | "done" | "stopped" | "failed";
export type JobKind = "remix" | "slideshow" | "wall" | "talk" | "video" | "image" | "campaign";

export interface AgentMsg {
  id: string;
  at: string;
  role: "user" | "agent";
  /** MAX_TEXT characters at most. */
  text?: string;
  media?: { key: string; name: string }[];
  /** A remix source key. */
  source?: string;
  go?: { path: string; label: string }[];
  meta?: { steps: number; ms: number };
  turn?: TurnState;
  /** `name`: a made video's file name, which the editor's project takes, so Open finds that project (agentPlans madeOpen). */
  job?: { kind: JobKind; state: "running" | "done" | "failed"; drafts?: string[]; open?: string; title?: string; name?: string; startedAt: string; endedAt?: string };
  card?: AgentCard;
  receipt?: Receipt;
  error?: boolean;
  /** Its words quote text from outside the app (a competitor's ad, a page read), so it is never sent to the feedback service. */
  quotes?: true;
}

export interface AgentThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMsg[];
}

/** A new message with its id ("m" and base 36) and time. */
export const newMsg = (role: AgentMsg["role"], fields: Omit<Partial<AgentMsg>, "id" | "at" | "role"> = {}, now = new Date()): AgentMsg => ({
  ...fields,
  id: newId("m", now),
  at: now.toISOString(),
  role,
});

/** A chat's title from its first message: 48 characters at most, cut at a word. */
export function titleOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= TITLE_CHARS) return t || "New chat";
  const head = t.slice(0, TITLE_CHARS + 1);
  const space = head.lastIndexOf(" ");
  return space > 0 ? head.slice(0, space) : head.slice(0, TITLE_CHARS);
}

/** Newest first; MAX_THREADS threads of their newest MAX_MSGS messages, the oldest threads dropped until under MAX_CHARS. */
export function trimThreads(threads: AgentThread[]): AgentThread[] {
  const list = [...threads]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_THREADS)
    .map((t) => (t.messages.length > MAX_MSGS ? { ...t, messages: t.messages.slice(-MAX_MSGS) } : t));
  let size = JSON.stringify(list).length;
  while (size > MAX_CHARS && list.length > 1) size -= JSON.stringify(list.pop()).length + 1;
  return list;
}

const isThread = (t: unknown): t is AgentThread => {
  const r = t as AgentThread | null;
  return !!r && typeof r.id === "string" && typeof r.title === "string" && typeof r.updatedAt === "string" && Array.isArray(r.messages);
};

/** This brand's chats, newest first; empty on bad JSON. */
export function loadThreads(userId: string): AgentThread[] {
  try {
    const v = JSON.parse(localStorage.getItem(threadsKey(userId)) ?? "[]");
    return Array.isArray(v) ? v.filter(isThread) : [];
  } catch {
    return [];
  }
}

function save(userId: string, threads: AgentThread[]): boolean {
  try {
    localStorage.setItem(threadsKey(userId), JSON.stringify(trimThreads(threads)));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(THREADS_CHANGED));
  return true;
}

const clip = (m: AgentMsg): AgentMsg => (m.text && m.text.length > MAX_TEXT ? { ...m, text: m.text.slice(0, MAX_TEXT) } : m);

/** Saves `change` over one thread; `now` null keeps its place in the list (a rename). */
function edit(userId: string, threadId: string, change: (t: AgentThread) => AgentThread, now: Date | null): Saved<AgentThread> {
  const list = loadThreads(userId);
  const t = list.find((x) => x.id === threadId);
  if (!t) return { ok: false, error: GONE_LINE };
  const item = { ...change(t), ...(now ? { updatedAt: now.toISOString() } : {}) };
  return save(userId, list.map((x) => (x.id === threadId ? item : x))) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** A new chat holding `messages`, titled from its first user message unless `title` is given. */
export function newThread(userId: string, messages: AgentMsg[], now = new Date(), title?: string): Saved<AgentThread> {
  const at = now.toISOString();
  const item: AgentThread = {
    id: newId("t", now),
    title: titleOf(title ?? messages.find((m) => m.role === "user")?.text ?? ""),
    createdAt: at,
    updatedAt: at,
    messages: messages.map(clip),
  };
  return save(userId, [item, ...loadThreads(userId)]) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** A chat that opens with the agent's words, for "Ask about this" on a result; `quotes` when they quote outside text. */
export const seedThread = (userId: string, title: string, agentText: string, go: AgentMsg["go"] = [], now = new Date(), quotes = false): Saved<AgentThread> =>
  newThread(userId, [newMsg("agent", { text: agentText, ...(go.length ? { go } : {}), ...(quotes ? { quotes: true as const } : {}) }, now)], now, title);

export const appendMsg = (userId: string, threadId: string, msg: AgentMsg, now = new Date()): Saved<AgentThread> =>
  edit(userId, threadId, (t) => ({ ...t, messages: [...t.messages, clip(msg)] }), now);

/** Changes one message; refused when it is gone (trimmed, or the chat deleted). */
export function patchMsg(userId: string, threadId: string, msgId: string, patch: Partial<Omit<AgentMsg, "id">>, now = new Date()): Saved<AgentThread> {
  if (!loadThreads(userId).some((t) => t.id === threadId && t.messages.some((m) => m.id === msgId))) return { ok: false, error: GONE_LINE };
  return edit(userId, threadId, (t) => ({ ...t, messages: t.messages.map((m) => (m.id === msgId ? clip({ ...m, ...patch }) : m)) }), now);
}

export function renameThread(userId: string, threadId: string, title: string): Saved<AgentThread> {
  if (!title.trim()) return { ok: false, error: "Type a name first." };
  return edit(userId, threadId, (t) => ({ ...t, title: titleOf(title) }), null);
}

/** Rewrites the list without the chat (no tombstone); returns it for Undo, or null when it wasn't there or couldn't save. */
export function deleteThread(userId: string, threadId: string): AgentThread | null {
  const list = loadThreads(userId);
  const t = list.find((x) => x.id === threadId);
  return t && save(userId, list.filter((x) => x.id !== threadId)) ? t : null;
}

/** Undo for deleteThread: back in its place by updatedAt. */
export function restoreThread(userId: string, thread: AgentThread): Saved<AgentThread> {
  return save(userId, [thread, ...loadThreads(userId).filter((x) => x.id !== thread.id)]) ? { ok: true, item: thread } : { ok: false, error: SAVE_FAILED };
}

export function onThreadsChanged(cb: () => void): () => void {
  window.addEventListener(THREADS_CHANGED, cb);
  return () => window.removeEventListener(THREADS_CHANGED, cb);
}
