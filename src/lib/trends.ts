// Finance-content trend drops: what's working right now on each platform and
// how to adapt it. Data is a static, periodically-refreshed snapshot (see
// src/data/trends.json) rather than a live feed - there is no scraper wired
// up yet, so entries are added by re-running the research pass and appending.

import trendsData from "@/data/trends.json";

export type TrendPlatform = "linkedin" | "instagram" | "facebook" | "tiktok";

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
}

export const TRENDS = trendsData as TrendEntry[];

export function getTrends(): TrendEntry[] {
  return [...TRENDS].sort((a, b) => (a.date_found < b.date_found ? 1 : -1));
}

/**
 * Deep-link into Write, pre-filled with this trend's angle so the FC can
 * draft their own version instead of starting from a blank form.
 * GeneratePage already consumes pillar/detail/ctx/format/platform params.
 */
export function buildTrendRemixUrl(trend: TrendEntry): string {
  const params = new URLSearchParams({
    pillar: trend.pillar,
    detail: trend.title,
    ctx: `Riding this trend: ${trend.title}. Why it works: ${trend.why_it_works} How to film/write it: ${trend.how_to_film}`,
    format: trend.format,
    platform: trend.platform,
  });
  return `/generate?${params.toString()}`;
}
