// The campaign wizard's angles step (plan-angles, Leo only): its rows and the angle suggestions. idea-dump mode
// "angles" runs here, outside React, so leaving the step loses nothing. Until Confirm keeps the picked ones
// (confirmAngles), the step's rows (suggested, your own, ticks, edits and typed text) wait in this tab's
// sessionStorage, cs-angles-suggest-<scoped>, per audience id. A reload mid-call loses that call only: the server
// gave the use back if OpenAI never answered.

import { anglesFor, confirmAngles, newAngleId, ANGLE_LIMITS, type Angle } from "@/lib/angles";
import { audienceLine, type Audience } from "@/lib/audiences";
import { brandRulesLine } from "@/lib/brandRules";
import { loadCampaigns, type Campaign } from "@/lib/campaigns";
import { loadBrand } from "@/lib/carousel";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { followStats, loadFollowing } from "@/lib/following";
import { buildIdeaDumpContext } from "@/lib/ideaDump";
import { loadMarket } from "@/lib/market";
import { loadPositioning } from "@/lib/positioning";
import { loadProducts, mainProduct, productBrief } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import { memoryLine } from "@/lib/voiceMemory";
import { loadVoiceProfile, voiceSummaryOf } from "@/lib/voiceProfile";
import type { PlanContext } from "../../supabase/functions/idea-dump/logic.ts";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

/** Q8: 3 to 8 angles a campaign. */
export const MIN_PICK = 3;
export const MAX_PICK = 8;
export const FAILED_LINE = "Couldn't suggest angles right now. Write your own, or try again.";
export const CAPPED_LINE = `You've used all ${DAILY_LIMITS["campaign-angles"]} angle suggestions for today. It resets at 8am Singapore time. Write your own below.`;
export const UNAVAILABLE_LINE = "Suggestions are unavailable for a moment. Write your own below.";
export const EDITED_LINE = "Posts already written keep their words. Swap a post to rewrite it.";

export type RowTag = "suggested" | "yours" | "used before";
export interface StepRow {
  id: string;
  title: string;
  line: string;
  origin: Angle["origin"];
  /** A saved angle for this audience: Remove deletes it from the store (with Undo). */
  used: boolean;
  picked: boolean;
  /** Typed text while the row is being edited. */
  draft?: { title: string; line: string };
}
export type ShownRow = StepRow & { tag: RowTag };
type AudienceIn = Pick<Audience, "id" | "name" | "who" | "cares" | "says">;

// ---- The step's rows -------------------------------------------------------------

const WORK = "cs-angles-suggest-";
/** This tab's copy, so the step still works when sessionStorage is blocked. */
const memory = new Map<string, Record<string, StepRow[]>>();
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
/** For useSyncExternalStore: changes whenever the job or a step's rows change. */
export const suggestVersion = () => version;
export function onSuggest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
function readRow(raw: unknown): StepRow | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const id = str(r?.id, 40);
  const title = str(r?.title, ANGLE_LIMITS.title);
  const line = str(r?.line, ANGLE_LIMITS.line);
  if (!r || !id || title === null || line === null) return null;
  const d = r.draft && typeof r.draft === "object" ? (r.draft as Record<string, unknown>) : null;
  const draft = d && { title: str(d.title, ANGLE_LIMITS.title) ?? "", line: str(d.line, ANGLE_LIMITS.line) ?? "" };
  return { id, title, line, origin: r.origin === "mine" ? "mine" : "suggested", used: r.used === true, picked: r.picked === true, ...(draft ? { draft } : {}) };
}

function readAll(scope: string): Record<string, StepRow[]> {
  const kept = memory.get(scope);
  if (kept) return kept;
  try {
    const raw = JSON.parse(sessionStorage.getItem(WORK + scope) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const all: Record<string, StepRow[]> = {};
    for (const [aud, list] of Object.entries(raw)) {
      if (Array.isArray(list)) all[aud] = list.map(readRow).filter((r): r is StepRow => !!r);
    }
    return all;
  } catch {
    return {};
  }
}

function writeRows(scope: string, audienceId: string, rows: StepRow[] | null): void {
  const all = { ...readAll(scope) };
  if (rows) all[audienceId] = rows.map(({ id, title, line, origin, used, picked, draft }) => ({ id, title, line, origin, used, picked, ...(draft ? { draft } : {}) }));
  else delete all[audienceId];
  memory.set(scope, all);
  try {
    sessionStorage.setItem(WORK + scope, JSON.stringify(all));
  } catch {
    // blocked or full: this tab's memory keeps the rows until a reload
  }
  notify();
}

/** The step's waiting rows for this audience, or null when it has none. */
export const loadWork = (userId: string, audienceId: string): StepRow[] | null => readAll(scoped(userId))[audienceId] ?? null;
/** Saves the step's rows (null clears them, as Confirm does). */
export const saveWork = (userId: string, audienceId: string, rows: StepRow[] | null) => writeRows(scoped(userId), audienceId, rows);

const tagOf = (origin: Angle["origin"]): RowTag => (origin === "mine" ? "yours" : "suggested");

/**
 * What the step lists: this audience's saved angles first ("used before", unticked unless `picks` holds them), with
 * any tick or edit the step made on them, then the new rows, newest first. An angle Confirm saved for this very
 * wizard (in `picks`, never used before that) keeps its own tag when Change reopens the step.
 */
export function stepRows(saved: Angle[], work: StepRow[] | null, picks: string[] = []): ShownRow[] {
  const rows = work ?? [];
  const over = new Map(rows.filter((r) => r.used).map((r) => [r.id, r]));
  const used = saved.map((a): ShownRow => {
    const fresh = picks.includes(a.id) && a.usedAt === a.createdAt;
    const row = over.get(a.id) ?? { id: a.id, title: a.title, line: a.line, origin: a.origin, used: true, picked: picks.includes(a.id) };
    return { ...row, used: true, tag: fresh ? tagOf(a.origin) : "used before" };
  });
  return [...used, ...rows.filter((r) => !r.used).map((r) => ({ ...r, tag: tagOf(r.origin) }))];
}

const titleKey = (t: string) => t.trim().toLowerCase();

/** A round's angles at the top of the new rows, ticked while the picks stay at 8 or fewer; a title already listed is left out. */
export function addSuggested(rows: StepRow[], got: { title: string; line: string }[]): StepRow[] {
  const taken = new Set(rows.map((r) => titleKey(r.title)));
  let picked = pickedRows(rows).length;
  const fresh: StepRow[] = [];
  for (const a of got) {
    const title = typeof a?.title === "string" ? a.title.trim().slice(0, ANGLE_LIMITS.title) : "";
    if (!title || taken.has(titleKey(title))) continue;
    taken.add(titleKey(title));
    const line = typeof a.line === "string" ? a.line.trim().slice(0, ANGLE_LIMITS.line) : "";
    fresh.push({ id: newAngleId(), title, line, origin: "suggested", used: false, picked: picked++ < MAX_PICK });
  }
  return [...fresh, ...rows];
}

export const pickedRows = <T extends StepRow>(rows: T[]): T[] => rows.filter((r) => r.picked && r.title.trim());

/** The line under a disabled Confirm, or null when the picks can go. */
export const pickLine = (n: number): string | null => (n < MIN_PICK ? `Pick at least ${MIN_PICK}.` : n > MAX_PICK ? `Pick ${MAX_PICK} or fewer.` : null);

/**
 * Confirm: keeps every ticked angle for this audience (usedAt now), clears the step's waiting rows and returns the
 * copies the campaign keeps. `error` is the no-room line when this device couldn't keep them for next time.
 */
export function confirmStep(userId: string, audienceId: string, rows: StepRow[], now = new Date()): { angles: Campaign["angles"]; error: string | null } {
  const picks = pickedRows(rows).map((r) => ({ id: r.id, title: r.title.trim(), line: r.line.trim(), origin: r.origin }));
  const { angles, error } = confirmAngles(userId, audienceId, picks, now);
  saveWork(userId, audienceId, null);
  return { angles: angles.map(({ id, title, line }) => ({ id, title, line })), error };
}

/** True when a saved campaign has written words on this angle (the edit note under the row). */
export const usedInPosts = (userId: string, angleId: string): boolean =>
  loadCampaigns(userId).some((c) => c.posts.some((p) => p.angleId === angleId && !!(p.hook || p.body || p.script || p.brief)));

// ---- The writer's context (phase 5 decision 13) ------------------------------------

/** What every plan writer gets: positioning, goal, voice, memory, speaker, product, brand rules, questions and examples. */
export function planContextFor(userId: string, platform?: string): PlanContext {
  const base = buildIdeaDumpContext(userId);
  const product = mainProduct(loadProducts(userId).items);
  return {
    positioning: base.positioning,
    goal: loadPositioning(userId)?.goal ?? "",
    platforms: base.platforms,
    voice: voiceSummaryOf(loadVoiceProfile(userId)),
    memory: memoryLine(userId, "posts"),
    speaker: speakerFor(userId),
    product: product ? productBrief(product) : "",
    rules: brandRulesLine(loadBrand(userId), platform),
    questions: loadMarket(userId).questions,
    // Following's best caption per account, sent as structure only (the prompt forbids copying them)
    examples: loadFollowing(userId).flatMap((a) => (Array.isArray(a.posts) ? [followStats(a).best?.caption?.trim() ?? ""] : [])).filter(Boolean).slice(0, 5),
  };
}

// ---- The suggestion job --------------------------------------------------------------

export type SuggestJob =
  | { state: "idle" }
  | { state: "suggesting"; key: string }
  | { state: "failed"; key: string; error: string; retry: boolean };

let job: SuggestJob = { state: "idle" };
const set = (s: SuggestJob) => {
  job = s;
  notify();
};
export const suggestJob = () => job;
/** The job's key for one brand's audience: the step shows the job only when it is its own. */
export const jobKey = (userId: string, audienceId: string) => `${scoped(userId)}:${audienceId}`;

function failureOf(e: unknown): { error: string; retry: boolean } {
  const err = e instanceof EdgeError ? e : null;
  if (err?.status === 429) return { error: CAPPED_LINE, retry: false };
  if (err?.status === 503) return { error: UNAVAILABLE_LINE, retry: false };
  // the gate and a bad request say why in the server's own words
  if (err && (err.code === "not_enabled" || err.code === "bad_request")) return { error: err.message, retry: false };
  return { error: FAILED_LINE, retry: true };
}

/**
 * Suggests 5 angles for this audience, avoiding every title the step lists. The rows show "suggesting" at once and
 * the new ones land at the top of the step's rows when the call answers, whether or not the step is still open.
 */
export async function startSuggest(userId: string, audience: AudienceIn, picks: string[] = []): Promise<void> {
  if (job.state === "suggesting") return;
  const scope = scoped(userId);
  const key = `${scope}:${audience.id}`;
  const saved = anglesFor(userId, audience.id);
  const listed = stepRows(saved, readAll(scope)[audience.id] ?? null, picks);
  set({ state: "suggesting", key });
  try {
    const r = await callFn<{ angles?: { title: string; line: string }[] }>(
      "idea-dump",
      { mode: "angles", audience: audienceLine(audience), avoid: listed.map((x) => x.title.trim()).filter(Boolean).slice(0, 30), context: planContextFor(userId) },
      FAILED_LINE,
    );
    // rows ticked, edited or added while it ran stay as they are now
    const now = stepRows(saved, readAll(scope)[audience.id] ?? null, picks);
    writeRows(scope, audience.id, addSuggested(now, Array.isArray(r?.angles) ? r.angles : []));
    set({ state: "idle" });
  } catch (e) {
    set({ state: "failed", key, ...failureOf(e) });
  }
}
