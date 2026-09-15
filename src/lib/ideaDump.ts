// Idea Dump (client side). Sends a consultant's rough notes to the idea-dump
// edge function, saves the post briefs it returns, scores each brief with the
// Coach's craft rules and the compliance scan, and hands a brief to the board
// (Idea column) or to Write, prefilled.
//
// Briefs persist per user, newest first, capped at MAX_SAVED_BRIEFS:
//   key: content-studio-ideadump-${userId}   (synced across devices by cloudSync)

import { supabase } from "@/lib/supabase";
import { analyzePosts } from "@/lib/coach";
import { hasComplianceErrors, scanCompliance, type ComplianceFlag } from "@/lib/compliance";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { loadPositioning } from "@/lib/positioning";
import { loadDrafts, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { setStage } from "@/lib/board";
import type { PlatformId } from "@/lib/platformCounters";
import { getFunnelStage } from "@/data/funnelFramework";
import {
  BRIEF_CTA_TYPES,
  BRIEF_FORMATS,
  BRIEF_PLATFORMS,
  FUNNEL_STAGE_IDS,
  MAX_IDEAS,
  MAX_NOTES_CHARS,
  NO_IDEAS_MESSAGE,
  splitIdeas,
  validateBriefs,
  type BriefPayload,
  type BriefPlatform,
  type IdeaDumpContext,
  type SkippedNote,
  type SplitResult,
} from "../../supabase/functions/idea-dump/logic.ts";

export { MAX_IDEAS, MAX_NOTES_CHARS, NO_IDEAS_MESSAGE, splitIdeas };
export type { SkippedNote, SplitResult };

export interface IdeaBrief extends BriefPayload {
  id: string;
  createdAt: string;
  /** The rough note as the consultant wrote it. */
  source: string;
  /** Index into hooks of the hook they picked. */
  chosenHook: number;
  /** Board card made from this brief, if any. */
  boardDraftId?: string;
}

export const MAX_SAVED_BRIEFS = 50;
const KEY_PREFIX = "content-studio-ideadump-";
const AUDIENCES = ["general", "young-adult", "working-adult", "parent", "pre-retiree"];
const NETWORK_MESSAGE = "Couldn't reach Idea Dump. Check your connection and try again.";
const GENERIC_ERROR = "Couldn't develop your ideas. Try again in a minute.";

// ---- Storage ------------------------------------------------------------------

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
}

/** Rebuilds a saved brief defensively: synced data can come from older versions. */
function toBrief(v: unknown): IdeaBrief | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const hooks = strings(b.hooks);
  if (
    typeof b.id !== "string" ||
    typeof b.idea !== "string" ||
    typeof b.angle !== "string" ||
    typeof b.cta !== "string" ||
    hooks.length === 0
  ) {
    return null;
  }
  const chosen = Number.isInteger(b.chosenHook) ? (b.chosenHook as number) : 0;
  return {
    id: b.id,
    createdAt: typeof b.createdAt === "string" ? b.createdAt : "",
    source: typeof b.source === "string" && b.source ? b.source : b.idea,
    note: typeof b.note === "number" ? b.note : null,
    idea: b.idea,
    angle: b.angle,
    hooks,
    talkingPoints: strings(b.talkingPoints),
    cta: b.cta,
    ctaType: pick(BRIEF_CTA_TYPES, b.ctaType, "open-question"),
    format: pick(BRIEF_FORMATS, b.format, "text-post"),
    platform: pick(BRIEF_PLATFORMS, b.platform, "linkedin"),
    funnelStage: pick(FUNNEL_STAGE_IDS, b.funnelStage, "attraction"),
    stageReason: typeof b.stageReason === "string" ? b.stageReason : "",
    chosenHook: chosen >= 0 && chosen < hooks.length ? chosen : 0,
    boardDraftId: typeof b.boardDraftId === "string" ? b.boardDraftId : undefined,
  };
}

export function loadBriefs(userId: string | null | undefined): IdeaBrief[] {
  const storage = safeStorage();
  if (!storage || !userId) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY_PREFIX + userId) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map(toBrief).filter((b): b is IdeaBrief => b !== null)
      : [];
  } catch {
    return [];
  }
}

export function saveBriefs(userId: string, briefs: IdeaBrief[]): IdeaBrief[] {
  const next = briefs.slice(0, MAX_SAVED_BRIEFS);
  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(KEY_PREFIX + userId, JSON.stringify(next));
    } catch {
      // storage full or unavailable; the briefs still show this session
    }
  }
  return next;
}

export function addBriefs(userId: string, fresh: IdeaBrief[]): IdeaBrief[] {
  return saveBriefs(userId, [...fresh, ...loadBriefs(userId)]);
}

export function updateBrief(userId: string, id: string, patch: Partial<IdeaBrief>): IdeaBrief[] {
  return saveBriefs(
    userId,
    loadBriefs(userId).map((b) => (b.id === id ? { ...b, ...patch } : b)),
  );
}

export function removeBrief(userId: string, id: string): IdeaBrief[] {
  return saveBriefs(
    userId,
    loadBriefs(userId).filter((b) => b.id !== id),
  );
}

// ---- Context sent with the notes ---------------------------------------------

/** What the app knows about the consultant, for the model to write in their voice. */
export function buildIdeaDumpContext(userId: string | null | undefined): IdeaDumpContext {
  const voiceProfile = loadVoiceProfile(userId);
  const voice =
    voiceProfile?.voiceSummary?.trim() ||
    (voiceProfile?.posts ?? [])
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      .slice(0, 2)
      .join("\n\n");

  const pos = loadPositioning(userId);
  const positioning =
    pos && (pos.oneLiner.trim() || pos.audienceDetail.trim() || pos.topics.length || pos.edge.trim())
      ? { oneLiner: pos.oneLiner, audienceDetail: pos.audienceDetail, topics: pos.topics, edge: pos.edge }
      : null;

  // Preferred platforms: the positioning's primary one, then where they post most.
  const counts = new Map<string, number>();
  for (const d of loadDrafts(userId)) {
    if (d.platform) counts.set(d.platform, (counts.get(d.platform) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const platforms = [...new Set([...(pos ? [pos.platform] : []), ...ranked])]
    .filter((p): p is BriefPlatform => (BRIEF_PLATFORMS as readonly string[]).includes(p))
    .slice(0, 3);

  return { voice: voice.slice(0, 1500), positioning, platforms };
}

/** The consultant's audience from positioning, as a Write audience value. */
export function preferredAudience(userId: string | null | undefined): string | null {
  const audience = loadPositioning(userId)?.audience;
  return audience && AUDIENCES.includes(audience) ? audience : null;
}

// ---- Calling the edge function ------------------------------------------------

export type DevelopOutcome =
  | { kind: "ok"; briefs: IdeaBrief[]; skipped: SkippedNote[]; usage: { used: number; limit: number } | null }
  | { kind: "limit"; message: string }
  | { kind: "no-ideas"; message: string; skipped: SkippedNote[] }
  | { kind: "error"; message: string };

function skippedFrom(v: unknown): SkippedNote[] {
  return (Array.isArray(v) ? v : []).filter(
    (s): s is SkippedNote =>
      Boolean(s) &&
      typeof s === "object" &&
      typeof (s as SkippedNote).note === "number" &&
      typeof (s as SkippedNote).idea === "string" &&
      typeof (s as SkippedNote).reason === "string",
  );
}

/** Maps a non-2xx response (status 0 = never reached the server) to what the UI shows. */
export function outcomeForFailure(status: number, body: unknown): DevelopOutcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof b.error === "string" && b.error.trim() ? b.error.trim() : "";
  if (status === 429 || b.code === "daily_limit") {
    return {
      kind: "limit",
      message: message || "You've used today's Idea Dumps. It resets at 8am Singapore time.",
    };
  }
  if (status === 422 || b.code === "no_ideas") {
    return { kind: "no-ideas", message: message || NO_IDEAS_MESSAGE, skipped: skippedFrom(b.skipped) };
  }
  if (status === 0) return { kind: "error", message: NETWORK_MESSAGE };
  return { kind: "error", message: message || GENERIC_ERROR };
}

function hookIsStrong(hook: string, platform: BriefPlatform): boolean {
  return (
    analyzePosts([{ text: hook, platform: platform as PlatformId }])?.dimensions.find((d) => d.key === "hook")
      ?.score === 100
  );
}

/** Turns a 2xx response into saved-ready briefs, re-validating the shape. */
export function outcomeForSuccess(data: unknown, ideas: string[], now = new Date()): DevelopOutcome {
  const res = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const checked = validateBriefs({ briefs: res.briefs, skipped: res.skipped }, { notes: ideas });
  if (!checked) return { kind: "error", message: GENERIC_ERROR };
  const skipped = skippedFrom(res.skipped).length ? skippedFrom(res.skipped) : checked.skipped;
  if (checked.briefs.length === 0) {
    return skipped.length
      ? { kind: "no-ideas", message: NO_IDEAS_MESSAGE, skipped }
      : { kind: "error", message: GENERIC_ERROR };
  }
  const usage = res.usage as { used?: unknown; limit?: unknown } | undefined;
  return {
    kind: "ok",
    briefs: checked.briefs.map((b) => {
      const strong = b.hooks.findIndex((h) => hookIsStrong(h, b.platform));
      return {
        ...b,
        id: newDraftId(),
        createdAt: now.toISOString(),
        source: b.note ? ideas[b.note - 1] : b.idea,
        chosenHook: strong === -1 ? 0 : strong,
      };
    }),
    skipped,
    usage:
      usage && typeof usage.used === "number" && typeof usage.limit === "number"
        ? { used: usage.used, limit: usage.limit }
        : null,
  };
}

export async function developIdeas(ideas: string[], context: IdeaDumpContext): Promise<DevelopOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke("idea-dump", {
      body: { notes: ideas.join("\n"), ...context },
    });
    if (error) {
      // FunctionsHttpError carries the Response; a fetch failure carries an Error.
      const ctx = (error as { context?: unknown }).context as Response | undefined;
      const isResponse = Boolean(ctx) && typeof ctx.status === "number" && typeof ctx.json === "function";
      const body = isResponse ? await ctx.json().catch(() => null) : null;
      return outcomeForFailure(isResponse ? ctx.status : 0, body);
    }
    return outcomeForSuccess(data, ideas);
  } catch {
    return { kind: "error", message: NETWORK_MESSAGE };
  }
}

// ---- Scoring ------------------------------------------------------------------

export interface BriefScore {
  /** 0-100, the same weights the Coach uses per post, with "developed" in place of length. */
  score: number;
  strongHooks: boolean[];
  clearAsk: boolean;
  developed: boolean;
  flags: ComplianceFlag[];
  compliant: boolean;
  /** The biggest thing to fix ("" if none). */
  issue: string;
}

export function scoreBrief(
  brief: Pick<IdeaBrief, "hooks" | "talkingPoints" | "angle" | "cta" | "platform">,
): BriefScore {
  const strongHooks = brief.hooks.map((h) => hookIsStrong(h, brief.platform));
  const strong = strongHooks.filter(Boolean).length;
  const clearAsk =
    analyzePosts([{ text: brief.cta }])?.dimensions.find((d) => d.key === "cta")?.score === 100;
  const developed = brief.talkingPoints.length >= 3 && brief.angle.trim().length > 0;
  const flags = scanCompliance([...brief.hooks, brief.angle, ...brief.talkingPoints, brief.cta].join("\n"));
  const compliant = !hasComplianceErrors(flags);
  const score = Math.round(
    (brief.hooks.length ? (35 * strong) / brief.hooks.length : 0) +
      (clearAsk ? 25 : 0) +
      (developed ? 20 : 0) +
      (compliant ? 20 : 0),
  );
  const issue = !compliant
    ? "Uses a regulated phrase. Reword it before you post."
    : strong === 0
      ? "No hook stands out. Open with a question, a number or a bold claim."
      : !clearAsk
        ? "The call to action isn't a clear ask. Tell the reader exactly what to do next."
        : !developed
          ? "Add another talking point so the post has substance."
          : "";
  return { score, strongHooks, clearAsk, developed, flags, compliant, issue };
}

// ---- Hand-offs: Write and the board -------------------------------------------

export function chosenHookText(brief: Pick<IdeaBrief, "hooks" | "chosenHook">): string {
  return brief.hooks[brief.chosenHook] ?? brief.hooks[0] ?? "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Deep link into Write with the brief filled in (GeneratePage reads these params). */
export function briefWriteUrl(brief: IdeaBrief, audience?: string | null): string {
  const stage = getFunnelStage(brief.funnelStage);
  const ctx = [
    `Write this post from my idea brief. Open with this hook: "${chosenHookText(brief)}"`,
    `Angle: ${brief.angle}`,
    brief.talkingPoints.length
      ? `Talking points: ${brief.talkingPoints.map((p, i) => `(${i + 1}) ${p}`).join(" ")}`
      : "",
    `Call to action: ${brief.cta}`,
    `Funnel stage: ${stage.label}.`,
    brief.source && brief.source !== brief.idea ? `My original note: "${clip(brief.source, 300)}"` : "",
    "Match my voice. Keep it compliant for a licensed Singapore financial consultant.",
  ]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    pillar: "topic",
    detail: brief.idea,
    ctx,
    format: brief.format,
    platform: brief.platform,
    cta: brief.ctaType,
    funnel: brief.funnelStage,
  });
  if (audience && AUDIENCES.includes(audience)) params.set("audience", audience);
  return `/generate?${params.toString()}`;
}

/** The Write topic a board card carries, so its Open link keeps the brief. */
function briefTopic(brief: IdeaBrief): string {
  return [
    brief.idea,
    `Angle: ${brief.angle}`,
    brief.talkingPoints.length ? `Points: ${brief.talkingPoints.join("; ")}` : "",
    `CTA: ${brief.cta}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Adds the brief to the board's Idea column. Returns the board card's draft id. */
export function addBriefToBoard(userId: string, brief: IdeaBrief, audience?: string | null): string {
  const hook = chosenHookText(brief);
  const drafts = loadDrafts(userId);
  if (brief.boardDraftId && drafts.some((d) => d.id === brief.boardDraftId)) return brief.boardDraftId;
  // Same guard as the board's quick add: don't stack a duplicate idea card.
  const existing = drafts.find((d) => !d.draft && d.hook === hook);
  if (existing) return existing.id;
  const entry: DraftEntry = {
    id: newDraftId(),
    createdAt: new Date().toISOString(),
    hook,
    draft: "",
    pillar: "topic",
    pillarDetail: briefTopic(brief),
    audience: audience && AUDIENCES.includes(audience) ? audience : "general",
    format: brief.format,
    platform: brief.platform,
    ctaType: brief.ctaType,
  };
  upsertDraft(userId, entry);
  setStage(userId, entry.id, "idea");
  return entry.id;
}

/** True when the brief's board card still exists. */
export function isOnBoard(brief: IdeaBrief, drafts: DraftEntry[]): boolean {
  return Boolean(brief.boardDraftId) && drafts.some((d) => d.id === brief.boardDraftId);
}
