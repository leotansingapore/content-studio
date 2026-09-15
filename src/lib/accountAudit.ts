// Client side of "Your account audit" (Instagram + TikTok) on the Analytics
// page. The audit-social-account edge function reads the account and writes
// the audit; this opens it, reads the caller's own rows (RLS) and builds the
// Write links. The judging logic is shared with the edge functions.

import { supabase } from "@/lib/supabase";
import {
  oneLine,
  type AuditAdvice,
  type AuditPlatform,
  type AuditProfile,
  type AuditStats,
  type AuditStatus,
  type RatedPost,
} from "../../supabase/functions/_shared/socialAudit.ts";

export {
  BREAKOUT_RATIO,
  MIN_POSTS_FOR_ADVICE,
  POSTS_TO_READ,
  WEAK_RATIO,
  formatWord,
  freshnessOf,
  normalizeHandle,
  oneLine,
  profileUrl,
  refreshDecision,
} from "../../supabase/functions/_shared/socialAudit.ts";
export type {
  AdvicePoint,
  AuditAdvice,
  AuditPlatform,
  AuditStats,
  RatedPost,
  RefreshDecision,
  RemixPick,
} from "../../supabase/functions/_shared/socialAudit.ts";

export interface AuditRow {
  id: string;
  user_id: string;
  platform: AuditPlatform;
  handle: string;
  status: AuditStatus;
  error: string | null;
  profile: AuditProfile | null;
  posts: RatedPost[];
  stats: AuditStats | null;
  advice: AuditAdvice | null;
  fetched_at: string | null;
  refresh_started_at: string | null;
  last_viewed_at: string;
  created_at: string;
}

export interface AuditSnapshot {
  taken_at: string;
  followers: number | null;
  posts_analyzed: number;
  median_views: number | null;
  median_engagement_rate: number | null;
  posts_per_week: number | null;
}

/** Returns the saved audit, starting a refresh on the server when it's due. */
export async function openAudit(
  platform: AuditPlatform,
  handle: string,
): Promise<{ audit: AuditRow; notice: string | null }> {
  const { data, error } = await supabase.functions.invoke("audit-social-account", {
    body: { platform, handle },
  });
  if (error) {
    // FunctionsHttpError hides the JSON body behind error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error("Couldn't reach the audit service. Check your connection and try again.");
  }
  const res = data as { audit?: AuditRow; notice?: string; error?: string } | null;
  if (res?.error) throw new Error(res.error);
  if (!res?.audit) throw new Error("The audit service sent nothing back. Try again.");
  return { audit: res.audit, notice: res.notice ?? null };
}

export async function loadAudit(id: string): Promise<AuditRow | null> {
  const { data, error } = await supabase
    .from("cs_social_audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as AuditRow | null) ?? null;
}

/** The latest two snapshots, newest first. */
export async function loadSnapshots(auditId: string): Promise<AuditSnapshot[]> {
  const { data, error } = await supabase
    .from("cs_social_snapshots")
    .select("taken_at, followers, posts_analyzed, median_views, median_engagement_rate, posts_per_week")
    .eq("audit_id", auditId)
    .order("taken_at", { ascending: false })
    .limit(2);
  if (error) throw error;
  return (data as AuditSnapshot[]) ?? [];
}

export async function removeAudit(id: string): Promise<void> {
  const { error } = await supabase.from("cs_social_audits").delete().eq("id", id);
  if (error) throw new Error("Couldn't remove the audit. Try again.");
}

/** The first non-empty line of a caption, shortened. */
export function firstLine(caption: string, max = 120): string {
  const line = String(caption ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ? oneLine(line, max) : "";
}

/**
 * Deep link into Write for a fresh version of one of the consultant's own
 * winning posts: same idea and mechanic, new hook and example.
 */
export function remixUrl(
  post: RatedPost,
  platform: AuditPlatform,
  handle: string,
  newAngle?: string | null,
): string {
  const name = platform === "instagram" ? "Instagram" : "TikTok";
  const standing =
    post.ratio !== null
      ? `${post.ratio}x my usual ${post.views !== null ? "views" : "likes and comments"}`
      : "one of my recent posts";
  const ctx = [
    `This is one of MY OWN best ${name} posts (@${handle}, ${standing}). Write a fresh version in my voice: keep the topic and what made it work, but use a new hook and a new example. Don't reuse the original wording.`,
    newAngle ? `Angle for the new version: ${newAngle}` : "",
    post.caption ? `Original caption: "${oneLine(post.caption, 300)}"` : "",
    "Keep it compliant for a licensed Singapore financial consultant.",
  ]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    pillar: "topic",
    detail: firstLine(post.caption, 90) || "A remix of my best post",
    ctx,
    format: post.format === "video" ? "short-video" : post.format === "carousel" ? "carousel" : "text-post",
    platform,
  });
  return `/generate?${params.toString()}`;
}

export function formatCount(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const short = (x: number) => (x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${short(v / 1000)}K`;
  return `${short(v / 1_000_000)}M`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function timeUntil(iso: string, now = Date.now()): string {
  const mins = Math.round((Date.parse(iso) - now) / 60_000);
  if (mins <= 1) return "soon";
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)}h`;
}

export function shortDate(iso: string | null, now = new Date()): string {
  if (!iso) return "undated";
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  // A pinned post from last September otherwise reads as this week.
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}
