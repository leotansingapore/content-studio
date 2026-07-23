// Derived analytics over self-reported post metrics.
//
// Everything here reads DraftEntry[] from draftHistory.ts — there is no
// separate data store. All rates are computed from manually-entered numbers,
// so every function gates on a minimum sample size before surfacing a claim;
// see MIN_GROUP_SAMPLE / MIN_INSIGHT_SAMPLE below. This keeps "what's
// working" honest on the small datasets a single advisor will realistically
// have (a handful to a few dozen tracked posts), rather than overclaiming on
// noise.

import {
  draftStatus,
  engagement,
  loadDrafts,
  type DraftEntry,
} from "@/lib/draftHistory";
import { readout, type PlatformId } from "@/lib/platformCounters";

export interface TrackedPost extends DraftEntry {
  impressions: number;
  engagementTotal: number;
  engagementRate: number; // % of impressions that engaged; 0 if impressions unknown
}

// A group needs at least this many posts before its average is shown at all.
export const MIN_GROUP_SAMPLE = 2;
// A group needs at least this many posts before it can drive an auto-insight.
const MIN_INSIGHT_SAMPLE = 3;

export function getTrackedPosts(
  userId: string | null | undefined,
): TrackedPost[] {
  return loadDrafts(userId)
    .filter(
      (d) =>
        draftStatus(d) === "posted" &&
        d.metrics &&
        (d.metrics.impressions || engagement(d.metrics)),
    )
    .map((d) => {
      const impressions = d.metrics?.impressions ?? 0;
      const engagementTotal = engagement(d.metrics);
      return {
        ...d,
        impressions,
        engagementTotal,
        engagementRate:
          impressions > 0
            ? Math.round((engagementTotal / impressions) * 1000) / 10
            : 0,
      };
    });
}

// ---------------------------------------------------------------------------
// Trend: chronological engagement rate for posts that have both a posted
// date and impressions. Capped to the most recent N so the chart stays
// readable regardless of history length.
// ---------------------------------------------------------------------------

export interface TrendPoint {
  id: string;
  date: string; // ISO
  label: string; // short display date, e.g. "Jun 3"
  platform: string;
  engagementRate: number;
  engagementTotal: number;
  impressions: number;
}

export function getTrend(
  userId: string | null | undefined,
  limit = 20,
): TrendPoint[] {
  const withDates = getTrackedPosts(userId).filter(
    (d) => d.postedAt && d.impressions > 0,
  );
  const sorted = [...withDates].sort((a, b) =>
    a.postedAt! < b.postedAt! ? -1 : 1,
  );
  const recent = sorted.slice(-limit);
  return recent.map((d) => ({
    id: d.id,
    date: d.postedAt!,
    label: new Date(d.postedAt!).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    platform: d.platform,
    engagementRate: d.engagementRate,
    engagementTotal: d.engagementTotal,
    impressions: d.impressions,
  }));
}

// ---------------------------------------------------------------------------
// Breakdown: average engagement rate grouped by a dimension (platform,
// pillar, format, audience, cta type).
// ---------------------------------------------------------------------------

export type BreakdownDimension =
  | "platform"
  | "pillar"
  | "format"
  | "audience"
  | "ctaType";

export interface BreakdownRow {
  key: string;
  count: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number;
}

export function getBreakdown(
  userId: string | null | undefined,
  dimension: BreakdownDimension,
): BreakdownRow[] {
  const tracked = getTrackedPosts(userId).filter((d) => d.impressions > 0);
  const groups = new Map<string, TrackedPost[]>();
  for (const d of tracked) {
    const key = d[dimension] || "unspecified";
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  const rows: BreakdownRow[] = [];
  for (const [key, posts] of groups) {
    const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
    const totalEngagement = posts.reduce((s, p) => s + p.engagementTotal, 0);
    rows.push({
      key,
      count: posts.length,
      totalImpressions,
      totalEngagement,
      avgEngagementRate:
        totalImpressions > 0
          ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
          : 0,
    });
  }
  return rows.sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
}

// ---------------------------------------------------------------------------
// Length correlation: does staying inside the platform's sweet-spot word
// count actually correlate with better engagement? Reuses the same
// good/warn/over classification the composer shows live while writing.
// ---------------------------------------------------------------------------

export type LengthStatus = "good" | "warn" | "over";

export interface LengthRow {
  status: LengthStatus;
  count: number;
  avgEngagementRate: number;
}

export function getLengthCorrelation(
  userId: string | null | undefined,
): LengthRow[] {
  const tracked = getTrackedPosts(userId).filter((d) => d.impressions > 0);
  const buckets: Record<LengthStatus, TrackedPost[]> = {
    good: [],
    warn: [],
    over: [],
  };
  for (const d of tracked) {
    const platform = (["linkedin", "instagram", "facebook", "tiktok"] as const).includes(
      d.platform as PlatformId,
    )
      ? (d.platform as PlatformId)
      : "linkedin";
    const status = readout(d.draft, platform).status;
    buckets[status].push(d);
  }
  return (["good", "warn", "over"] as const)
    .map((status) => {
      const posts = buckets[status];
      const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
      const totalEngagement = posts.reduce((s, p) => s + p.engagementTotal, 0);
      return {
        status,
        count: posts.length,
        avgEngagementRate:
          totalImpressions > 0
            ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
            : 0,
      };
    })
    .filter((r) => r.count > 0);
}

// ---------------------------------------------------------------------------
// Day-of-week: which day tends to land best. Uses the date the post was
// marked posted (not an exact posting time, which this app doesn't collect),
// so treat it as directional, not a precise "best hour to post" claim.
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface DayRow {
  day: string;
  count: number;
  avgEngagementRate: number;
}

export function getDayOfWeekBreakdown(
  userId: string | null | undefined,
): DayRow[] {
  const tracked = getTrackedPosts(userId).filter(
    (d) => d.postedAt && d.impressions > 0,
  );
  const buckets: TrackedPost[][] = Array.from({ length: 7 }, () => []);
  for (const d of tracked) {
    const jsDay = new Date(d.postedAt!).getDay(); // 0 = Sun
    const idx = (jsDay + 6) % 7; // 0 = Mon
    buckets[idx].push(d);
  }
  return buckets
    .map((posts, i) => {
      const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
      const totalEngagement = posts.reduce((s, p) => s + p.engagementTotal, 0);
      return {
        day: DAY_LABELS[i],
        count: posts.length,
        avgEngagementRate:
          totalImpressions > 0
            ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
            : 0,
      };
    })
    .filter((r) => r.count > 0);
}

// ---------------------------------------------------------------------------
// Auto-generated insights: plain-language "what's working / what's not /
// double down / how to improve" bullets, each gated on sample size so a
// single lucky (or unlucky) post never drives a recommendation.
// ---------------------------------------------------------------------------

export type InsightTone = "positive" | "negative" | "tip" | "neutral";

export interface Insight {
  tone: InsightTone;
  title: string;
  body: string;
}

const DIMENSION_LABEL: Record<BreakdownDimension, Record<string, string>> = {
  platform: {
    linkedin: "LinkedIn",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
  },
  pillar: {
    interest: "Interest",
    identity: "Identity",
    topic: "Topic",
    market: "Market",
  },
  format: {
    "text-post": "Text posts",
    carousel: "Carousels",
    "short-video": "Short video",
    story: "Stories",
  },
  audience: {},
  ctaType: {},
};

function labelFor(dimension: BreakdownDimension, key: string): string {
  return DIMENSION_LABEL[dimension]?.[key] ?? key;
}

// Exposed so pages building their own breakdown charts don't need a second
// copy of these label maps.
export function labelForDimension(dimension: BreakdownDimension, key: string): string {
  return labelFor(dimension, key);
}

function dimensionNoun(dimension: BreakdownDimension): string {
  switch (dimension) {
    case "platform":
      return "platform";
    case "pillar":
      return "pillar";
    case "format":
      return "format";
    case "audience":
      return "audience";
    case "ctaType":
      return "CTA style";
  }
}

export function getInsights(userId: string | null | undefined): Insight[] {
  const tracked = getTrackedPosts(userId).filter((d) => d.impressions > 0);
  const insights: Insight[] = [];

  if (tracked.length < MIN_INSIGHT_SAMPLE) {
    insights.push({
      tone: "neutral",
      title: "Track a few more posts",
      body: `You've logged real numbers on ${tracked.length} post${
        tracked.length === 1 ? "" : "s"
      }. Add impressions and engagement on at least ${MIN_INSIGHT_SAMPLE} posted posts (in My posts) and this page starts surfacing what's actually working.`,
    });
    return insights;
  }

  const overallImpressions = tracked.reduce((s, d) => s + d.impressions, 0);
  const overallEngagement = tracked.reduce((s, d) => s + d.engagementTotal, 0);
  const baseline =
    overallImpressions > 0 ? (overallEngagement / overallImpressions) * 100 : 0;

  // Best / worst per dimension.
  const dims: BreakdownDimension[] = ["platform", "pillar", "format"];
  for (const dim of dims) {
    const rows = getBreakdown(userId, dim).filter(
      (r) => r.count >= MIN_INSIGHT_SAMPLE,
    );
    if (rows.length < 2 || baseline <= 0) continue;
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (best.avgEngagementRate >= baseline * 1.15) {
      insights.push({
        tone: "positive",
        title: `Double down: ${labelFor(dim, best.key)}`,
        body: `${labelFor(dim, best.key)} ${dimensionNoun(dim)} posts average ${best.avgEngagementRate}% engagement across ${best.count} posts — well above your ${Math.round(baseline * 10) / 10}% overall average. Write more of these.`,
      });
    }
    if (
      worst.key !== best.key &&
      worst.avgEngagementRate <= baseline * 0.7 &&
      worst.avgEngagementRate < best.avgEngagementRate
    ) {
      insights.push({
        tone: "negative",
        title: `Underperforming: ${labelFor(dim, worst.key)}`,
        body: `${labelFor(dim, worst.key)} ${dimensionNoun(dim)} posts average just ${worst.avgEngagementRate}% engagement across ${worst.count} posts. Either rework the angle or spend less time there.`,
      });
    }
  }

  // Length correlation.
  const lengthRows = getLengthCorrelation(userId);
  const good = lengthRows.find((r) => r.status === "good");
  const over = lengthRows.find((r) => r.status === "over");
  if (
    good &&
    over &&
    good.count >= MIN_INSIGHT_SAMPLE &&
    over.count >= 2 &&
    good.avgEngagementRate > over.avgEngagementRate * 1.15
  ) {
    insights.push({
      tone: "tip",
      title: "Keep it inside the sweet spot",
      body: `Posts inside the platform's ideal length average ${good.avgEngagementRate}% engagement vs ${over.avgEngagementRate}% for posts that ran long. The live counter in Write flags this before you post — trust it.`,
    });
  }

  // Day of week.
  const dayRows = getDayOfWeekBreakdown(userId).filter(
    (r) => r.count >= MIN_INSIGHT_SAMPLE,
  );
  if (dayRows.length >= 2 && baseline > 0) {
    const sorted = [...dayRows].sort(
      (a, b) => b.avgEngagementRate - a.avgEngagementRate,
    );
    const bestDay = sorted[0];
    if (bestDay.avgEngagementRate >= baseline * 1.15) {
      insights.push({
        tone: "tip",
        title: `${bestDay.day} is your best day`,
        body: `Posts marked posted on a ${bestDay.day} average ${bestDay.avgEngagementRate}% engagement, your strongest day with ${bestDay.count} posts tracked. Bias your posting schedule toward it. (Based on the date you marked the post as posted, not an exact posting time.)`,
      });
    }
  }

  // Recent trend: last half vs the half before it.
  const trend = getTrend(userId, 40);
  if (trend.length >= 6) {
    const mid = Math.floor(trend.length / 2);
    const earlier = trend.slice(0, mid);
    const recent = trend.slice(mid);
    const avg = (pts: TrendPoint[]) =>
      pts.reduce((s, p) => s + p.engagementRate, 0) / pts.length;
    const earlierAvg = avg(earlier);
    const recentAvg = avg(recent);
    if (earlierAvg > 0) {
      const change = ((recentAvg - earlierAvg) / earlierAvg) * 100;
      if (Math.abs(change) >= 15) {
        insights.push({
          tone: change > 0 ? "positive" : "negative",
          title: change > 0 ? "Trending up" : "Trending down",
          body: `Your average engagement rate is ${Math.round(recentAvg * 10) / 10}% over your most recent ${recent.length} tracked posts, ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change))}% from the ${earlier.length} before that.`,
        });
      }
    }
  }

  if (insights.length === 0) {
    insights.push({
      tone: "neutral",
      title: "No strong signal yet",
      body: "Your tracked posts aren't showing a clear pattern by platform, pillar, or format yet — engagement looks fairly even. Keep tracking; patterns usually show up after a dozen or so posts.",
    });
  }

  const priority: Record<InsightTone, number> = {
    positive: 0,
    negative: 1,
    tip: 2,
    neutral: 3,
  };
  return insights.sort((a, b) => priority[a.tone] - priority[b.tone]).slice(0, 5);
}
