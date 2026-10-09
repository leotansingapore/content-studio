// Deep-links an existing saved draft into Write, pre-filled to reformat it
// for a different platform/format. No new edge-function mode needed - like
// the existing "remix" links in topPosts.ts/trends.ts, this rides the same
// free-text ctx field the generator already reads.

import { newDraftId, type DraftEntry } from "@/lib/draftHistory";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { scoped } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import {
  LONG_POSTS,
  validateLong,
  type IdeaDumpContext,
  type LongExtracts,
  type LongFormula,
  type LongPost,
} from "../../supabase/functions/idea-dump/logic.ts";

export interface RepurposeTarget {
  key: string;
  platform: string;
  format: string;
  label: string;
}

export const REPURPOSE_TARGETS: RepurposeTarget[] = [
  { key: "li-text", platform: "linkedin", format: "text-post", label: "LinkedIn post" },
  { key: "li-carousel", platform: "linkedin", format: "carousel", label: "LinkedIn carousel" },
  { key: "ig-carousel", platform: "instagram", format: "carousel", label: "Instagram carousel" },
  { key: "ig-reel", platform: "instagram", format: "short-video", label: "Instagram Reel" },
  { key: "tiktok", platform: "tiktok", format: "short-video", label: "TikTok script" },
  { key: "fb-text", platform: "facebook", format: "text-post", label: "Facebook post" },
];

/** Targets worth offering for a given draft - excludes its current platform+format. */
export function repurposeTargetsFor(draft: DraftEntry): RepurposeTarget[] {
  return REPURPOSE_TARGETS.filter(
    (t) => !(t.platform === draft.platform && t.format === draft.format),
  );
}

export function buildRepurposeUrl(draft: DraftEntry, target: RepurposeTarget): string {
  const params = new URLSearchParams({
    pillar: draft.pillar,
    detail: draft.pillarDetail || draft.hook || draft.draft.slice(0, 80),
    audience: draft.audience,
    platform: target.platform,
    format: target.format,
    ctx: `Repurpose this existing post (originally written for ${draft.platform}) into a ${target.label}. Keep the core idea and message, but adapt the structure, pacing and length for the new platform/format - don't just paste the original in. Original post for reference: ${draft.draft.slice(0, 600)}`,
  });
  return `/generate?${params.toString()}`;
}

// ---- One long piece into a week of posts (idea-dump mode "long") ----------------
// The app picks 5 formulas in rotation; the model pulls out the piece's claims,
// numbers, stories and quotable lines and writes a post per formula; the
// consultant keeps the posts they want as drafts. The last run is kept under
// content-studio-longpiece-<user> so it survives leaving the page.

export type { LongExtracts, LongPost };
export { MAX_LONG_CHARS } from "../../supabase/functions/idea-dump/logic.ts";

// A pasted piece is often not the consultant's own story, so formulas built on their own
// experience ("what one mistake cost me") made the model invent one (live check 2026-10-09).
const LONG_FORMULAS = HOOK_FORMULAS.filter((f) => !f.personal);

/** 5 different non-personal formulas in list order from `start`. */
export function longPieceFormulas(start: number): LongFormula[] {
  const len = LONG_FORMULAS.length;
  return Array.from({ length: LONG_POSTS }, (_, k) => {
    const f = LONG_FORMULAS[(((start + k) % len) + len) % len];
    return { id: f.id, name: f.name, template: f.template };
  });
}

export type LongOutcome =
  | { kind: "ok"; extracts: LongExtracts; posts: LongPost[]; truncated: boolean; usage: { used: number; limit: number } | null }
  | { kind: "limit" | "error"; message: string };

const LONG_ERROR = "Couldn't write posts from this piece. Try again in a minute.";

export function longSuccess(data: unknown, sent: LongFormula[]): LongOutcome {
  const res = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  // the server answers with formulaId per post; re-check it against what we sent
  const posts = (Array.isArray(res.posts) ? res.posts : []).map((p) => {
    const i = sent.findIndex((f) => f.id === (p as LongPost)?.formulaId);
    return { ...(p as object), formula: i + 1 };
  });
  const checked = validateLong({ extracts: res.extracts ?? {}, posts }, sent);
  if (!checked || checked.posts.length === 0) return { kind: "error", message: LONG_ERROR };
  const u = res.usage as { used?: unknown; limit?: unknown } | undefined;
  return {
    kind: "ok",
    ...checked,
    truncated: res.truncated === true,
    usage: u && typeof u.used === "number" && typeof u.limit === "number" ? { used: u.used, limit: u.limit } : null,
  };
}

/** A non-2xx answer (status 0 = never reached the server) as what the page shows. */
export function longFailure(status: number, body: unknown): LongOutcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof b.error === "string" && b.error.trim() ? b.error.trim() : "";
  if (status === 429 || b.code === "daily_limit") return { kind: "limit", message: message || "You've used today's runs. It resets at 8am Singapore time." };
  if (status === 0) return { kind: "error", message: "Couldn't reach the server. Check your connection and try again." };
  return { kind: "error", message: message || LONG_ERROR };
}

export async function weekFromLongPiece(text: string, context: IdeaDumpContext, formulas: LongFormula[]): Promise<LongOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke("idea-dump", { body: { mode: "long", text, formulas, ...context } });
    if (error) {
      const ctx = (error as { context?: unknown }).context as Response | undefined;
      const isResponse = Boolean(ctx) && typeof ctx.status === "number" && typeof ctx.json === "function";
      const body = isResponse ? await ctx.json().catch(() => null) : null;
      return longFailure(isResponse ? ctx.status : 0, body);
    }
    return longSuccess(data, formulas);
  } catch {
    return longFailure(0, null);
  }
}

/** A post the consultant keeps: a draft in My posts, its first line the hook, its formula kept. */
export function longPostEntry(p: LongPost, platform: string, audience: string, now = new Date()): DraftEntry {
  const draft = p.post.trim();
  return {
    id: newDraftId(),
    createdAt: now.toISOString(),
    hook: (draft.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 200),
    draft,
    pillar: "topic",
    pillarDetail: p.basedOn.slice(0, 160),
    audience,
    format: "text-post",
    platform,
    ctaType: "open-question",
    status: "draft",
    hookFormula: p.formulaId,
  };
}

export interface LongRun {
  createdAt: string;
  truncated: boolean;
  extracts: LongExtracts;
  /** draftId once kept. */
  posts: (LongPost & { draftId?: string })[];
}

const LONG_KEY = "content-studio-longpiece-";

export function loadLongRun(userId: string | null): LongRun | null {
  if (!userId) return null;
  try {
    const r = JSON.parse(localStorage.getItem(LONG_KEY + scoped(userId)) ?? "null") as LongRun | null;
    return r && Array.isArray(r.posts) && r.extracts ? r : null;
  } catch {
    return null;
  }
}

export function saveLongRun(userId: string, run: LongRun): LongRun {
  try {
    localStorage.setItem(LONG_KEY + scoped(userId), JSON.stringify(run));
  } catch {
    // storage full: the run still shows this visit
  }
  return run;
}
