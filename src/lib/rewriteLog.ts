// One-tap rewrites kept in Write ("Use this"), counted on this device so a habit becomes a standing note
// (north-star brand-voice-memory, Leo only). The same rewrite kept on 3 different drafts within 14 days shows a
// one-line nudge under the draft; "No thanks" hides that nudge for 30 days. Counting only, no AI.
//
// For Write (memory-wiring): logRewrite after a kept rewrite, rewriteNudge to show the line, rememberRewrite on
// "Remember", dismissRewriteNudge on "No thanks". Only the five REWRITES ids count, never "lines" or "ask".

import { scoped } from "@/lib/profiles";
import { addLearning, isOn, loadLearnings, type Learning, type Saved } from "@/lib/voiceMemory";

/** Write's REWRITES (GeneratePage), each with its nudge and the learning it saves. */
export const REWRITE_LEARNINGS = {
  shorter: { label: "Shorter", nudge: "You often make posts shorter. Start them shorter?", learning: "Write posts about a third shorter than usual." },
  longer: { label: "Longer", nudge: "You often make posts longer. Start them longer?", learning: "Write posts about a third longer, with one more concrete detail." },
  simpler: { label: "Simpler", nudge: "You often ask for simpler words. Keep it simple from the start?", learning: "Use plain words and short sentences." },
  casual: { label: "More casual", nudge: "You often make posts more casual. Start that way?", learning: "Keep the tone casual and conversational." },
  formal: { label: "More formal", nudge: "You often make posts more formal. Start that way?", learning: "Keep the tone formal and polished." },
} as const;
export type LoggedRewrite = keyof typeof REWRITE_LEARNINGS;
export const isLoggedRewrite = (id: string): id is LoggedRewrite => Object.prototype.hasOwnProperty.call(REWRITE_LEARNINGS, id);

export const MAX_LOG = 20;
export const NUDGE_AT = 3;
export const NUDGE_DAYS = 14;
export const QUIET_DAYS = 30;
const DAY = 86_400_000;

interface Kept {
  id: LoggedRewrite;
  draftId: string;
  at: string;
}
const logKey = (userId: string) => `cs-rewrites-${scoped(userId)}`;
const offKey = (userId: string) => `cs-rewrite-nudge-off-${scoped(userId)}`;

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // a full device only loses the count
  }
}

export function loadRewriteLog(userId: string): Kept[] {
  const v = readJson(logKey(userId));
  return (Array.isArray(v) ? v : []).flatMap((k: Partial<Kept> | null) =>
    k && typeof k.id === "string" && isLoggedRewrite(k.id) && typeof k.draftId === "string" && k.draftId && typeof k.at === "string" && !Number.isNaN(Date.parse(k.at))
      ? [{ id: k.id, draftId: k.draftId, at: k.at }]
      : [],
  );
}

/** Logs a kept rewrite on a draft; anything but the five REWRITES ids (or no draft) is ignored. */
export function logRewrite(userId: string, id: string, draftId: string | null | undefined, now = new Date()): void {
  if (!isLoggedRewrite(id) || !draftId) return;
  writeJson(logKey(userId), [...loadRewriteLog(userId), { id, draftId, at: now.toISOString() }].slice(-MAX_LOG));
}

function quietUntil(userId: string): Record<string, string> {
  const v = readJson(offKey(userId));
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

/** The rewrite to nudge about now, or null: kept on 3 different drafts within 14 days, not hidden, not already a learning. */
export function rewriteNudge(userId: string, now = new Date()): LoggedRewrite | null {
  const since = now.getTime() - NUDGE_DAYS * DAY;
  const off = quietUntil(userId);
  const learned = new Set(loadLearnings(userId).filter((l: Learning) => isOn(l) && l.source === "rewrite").map((l) => l.rewrite));
  const drafts = new Map<LoggedRewrite, Set<string>>();
  for (const k of loadRewriteLog(userId)) {
    if (Date.parse(k.at) < since) continue;
    drafts.set(k.id, (drafts.get(k.id) ?? new Set()).add(k.draftId));
  }
  for (const [id, set] of drafts) {
    const hidden = off[id] && now.getTime() - Date.parse(off[id]) < QUIET_DAYS * DAY;
    if (set.size >= NUDGE_AT && !hidden && !learned.has(id)) return id;
  }
  return null;
}

/** "No thanks": hides this rewrite's nudge for 30 days. */
export function dismissRewriteNudge(userId: string, id: LoggedRewrite, now = new Date()): void {
  writeJson(offKey(userId), { ...quietUntil(userId), [id]: now.toISOString() });
}

/** "Remember": saves the rewrite's learning for posts, and clears its count so the nudge starts over. */
export function rememberRewrite(userId: string, id: LoggedRewrite, now = new Date()): Saved<Learning> {
  const saved = addLearning(userId, { text: REWRITE_LEARNINGS[id].learning, scope: "posts", source: "rewrite", rewrite: id }, null, now);
  if (saved.ok) writeJson(logKey(userId), loadRewriteLog(userId).filter((k) => k.id !== id));
  return saved;
}
