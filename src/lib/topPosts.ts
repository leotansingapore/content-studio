// Top-performing posts scraped from each advisor's Instagram, used as a swipe
// file: browse what worked, read the idea behind it, then remix it in Write.
//
// Data is static (src/data/topPosts.json), refreshed on request by re-running
// the scrape pipeline (see scripts/refresh-top-posts.md) and redeploying. We do
// NOT store Instagram thumbnail URLs because their CDN links expire within days;
// cards are text-forward and link out to the live post for the visual.

import topPostsData from "@/data/topPosts.json";
import advisorsData from "@/data/advisors.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";

export interface PostIdea {
  hook: string;
  format: string;
  why: string;
  adapt: string;
}

export interface TopPost {
  shortCode: string;
  url: string;
  type: string;
  productType?: string | null;
  likes: number;
  comments: number;
  views: number;
  timestamp?: string | null;
  caption: string;
  idea?: PostIdea;
}

export interface TopPostWithAdvisor extends TopPost {
  advisorId: string;
  advisorName: string;
  handle: string;
  company?: string;
  tier?: number;
  // Advisor metadata carried onto the post so the swipe file can derive
  // topic/audience tags without a second lookup.
  niche?: string[];
  audience?: string[];
  advisorFormat?: string[];
}

const RAW = topPostsData as Record<string, TopPost[]>;
const ADVISORS = advisorsData as AdvisorEntry[];

const byHandle: Record<string, AdvisorEntry> = {};
for (const a of ADVISORS) {
  if (a.platform === "instagram") {
    byHandle[a.handle.replace("@", "").toLowerCase()] = a;
  }
}

/** Engagement score used for ranking: comments weighted higher than likes. */
export function engagementScore(p: TopPost): number {
  return (p.likes || 0) + (p.comments || 0) * 3;
}

export function getTopPostsForAdvisor(advisor: AdvisorEntry): TopPost[] {
  const key = advisor.handle.replace("@", "").toLowerCase();
  return (RAW[key] ?? []).slice().sort((a, b) => engagementScore(b) - engagementScore(a));
}

export function getAllTopPosts(): TopPostWithAdvisor[] {
  const out: TopPostWithAdvisor[] = [];
  for (const [handle, posts] of Object.entries(RAW)) {
    const advisor = byHandle[handle];
    if (!advisor) continue;
    for (const p of posts) {
      out.push({
        ...p,
        advisorId: advisor.id,
        advisorName: advisor.name,
        handle: advisor.handle,
        company: advisor.company as string | undefined,
        tier: advisor.tier,
        niche: advisor.niche,
        audience: advisor.audience,
        advisorFormat: advisor.format,
      });
    }
  }
  return out.sort((a, b) => engagementScore(b) - engagementScore(a));
}

export function hasTopPosts(advisor: AdvisorEntry): boolean {
  const key = advisor.handle.replace("@", "").toLowerCase();
  return (RAW[key]?.length ?? 0) > 0;
}

export const TOTAL_TOP_POSTS = Object.values(RAW).reduce(
  (n, list) => n + list.length,
  0,
);

/** Map an Instagram post type to the generator's format option. */
export function generatorFormat(p: TopPost): string {
  const t = (p.productType || p.type || "").toLowerCase();
  if (t.includes("clips") || t.includes("video") || t.includes("igtv")) {
    return "short-video";
  }
  if (t.includes("sidecar") || t.includes("carousel")) return "carousel";
  return "text-post";
}

/**
 * Deep-link into the Write page, pre-filling the topic, context and competitor
 * reference so the advisor can generate their own version of a proven post.
 * GeneratePage already consumes pillar/detail/ctx/ref/format/platform params.
 */
export function buildRemixUrl(
  post: TopPost,
  advisor: { name: string; handle: string },
  extras?: { angle?: string | null; structure?: string | null },
): string {
  const topic =
    post.idea?.hook ||
    post.caption.slice(0, 90).replace(/\s+\S*$/, "") ||
    "A proven post idea";
  // Inspiration, not plagiarism: we pass the idea, why it worked, the angle and
  // the structure — never the original wording to copy.
  const ctxParts = [
    `Reverse-engineer this proven post by ${advisor.name} (${advisor.handle}) and write my OWN version in my voice. Keep the mechanic and structure; do not copy the wording.`,
    post.idea?.hook ? `Original idea: ${post.idea.hook}` : "",
    post.idea?.why ? `Why it worked: ${post.idea.why}` : "",
    extras?.angle ? `Content angle to keep: ${extras.angle}` : "",
    extras?.structure ? `Structure to follow: ${extras.structure}` : "",
    post.idea?.adapt ? `How to adapt it for me: ${post.idea.adapt}` : "",
    `Change the specifics to fit my audience and stay compliant for a licensed SG financial advisor.`,
  ].filter(Boolean);
  const params = new URLSearchParams({
    pillar: "topic",
    detail: topic,
    ctx: ctxParts.join(" "),
    ref: advisor.handle.replace("@", ""),
    format: generatorFormat(post),
    platform: "instagram",
  });
  return `/generate?${params.toString()}`;
}
