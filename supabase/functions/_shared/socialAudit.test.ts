import { describe, expect, it } from "vitest";
import { COMPLIANCE_FLAGS } from "../../../src/lib/compliance.ts";
import {
  COMPLIANCE_RULES,
  buildAdvicePrompt,
  computeAudit,
  normalizeHandle,
  normalizeIgPost,
  normalizeTiktokPost,
  refreshDecision,
  tiktokProfile,
  validateAdvice,
  type AuditFreshness,
  type SocialPost,
} from "./socialAudit.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-15T00:00:00Z");

function post(id: string, overrides: Partial<SocialPost>): SocialPost {
  return {
    id,
    url: `https://example.com/${id}`,
    format: "video",
    caption: `caption ${id}`,
    postedAt: null,
    views: null,
    likes: 0,
    comments: 0,
    shares: null,
    saves: null,
    durationSec: null,
    pinned: false,
    collab: false,
    ...overrides,
  };
}

const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

// Six TikTok videos: five settled (median views 2,000) and one an hour old.
const tiktokPosts = [
  post("p1", { views: 1000, likes: 10, shares: 0, saves: 0, durationSec: 20, postedAt: daysAgo(10) }),
  post("p2", { views: 2000, likes: 20, shares: 0, saves: 0, durationSec: 20, postedAt: daysAgo(9) }),
  post("p3", { views: 3000, likes: 30, shares: 0, saves: 0, durationSec: 45, postedAt: daysAgo(8) }),
  post("p4", { views: 9000, likes: 90, shares: 0, saves: 0, durationSec: 45, postedAt: daysAgo(7) }),
  post("p5", { views: 400, likes: 4, shares: 0, saves: 0, durationSec: 90, postedAt: daysAgo(6) }),
  post("p6", { views: 100000, likes: 1000, shares: 0, saves: 0, durationSec: 45, postedAt: daysAgo(1 / 24) }),
];

describe("compliance", () => {
  it("mirrors the app's compliance rules exactly", () => {
    const shape = (rules: { id: string; pattern: RegExp }[]) =>
      rules.map((r) => ({ id: r.id, source: r.pattern.source, flags: r.pattern.flags }));
    expect(shape(COMPLIANCE_RULES)).toEqual(shape(COMPLIANCE_FLAGS));
  });
});

describe("normalizeHandle", () => {
  it("accepts handles and profile links", () => {
    expect(normalizeHandle("instagram", "@Humphreytalks")).toBe("humphreytalks");
    expect(normalizeHandle("instagram", "https://www.instagram.com/humphreytalks/?hl=en")).toBe("humphreytalks");
    expect(normalizeHandle("tiktok", "https://www.tiktok.com/@leila_tuck/video/123")).toBe("leila_tuck");
    expect(normalizeHandle("tiktok", "leila_tuck")).toBe("leila_tuck");
  });

  it("rejects post links and things that aren't handles", () => {
    expect(normalizeHandle("instagram", "https://www.instagram.com/reel/DOv3uVZjq2P/")).toBeNull();
    expect(normalizeHandle("tiktok", "tiktok.com/video/123")).toBeNull();
    expect(normalizeHandle("instagram", "not a handle!")).toBeNull();
    expect(normalizeHandle("instagram", "a")).toBeNull();
    expect(normalizeHandle("instagram", "...")).toBeNull();
    expect(normalizeHandle("tiktok", "")).toBeNull();
  });
});

describe("normalizers", () => {
  it("reads an Instagram reel's plays, length and collab owner", () => {
    const reel = normalizeIgPost(
      {
        shortCode: "DOv3uVZjq2P",
        url: "https://www.instagram.com/p/DOv3uVZjq2P/",
        type: "Video",
        productType: "clips",
        caption: "hi",
        likesCount: 1554,
        commentsCount: 163,
        videoViewCount: 20670,
        videoPlayCount: 63722,
        videoDuration: 93.18,
        timestamp: "2025-09-18T15:05:00.000Z",
        ownerUsername: "wuminations",
      },
      "humphreytalks",
    );
    expect(reel).toMatchObject({
      id: "DOv3uVZjq2P",
      format: "video",
      views: 63722,
      likes: 1554,
      comments: 163,
      durationSec: 93,
      postedAt: "2025-09-18T15:05:00.000Z",
      collab: true,
    });
  });

  it("gives Instagram carousels no views and floors hidden likes at zero", () => {
    const carousel = normalizeIgPost(
      { shortCode: "abc", type: "Sidecar", likesCount: -1, commentsCount: 4, videoViewCount: 50, ownerUsername: "me" },
      "me",
    );
    expect(carousel).toMatchObject({
      format: "carousel",
      views: null,
      likes: 0,
      comments: 4,
      collab: false,
      url: "https://www.instagram.com/p/abc/",
      postedAt: null,
    });
    expect(normalizeIgPost({ error: "not_found" }, "me")).toBeNull();
  });

  it("reads a TikTok slideshow and its author", () => {
    const item = {
      id: "7613949020318272781",
      text: "t",
      createTime: 1772760679,
      isSlideshow: true,
      playCount: 1600000,
      diggCount: 237800,
      commentCount: 224,
      shareCount: 325,
      collectCount: 2546,
      videoMeta: { duration: 51 },
      isPinned: true,
      authorMeta: { name: "leila_tuck", fans: 21300, video: 468, nickName: "Leila Tuck" },
    };
    expect(normalizeTiktokPost(item, "leila_tuck")).toMatchObject({
      format: "carousel",
      durationSec: null,
      postedAt: "2026-03-06T01:31:19.000Z",
      views: 1600000,
      shares: 325,
      saves: 2546,
      pinned: true,
      collab: false,
      url: "https://www.tiktok.com/@leila_tuck/video/7613949020318272781",
    });
    expect(tiktokProfile([item], "leila_tuck")).toMatchObject({
      followers: 21300,
      postsCount: 468,
      fullName: "Leila Tuck",
    });
  });
});

describe("computeAudit", () => {
  it("rates TikTok videos against the account's median views and skips new ones", () => {
    const { posts, stats } = computeAudit(tiktokPosts, "tiktok", 5000, NOW);
    expect(posts.map((p) => p.ratio)).toEqual([0.5, 1, 1.5, 4.5, 0.2, null]);
    expect(posts[5].young).toBe(true);
    expect(stats.medianViews).toBe(2000);
    expect(stats.medianInteractions).toBe(20);
    expect(stats.medianEngagementRate).toBe(1);
    expect(stats.engagementBasis).toBe("views");
    expect(stats.topIds).toEqual(["p4", "p3", "p2"]);
    expect(stats.weakIds).toEqual(["p5", "p1"]);
    expect(stats.postsPerWeek).toBe(3.5);
    expect(stats.daysSinceLastPost).toBe(0);
    expect(stats.durations).toEqual([
      { bucket: "under 30s", count: 2, medianViews: 1500 },
      { bucket: "30 to 60s", count: 2, medianViews: 6000 },
      { bucket: "over 60s", count: 1, medianViews: 400 },
    ]);
  });

  it("compares Instagram photos and carousels on likes and comments, reels on views", () => {
    const { posts, stats } = computeAudit(
      [
        post("v1", { format: "video", views: 1000, likes: 50, postedAt: daysAgo(5) }),
        post("v2", { format: "video", views: 3000, likes: 100, postedAt: daysAgo(4) }),
        post("c1", { format: "carousel", likes: 100, postedAt: daysAgo(3) }),
        post("c2", { format: "carousel", likes: 300, postedAt: daysAgo(3) }),
        post("c3", { format: "image", likes: 200, postedAt: daysAgo(2.5) }),
      ],
      "instagram",
      10000,
      NOW,
    );
    expect(posts.map((p) => p.ratio)).toEqual([0.5, 1.5, 0.5, 1.5, 1]);
    expect(posts[3].engagementRate).toBe(3);
    expect(stats.engagementBasis).toBe("followers");
    expect(stats.topIds).toEqual(["v2", "c2", "c3"]);
    expect(stats.weakIds).toEqual(["v1", "c1"]);
  });

  it("measures posting rhythm over the last four weeks when the sample is older", () => {
    const posts = [
      post("old", { views: 10, postedAt: daysAgo(200) }),
      ...[1, 5, 9, 13, 17, 21, 25, 27].map((d) => post(`d${d}`, { views: 10, postedAt: daysAgo(d) })),
    ];
    expect(computeAudit(posts, "tiktok", null, NOW).stats.postsPerWeek).toBe(2);
  });
});

describe("buildAdvicePrompt", () => {
  it("lists posts newest first with their real numbers and standing", () => {
    const { posts, stats } = computeAudit(tiktokPosts, "tiktok", 5000, NOW);
    const { system, user } = buildAdvicePrompt({
      platform: "tiktok",
      profile: {
        handle: "me",
        url: "",
        fullName: "Me",
        bio: "",
        followers: 5000,
        postsCount: 6,
        verified: false,
        isPrivate: false,
      },
      stats,
      posts,
    });
    expect(system).toContain("no em dashes");
    expect(user).toContain("Median views per video: 2,000");
    expect(user).toContain("[p4] | video 45s");
    expect(user).toContain("4.5x usual views");
    expect(user).toContain("new, still growing");
    expect(user.indexOf("[p6]")).toBeLessThan(user.indexOf("[p1]"));
  });
});

describe("validateAdvice", () => {
  it("keeps only compliant points that cite real posts", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        summary: "Your reels win — keep going.",
        doubleDown: [
          { title: "Money myths", detail: "Myth posts beat your usual.", postIds: ["p4", "ghost"] },
          { title: "Guaranteed wins", detail: "Promise returns.", postIds: ["p4"] },
          { title: "A", detail: "a", postIds: [] },
          { title: "B", detail: "b", postIds: [] },
          { title: "C", detail: "c", postIds: [] },
        ],
        fix: [{ title: "", detail: "no title" }],
        stop: "not a list",
        remix: [
          { postId: "p4", why: "Top post", newAngle: "New example" },
          { postId: "p4", why: "dupe", newAngle: "dupe" },
          { postId: "ghost", why: "x", newAngle: "y" },
        ],
      }) +
      "\n```";
    const advice = validateAdvice(raw, ["p1", "p4"]);
    expect(advice?.summary).toBe("Your reels win, keep going.");
    expect(advice?.doubleDown.map((p) => p.title)).toEqual(["Money myths", "A", "B"]);
    expect(advice?.doubleDown[0].postIds).toEqual(["p4"]);
    expect(advice?.fix).toEqual([]);
    expect(advice?.stop).toEqual([]);
    expect(advice?.remix).toEqual([{ postId: "p4", why: "Top post", newAngle: "New example" }]);
  });

  it("returns null when nothing usable is left", () => {
    expect(validateAdvice("not json", ["p1"])).toBeNull();
    expect(validateAdvice({ summary: "", doubleDown: [] }, [])).toBeNull();
  });
});

describe("refreshDecision", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();
  const ready: AuditFreshness = {
    status: "ready",
    fetchedAt: ago(60),
    refreshStartedAt: ago(61),
    hasAdvice: true,
    postsAnalyzed: 30,
  };

  it("refreshes a new audit and a stale one", () => {
    expect(
      refreshDecision({ status: "pending", fetchedAt: null, refreshStartedAt: null, hasAdvice: false, postsAnalyzed: 0 }, now),
    ).toEqual({ action: "refresh" });
    expect(refreshDecision({ ...ready, fetchedAt: ago(21 * 60) }, now)).toEqual({ action: "refresh" });
  });

  it("serves a fresh audit and says when it next updates", () => {
    expect(refreshDecision(ready, now)).toEqual({
      action: "serve",
      nextRefreshAt: new Date(now - 60 * 60_000 + 20 * 3_600_000).toISOString(),
    });
  });

  it("waits on a running refresh unless it is stuck", () => {
    expect(refreshDecision({ ...ready, status: "refreshing", refreshStartedAt: ago(1) }, now)).toEqual({ action: "busy" });
    expect(
      refreshDecision({ ...ready, status: "refreshing", fetchedAt: null, refreshStartedAt: ago(6) }, now),
    ).toEqual({ action: "refresh" });
  });

  it("pauses briefly before retrying a failed run", () => {
    const failed: AuditFreshness = { ...ready, status: "error", fetchedAt: null, hasAdvice: false, postsAnalyzed: 0 };
    expect(refreshDecision({ ...failed, refreshStartedAt: ago(1) }, now)).toEqual({
      action: "serve",
      nextRefreshAt: new Date(now - 60_000 + 2 * 60_000).toISOString(),
    });
    expect(refreshDecision({ ...failed, refreshStartedAt: ago(3) }, now)).toEqual({ action: "refresh" });
  });

  it("retries missing advice before the cooldown, but not straight away", () => {
    expect(refreshDecision({ ...ready, hasAdvice: false }, now)).toEqual({ action: "refresh" });
    expect(refreshDecision({ ...ready, hasAdvice: false, refreshStartedAt: ago(5) }, now).action).toBe("serve");
    expect(refreshDecision({ ...ready, hasAdvice: false, postsAnalyzed: 3 }, now).action).toBe("serve");
  });
});
