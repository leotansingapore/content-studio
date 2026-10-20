// Top-performing posts scraped from each advisor's Instagram, used as a swipe
// file: browse what worked, read the idea behind it, then remix it in Write.
//
// Data is static (src/data/topPosts.json), refreshed on request by re-running
// the scrape pipeline (see scripts/refresh-top-posts.md) and redeploying.
// Instagram's own CDN links expire within days, so we do not store them —
// instead scripts/fetch-covers.mjs downloads each post's cover ONCE and commits
// the bytes to public/covers/, and `cover` below points at our copy. A post
// without a `cover` (deleted, private) falls back to a format placeholder.

import topPostsData from "@/data/topPosts.json";
import advisorsData from "@/data/advisors.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import { sourceKey } from "@/lib/remixSource";
import type { PostTags } from "../../supabase/functions/remix/teardown.ts";
import { cutAtWord } from "../../supabase/functions/video-assist/captions.ts";

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
  /** Our committed copy of the post's cover image, e.g. "/covers/ABC123.jpg". */
  cover?: string;
  /** Jev's tags from the drop (scripts/tag-top-posts.mjs); read only by enrich(..., { useTags: true }). */
  tags?: Omit<PostTags, "by">;
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

/** The Instagram profile's id for a handle. Top posts, their source keys and resolveSource all key on it, while a
 * YouTube or TikTok entry with the same handle (e.g. honey-money-sg-youtube) shows the same Instagram posts. */
export const topAdvisorId = (handle: string): string | undefined => byHandle[handle.replace("@", "").toLowerCase()]?.id;

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

/** Tier-1 profiles are advisors; everyone else (creators, firms) counts as an influencer. */
export type CreatorKind = "advisor" | "influencer";
export const creatorKind = (tier?: number): CreatorKind => (tier === 1 ? "advisor" : "influencer");

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
    cutAtWord(post.caption.trim(), 90) ||
    "A proven post idea";
  // Inspiration, not plagiarism: we pass the idea, why it worked, the angle,
  // the structure and the caption as a style reference (Leo, 2026-10-08:
  // "the captions can be edited based on their business"), and tell the
  // writer never to copy the wording.
  const ctxParts = [
    `Reverse-engineer this proven post by ${advisor.name} (${advisor.handle}) and write my OWN version in my voice. Keep the mechanic and structure; do not copy the wording.`,
    post.idea?.hook ? `Original idea: ${post.idea.hook}` : "",
    post.idea?.why ? `Why it worked: ${post.idea.why}` : "",
    post.caption
      ? `Original caption, a style reference only (rewrite it for my business, never copy it): "${cutAtWord(post.caption, 400)}"`
      : "",
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
  const advisorId = topAdvisorId(advisor.handle);
  if (advisorId) params.set("source", sourceKey.top(advisorId, post.shortCode));
  return `/generate?${params.toString()}`;
}

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** 141900 -> "141.9K", 2200 -> "2.2K". */
export const compactNum = (n: number): string => COMPACT.format(Math.max(0, n || 0));

/** "3d ago", "4w ago", "5mo ago", "2y ago" from an ISO timestamp. */
export function postAge(iso: string | null | undefined, now = Date.now()): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
