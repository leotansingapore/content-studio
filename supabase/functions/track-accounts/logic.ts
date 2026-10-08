// Following (Discover > Following): read a public Instagram or TikTok account's
// numbers and latest posts, so the app can chart its growth, posting pace and
// new posts to remix. Pure, so vitest covers the request and the shaping.

import { normalizeHandle, type AuditPlatform, type AuditProfile, type SocialPost } from "../_shared/socialAudit.ts";

/** Posts read per check: enough for a posting pace, cheap enough to check daily. */
export const POSTS_PER_CHECK = 12;

export interface TrackedPost {
  id: string;
  url: string;
  format: SocialPost["format"];
  caption: string;
  postedAt: string | null;
  views: number | null;
  likes: number;
  comments: number;
}

export interface TrackResult {
  platform: AuditPlatform;
  handle: string;
  name: string;
  url: string;
  followers: number | null;
  postsCount: number | null;
  posts: TrackedPost[];
}

export function parseTrackRequest(body: unknown): { ok: true; platform: AuditPlatform; handle: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const platform = b.platform === "tiktok" ? "tiktok" : b.platform === "instagram" ? "instagram" : null;
  if (!platform) return { ok: false, error: "Pick Instagram or TikTok." };
  const handle = normalizeHandle(platform, String(b.handle ?? ""));
  if (!handle) return { ok: false, error: "That doesn't look like an account name. Paste @name or a profile link." };
  return { ok: true, platform, handle };
}

/** What the app keeps: numbers and the newest posts, captions cut to 240 characters, pinned posts left out. */
export function shapeResult(platform: AuditPlatform, profile: AuditProfile, posts: SocialPost[]): TrackResult {
  return {
    platform,
    handle: profile.handle,
    name: profile.fullName.slice(0, 80),
    url: profile.url,
    followers: profile.followers,
    postsCount: profile.postsCount,
    posts: posts
      .filter((p) => !p.pinned)
      .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
      .slice(0, POSTS_PER_CHECK)
      .map((p) => ({
        id: p.id, url: p.url, format: p.format, caption: p.caption.slice(0, 240), postedAt: p.postedAt,
        views: p.views, likes: p.likes, comments: p.comments,
      })),
  };
}
