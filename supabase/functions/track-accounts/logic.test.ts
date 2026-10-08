import { describe, expect, it } from "vitest";
import { parseTrackRequest, POSTS_PER_CHECK, shapeResult } from "./logic";
import type { AuditProfile, SocialPost } from "../_shared/socialAudit";

describe("track request", () => {
  it("takes @name, a bare name or a profile link", () => {
    expect(parseTrackRequest({ platform: "instagram", handle: "@Money.Talks_SG" })).toEqual({ ok: true, platform: "instagram", handle: "money.talks_sg" });
    expect(parseTrackRequest({ platform: "tiktok", handle: "https://www.tiktok.com/@cpfnerd?lang=en" })).toEqual({ ok: true, platform: "tiktok", handle: "cpfnerd" });
  });

  it("refuses an unknown platform, a post link and junk", () => {
    expect(parseTrackRequest({ platform: "x", handle: "abc" }).ok).toBe(false);
    expect(parseTrackRequest({ platform: "instagram", handle: "https://www.instagram.com/reel/abc123/" }).ok).toBe(false);
    expect(parseTrackRequest({ platform: "instagram", handle: "a b c" }).ok).toBe(false);
    expect(parseTrackRequest(null).ok).toBe(false);
  });
});

const profile: AuditProfile = { handle: "acct", url: "https://www.instagram.com/acct/", fullName: "Acct Name", bio: "", followers: 1200, postsCount: 40, verified: false, isPrivate: false };
const post = (i: number, extra: Partial<SocialPost> = {}): SocialPost => ({
  id: `p${i}`, url: `https://www.instagram.com/p/p${i}/`, format: "video", caption: "x".repeat(300), postedAt: `2026-10-${String(i).padStart(2, "0")}T10:00:00Z`,
  views: 100 * i, likes: i, comments: 1, shares: null, saves: null, durationSec: 30, pinned: false, collab: false, ...extra,
});

describe("shaping a check", () => {
  it("keeps the newest unpinned posts with short captions", () => {
    const posts = Array.from({ length: 20 }, (_, i) => post(i + 1));
    posts[19] = post(20, { pinned: true });
    const r = shapeResult("instagram", profile, posts);
    expect(r).toMatchObject({ platform: "instagram", handle: "acct", name: "Acct Name", followers: 1200, postsCount: 40 });
    expect(r.posts).toHaveLength(POSTS_PER_CHECK);
    expect(r.posts[0].id).toBe("p19");
    expect(r.posts.some((p) => p.id === "p20")).toBe(false);
    expect(r.posts[0].caption).toHaveLength(240);
    expect(Object.keys(r.posts[0]).sort()).toEqual(["caption", "comments", "format", "id", "likes", "postedAt", "url", "views"]);
  });
});
