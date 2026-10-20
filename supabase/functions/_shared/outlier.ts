// Outlier score: each post against its own account's usual, so "top performing" means beat its own normal rather
// than big raw numbers (docs/north-star/items/find-outlier-score.md). Pure, and its only import is median, so Deno
// functions and the Vite app share it. Nothing is stored: feeds score the posts they already hold when they render.

import { median } from "./socialAudit.ts";

export const OUTLIER = { youngHours: 48, baselinePosts: 20, minPosts: 3, confidentPosts: 5,
  tiers: { mega: 10, viral: 3, above: 1.5, below: 0.5 } } as const;
export type OutlierTier = "mega" | "viral" | "above" | "usual" | "below";
export interface OutlierPost { id: string; postedAt: string | null; views: number | null;
  likes: number; comments: number; shares?: number | null; saves?: number | null }
export interface Outlier { ratio: number | null; tier: OutlierTier | null; basis: "views" | "interactions" | null;
  baseline: number | null; posts: number; confidence: "high" | "low" | null;
  reason: "young" | "few-posts" | "no-numbers" | null; rank: number }

export const times = (ratio: number): string => `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}x`;

export function tierOf(ratio: number): OutlierTier {
  const t = OUTLIER.tiers;
  return ratio >= t.mega ? "mega" : ratio >= t.viral ? "viral" : ratio >= t.above ? "above" : ratio >= t.below ? "usual" : "below";
}

/** Virlo's weighting, ln(ratio) x ln(baseline), so one lucky post on a tiny account doesn't top the list. 0 at or below
 * the usual, and -1 for a post with no score, so it sorts under every scored one. */
export function rankOf(ratio: number | null, baseline: number | null): number {
  if (ratio === null || baseline === null) return -1;
  return ratio > 1 ? Math.log(ratio) * Math.log(Math.max(baseline, 10)) : 0;
}

const valueOf = (p: OutlierPost) => p.views ?? p.likes + p.comments + (p.shares ?? 0) + (p.saves ?? 0);
const timeOf = (p: OutlierPost) => (p.postedAt === null ? NaN : Date.parse(p.postedAt));

/** Every post of one account, keyed by id. A post with no date counts as settled, as the account audit treats it. */
export function scoreAccount(posts: OutlierPost[], now: number): Record<string, Outlier> {
  const young = (p: OutlierPost) => (now - timeOf(p)) / 3_600_000 < OUTLIER.youngHours;
  // The account's last 20 settled posts on each basis, newest first; undated ones sort as the oldest.
  const recent = (basis: "views" | "interactions") =>
    posts
      .filter((p) => (p.views !== null) === (basis === "views") && !young(p))
      .sort((a, b) => (timeOf(b) || -Infinity) - (timeOf(a) || -Infinity) || 0)
      .slice(0, OUTLIER.baselinePosts);
  const windows = { views: recent("views"), interactions: recent("interactions") };

  const out: Record<string, Outlier> = {};
  for (const p of posts) {
    const basis = p.views !== null ? "views" : "interactions";
    const others = windows[basis].filter((o) => o !== p).map(valueOf);
    const baseline = others.length >= OUTLIER.minPosts ? median(others) : null;
    const reason = young(p) ? "young" : baseline === null ? "few-posts" : baseline === 0 ? "no-numbers" : null;
    const ratio = reason || baseline === null ? null : valueOf(p) / baseline;
    out[p.id] = {
      ratio,
      tier: ratio === null ? null : tierOf(ratio),
      basis,
      baseline,
      posts: others.length,
      confidence: ratio === null ? null : others.length >= OUTLIER.confidentPosts ? "high" : "low",
      reason,
      rank: rankOf(ratio, baseline),
    };
  }
  return out;
}

/**
 * Best first: scored before unscored, a sure score before a shaky one (3 or 4 posts) of the same tier, then rank, then
 * ratio. Callers break a final tie by the newer post.
 * shortcut: not transitive when a shaky post outranks a sure one of its tier with another tier's post ranked between
 * them (the sort still returns every post, in an order that can depend on input order); fine while shaky scores are
 * rare (Following reads 12 posts, competitors 30), revisit if the niche feed mixes many 3- and 4-post accounts.
 */
export function byOutlier(a: Outlier, b: Outlier): number {
  if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null ? 1 : -1;
  if (a.tier === b.tier && a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
  return b.rank - a.rank || (b.ratio ?? 0) - (a.ratio ?? 0);
}
