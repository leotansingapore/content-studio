// Client side of "Your account audit" (Instagram + TikTok) on the Analytics
// page. The audit-social-account edge function reads the account and writes
// the audit; this opens it, reads the caller's own rows (RLS) and builds the
// Write links. The judging logic is shared with the edge functions.

import { supabase } from "@/lib/supabase";
import { localDateKey } from "@/lib/dueDates";
import { sourceKey } from "@/lib/remixSource";
import { IDEAS_PER_BATCH } from "../../supabase/functions/_shared/postIdeas.ts";
import type { SocialAccounts } from "@/lib/socialAccounts";
import {
  normalizeHandle,
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

/**
 * Returns the saved audit, starting a refresh on the server when it's due. `profession`: the open brand's
 * (professionFor), "" for an adviser; always sent, so the server reads the brand kit only for the weekly job.
 */
export async function openAudit(
  platform: AuditPlatform,
  handle: string,
  profession: string,
): Promise<{ audit: AuditRow; notice: string | null }> {
  const { data, error } = await supabase.functions.invoke("audit-social-account", {
    body: { platform, handle, profession },
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

/**
 * The caller's saved audit of one handle (owner-read RLS, unique on user, platform and handle), or null. A
 * direct read: it never starts a refresh, which openAudit can, and a refresh is paid.
 */
export async function loadAuditFor(platform: AuditPlatform, handle: string): Promise<AuditRow | null> {
  const { data, error } = await supabase
    .from("cs_social_audits")
    .select("*")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return (data as AuditRow | null) ?? null;
}

/**
 * Captions to fill /voice's empty slots ("Use my own posts"): the longest of at least `min` characters, at most
 * `slots` of them, leaving out collabs (another account's words) and repeats.
 */
export function captionsForVoice(posts: Pick<RatedPost, "caption" | "collab">[], slots: number, min = 100): string[] {
  const seen = new Set<string>();
  return posts
    .filter((p) => !p.collab)
    .map((p) => String(p.caption ?? "").trim())
    .filter((c) => c.length >= min && !seen.has(c) && seen.add(c))
    .sort((a, b) => b.length - a.length)
    .slice(0, Math.max(0, slots));
}

/** The latest snapshots, newest first. */
export async function loadSnapshots(auditId: string): Promise<AuditSnapshot[]> {
  const { data, error } = await supabase
    .from("cs_social_snapshots")
    .select("taken_at, followers, posts_analyzed, median_views, median_engagement_rate, posts_per_week")
    .eq("audit_id", auditId)
    .order("taken_at", { ascending: false })
    // Enough for the follower chart's points even when a day has several refreshes.
    .limit(60);
  if (error) throw error;
  return (data as AuditSnapshot[]) ?? [];
}

export interface FollowerPoint {
  at: string;
  followers: number;
  /** Followers gained (or lost) since the point before; null for the first snapshot. */
  change: number | null;
}

/**
 * The follower chart: one point a day (that day's last snapshot), oldest first, the newest `max` of them.
 * weekly: one point a week (Monday to Sunday) instead, for a long run of daily counts.
 */
export function followerSeries(snapshots: Pick<AuditSnapshot, "taken_at" | "followers">[], max = 12, weekly = false): FollowerPoint[] {
  const byDay = new Map<string, { at: string; followers: number }>();
  for (const s of snapshots) {
    if (s.followers === null) continue;
    const d = new Date(s.taken_at);
    const day = localDateKey(weekly ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)) : d);
    const kept = byDay.get(day);
    if (!kept || Date.parse(s.taken_at) > Date.parse(kept.at)) byDay.set(day, { at: s.taken_at, followers: s.followers });
  }
  const days = [...byDay.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return days
    .map((d, i) => ({ ...d, change: i ? d.followers - days[i - 1].followers : null }))
    .slice(-max);
}

/** Zernio's daily follower counts (UTC days) as snapshots, so followerSeries merges them with the audit's. */
export const zernioSnapshots = (series: { date: string; followers: number }[]): Pick<AuditSnapshot, "taken_at" | "followers">[] =>
  series.map((p) => ({ taken_at: `${p.date}T12:00:00Z`, followers: p.followers }));

/** The chart's points with Zernio's counts added: daily up to a month of days, else one a week (up to a year). */
export function growthSeries(
  snapshots: Pick<AuditSnapshot, "taken_at" | "followers">[],
  zernio: { date: string; followers: number }[] = [],
): { points: FollowerPoint[]; weekly: boolean } {
  if (!zernio.length) return { points: followerSeries(snapshots), weekly: false };
  const all = [...snapshots, ...zernioSnapshots(zernio)];
  const days = followerSeries(all, 1000);
  return days.length > 31 ? { points: followerSeries(all, 53, true), weekly: true } : { points: days, weekly: false };
}

/** Platforms the account audit reads. */
export const AUDITABLE: AuditPlatform[] = ["instagram", "tiktok"];

/** The audit panels Analytics shows: an auditable platform with a handle typed in. */
export const auditedHandles = (accounts: SocialAccounts): { platform: AuditPlatform; handle: string }[] =>
  AUDITABLE.flatMap((platform) => {
    const handle = normalizeHandle(platform, accounts[platform]?.handle ?? "");
    return handle ? [{ platform, handle }] : [];
  });

/** The connected account an audit panel is about: the same platform and handle. */
export const connectedFor = <T extends { platform: string; username: string }>(list: T[], platform: string, handle: string): T | undefined =>
  list.find((z) => z.platform === platform && normalizeHandle(platform as AuditPlatform, z.username) === handle);

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
    // resolves through rememberSource: the audit's posts are server rows the device doesn't keep
    source: sourceKey.audit(platform, post.id),
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

// ---- Post ideas in your style ------------------------------------------------

export { MIN_POSTS_FOR_IDEAS } from "../../supabase/functions/_shared/postIdeas.ts";

export interface IdeaRow {
  id: string;
  audit_id: string;
  batch: number;
  position: number;
  hook: string;
  idea: string;
  format: "video" | "carousel" | "image";
  based_on_post_id: string | null;
  why: string | null;
  formula: string | null;
  status: "new" | "used" | "dismissed";
  created_at: string;
}

/** The newest batch of ideas for an audit (including skipped ones). */
export async function loadLatestIdeas(auditId: string): Promise<IdeaRow[]> {
  const { data, error } = await supabase
    .from("cs_social_ideas")
    .select("*")
    .eq("audit_id", auditId)
    .order("batch", { ascending: false })
    .order("position", { ascending: true })
    .limit(IDEAS_PER_BATCH * 2);
  if (error) throw error;
  const rows = (data as IdeaRow[]) ?? [];
  return rows.filter((r) => r.batch === rows[0]?.batch);
}

/** Asks the server for a new batch that repeats nothing shown or posted before, written for `profession` ("" for an adviser). */
export async function requestIdeas(auditId: string, profession: string): Promise<IdeaRow[]> {
  const { data, error } = await supabase.functions.invoke("suggest-post-ideas", {
    body: { auditId, profession: profession || undefined },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error("Couldn't reach the ideas service. Check your connection and try again.");
  }
  const res = data as { ideas?: IdeaRow[]; error?: string } | null;
  if (res?.error) throw new Error(res.error);
  return res?.ideas ?? [];
}

export async function setIdeaStatus(id: string, status: "used" | "dismissed"): Promise<void> {
  const { error } = await supabase.from("cs_social_ideas").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Deep link into Write with the idea's hook and brief filled in. */
export function ideaWriteUrl(
  idea: IdeaRow,
  platform: AuditPlatform,
  handle: string,
  basedOn?: RatedPost,
): string {
  const name = platform === "instagram" ? "Instagram" : "TikTok";
  const ctx = [
    `Write this ${name} post for me (@${handle}). Open with this hook: "${idea.hook}"`,
    `What it covers: ${idea.idea}`,
    basedOn
      ? `Use the style that made my post "${firstLine(basedOn.caption, 120)}" work${
          basedOn.ratio !== null ? ` (${basedOn.ratio}x my usual ${basedOn.views !== null ? "views" : "likes and comments"})` : ""
        }.`
      : "",
    idea.why ? `Why it should travel: ${idea.why}` : "",
    "Match my voice. Keep it compliant for a licensed Singapore financial consultant.",
  ]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    pillar: "topic",
    detail: idea.hook,
    ctx,
    format: idea.format === "video" ? "short-video" : idea.format === "carousel" ? "carousel" : "text-post",
    platform,
  });
  return `/generate?${params.toString()}`;
}
