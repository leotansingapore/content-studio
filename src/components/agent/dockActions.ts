// Copied from src/components/feedback/AssistantDock.tsx (itself a copy of github.com/leotansingapore/feedback-board's
// client/AssistantDock.tsx, which this repo never edits): the feedback service's chat call (`send`) and `runAction`,
// so the agent asks the service and renders its chips exactly as today's dock does. Keep the two in step by hand
// when feedback-board changes them. Only the React state around them is left behind: each returns its line instead.

import { FEEDBACK_API, FEEDBACK_BOARD_KEY } from "@/components/feedback/config";
import { loadThreads } from "@/lib/agentThreads";

export type DockIdentity = { id: string; name?: string | null; email?: string | null };

/** A chip the feedback service returns: post to the board, message the team, or open a page. */
export type DockAction =
  | { type: "feedback"; category: "feature" | "improvement" | "bug" | "question"; title: string; body: string; label: string }
  | { type: "support"; message: string; label: string }
  | { type: "go"; path: string; label: string };

export interface FeedbackAnswer {
  /** assistant_events id, for thumbs. */
  id: string | null;
  text: string;
  actions: DockAction[];
}

const base = FEEDBACK_API.replace(/\/$/, "");

function storage(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* blocked storage */
  }
  return null;
}

function voterId(identity?: DockIdentity) {
  if (identity?.id) return identity.id;
  let t = storage("fb_voter");
  if (!t) {
    t = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    storage("fb_voter", t);
  }
  return t;
}

const headers = (identity?: DockIdentity) => ({ "Content-Type": "application/json", "X-Board-Key": FEEDBACK_BOARD_KEY, "X-Voter": voterId(identity) });

/**
 * Only a same-origin path ever navigates or renders as a link: one leading "/" not followed by "/" or "\", and no
 * whitespace or control character anywhere, since browsers drop a tab or newline and "/\t/x" would become "//x"
 * (ideasInbox.ts safeLink's rule, plus DEL).
 */
export const isAppPath = (path: string) => /^\/(?![/\\])[^\s\x00-\x1f\x7f]*$/.test(path);

/**
 * The feedback service's answer to the last 12 messages, as the dock's `send` asks it. Throws an Error holding the
 * line to show ("The assistant is not answering right now.") when the service refuses.
 */
export async function askFeedback(
  messages: { role: "user" | "assistant"; text: string }[],
  o: { thread: string; identity?: DockIdentity; page?: string | null },
): Promise<FeedbackAnswer> {
  const res = await fetch(`${base}/assistant/chat`, {
    method: "POST",
    headers: headers(o.identity),
    body: JSON.stringify({
      messages: messages.slice(-12).map((m) => ({ role: m.role, text: m.text })),
      page: o.page !== undefined ? o.page : typeof window !== "undefined" ? window.location.pathname : null,
      thread: o.thread,
      identity: o.identity ? { name: o.identity.name ?? null } : null,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; text?: string; actions?: DockAction[]; error?: string };
  if (!res.ok) throw new Error(data.error || "The assistant is not answering right now.");
  return { id: data.id ?? null, text: data.text || "", actions: data.actions ?? [] };
}

/**
 * Runs one chip: a `go` opens the page (null back: nothing to show); a `feedback` posts to the board and a `support`
 * messages the team, each answering the outcome line the dock shows in place of the chip.
 */
export async function runAction(a: DockAction, o: { identity?: DockIdentity; navigate?: (path: string) => void } = {}): Promise<string | null> {
  if (a.type === "go") {
    if (!isAppPath(a.path)) return null;
    if (o.navigate) o.navigate(a.path);
    else window.location.assign(a.path);
    return null;
  }
  try {
    if (a.type === "feedback") {
      const res = await fetch(`${base}/posts`, {
        method: "POST",
        headers: headers(o.identity),
        body: JSON.stringify({ title: a.title, body: a.body, category: a.category, name: o.identity?.name ?? "", email: o.identity?.email ?? "", website: "" }),
      });
      const d = (await res.json().catch(() => ({}))) as { number?: number; error?: string };
      if (!res.ok || typeof d.number !== "number") throw new Error(d.error || "The board did not accept that.");
      return `Posted to the feedback board as #${d.number}.`;
    }
    const res = await fetch(`${base}/support`, {
      method: "POST",
      headers: headers(o.identity),
      body: JSON.stringify({ message: a.message, name: o.identity?.name ?? "", email: o.identity?.email ?? "", page: window.location.pathname, website: "" }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; replyTo?: string | null };
    if (!res.ok || !d.ok) throw new Error(d.error || "Could not send that.");
    return d.replyTo ? `Sent. The reply will come to ${d.replyTo}.` : "Sent to the team.";
  } catch (e) {
    return `That did not work: ${e instanceof Error ? e.message : "try again"}`;
  }
}

/** A go chip that posts to the board or messages the team rides in the thread as "fb:<the action>"; once run, "done:". */
export const FB = "fb:";
export const DONE = "done:";
export function chipAction(path: string): DockAction | null {
  if (!path.startsWith(FB)) return null;
  try {
    const a = JSON.parse(path.slice(FB.length)) as DockAction;
    return a && (a.type === "feedback" || a.type === "support") ? a : null;
  } catch {
    return null;
  }
}

/**
 * The agent engine's feedback hook (agentRun's setFeedback): a message no act fits goes to the service with the
 * thread's last 12 messages, and comes back as words and chips the thread can keep.
 */
export const feedbackFor =
  (identity?: DockIdentity) =>
  async (userId: string, threadId: string, text: string): Promise<{ text: string; go: { label: string; path: string }[] }> => {
    const said = (loadThreads(userId).find((t) => t.id === threadId)?.messages ?? []).flatMap((m) =>
      m.text ? [{ role: m.role === "user" ? ("user" as const) : ("assistant" as const), text: m.text }] : [],
    );
    if (said[said.length - 1]?.text !== text) said.push({ role: "user", text });
    const r = await askFeedback(said, { thread: threadId, identity });
    // a service "go" keeps only an app path: the say:, format:, forget: and fb: prefixes are the engine's alone
    const go = r.actions.flatMap((a) => (a.type !== "go" ? [{ label: a.label, path: FB + JSON.stringify(a) }] : isAppPath(a.path) ? [{ label: a.label, path: a.path }] : []));
    return { text: r.text, go };
  };
