// Client side of "Clone a reel" (/clone). The clone-reel edge function reads
// the post and writes the breakdown and the consultant's version; this calls
// it, keeps recent results on this device (synced by cloudSync), and turns a
// result into a draft for Write or the board.

import { supabase } from "@/lib/supabase";
import { setStage, type ProductionStage } from "@/lib/board";
import { getDraftById, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { VOICE_MIN_CHARS, isVoiceProfileUsable, type VoiceProfile } from "@/lib/voiceProfile";
import {
  parseReelUrl,
  type CloneErrorCode,
  type CloneResponse,
  type HookFormulaInput,
  type MyVersion,
  type ShotBeat,
  type VoiceInput,
  type Winner,
} from "../../supabase/functions/clone-reel/logic.ts";
import { formulaOfHook, type HookFormula } from "@/lib/hookFormulas";
import type { Pacing, Visuals } from "../../supabase/functions/reel-visuals/logic.ts";
import { scoped } from "@/lib/profiles";
import { getTrackedPosts } from "@/lib/analytics";
import { sampleReelFrames } from "@/lib/reelFrames";

export { LINK_MESSAGES, parseReelUrl } from "../../supabase/functions/clone-reel/logic.ts";
export type {
  Breakdown,
  CloneResponse,
  Concept,
  CloneSource,
  MyVersion,
  ReelMetrics,
  ReelPlatform,
  ShotBeat,
} from "../../supabase/functions/clone-reel/logic.ts";
export type { Pacing, Visuals };
export { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

/** A little over the server's 90s budget, so its own timeout answer arrives first. */
export const CLIENT_TIMEOUT_MS = 110_000;

export type ReelCloneErrorCode = CloneErrorCode | "daily_limit" | "usage_unavailable" | "network" | "cancelled";

export class ReelCloneError extends Error {
  constructor(
    message: string,
    readonly code: ReelCloneErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReelCloneError";
  }
}

const KNOWN_CODES = new Set<ReelCloneErrorCode>([
  "bad_url",
  "unauthorized",
  "not_found",
  "timeout",
  "scrape_failed",
  "scrape_paused",
  "ai_failed",
  "not_configured",
  "server_error",
  "daily_limit",
  "usage_unavailable",
]);

const FALLBACK_MESSAGES: Partial<Record<ReelCloneErrorCode, string>> = {
  unauthorized: "Your session has expired. Sign in again to clone a reel.",
  not_found: "We couldn't open that post. It may be private, deleted or age-restricted.",
  daily_limit: "You've used today's clones. They reset at 8am Singapore time.",
  timeout: "This one is taking longer than usual. Try again in a minute.",
  network: "Couldn't connect. Check your connection and try again.",
  server_error: "Something went wrong. Try again in a minute.",
};

/** The error code for a failed call: the server's own code when it sent one, else by status. */
export function errorCodeFor(code: unknown, status: number): ReelCloneErrorCode {
  if (typeof code === "string" && KNOWN_CODES.has(code as ReelCloneErrorCode)) return code as ReelCloneErrorCode;
  if (status === 400) return "bad_url";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "daily_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 503) return "usage_unavailable";
  return "server_error";
}

function looksLikeResponse(v: unknown): v is Response {
  return Boolean(v) && typeof (v as Response).status === "number" && typeof (v as Response).json === "function";
}

function isCloneResponse(v: unknown): v is CloneResponse {
  const r = v as CloneResponse | null;
  return (
    Boolean(r?.source?.url) &&
    (r?.source?.platform === "instagram" || r?.source?.platform === "tiktok") &&
    Array.isArray(r?.breakdown?.beats) &&
    typeof r?.myVersion?.script === "string" &&
    typeof r?.myVersion?.caption === "string"
  );
}

/** Calls one of this app's edge functions and returns its answer. Throws ReelCloneError with a message fit to show. */
export async function invokeFunction(
  name: "clone-reel" | "storyboard",
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const started = Date.now();
  let data: unknown = null;
  let error: unknown = null;
  try {
    ({ data, error } = await supabase.functions.invoke(name, {
      body: payload,
      signal,
      timeout: CLIENT_TIMEOUT_MS,
    }));
  } catch (e) {
    error = e;
  }

  if (error) {
    if (signal?.aborted) throw new ReelCloneError("Cancelled.", "cancelled", 0);
    // FunctionsHttpError hides the JSON body behind error.context.
    const ctx = (error as { context?: unknown }).context;
    if (looksLikeResponse(ctx)) {
      const body = (await ctx.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
      const code = errorCodeFor(body?.code, ctx.status);
      const message =
        typeof body?.error === "string" && body.error.trim()
          ? body.error
          : (FALLBACK_MESSAGES[code] ?? FALLBACK_MESSAGES.server_error!);
      throw new ReelCloneError(message, code, ctx.status);
    }
    if (Date.now() - started >= CLIENT_TIMEOUT_MS - 1000) {
      throw new ReelCloneError(FALLBACK_MESSAGES.timeout!, "timeout", 0);
    }
    throw new ReelCloneError(FALLBACK_MESSAGES.network!, "network", 0);
  }

  const body = data as { error?: unknown; code?: unknown } | null;
  if (typeof body?.error === "string") throw new ReelCloneError(body.error, errorCodeFor(body.code, 200), 200);
  return data;
}

/** What the function needs of each hook formula; hookOptions[i] is written with formulas[i]. */
const formulaInput = (formulas: HookFormula[]): HookFormulaInput[] =>
  formulas.map(({ name, template, example, trap }) => ({ name, template, example, trap }));

/** The version with the ids of the formulas its hooks were written with, when they line up. */
function tagHooks(version: MyVersion, formulas: HookFormula[]): MyVersion {
  return formulas.length && version.hookOptions?.length === formulas.length
    ? { ...version, hookFormulas: formulas.map((f) => f.id) }
    : version;
}

/** Clones one reel, writing its hooks with `formulas` when given. Throws ReelCloneError with a message fit to show. */
export async function cloneReel(
  url: string,
  voice: VoiceInput | null,
  signal?: AbortSignal,
  formulas: HookFormula[] = [],
): Promise<CloneResponse> {
  const data = await invokeFunction(
    "clone-reel",
    formulas.length ? { url, voice, formulas: formulaInput(formulas) } : { url, voice },
    signal,
  );
  if (!isCloneResponse(data)) {
    throw new ReelCloneError("The clone came back incomplete. Try again.", "server_error", 200);
  }
  return { ...data, myVersion: tagHooks(data.myVersion, formulas) };
}

/** Tracked posts needed before "your best posts" means anything. */
export const MIN_POSTS_FOR_WINNERS = 3;

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The consultant's 3 best posted hooks by engagement, with their numbers in
 * words, once they've logged numbers for enough posts. Each clone leans on
 * these, so the next one starts from what already worked for them.
 */
export function winnersFor(userId: string | null | undefined): Winner[] {
  const posts = getTrackedPosts(userId).filter((p) => (p.hook ?? "").trim().length >= 8);
  if (posts.length < MIN_POSTS_FOR_WINNERS) return [];
  return [...posts]
    .sort((a, b) => b.engagementTotal - a.engagementTotal || b.impressions - a.impressions)
    .slice(0, 3)
    .map((p) => ({
      hook: p.hook.trim().slice(0, 200),
      result: [
        p.impressions ? `${fmt(p.impressions)} views` : null,
        `${fmt(p.engagementTotal)} engagements`,
        p.engagementRate ? `${p.engagementRate}% engaged` : null,
      ]
        .filter(Boolean)
        .join(", "),
    }));
}

/** The voice the function writes in: GeneratePage's rule, a usable profile, plus their best posts. */
export function voiceForClone(profile: VoiceProfile | null, winners: Winner[] = []): VoiceInput | null {
  const usable = Boolean(profile && isVoiceProfileUsable(profile));
  const samples = usable
    ? profile!.posts
        .map((p) => (p ?? "").trim())
        .filter((p) => p.length >= VOICE_MIN_CHARS)
        .slice(0, 3)
        .map((p) => p.slice(0, 900))
    : [];
  const summary = usable ? (profile!.voiceSummary ?? "").trim().slice(0, 1200) : "";
  if (!summary && !samples.length && !winners.length) return null;
  return winners.length ? { summary, samples, winners } : { summary, samples };
}

// ---- Hooks and the shot list ---------------------------------------------------------

/** The version with hook option `index` as its opener and first spoken line. */
export function withHook(version: MyVersion, index: number): MyVersion {
  const hook = version.hookOptions?.[index];
  if (!hook || !version.beats?.length) return version;
  const beats = version.beats.map((b, i) => (i === 0 ? { ...b, say: hook } : b));
  return { ...version, hook, beats, script: beats.map((b) => b.say).join("\n") };
}

/** The shot list as plain text for a notes app: one block per beat, with a planned shot per beat when given. */
export function shotListText(beats: ShotBeat[], shots: string[] = []): string {
  return beats
    .map((b, i) => {
      const visual = shots[i] || b.visual;
      return [
        `${i + 1}. (${b.seconds}s) ${b.say}`,
        b.delivery ? `   Delivery: ${b.delivery}` : null,
        b.onScreen ? `   On screen: ${b.onScreen}` : null,
        visual ? `   Show: ${visual}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** "/clone?url=..." for a link the page can clone, else null. */
export function cloneLinkFor(url: string | null | undefined): string | null {
  const parsed = parseReelUrl(url);
  return parsed.ok ? `/clone?${new URLSearchParams({ url: parsed.url }).toString()}` : null;
}

// ---- Loading steps ------------------------------------------------------------------

/**
 * One request does all four steps, so progress is estimated from elapsed time
 * (typical timings), not reported by the server.
 */
export const CLONE_STEPS = [
  { label: "Fetching the post", detail: "Caption and public numbers", from: 0 },
  { label: "Transcribing", detail: "What's said in the video", from: 8 },
  { label: "Breaking it down", detail: "Hook, beats, payoff and call to action", from: 28 },
  { label: "Writing your version", detail: "In your voice, then a compliance check", from: 42 },
] as const;

export function cloneStepAt(seconds: number): number {
  let step = 0;
  CLONE_STEPS.forEach((s, i) => {
    if (seconds >= s.from) step = i;
  });
  return step;
}

// ---- Recent clones (this device, synced) -------------------------------------------

const SAVED_PREFIX = "content-studio-reel-clones-";
export const MAX_SAVED_CLONES = 8;
const SAVED_TRANSCRIPT_CHARS = 4000;

export interface SavedClone {
  /** platform:postId, so cloning the same post again replaces the old result. */
  id: string;
  savedAt: string;
  result: CloneResponse;
  /** What the frames showed, with the pacing measured from the video (Instagram reels only). */
  visuals?: Visuals & { measured: Pacing };
  /** The draft made from this result, once opened in Write or added to the board. */
  draftId?: string;
  onBoard?: boolean;
  /** Which of result.concepts result.myVersion is (0 when absent). */
  concept?: number;
  /** The versions of the other concepts built so far, by concept index, each with its own draft. */
  builds?: (ConceptBuild | null)[];
}

export interface ConceptBuild {
  version: MyVersion;
  draftId?: string;
  onBoard?: boolean;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function cloneIdOf(result: CloneResponse): string {
  return `${result.source.platform}:${result.source.postId}`;
}

export function loadSavedClones(userId: string | null | undefined): SavedClone[] {
  const s = storage();
  if (!s || !userId) return [];
  try {
    const parsed = JSON.parse(s.getItem(SAVED_PREFIX + scoped(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === "string" && isCloneResponse(c.result)) : [];
  } catch {
    return [];
  }
}

/** Saves a clone as the newest, replacing any older one for the same post. */
export function rememberClone(userId: string, clone: SavedClone): SavedClone[] {
  const trimmed: SavedClone = {
    ...clone,
    result: {
      ...clone.result,
      source: {
        ...clone.result.source,
        transcript: clone.result.source.transcript?.slice(0, SAVED_TRANSCRIPT_CHARS) ?? null,
        // Instagram's video link expires within days; never keep it.
        videoUrl: null,
      },
    },
  };
  const next = [trimmed, ...loadSavedClones(userId).filter((c) => c.id !== clone.id)].slice(0, MAX_SAVED_CLONES);
  const s = storage();
  if (s) {
    try {
      s.setItem(SAVED_PREFIX + scoped(userId), JSON.stringify(next));
    } catch {
      // Storage full: the result still shows, it just isn't kept.
    }
  }
  return next;
}

// ---- Drafts --------------------------------------------------------------------------------

type CtaType = "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question";

/** GeneratePage's CTA option closest to the version's call to action. */
export function ctaTypeFor(cta: string): CtaType {
  const t = String(cta ?? "").toLowerCase();
  if (/\bcomment\b/.test(t)) return "comment-keyword";
  if (/\b(dm|message|inbox)\b/.test(t)) return "dm-keyword";
  if (/\b(save|share|send this|tag)\b/.test(t)) return "save-share";
  if (/\b(call|chat|book|appointment|review)\b/.test(t)) return "book-call";
  if (/\?\s*$/.test(t)) return "open-question";
  return "dm-keyword";
}

/** Script, then the caption under the heading splitScriptCaption looks for. */
export function cloneDraftText(version: MyVersion): string {
  return `${version.script.trim()}\n\n---\n\nCAPTION:\n${version.caption.trim()}`;
}

export function buildCloneDraft(id: string, result: CloneResponse, now = new Date()): DraftEntry {
  const v = result.myVersion;
  const formula = formulaOfHook(v.hook, (v.hookOptions ?? []).map((text, i) => ({ text, formula: v.hookFormulas?.[i] })));
  return {
    id,
    createdAt: now.toISOString(),
    hook: v.hook,
    draft: cloneDraftText(v),
    pillar: "topic",
    pillarDetail: v.hook,
    audience: "general",
    format: "short-video",
    platform: result.source.platform,
    ctaType: ctaTypeFor(v.cta),
    ...(formula ? { hookFormula: formula.id } : {}),
  };
}

/**
 * Makes (once) the draft for a clone, optionally sets its board stage, and
 * returns the updated clone. A draft that already exists is never overwritten,
 * so edits made in Write survive a later "Add to board".
 */
export function saveCloneDraft(userId: string, clone: SavedClone, stage?: ProductionStage): SavedClone {
  const existing = clone.draftId ? getDraftById(userId, clone.draftId) : null;
  const draftId = existing?.id ?? newDraftId();
  if (!existing) upsertDraft(userId, buildCloneDraft(draftId, clone.result));
  if (stage) setStage(userId, draftId, stage);
  const updated: SavedClone = { ...clone, draftId, onBoard: clone.onBoard || Boolean(stage) };
  rememberClone(userId, updated);
  return updated;
}

// ---- Reading the video (Instagram reels) ---------------------------------------------------

export type VisualsPhase = "download" | "scan" | "read" | "done" | "error";

export interface VisualsJob {
  cloneId: string;
  phase: VisualsPhase;
  /** 0 to 1 through the scene scan. */
  progress: number;
  /** The frames being read, kept for this session only (too big to sync). */
  frames: string[];
  error?: string;
}

let visualsJob: VisualsJob | null = null;
let visualsToken: object | null = null;
const visualsListeners = new Set<(job: VisualsJob | null) => void>();

export const currentVisualsJob = () => visualsJob;

export function onVisualsJob(fn: (job: VisualsJob | null) => void): () => void {
  visualsListeners.add(fn);
  return () => {
    visualsListeners.delete(fn);
  };
}

/** True when this clone still carries Instagram's video link and hasn't been read yet. */
export function canReadVideo(clone: SavedClone): boolean {
  return (
    Boolean(clone.result.source.videoUrl) &&
    !clone.visuals &&
    Boolean(clone.result.myVersion.beats?.length) &&
    (clone.concept ?? 0) === 0
  );
}

/**
 * Samples the reel's frames in this tab, has reel-visuals read them, and saves
 * the result onto the clone. It lives outside the page, so it keeps going when
 * the consultant opens another page meanwhile. Starting another replaces it.
 */
export async function startVisualsJob(userId: string, clone: SavedClone): Promise<void> {
  const url = clone.result.source.videoUrl;
  const beats = (clone.result.myVersion.beats ?? []).map((b) => b.say);
  if (!url || !beats.length) return;
  if (visualsJob?.cloneId === clone.id && !["done", "error"].includes(visualsJob.phase)) return;

  const token = {};
  visualsToken = token;
  let job: VisualsJob = { cloneId: clone.id, phase: "download", progress: 0, frames: [] };
  const set = (patch: Partial<VisualsJob>) => {
    job = { ...job, ...patch };
    if (visualsToken !== token) return;
    visualsJob = job;
    visualsListeners.forEach((fn) => fn(job));
  };
  set({});

  try {
    const { frames, pacing } = await sampleReelFrames(url, (phase, fraction) => set({ phase, progress: fraction }));
    set({ phase: "read", progress: 1, frames: frames.map((f) => f.image) });
    const { data, error } = await supabase.functions.invoke("reel-visuals", {
      body: { frames, pacing, beats },
      timeout: 90_000,
    });
    if (error) {
      const ctx = (error as { context?: unknown }).context;
      const body = looksLikeResponse(ctx) ? ((await ctx.json().catch(() => null)) as { error?: unknown } | null) : null;
      throw new Error(typeof body?.error === "string" && body.error ? body.error : "Couldn't read the video this time. Try again.");
    }
    const visuals = (data as { visuals?: Visuals } | null)?.visuals;
    if (!visuals?.format || !Array.isArray(visuals.myVisuals)) {
      throw new Error("The video breakdown came back incomplete. Try again.");
    }
    const latest = loadSavedClones(userId).find((c) => c.id === clone.id) ?? clone;
    rememberClone(userId, { ...latest, visuals: { ...visuals, measured: pacing } });
    set({ phase: "done" });
  } catch (e) {
    set({ phase: "error", error: e instanceof Error && e.message ? e.message : "Couldn't read the video this time. Try again." });
  }
}

// ---- Concepts --------------------------------------------------------------------------------

/**
 * The clone showing concept `index`: `version` when it was just written, else
 * the one built before, each with its own draft. The version it leaves is
 * kept, so switching back is free. Unchanged when that concept isn't built.
 */
export function withConcept(clone: SavedClone, index: number, version?: MyVersion): SavedClone {
  const current = clone.concept ?? 0;
  if (!version && index === current) return clone;
  const builds = Array.from({ length: Math.max(clone.builds?.length ?? 0, current + 1, index + 1) }, (_, i) => clone.builds?.[i] ?? null);
  const target: ConceptBuild | null = version ? { version } : builds[index];
  if (!target) return clone;
  builds[current] = { version: clone.result.myVersion, draftId: clone.draftId, onBoard: clone.onBoard };
  const next: SavedClone = { ...clone, concept: index, builds, result: { ...clone.result, myVersion: target.version } };
  delete next.draftId;
  delete next.onBoard;
  if (target.draftId) next.draftId = target.draftId;
  if (target.onBoard) next.onBoard = true;
  return next;
}

/** The original's look, read for the first concept's beats, so only shown with that version. */
export const visualsFor = (clone: SavedClone) => ((clone.concept ?? 0) === 0 ? (clone.visuals ?? null) : null);

const conceptRuns = new Map<string, { index: number; promise: Promise<SavedClone> }>();

/** The concept being written for this clone, if one is. */
export const conceptRun = (cloneId: string) => conceptRuns.get(cloneId) ?? null;

/**
 * Writes the version of concept `index` and saves it as the clone's version.
 * It runs outside the page, so it lands even when the consultant opens
 * another page meanwhile. One at a time per clone.
 */
export function startConceptBuild(
  userId: string | null,
  clone: SavedClone,
  index: number,
  voice: VoiceInput | null,
  formulas: HookFormula[] = [],
): Promise<SavedClone> {
  const running = conceptRuns.get(clone.id);
  if (running) return running.promise;
  const concept = clone.result.concepts?.[index];
  if (!concept) return Promise.resolve(clone);
  const promise = invokeFunction("clone-reel", { url: clone.result.source.url, voice, formulas: formulaInput(formulas), concept })
    .then((data) => {
      const v = (data as { myVersion?: MyVersion } | null)?.myVersion;
      if (typeof v?.script !== "string" || typeof v?.caption !== "string" || !v.beats?.length) {
        throw new ReelCloneError("That version came back incomplete. Try again.", "server_error", 200);
      }
      const latest = (userId && loadSavedClones(userId).find((c) => c.id === clone.id)) || clone;
      const updated = withConcept(latest, index, tagHooks(v, formulas));
      if (userId) rememberClone(userId, updated);
      return updated;
    })
    .finally(() => conceptRuns.delete(clone.id));
  conceptRuns.set(clone.id, { index, promise });
  return promise;
}
