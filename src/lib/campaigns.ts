// Campaigns (plan-campaign, Leo only): a month of posts for one audience, synced per brand under
// content-studio-campaigns-<scoped>, newest first, 12 at most. Deleting rewrites the array, so nothing depends on a
// tombstone. Status, cost and the angle mix are worked out from the posts, never stored. The wizard's layout
// (buildCampaignPosts, planCampaign, addCampaign) joins this file in wave 3.

import type { FunnelStageId } from "@/data/funnelFramework";
import type { PlanPillar } from "@/lib/contentPlan";
import { draftStatus, engagement, MAX_DRAFTS, type DraftEntry } from "@/lib/draftHistory";
import type { PlanPlatform } from "@/lib/positioning";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { BREAKOUT_RATIO, median } from "../../supabase/functions/_shared/socialAudit.ts";

export type CampaignFormat = "text-post" | "carousel" | "short-video" | "slideshow" | "wall" | "ai-video";
export const FREE_FORMATS: CampaignFormat[] = ["text-post", "carousel", "short-video"];
export type PostState = "waiting" | "drafting" | "ready" | "failed" | "making" | "made" | "skipped";

export interface CampaignPost {
  n: number; day: string; time?: string; angleId: string; format: CampaignFormat;
  stage: FunnelStageId; pillar: PlanPillar; formulaId?: string; ctaType: string;
  hook?: string; body?: string; script?: string; brief?: string; cta?: string; mas?: boolean | null;
  state: PostState; error?: string; draftId?: string;
  made?: { kind: "draft" | "slideshow" | "video"; id: string };
  prev?: { hook?: string; body?: string; script?: string; brief?: string; cta?: string };
}

export interface Campaign {
  id: string; name: string; createdAt: string; audience: string; audienceName: string;
  angles: { id: string; title: string; line: string }[]; platforms: PlanPlatform[]; accountIds?: string[];
  formats: CampaignFormat[]; weeks: number; perWeek: 2 | 3 | 5 | 7; startDay: string;
  pictures: "stock" | "mine"; goal?: string; target: { posts: number; winners: number };
  waitUntil?: string; posts: CampaignPost[];
}

export interface CampaignAsk { audience: string; angles: Campaign["angles"]; platforms: PlanPlatform[]; accountIds?: string[]; formats: CampaignFormat[]; weeks: number; perWeek: Campaign["perWeek"]; pictures: Campaign["pictures"]; name: string }

export const MAX_CAMPAIGNS = 12;
export const MAX_CAMPAIGN_CHARS = 800_000;
export const CAMPAIGNS_CHANGED = "content-studio-campaigns-changed";
export const LIMIT_LINE = "You have 12 campaigns. Delete a done one first.";
export const SIZE_LINE = "Couldn't save. Delete a done campaign to make room.";
const PREFIX = "content-studio-campaigns-";

/** A 15 s AI video: Speak for the clip plus its voiceover, from the price table (never typed). */
export const AI_VIDEO = sumPrices(priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice")) as Price;
/** A slideshow or a wall of text: one remix make. */
export const REMIX_MAKE = priceOf("remix-make") as Price;

export const campaignsKey = (userId: string) => PREFIX + scoped(userId);

export function loadCampaigns(userId: string | null | undefined): Campaign[] {
  if (!userId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(campaignsKey(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((c) => c && typeof c === "object" && typeof c.id === "string" && Array.isArray(c.posts) && Array.isArray(c.angles));
  } catch {
    return [];
  }
}

/** Saves the whole list (newest first). Null when saved; else the line, and nothing is written. */
export function saveCampaigns(userId: string, list: Campaign[]): string | null {
  if (list.length > MAX_CAMPAIGNS) return LIMIT_LINE;
  const json = JSON.stringify(list);
  if (json.length > MAX_CAMPAIGN_CHARS) return SIZE_LINE;
  try {
    localStorage.setItem(campaignsKey(userId), json);
  } catch {
    return SIZE_LINE;
  }
  window.dispatchEvent(new Event(CAMPAIGNS_CHANGED));
  return null;
}

export const getCampaign = (userId: string | null | undefined, id: string): Campaign | null => loadCampaigns(userId).find((c) => c.id === id) ?? null;

/** Changes one post (never its n). Returns the saved campaign, or null when it or the post is gone or it couldn't save. */
export function updatePost(userId: string, id: string, n: number, patch: Partial<CampaignPost>): Campaign | null {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === id);
  if (!c?.posts.some((p) => p.n === n)) return null;
  const next = { ...c, posts: c.posts.map((p) => (p.n === n ? { ...p, ...patch, n } : p)) };
  return saveCampaigns(userId, list.map((x) => (x.id === id ? next : x))) ? null : next;
}

/** Removes a campaign; returns it for the Undo toast (restoreCampaign), or null when it wasn't there. */
export function deleteCampaign(userId: string, id: string): Campaign | null {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  return saveCampaigns(userId, list.filter((x) => x.id !== id)) ? null : c;
}

/** Undo for deleteCampaign: back in its createdAt place. Null when saved, else the line. */
export function restoreCampaign(userId: string, c: Campaign): string | null {
  const list = loadCampaigns(userId).filter((x) => x.id !== c.id);
  return saveCampaigns(userId, [...list, c].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function onCampaignsChanged(cb: () => void): () => void {
  window.addEventListener(CAMPAIGNS_CHANGED, cb);
  return () => window.removeEventListener(CAMPAIGNS_CHANGED, cb);
}

export type CampaignStatus = "draft" | "running" | "done";

/** Done: every post made or skipped and the last post day before `today` (YYYY-MM-DD). Running: something made. Else draft. */
export function campaignStatus(c: Pick<Campaign, "posts">, today: string): CampaignStatus {
  const last = c.posts.reduce((m, p) => (p.day > m ? p.day : m), "");
  if (c.posts.length && last < today && c.posts.every((p) => p.state === "made" || p.state === "skipped")) return "done";
  return c.posts.some((p) => p.state === "made") ? "running" : "draft";
}

export interface CampaignCost {
  /** Free-format posts not yet made or skipped. */
  free: number;
  /** Posts a maker makes at Make, not yet made or skipped. */
  made: { slideshows: number; walls: number; videos: number };
  /** What those makes come to, in US$ to the cent: REMIX_MAKE per slideshow or wall, AI_VIDEO per video. */
  usd: number;
  /** How many of them today's limits cover; null when a limit couldn't be read (no coverage line). */
  covers: { remix: number | null; videos: number | null };
}

/** AI videos left today: the smaller of `ai-video` and `ai-voice` uses left, null when either is unread. */
export const videosLeft = (aiVideo: number | null, aiVoice: number | null): number | null =>
  aiVideo === null || aiVoice === null ? null : Math.min(aiVideo, aiVoice);

export function campaignCost(c: Pick<Campaign, "posts">, left: { video: number | null; remix: number | null }): CampaignCost {
  const open = c.posts.filter((p) => p.state !== "made" && p.state !== "skipped");
  const count = (f: CampaignFormat) => open.filter((p) => p.format === f).length;
  const made = { slideshows: count("slideshow"), walls: count("wall"), videos: count("ai-video") };
  const remix = made.slideshows + made.walls;
  return {
    free: open.filter((p) => FREE_FORMATS.includes(p.format)).length,
    made,
    usd: Math.round((remix * REMIX_MAKE.usd + made.videos * AI_VIDEO.usd) * 100) / 100,
    covers: { remix: left.remix === null ? null : Math.min(left.remix, remix), videos: left.video === null ? null : Math.min(left.video, made.videos) },
  };
}

/** Posts per angle in the campaign's angle order, skipped posts left out (AngleMix only draws these). */
export const angleCounts = (c: Pick<Campaign, "angles" | "posts">): { id: string; title: string; count: number }[] =>
  c.angles.map((a) => ({ id: a.id, title: a.title, count: c.posts.filter((p) => p.angleId === a.id && p.state !== "skipped").length }));

/** "Success looks like": 1 winner per 14 posts, at least 1 (Fastlane: 28 posts, 2 winners). */
export const winnersFor = (posts: number) => Math.max(1, Math.round(posts / 14));

const hasNumbers = (d: DraftEntry) => !!d.metrics && !!(d.metrics.impressions || engagement(d.metrics));

/** A winner: engagement at least BREAKOUT_RATIO (1.5) times the median of the brand's posts with numbers. */
export function isWinner(draft: DraftEntry, drafts: DraftEntry[]): boolean {
  const e = engagement(draft.metrics);
  const usual = median(drafts.filter(hasNumbers).map((d) => engagement(d.metrics)));
  return e > 0 && usual !== null && e >= BREAKOUT_RATIO * usual;
}

/** How many My posts entries making `adding` new ones pushes out (it keeps the newest MAX_DRAFTS). */
export const draftsDropped = (current: number, adding: number) => Math.max(0, current + adding - MAX_DRAFTS);

/** True only when an entry that making `adding` new ones pushes out of My posts (newest first) is posted or has numbers. */
export const dropsPostedDraft = (drafts: DraftEntry[], adding: number): boolean =>
  drafts.slice(Math.max(0, MAX_DRAFTS - adding)).some((d) => draftStatus(d) === "posted" || hasNumbers(d));

/** The next written, unmade post after `from`, wrapping to the start; null when none is waiting for review. */
export function nextToReview(c: Pick<Campaign, "posts">, from: number): number | null {
  const posts = [...c.posts].sort((a, b) => a.n - b.n);
  return [...posts.filter((p) => p.n > from), ...posts.filter((p) => p.n <= from)].find((p) => p.state === "ready")?.n ?? null;
}

export type QueueAction = "make" | "swap" | "edit" | "skip" | "prev" | "next";
const KEYS: Record<string, QueueAction> = { "1": "make", "2": "swap", "3": "edit", "4": "skip", ArrowLeft: "prev", ArrowRight: "next" };

/** The queue's keys 1 to 4 and the arrows; null while typing, inside a dialog, or with a modifier held. */
export function keyAction(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"> & { target: unknown }): QueueAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const el = e.target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? "") || el.isContentEditable || el.closest?.('[role="dialog"], [role="alertdialog"], dialog'))) return null;
  return KEYS[e.key] ?? null;
}
