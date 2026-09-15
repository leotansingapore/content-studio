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
  type MyVersion,
  type VoiceInput,
} from "../../supabase/functions/clone-reel/logic.ts";

export { LINK_MESSAGES, parseReelUrl } from "../../supabase/functions/clone-reel/logic.ts";
export type {
  Breakdown,
  CloneResponse,
  CloneSource,
  MyVersion,
  ReelMetrics,
  ReelPlatform,
} from "../../supabase/functions/clone-reel/logic.ts";
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
  network: "Couldn't reach the clone service. Check your connection and try again.",
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

/** Clones one reel. Throws ReelCloneError with a message fit to show. */
export async function cloneReel(url: string, voice: VoiceInput | null, signal?: AbortSignal): Promise<CloneResponse> {
  const started = Date.now();
  let data: unknown = null;
  let error: unknown = null;
  try {
    ({ data, error } = await supabase.functions.invoke("clone-reel", {
      body: { url, voice },
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
  if (!isCloneResponse(data)) {
    throw new ReelCloneError("The clone came back incomplete. Try again.", "server_error", 200);
  }
  return data;
}

/** The voice the function writes in: GeneratePage's rule, a usable profile or nothing. */
export function voiceForClone(profile: VoiceProfile | null): VoiceInput | null {
  if (!profile || !isVoiceProfileUsable(profile)) return null;
  const samples = profile.posts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length >= VOICE_MIN_CHARS)
    .slice(0, 3)
    .map((p) => p.slice(0, 900));
  const summary = (profile.voiceSummary ?? "").trim().slice(0, 1200);
  return summary || samples.length ? { summary, samples } : null;
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
  /** The draft made from this result, once opened in Write or added to the board. */
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
    const parsed = JSON.parse(s.getItem(SAVED_PREFIX + userId) ?? "[]");
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
      },
    },
  };
  const next = [trimmed, ...loadSavedClones(userId).filter((c) => c.id !== clone.id)].slice(0, MAX_SAVED_CLONES);
  const s = storage();
  if (s) {
    try {
      s.setItem(SAVED_PREFIX + userId, JSON.stringify(next));
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
