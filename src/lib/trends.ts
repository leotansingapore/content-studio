// Daily trend drops: what's moving in the world right now (memes, news,
// current affairs, cultural moments) translated into content an SG financial
// consultant can actually post, with ready-made hooks, talking points and a CTA.
//
// Data is a static file (src/data/trends.json) refreshed by the scheduled
// trend-scout routine, which commits a fresh drop to `main` each morning.
// There is no live feed at runtime - the page reads whatever the last drop
// wrote.

import trendsData from "@/data/trends.json";

export type TrendPlatform = "linkedin" | "instagram" | "facebook" | "tiktok";

/** Mirrors the CTA options in the Write generator so a trend can preset one. */
export type TrendCtaType =
  | "dm-keyword"
  | "comment-keyword"
  | "save-share"
  | "book-call"
  | "open-question";

export interface TrendEntry {
  id: string;
  platform: TrendPlatform;
  format: string;
  pillar: string;
  title: string;
  why_it_works: string;
  how_to_film: string;
  source_label: string;
  source_url: string;
  date_found: string;
  // Fields added with the world-trends scout. Optional: drops written before
  // this shape (and any partial entry) still render without blowing up.
  /** meme | news | current-affairs | event | culture | sport */
  trend_type?: string;
  /** The thing actually trending in the world that this post rides on. */
  trend_source?: string;
  /** Ready-to-use opening lines. */
  hooks?: string[];
  /** The points to actually make in the post. */
  talking_points?: string[];
  /** The closing call to action, as a usable line. */
  cta?: string;
  cta_type?: TrendCtaType;
}

const VALID_CTA_TYPES: TrendCtaType[] = [
  "dm-keyword",
  "comment-keyword",
  "save-share",
  "book-call",
  "open-question",
];

export const TRENDS = trendsData as TrendEntry[];

export function getTrends(): TrendEntry[] {
  return [...TRENDS].sort((a, b) => (a.date_found < b.date_found ? 1 : -1));
}

/** Non-empty string entries only - guards against a partial scout drop. */
function cleanList(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => typeof s === "string" && s.trim().length > 0);
}

export function trendHooks(t: TrendEntry): string[] {
  return cleanList(t.hooks);
}

export function trendTalkingPoints(t: TrendEntry): string[] {
  return cleanList(t.talking_points);
}

/**
 * Deep-link into Write, pre-filled with this trend's angle, chosen hook,
 * talking points and CTA so the consultant starts from a brief rather than a
 * blank form. GeneratePage already consumes these params.
 */
export function buildTrendRemixUrl(trend: TrendEntry, hook?: string): string {
  const hooks = trendHooks(trend);
  const chosenHook = hook ?? hooks[0];
  const points = trendTalkingPoints(trend);

  const ctxParts = [
    trend.trend_source
      ? `This post rides a current trend: ${trend.trend_source}`
      : `Riding this trend: ${trend.title}`,
    `Why it works: ${trend.why_it_works}`,
    chosenHook ? `Open with this hook (adapt the wording to my voice): ${chosenHook}` : "",
    points.length > 0 ? `Cover these points: ${points.join(" | ")}` : "",
    trend.cta ? `End with this call to action: ${trend.cta}` : "",
    `Delivery notes: ${trend.how_to_film}`,
  ].filter(Boolean);

  const params = new URLSearchParams({
    pillar: trend.pillar,
    detail: trend.title,
    ctx: ctxParts.join("\n"),
    format: trend.format,
    platform: trend.platform,
  });
  if (trend.cta_type && VALID_CTA_TYPES.includes(trend.cta_type)) {
    params.set("cta", trend.cta_type);
  }
  return `/generate?${params.toString()}`;
}
