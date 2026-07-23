// Look up a creator by handle/username and analyze their curated top posts.
//
// Honesty boundary: this only covers the ~50 SG finance/insurance creators
// already curated in src/data/advisors.json + src/data/topPosts.json (Leo's
// existing scrape pipeline). There is no live scraping wired up for an
// arbitrary handle - that would need an Apify subscription/API key and a
// backend to hold it (this is a static SPA, same constraint documented in
// docs/analytics-integration.md for OAuth analytics). See findAdvisor's
// null case for the honest fallback.
//
// It's also a small sample by design: topPosts.json is a swipe file of each
// creator's BEST posts (2-5 each), not their full history. That means we can
// see patterns behind what worked, but not compare against what didn't - so
// insights here are framed as "patterns to steal," not a full win/loss audit.

import advisorsData from "@/data/advisors.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import {
  engagementScore,
  generatorFormat,
  getTopPostsForAdvisor,
  hasTopPosts,
  type TopPost,
} from "@/lib/topPosts";

const ADVISORS = advisorsData as AdvisorEntry[];

function normalize(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function findAdvisor(query: string): AdvisorEntry | null {
  const q = normalize(query);
  if (!q) return null;
  const exact = ADVISORS.find((a) => normalize(a.handle) === q);
  if (exact) return exact;
  const byName = ADVISORS.find((a) => a.name.toLowerCase() === q);
  return byName ?? null;
}

export function searchAdvisors(query: string, limit = 6): AdvisorEntry[] {
  const q = normalize(query);
  if (!q) return [];
  return ADVISORS.filter(
    (a) => normalize(a.handle).includes(q) || a.name.toLowerCase().includes(q),
  ).slice(0, limit);
}

export const ANALYZABLE_COUNT = ADVISORS.filter((a) => hasTopPosts(a)).length;

export type CreatorInsightTone = "positive" | "tip" | "neutral";

export interface CreatorInsight {
  tone: CreatorInsightTone;
  title: string;
  body: string;
}

export interface FormatStat {
  format: string;
  label: string;
  count: number;
  avgScore: number;
}

export interface CreatorAnalysis {
  advisor: AdvisorEntry;
  posts: TopPost[];
  bestPost: TopPost | null;
  avgLikes: number;
  avgComments: number;
  formatStats: FormatStat[];
  insights: CreatorInsight[];
}

const FORMAT_LABEL: Record<string, string> = {
  "text-post": "Single-image / text posts",
  carousel: "Carousels",
  "short-video": "Reels / short video",
};
const ALL_FORMATS = ["carousel", "short-video", "text-post"];

export function analyzeCreator(advisor: AdvisorEntry): CreatorAnalysis | null {
  const posts = getTopPostsForAdvisor(advisor);
  if (posts.length === 0) return null;

  const bestPost = [...posts].sort(
    (a, b) => engagementScore(b) - engagementScore(a),
  )[0];
  const avgLikes = Math.round(
    posts.reduce((s, p) => s + (p.likes || 0), 0) / posts.length,
  );
  const avgComments =
    Math.round(
      (posts.reduce((s, p) => s + (p.comments || 0), 0) / posts.length) * 10,
    ) / 10;

  const groups = new Map<string, TopPost[]>();
  for (const p of posts) {
    const fmt = generatorFormat(p);
    groups.set(fmt, [...(groups.get(fmt) ?? []), p]);
  }
  const formatStats: FormatStat[] = [...groups.entries()]
    .map(([format, list]) => ({
      format,
      label: FORMAT_LABEL[format] ?? format,
      count: list.length,
      avgScore:
        Math.round(
          (list.reduce((s, p) => s + engagementScore(p), 0) / list.length) * 10,
        ) / 10,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const insights: CreatorInsight[] = [];

  if (formatStats.length > 0) {
    const top = formatStats[0];
    insights.push({
      tone: "positive",
      title: `${top.label} lead their top posts`,
      body:
        formatStats.length > 1
          ? `${top.count} of their ${posts.length} curated top posts are ${top.label.toLowerCase()}, averaging a ${top.avgScore} engagement score - the strongest format in their swipe file. If you're studying this account, this is the format to look at closest.`
          : `All ${top.count} of their curated top posts are ${top.label.toLowerCase()}. That's the only format we have data on for this account.`,
    });
  }

  if (bestPost?.idea?.why) {
    insights.push({
      tone: "tip",
      title: "Why their best post worked",
      body: bestPost.idea.why,
    });
  }
  if (bestPost?.idea?.adapt) {
    insights.push({
      tone: "tip",
      title: "How to make your own version",
      body: bestPost.idea.adapt,
    });
  }

  const usedFormats = new Set(formatStats.map((f) => f.format));
  const unusedFormat = ALL_FORMATS.find((f) => !usedFormats.has(f));
  if (unusedFormat && posts.length >= 2) {
    insights.push({
      tone: "neutral",
      title: `No ${FORMAT_LABEL[unusedFormat].toLowerCase()} in their top posts`,
      body: `Their curated best posts don't include any ${FORMAT_LABEL[unusedFormat].toLowerCase()}. That could mean it's genuinely untested for them, or it just underperforms and never made the swipe file - we can't tell which from this data alone. Worth testing it yourself either way, since it's an angle they're not covering.`,
    });
  }

  insights.push({
    tone: "neutral",
    title: "What this is (and isn't)",
    body: `This is based on ${posts.length} curated top-performing post${posts.length === 1 ? "" : "s"} for ${advisor.name}, not their full posting history - so it shows patterns behind what worked, not a complete win/loss breakdown. Treat it as a swipe file, not a scorecard.`,
  });

  return { advisor, posts, bestPost, avgLikes, avgComments, formatStats, insights };
}
