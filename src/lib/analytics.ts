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
import { addDays, keyToDate, localDateKey, scheduleTime } from "@/lib/dueDates";

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

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
        body: `${labelFor(dim, best.key)} ${dimensionNoun(dim)} posts average ${best.avgEngagementRate}% engagement across ${best.count} posts, well above your ${Math.round(baseline * 10) / 10}% overall average. Write more of these.`,
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
      body: `Posts inside the platform's ideal length average ${good.avgEngagementRate}% engagement vs ${over.avgEngagementRate}% for posts that ran long. The live counter in Write flags this before you post. Trust it.`,
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
      body: "Your tracked posts aren't showing a clear pattern by platform, pillar, or format yet. Engagement looks fairly even. Keep tracking; patterns usually show up after a dozen or so posts.",
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

// ---------------------------------------------------------------------------
// Period comparison, ranking and CSV export (gap s43, after TryPost's
// analytics: compare to the previous period, top posts by a chosen metric,
// export). Windows are by posted date.
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  posts: number;
  impressions: number;
  engagements: number;
  /** % of impressions that engaged, across the window. */
  rate: number;
}

const DAY = 86_400_000;

function totals(posts: TrackedPost[]): PeriodTotals {
  const impressions = posts.reduce((s, p) => s + p.impressions, 0);
  const engagements = posts.reduce((s, p) => s + p.engagementTotal, 0);
  return { posts: posts.length, impressions, engagements, rate: impressions ? Math.round((engagements / impressions) * 1000) / 10 : 0 };
}

/** This window and the one before it, plus % change (null when there is nothing to compare to). */
export function comparePeriods(posts: TrackedPost[], days: number, now = Date.now()) {
  const at = (p: TrackedPost) => new Date(p.postedAt ?? p.createdAt).getTime();
  const current = totals(posts.filter((p) => at(p) > now - days * DAY && at(p) <= now));
  const previous = totals(posts.filter((p) => at(p) > now - 2 * days * DAY && at(p) <= now - days * DAY));
  const change = (k: keyof PeriodTotals) => (previous[k] ? Math.round(((current[k] - previous[k]) / previous[k]) * 100) : null);
  return { current, previous, change: { posts: change("posts"), impressions: change("impressions"), engagements: change("engagements"), rate: change("rate") } };
}

export type RankMetric = "engagementTotal" | "engagementRate" | "impressions" | "reactions" | "comments" | "shares";

export function rankPosts(posts: TrackedPost[], metric: RankMetric, n = 5): TrackedPost[] {
  const val = (p: TrackedPost) =>
    metric === "engagementTotal" || metric === "engagementRate" || metric === "impressions" ? p[metric] : p.metrics?.[metric] ?? 0;
  return [...posts].sort((a, b) => val(b) - val(a)).slice(0, n);
}

/** A spreadsheet of every tracked post. Quotes, commas and line breaks are escaped. */
export function postsCsv(posts: TrackedPost[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Posted", "Platform", "Format", "Hook", "Impressions", "Reactions", "Comments", "Shares", "Engagements", "Engagement rate %"];
  const rows = posts.map((p) => [
    (p.postedAt ?? p.createdAt).slice(0, 10), p.platform, p.format, p.hook || p.draft.slice(0, 80),
    p.impressions, p.metrics?.reactions ?? 0, p.metrics?.comments ?? 0, p.metrics?.shares ?? 0, p.engagementTotal, p.engagementRate,
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// ---------------------------------------------------------------------------
// Best hashtags and best time to post (gaps s46, s21). Both pool engagement
// over impressions, like every other card here, and stay quiet on too few posts.
// ---------------------------------------------------------------------------

/** The hashtags in a post, lower-cased, each once. A # inside a URL or an entity, or a bare number (#1), is not a tag. */
export function parseHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(/(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu)) tags.add(m[2].toLowerCase());
  return [...tags];
}

export interface TagRow {
  tag: string;
  count: number;
  rate: number;
}

/** Hashtags ranked by engagement rate across the posts that used them. Tags used once are left out, and nothing comes back on fewer than 3 posts with tags. */
export function hashtagRanking(posts: TrackedPost[], limit = 8): TagRow[] {
  const tagged = posts.filter((p) => p.impressions > 0).map((p) => ({ p, tags: parseHashtags(`${p.hook}\n${p.draft}`) })).filter((x) => x.tags.length);
  if (tagged.length < MIN_INSIGHT_SAMPLE) return [];
  const byTag = new Map<string, TrackedPost[]>();
  for (const { p, tags } of tagged) for (const t of tags) byTag.set(t, [...(byTag.get(t) ?? []), p]);
  return [...byTag]
    .filter(([, ps]) => ps.length >= MIN_GROUP_SAMPLE)
    .map(([tag, ps]) => ({ tag, count: ps.length, rate: totals(ps).rate }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count)
    .slice(0, limit);
}

/** When a post went out (day 0 = Mon): the time it was scheduled for, else when it was marked posted. hour is null when only the day is known. */
export function postingTime(p: DraftEntry): { day: number; hour: number | null } | null {
  const monFirst = (d: Date) => (d.getDay() + 6) % 7;
  const chosen = scheduleTime(p.scheduledFor);
  if (chosen && p.scheduledFor) return { day: monFirst(keyToDate(p.scheduledFor)), hour: Number(chosen.slice(0, 2)) };
  if (p.postedAt && /T\d{2}:\d{2}/.test(p.postedAt)) {
    const d = new Date(p.postedAt);
    return Number.isNaN(d.getTime()) ? null : { day: monFirst(d), hour: d.getHours() };
  }
  const key = p.postedAt ?? p.scheduledFor;
  return key && /^\d{4}-\d{2}-\d{2}/.test(key) ? { day: monFirst(keyToDate(key)), hour: null } : null;
}

export const DAYPARTS = [
  { label: "Morning", from: 6, to: 12 },
  { label: "Afternoon", from: 12, to: 18 },
  { label: "Evening", from: 18, to: 24 },
  { label: "Night", from: 0, to: 6 },
] as const;

export interface TimeCell {
  count: number;
  rate: number;
}

export interface TimeGrid {
  /** 7 days (Mon first) x 24 hours. */
  hours: TimeCell[][];
  /** 7 days x the 4 DAYPARTS. */
  dayparts: TimeCell[][];
  /** One cell per day, timed or not. */
  days: TimeCell[];
  /** Posts with a known day, and how many of those have a time too. */
  placed: number;
  timed: number;
  /** Most posts have a time, so the hour grid means something. */
  hasTimes: boolean;
}

/** Average engagement rate by the day and hour each post went out. */
export function postingTimeGrid(posts: TrackedPost[]): TimeGrid {
  const grid = (cols: number) => Array.from({ length: 7 }, () => Array.from({ length: cols }, () => [] as TrackedPost[]));
  const hours = grid(24);
  const parts = grid(DAYPARTS.length);
  const days = Array.from({ length: 7 }, () => [] as TrackedPost[]);
  let placed = 0;
  let timed = 0;
  for (const p of posts) {
    const at = p.impressions > 0 ? postingTime(p) : null;
    if (!at) continue;
    placed++;
    days[at.day].push(p);
    if (at.hour === null) continue;
    timed++;
    hours[at.day][at.hour].push(p);
    parts[at.day][DAYPARTS.findIndex((d) => at.hour! >= d.from && at.hour! < d.to)].push(p);
  }
  const cell = (ps: TrackedPost[]): TimeCell => ({ count: ps.length, rate: totals(ps).rate });
  return {
    hours: hours.map((r) => r.map(cell)),
    dayparts: parts.map((r) => r.map(cell)),
    days: days.map(cell),
    placed,
    timed,
    hasTimes: timed > 0 && timed * 2 >= placed,
  };
}

/** The best-landing cell backed by at least `min` posts, as [row, column]. */
export function bestCell(rows: TimeCell[][], min = MIN_GROUP_SAMPLE): [number, number] | null {
  let best: [number, number] | null = null;
  rows.forEach((r, i) =>
    r.forEach((c, j) => {
      if (c.count >= min && (!best || c.rate > rows[best[0]][best[1]].rate)) best = [i, j];
    }),
  );
  return best;
}

// ---------------------------------------------------------------------------
// The next time to post (gap s37): the best-landing hour from the user's own
// posted results when there are enough timed posts, else a common slot for the
// platform. The next such day with nothing already scheduled, at least 2 hours out.
// ---------------------------------------------------------------------------

/** Common slots when there is no history yet (day 0 = Mon). A starting point, not a rule. */
const COMMON_SLOT: Record<string, { day: number; hour: number; minute: number }> = {
  linkedin: { day: 1, hour: 8, minute: 30 },
  instagram: { day: 2, hour: 19, minute: 30 },
  facebook: { day: 3, hour: 20, minute: 0 },
  tiktok: { day: 4, hour: 20, minute: 0 },
};

export interface SuggestedTime {
  /** "YYYY-MM-DDTHH:MM", ready for scheduledFor. */
  at: string;
  /** "slot" = the adviser's own posting times; "best" = from their results; "common" = no history yet. */
  why: "slot" | "best" | "common";
}

/** A weekly posting time: "<day 0 = Mon>T<HH:MM>", e.g. "1T08:30" for Tuesday 8:30am. */
export const SLOT = /^[0-6]T([01]\d|2[0-3]):[0-5]\d$/;

export function suggestPostingTime(posts: TrackedPost[], platform: string, taken: string[], now: Date = new Date(), slots: string[] = []): SuggestedTime {
  // the adviser's own weekly posting times win: the next one on a day with nothing scheduled
  const mine = slots.filter((x) => SLOT.test(x)).sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
  if (mine.length) {
    const busy = new Set(taken.map((t) => t.slice(0, 10)));
    const earliest = now.getTime() + 2 * 3_600_000;
    const today = localDateKey(now);
    for (let i = 0; i < 56; i++) {
      const day = addDays(today, i);
      if (busy.has(day)) continue;
      const d = keyToDate(day);
      const wd = (d.getDay() + 6) % 7;
      for (const x of mine) {
        if (Number(x[0]) !== wd) continue;
        const [hh, mm] = x.slice(2).split(":").map(Number);
        if (new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime() < earliest) continue;
        return { at: `${day}T${x.slice(2)}`, why: "slot" };
      }
    }
  }
  const grid = postingTimeGrid(posts);
  const cell = grid.hasTimes ? bestCell(grid.hours) : null;
  const slot = cell ? { day: cell[0], hour: cell[1], minute: 0 } : COMMON_SLOT[platform] ?? COMMON_SLOT.linkedin;
  const busy = new Set(taken.map((t) => t.slice(0, 10)));
  const earliest = now.getTime() + 2 * 3_600_000;
  const today = localDateKey(now);
  for (let i = 0; i < 28; i++) {
    const day = addDays(today, i);
    const d = keyToDate(day);
    if ((d.getDay() + 6) % 7 !== slot.day || busy.has(day)) continue;
    if (new Date(d.getFullYear(), d.getMonth(), d.getDate(), slot.hour, slot.minute).getTime() < earliest) continue;
    const hh = String(slot.hour).padStart(2, "0");
    const mm = String(slot.minute).padStart(2, "0");
    return { at: `${day}T${hh}:${mm}`, why: cell ? "best" : "common" };
  }
  // every matching day in four weeks is taken: the first free day at that time
  for (let i = 1; i < 60; i++) {
    const day = addDays(today, i);
    if (!busy.has(day)) return { at: `${day}T${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`, why: cell ? "best" : "common" };
  }
  return { at: `${addDays(today, 1)}T09:00`, why: "common" };
}
