// The agent's side of memory (north-star agent-memory, Leo only): forget or undo by saying it, "what do you remember
// about me", the nudge after the same change on 3 cards, and the "Following" line on a card. The learnings are
// brand-voice-memory's store (voiceMemory.ts); the corrections and dismissed nudges stay on this device. The engine
// (agentRun.ts) calls these and draws the receipts; nothing here calls a model.

import { loadCoachProfile } from "@/lib/coachProfile";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { activeLearnings, isOn, loadFacts, loadLearnings, setLearningOff, type Learning, type LearningScope } from "@/lib/voiceMemory";

/** How many learnings the agent sends Jev as l1 to l10, newest first. */
export const JEV_LEARNINGS = 10;
export const WHICH_ONE = "Which one should I forget?";
export const NOTHING_TO_UNDO = "There's nothing to undo here.";
export const LEARNING_RECORDED = "Learning recorded";
export const LEARNING_REMOVED = "Learning removed";
export const UNDO_LINE = "To undo: say undo, or tap Undo.";
export const SEE_LEARNED = { label: "See what the AI has learned", path: links.voice({ section: "learned" }) };
export const undidLine = (title: string) => `Undid: ${title}.`;
export const MEMORY_HEAD = "Here's what I follow when I make things:";
export const MEMORY_EMPTY = 'Nothing yet. Tell me something like "always end with a question" and I\'ll keep to it.';
export const FROM_COACH = "(from Coach)";

/** The scope as the card's question and the memory answer say it. */
export const scopeWords = (s: LearningScope) => (s === "all" ? "posts, videos and pictures" : s);

/** The learnings on now as the agent sends them to Jev ("<text> (<scope>)"); l1 is the first. */
export const learningLines = (rows: Learning[]) => activeLearnings(rows).slice(0, JEV_LEARNINGS).map((l) => `${l.text} (${l.scope})`);

/** Active video and all-scope learnings joined by "; ", newest first: Jev's video_preferences. */
export const videoPreferences = (learnings: Learning[]) =>
  activeLearnings(learnings)
    .filter((l) => l.scope === "videos" || l.scope === "all")
    .map((l) => l.text)
    .join("; ");

/** "Following: <learning>; <learning>" for up to 2 learnings on now in the make's scope or "all", or "". */
export function followingLine(learnings: Learning[], scope: Exclude<LearningScope, "all">): string {
  const on = activeLearnings(learnings).filter((l) => l.scope === scope || l.scope === "all").slice(0, 2);
  return on.length ? `Following: ${on.map((l) => l.text).join("; ")}` : "";
}

// ---------- forget and undo ----------

/** A thread message as far as memory needs it; agentThreads' AgentMsg fits. */
export interface MsgLike {
  id: string;
  receipt?: { title: string; undo?: unknown; undone?: string };
}

/** The newest receipt in the thread that can still be undone: Jev's last_change and forget's "last". */
export function lastUndoable(messages: MsgLike[]): { msg: string; title: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const r = messages[i].receipt;
    if (r?.undo && !r.undone) return { msg: messages[i].id, title: r.title };
  }
  return null;
}

export type ForgetResult =
  /** Switched off: receipt LEARNING_REMOVED / the text, whose Undo is setLearningOff(id, false). */
  | { kind: "removed"; learning: Learning }
  /** Run this receipt's Undo, then say undidLine(title). */
  | { kind: "undo"; msg: string; title: string }
  /** A chip's `which` goes straight back into forgetPick, with no second Jev call. */
  | { kind: "ask"; line: string; chips: { label: string; which: string }[] }
  | { kind: "nothing"; line: string }
  | { kind: "failed"; line: string };

/**
 * What the forget act does with Jev's `which`: "l<k>" (k 1 to 10, as learningLines sent them) or a chip's learning id
 * switches that learning off at once; "last" undoes the newest undoable receipt in the thread; anything else asks
 * with chips for the 3 newest learnings (or the last change when no learning is on).
 */
export function forgetPick(userId: string, which: string | null, messages: MsgLike[], now = new Date()): ForgetResult {
  const on = activeLearnings(loadLearnings(userId));
  const k = which?.match(/^l(\d{1,2})$/);
  const target = k ? (Number(k[1]) <= JEV_LEARNINGS ? on[Number(k[1]) - 1] : undefined) : on.find((l) => l.id === which);
  if (target) {
    const r = setLearningOff(userId, target.id, true, now);
    return r.ok === false ? { kind: "failed", line: r.error } : { kind: "removed", learning: r.item };
  }
  const last = lastUndoable(messages);
  if (which === "last" && last) return { kind: "undo", ...last };
  const chips = on.slice(0, 3).map((l) => ({ label: l.text, which: l.id }));
  if (!chips.length && last) chips.push({ label: last.title, which: "last" });
  return chips.length ? { kind: "ask", line: WHICH_ONE, chips } : { kind: "nothing", line: NOTHING_TO_UNDO };
}

// ---------- what do you remember ----------

/** The fixed answer to "what do you remember about me": up to 10 learnings on now, Coach's lists, the facts count. */
export function memoryAnswer(userId: string): string {
  const learned = activeLearnings(loadLearnings(userId))
    .slice(0, JEV_LEARNINGS)
    .map((l) => `- ${l.text} (${scopeWords(l.scope)})`);
  const coach = loadCoachProfile(userId);
  const fromCoach = [...coach.likes.map((x) => `- Lean into: ${x} ${FROM_COACH}`), ...coach.dislikes.map((x) => `- Steer clear of: ${x} ${FROM_COACH}`)];
  const facts = loadFacts(userId).filter(isOn).length;
  const factsLine = facts ? [`And ${facts} ${facts === 1 ? "fact" : "facts"} you gave me.`] : [];
  const lines = [...learned, ...fromCoach];
  return (lines.length ? [MEMORY_HEAD, ...lines, ...factsLine] : [MEMORY_EMPTY, ...factsLine]).join("\n");
}

// ---------- learning from corrections (device only) ----------

export interface Correction {
  kind: "format" | "face";
  from: string;
  to: string;
  card: string;
  at: string;
}
export type NudgeId = "video-carousel" | "video-script" | "face-mine" | "face-ai";
export interface Nudge {
  id: NudgeId;
  line: string;
  /** Saved with source "correction" on Remember. */
  learning: { text: string; scope: LearningScope };
}

const NUDGES: (Nudge & { kind: Correction["kind"]; from: string; to: string })[] = [
  { id: "video-carousel", kind: "format", from: "video", to: "carousel", line: "You often turn videos into carousels. Make carousels first?", learning: { text: "Make carousels unless I ask for something else.", scope: "all" } },
  { id: "video-script", kind: "format", from: "video", to: "script", line: "You often swap the video for a script you film. Start with scripts?", learning: { text: "Write scripts I film myself unless I ask for a video.", scope: "videos" } },
  { id: "face-mine", kind: "face", from: "ai", to: "mine", line: "You often switch to your own face. Use it every time?", learning: { text: "Use my own face in videos.", scope: "videos" } },
  { id: "face-ai", kind: "face", from: "mine", to: "ai", line: "You often switch to an AI presenter. Use one every time?", learning: { text: "Use an AI presenter in my videos.", scope: "videos" } },
];

export const KEEP_CORRECTIONS = 30;
const DAY = 86_400_000;
const NUDGE_WINDOW = 14 * DAY;
const NUDGE_OFF_FOR = 30 * DAY;
const correctionsKey = (userId: string) => `cs-agent-corrections-${scoped(userId)}`;
const nudgeOffKey = (userId: string) => `cs-agent-nudge-off-${scoped(userId)}`;
const VIDEO_FORMATS = new Set(["video", "speaking", "explainer"]);

/** Any video format counts as "video"; who appears is "mine" (the saved face) or "ai" (any presenter). */
const norm = (kind: Correction["kind"], v: string) => (kind === "face" ? (v === "mine" ? "mine" : "ai") : VIDEO_FORMATS.has(v) ? "video" : v);

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // device hints only: a full or blocked store just means no nudge
  }
}

export function loadCorrections(userId: string): Correction[] {
  const rows = readJson<unknown[]>(correctionsKey(userId), []);
  return (Array.isArray(rows) ? rows : []).filter(
    (c): c is Correction =>
      !!c && typeof c === "object" && ["format", "face"].includes((c as Correction).kind) && ["from", "to", "card", "at"].every((f) => typeof (c as Record<string, unknown>)[f] === "string"),
  );
}

/** Counts a change the person made on a card (Try another format, Who appears), the last 30 on this device. */
export function noteCorrection(userId: string, c: Omit<Correction, "at">, now = new Date()): void {
  const from = norm(c.kind, c.from);
  const to = norm(c.kind, c.to);
  if (from === to) return;
  writeJson(correctionsKey(userId), [...loadCorrections(userId), { kind: c.kind, from, to, card: c.card, at: now.toISOString() }].slice(-KEEP_CORRECTIONS));
}

/**
 * The nudge for the receipt after this change, or null: only when the same change has now happened on exactly 3
 * different cards within 14 days, its learning is not already on, and No thanks was not pressed in the last 30 days.
 */
export function correctionNudge(userId: string, c: Pick<Correction, "kind" | "from" | "to">, now = new Date()): Nudge | null {
  const from = norm(c.kind, c.from);
  const to = norm(c.kind, c.to);
  const n = NUDGES.find((x) => x.kind === c.kind && x.from === from && x.to === to);
  if (!n) return null;
  const off = readJson<Record<string, string>>(nudgeOffKey(userId), {})[n.id];
  if (off && now.getTime() - Date.parse(off) < NUDGE_OFF_FOR) return null;
  const cards = new Set(
    loadCorrections(userId)
      .filter((x) => x.kind === c.kind && x.from === from && x.to === to && now.getTime() - Date.parse(x.at) <= NUDGE_WINDOW)
      .map((x) => x.card),
  );
  if (cards.size !== 3) return null;
  if (activeLearnings(loadLearnings(userId)).some((l) => l.text === n.learning.text)) return null;
  return { id: n.id, line: n.line, learning: n.learning };
}

/** No thanks: hides that nudge for 30 days on this device. */
export function dismissNudge(userId: string, id: NudgeId, now = new Date()): void {
  writeJson(nudgeOffKey(userId), { ...readJson<Record<string, string>>(nudgeOffKey(userId), {}), [id]: now.toISOString() });
}
