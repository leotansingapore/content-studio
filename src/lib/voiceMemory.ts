// What the AI may say about you and what it has learned (north-star brand-voice-memory, on for everyone from 1 Nov 2026).
// Two synced lists per brand: facts the writers may state about the adviser, and learnings (standing notes:
// "never use emoji in my posts") from the assistant, a rewrite kept on 3 posts, or typed on /voice. Remove
// turns a row off (offAt) and never deletes it, so Undo and the "replaced" history work.
//
// For the writers (memory-wiring): memoryLine(userId, scope) is the one block to add to a prompt, after the
// brand rules and before the voice summary, for every sign-in. Coach's lists, which it also reads, exist on every
// account, so they ride only beside a fact or a learning: with neither the block is "" and the prompt is today's.

import { scoped } from "@/lib/profiles";
import { loadCoachProfile } from "@/lib/coachProfile";
import { livePromo, loadBrand } from "@/lib/carousel";

export const MAX_FACTS = 20;
export const FACT_CHARS = 160;
export const MAX_LEARNINGS = 30;
export const LEARNING_CHARS = 140;
/** Rows kept per list, off ones included; the oldest off rows go first past this. */
export const KEEP_ROWS = 120;

export const LEARNING_SCOPES = ["posts", "videos", "pictures", "all"] as const;
export type LearningScope = (typeof LEARNING_SCOPES)[number];
/** "correction": saved from the agent's nudge after the same change on 3 cards (agent-memory). */
export type LearningSource = "assistant" | "rewrite" | "typed" | "correction";

export interface Fact {
  id: string;
  text: string;
  createdAt: string;
  offAt?: string;
}
export interface Learning {
  id: string;
  text: string;
  scope: LearningScope;
  source: LearningSource;
  createdAt: string;
  offAt?: string;
  /** The learning that turned this one off. */
  replacedBy?: string;
  /** The rewrite kept 3 times, for source "rewrite" (rewriteLog.ts REWRITE_LEARNINGS). */
  rewrite?: string;
  /** The agent thread and message it was saved from (agent-memory), for /voice's "From a chat" link. */
  thread?: string;
  msg?: string;
}

export const FACTS_CHANGED = "content-studio-facts-changed";
export const LEARNINGS_CHANGED = "content-studio-learnings-changed";
const FACTS_PREFIX = "content-studio-facts-";
const LEARNINGS_PREFIX = "content-studio-learnings-";

export const SAVE_FAILED = "Couldn't save that. Try again.";
export const fullLine = (n: number) => `${n} is the most. Remove one to add another.`;

/** `existed`: the same row was already on, so nothing was written. */
export type Saved<T> = { ok: true; item: T; existed?: true } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);
const newId = (prefix: string, now: Date) => `${prefix}-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function read(key: string): unknown[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Keeps at most KEEP_ROWS by dropping the oldest off rows (the on ones are capped well below it). */
function pruned<T extends { offAt?: string }>(rows: T[]): T[] {
  const extra = rows.length - KEEP_ROWS;
  if (extra <= 0) return rows;
  const drop = new Set(rows.filter((r) => r.offAt).sort((a, b) => a.offAt!.localeCompare(b.offAt!)).slice(0, extra));
  return rows.filter((r) => !drop.has(r));
}

function write<T extends { offAt?: string }>(key: string, event: string, rows: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(pruned(rows)));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(event));
  return true;
}

export const isOn = (r: { offAt?: string }) => !r.offAt;

// Brand > Profile's Do, Don't and Avoid lists (/playbook) are learnings whose words start with a lead every reader
// prints as written (memoryLine, the agent, slide-campaigns), so no reader needs to know them. Each kind has its own
// cap. Avoid is also checked in code: a post that uses one is flagged (brandRules.ts avoidList).
export const RULES = { do: { lead: "Do: ", max: 10 }, dont: { lead: "Don't: ", max: 10 }, avoid: { lead: "Avoid: ", max: 30 } } as const;
export type RuleKind = keyof typeof RULES;
const RULE_KINDS = Object.keys(RULES) as RuleKind[];
/** The Profile list a learning belongs to, from its lead; null for a plain learning. */
export const ruleKind = (text: string): RuleKind | null => RULE_KINDS.find((k) => text.startsWith(RULES[k].lead)) ?? null;
const learningCap = (text: string) => {
  const k = ruleKind(text);
  return k ? RULES[k].max : MAX_LEARNINGS;
};
const sameKind = (text: string) => (l: Learning) => ruleKind(l.text) === ruleKind(text);

// Profile's Product claims are facts with a lead the same way, 30 of them beside the 20 facts typed on /voice.
export const FACT_KINDS: Record<"claim", { lead: string; max?: number }> = { claim: { lead: "Claim: ", max: 30 } };
export type FactKind = keyof typeof FACT_KINDS;
const FACT_KIND_IDS = Object.keys(FACT_KINDS) as FactKind[];
/** The Profile list a fact belongs to, from its lead; null for a fact typed on /voice. */
export const factKind = (text: string): FactKind | null => FACT_KIND_IDS.find((k) => text.startsWith(FACT_KINDS[k].lead)) ?? null;
/** The cap a fact counts against: its kind's own, or MAX_FACTS shared by the proof facts. */
const factGroup = (text: string): FactKind | "proof" => {
  const k = factKind(text);
  return k && FACT_KINDS[k].max ? k : "proof";
};
const factCap = (text: string) => {
  const g = factGroup(text);
  return g === "proof" ? MAX_FACTS : FACT_KINDS[g].max!;
};
const sameGroup = (text: string) => (f: Fact) => factGroup(f.text) === factGroup(text);
/** The facts /voice lists and MAX_FACTS caps: all but the Profile's own-capped lists. */
export const proofFacts = (rows: Fact[]) => rows.filter((f) => factGroup(f.text) === "proof");

// ---------- facts ----------

const factsKey = (userId: string) => `${FACTS_PREFIX}${scoped(userId)}`;

/** Every fact row, removed ones included, oldest first. Empty on bad JSON. */
export function loadFacts(userId: string): Fact[] {
  return read(factsKey(userId)).flatMap((raw) => {
    const f = raw as Partial<Fact> | null;
    const id = str(f?.id, 40);
    const text = str(f?.text, FACT_CHARS);
    const createdAt = iso(f?.createdAt);
    return id && text && createdAt ? [{ id, text, createdAt, ...(iso(f?.offAt) ? { offAt: f!.offAt } : {}) }] : [];
  });
}

export function addFact(userId: string, text: string, now = new Date()): Saved<Fact> {
  const t = str(text, FACT_CHARS);
  if (!t) return { ok: false, error: "Type a fact first." };
  const rows = loadFacts(userId);
  const same = rows.find((f) => isOn(f) && f.text.toLowerCase() === t.toLowerCase());
  if (same) return { ok: true, item: same, existed: true };
  if (rows.filter(isOn).filter(sameGroup(t)).length >= factCap(t)) return { ok: false, error: fullLine(factCap(t)) };
  const item: Fact = { id: newId("f", now), text: t, createdAt: now.toISOString() };
  return write(factsKey(userId), FACTS_CHANGED, [...rows, item]) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** Remove (off true) or Undo (off false). Undo is refused when its list is full. */
export function setFactOff(userId: string, id: string, off: boolean, now = new Date()): Saved<Fact> {
  const rows = loadFacts(userId);
  const row = rows.find((f) => f.id === id);
  if (!row) return { ok: false, error: SAVE_FAILED };
  if (!off && row.offAt && rows.filter(isOn).filter(sameGroup(row.text)).length >= factCap(row.text)) return { ok: false, error: fullLine(factCap(row.text)) };
  const item: Fact = off ? { ...row, offAt: row.offAt ?? now.toISOString() } : (({ offAt: _o, ...r }) => r)(row);
  return write(factsKey(userId), FACTS_CHANGED, rows.map((f) => (f.id === id ? item : f))) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** One Profile fact list's rows on now, oldest first, each with its words after the lead. */
export function factsOf(userId: string, kind: FactKind): { id: string; text: string }[] {
  return loadFacts(userId)
    .filter((f) => isOn(f) && factKind(f.text) === kind)
    .map((f) => ({ id: f.id, text: f.text.slice(FACT_KINDS[kind].lead.length) }));
}

export function addFactOf(userId: string, kind: FactKind, text: string, now = new Date()): Saved<Fact> {
  const t = str(text, FACT_CHARS - FACT_KINDS[kind].lead.length);
  if (!t) return { ok: false, error: "Type one first." };
  return addFact(userId, FACT_KINDS[kind].lead + t, now);
}

// ---------- learnings ----------

const learningsKey = (userId: string) => `${LEARNINGS_PREFIX}${scoped(userId)}`;
const SOURCES: LearningSource[] = ["assistant", "rewrite", "typed", "correction"];

/** Every learning row, removed and replaced ones included, oldest first. Empty on bad JSON. */
export function loadLearnings(userId: string): Learning[] {
  return read(learningsKey(userId)).flatMap((raw) => {
    const l = raw as Partial<Learning> | null;
    const id = str(l?.id, 40);
    const text = str(l?.text, LEARNING_CHARS);
    const createdAt = iso(l?.createdAt);
    const scope = LEARNING_SCOPES.find((s) => s === l?.scope);
    const source = SOURCES.find((s) => s === l?.source);
    if (!id || !text || !createdAt || !scope || !source) return [];
    const row: Learning = { id, text, scope, source, createdAt };
    if (iso(l?.offAt)) row.offAt = l!.offAt;
    if (str(l?.replacedBy, 40)) row.replacedBy = str(l?.replacedBy, 40);
    if (source === "rewrite" && str(l?.rewrite, 20)) row.rewrite = str(l?.rewrite, 20);
    if (str(l?.thread, 40)) row.thread = str(l?.thread, 40);
    if (str(l?.msg, 40)) row.msg = str(l?.msg, 40);
    return [row];
  });
}

/** The learnings on now, newest first. */
export const activeLearnings = (rows: Learning[]) => rows.filter(isOn).reverse();

/**
 * Saves a learning; `replaces` (the id of one on now) turns that one off as replaced by this one. The text is
 * the person's own words, cut to 140 characters. A learning already on with the same words and scope is kept.
 */
export function addLearning(
  userId: string,
  l: { text: string; scope: LearningScope; source: LearningSource; rewrite?: string; thread?: string; msg?: string },
  replaces?: string | null,
  now = new Date(),
): Saved<Learning> {
  const text = str(l.text, LEARNING_CHARS);
  if (!text) return { ok: false, error: "Type something to keep or stop first." };
  const rows = loadLearnings(userId);
  const same = rows.find((r) => isOn(r) && r.scope === l.scope && r.text.toLowerCase() === text.toLowerCase());
  if (same) return { ok: true, item: same, existed: true };
  const old = replaces ? rows.find((r) => r.id === replaces && isOn(r)) : undefined;
  const cap = learningCap(text);
  if (rows.filter(isOn).filter(sameKind(text)).length - (old && sameKind(text)(old) ? 1 : 0) >= cap) return { ok: false, error: fullLine(cap) };
  const item: Learning = {
    id: newId("l", now),
    text,
    scope: l.scope,
    source: l.source,
    createdAt: now.toISOString(),
    ...(l.source === "rewrite" && l.rewrite ? { rewrite: l.rewrite } : {}),
    ...(str(l.thread, 40) ? { thread: str(l.thread, 40) } : {}),
    ...(str(l.msg, 40) ? { msg: str(l.msg, 40) } : {}),
  };
  const next = rows.map((r) => (r === old ? { ...r, offAt: item.createdAt, replacedBy: item.id } : r));
  return write(learningsKey(userId), LEARNINGS_CHANGED, [...next, item]) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** Remove (off true) or Undo (off false, which also clears replacedBy). Undo is refused when its list is full. */
export function setLearningOff(userId: string, id: string, off: boolean, now = new Date()): Saved<Learning> {
  const rows = loadLearnings(userId);
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, error: SAVE_FAILED };
  const cap = learningCap(row.text);
  if (!off && row.offAt && rows.filter(isOn).filter(sameKind(row.text)).length >= cap) return { ok: false, error: fullLine(cap) };
  const item: Learning = off ? { ...row, offAt: row.offAt ?? now.toISOString() } : (({ offAt: _o, replacedBy: _r, ...r }) => r)(row);
  return write(learningsKey(userId), LEARNINGS_CHANGED, rows.map((r) => (r.id === id ? item : r))) ? { ok: true, item } : { ok: false, error: SAVE_FAILED };
}

/** Undo for a learning just saved: turns it off and puts back the one it replaced, in one write. */
export function undoLearning(userId: string, id: string, now = new Date()): boolean {
  const rows = loadLearnings(userId);
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  const next = rows.map((r): Learning => {
    if (r.id === id) return { ...r, offAt: r.offAt ?? now.toISOString() };
    if (r.replacedBy === id) return (({ offAt: _o, replacedBy: _r, ...rest }) => rest)(r);
    return r;
  });
  return write(learningsKey(userId), LEARNINGS_CHANGED, next);
}

/** The plain learnings on now, newest first: what /voice lists and MAX_LEARNINGS caps. */
export const plainLearnings = (rows: Learning[]) => activeLearnings(rows).filter((l) => !ruleKind(l.text));

/** One Profile list's rows on now, oldest first, each with its words after the lead. */
export function rulesOf(userId: string, kind: RuleKind): { id: string; text: string }[] {
  return loadLearnings(userId)
    .filter((l) => isOn(l) && ruleKind(l.text) === kind)
    .map((l) => ({ id: l.id, text: l.text.slice(RULES[kind].lead.length) }));
}

/** Adds a row to a Profile list, for every writer (scope all; memoryLine keeps Do and Don't out of pictures). */
export function addRule(userId: string, kind: RuleKind, text: string, now = new Date()): Saved<Learning> {
  const t = str(text, LEARNING_CHARS - RULES[kind].lead.length);
  if (!t) return { ok: false, error: "Type one first." };
  return addLearning(userId, { text: RULES[kind].lead + t, scope: "all", source: "typed" }, null, now);
}

/** The notes on now that a new note in `scope` is checked against: that scope's and "all"'s, newest first. */
export function notesFor(userId: string, scope: LearningScope): Learning[] {
  return activeLearnings(loadLearnings(userId))
    .filter((l) => scope === "all" || l.scope === scope || l.scope === "all")
    .slice(0, MAX_LEARNINGS);
}

/** Re-reads on a save here, in another tab or from sync. */
export function onMemoryChanged(fn: () => void): () => void {
  const storage = (e: StorageEvent) => (e.key === null || e.key.startsWith(FACTS_PREFIX) || e.key.startsWith(LEARNINGS_PREFIX)) && fn();
  window.addEventListener(FACTS_CHANGED, fn);
  window.addEventListener(LEARNINGS_CHANGED, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(FACTS_CHANGED, fn);
    window.removeEventListener(LEARNINGS_CHANGED, fn);
    window.removeEventListener("storage", storage);
  };
}

// ---------- the writer block ----------

export const MEMORY_HEADER = "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):";
export const FACTS_LEAD = "- Facts you may state about me (state no other facts, numbers, awards or results about me): ";
export const KEEP_LEAD = "- Keep doing or avoid: ";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-30" -> "30 Nov 2026". */
export const dayWords = (day: string) => `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** Profile's current promotion as the first fact, while it runs (carousel.ts livePromo). */
export const promoFact = (p: { text: string; until?: string }) => `My current offer, to quote word for word: ${p.text}${p.until ? ` (last day ${dayWords(p.until)})` : ""}`;

function block(facts: string[], keep: string[]): string {
  if (!facts.length && !keep.length) return "";
  return [MEMORY_HEADER, ...(facts.length ? [FACTS_LEAD + facts.join("; ")] : []), ...(keep.length ? [KEEP_LEAD + keep.join("; ")] : [])].join("\n");
}

/**
 * The block for a writer, or "" when there is no fact and no learning on now in `scope` or "all": the facts, then
 * those learnings (newest first), then (for posts) Coach's "Lean into" and "Steer clear of" lists. It never passes
 * `max` characters: whole items are left out from the end, so Coach's items and the oldest learnings go first and a
 * fact never goes before a learning.
 */
export function memoryLine(userId: string, scope: Exclude<LearningScope, "all">, max = 1500): string {
  const promo = livePromo(loadBrand(userId));
  // the promotion first, so a long block leaves out the oldest facts before it
  const facts = [...(promo ? [promoFact(promo)] : []), ...loadFacts(userId).filter(isOn).map((f) => f.text)];
  const learned = activeLearnings(loadLearnings(userId))
    // Do and Don't are about the words, so a picture's prompt goes without them
    .filter((l) => (l.scope === scope || l.scope === "all") && !(scope === "pictures" && (ruleKind(l.text) === "do" || ruleKind(l.text) === "dont")))
    // the Profile's lists first, so a long block leaves out the oldest plain notes before any of them
    .sort((a, b) => Number(!ruleKind(a.text)) - Number(!ruleKind(b.text)))
    .map((l) => l.text);
  const coach = scope === "posts" && (facts.length || learned.length) ? loadCoachProfile(userId) : null;
  const keep = [...learned, ...(coach?.likes.map((x) => `Lean into: ${x}`) ?? []), ...(coach?.dislikes.map((x) => `Steer clear of: ${x}`) ?? [])];
  while (facts.length || keep.length) {
    const text = block(facts, keep);
    if (text.length <= max) return text;
    if (keep.length) keep.pop();
    else facts.pop();
  }
  return "";
}
