import { describe, expect, it } from "vitest";
import type { TopPostWithAdvisor } from "./topPosts";
import {
  deriveTopic,
  deriveAngle,
  deriveAudiences,
  deriveTrigger,
  buildCreatorAverages,
  outperformance,
  enrich,
  sortPosts,
  similarPosts,
  personalTargetFromPositioning,
  personalMatch,
  BREAKOUT_RATIO,
  formatsWorkingNow,
  type ScoredPost,
} from "./postInsights";
import type { Positioning } from "./positioning";

const post = (over: Partial<TopPostWithAdvisor>): TopPostWithAdvisor => ({
  shortCode: "abc",
  url: "https://instagram.com/p/abc",
  type: "Image",
  productType: "feed",
  likes: 100,
  comments: 0,
  views: 0,
  timestamp: "2026-06-01T00:00:00.000Z",
  caption: "",
  advisorId: "adv1",
  advisorName: "Adv One",
  handle: "@adv1",
  ...over,
});

describe("deriveTopic", () => {
  it("matches caption keywords first", () => {
    expect(deriveTopic("Everything about your CPF Special Account", [])).toBe("CPF");
    expect(deriveTopic("How to invest in an ETF portfolio", [])).toBe("Investment");
    expect(deriveTopic("Why you need term life insurance", [])).toBe("Insurance");
  });
  it("falls back to the advisor niche", () => {
    expect(deriveTopic("no keywords here", ["estate-planning"])).toBe("Estate Planning");
  });
  it("returns null when nothing matches", () => {
    expect(deriveTopic("random text", [])).toBeNull();
  });
});

describe("deriveAngle", () => {
  it("detects contrarian and educational openers", () => {
    expect(deriveAngle("Unpopular opinion: whole life is fine")).toBe("Contrarian");
    expect(deriveAngle("Step-by-step guide to your first ETF")).toBe("Educational");
  });
  it("treats number-heavy posts as authority when nothing else hits", () => {
    expect(deriveAngle("In 2026 the S&P returned 12% over 3 years")).toBe("Authority");
  });
});

describe("deriveAudiences", () => {
  it("maps life-stage audiences and family niches", () => {
    expect(deriveAudiences(["parent"], [])).toContain("Parents");
    expect(deriveAudiences(["student"], [])).toContain("Fresh Grads");
    expect(deriveAudiences([], ["family-finance"])).toContain("Families");
  });
});

describe("deriveTrigger", () => {
  it("names a concrete trigger, not fluff", () => {
    expect(deriveTrigger("Here's why nobody tells you this")).toBe("Curiosity gap");
    expect(deriveTrigger("Don't miss out before it's too late")).toBe("Loss aversion");
  });
  it("returns null when there is no signal", () => {
    expect(deriveTrigger("plain sentence")).toBeNull();
  });
});

describe("outperformance + breakout", () => {
  const all = [
    post({ shortCode: "hi", likes: 1000 }),
    post({ shortCode: "lo", likes: 100 }),
  ];
  const avg = buildCreatorAverages(all);
  it("scores a post against its own creator average", () => {
    expect(avg["@adv1"]).toBe(550);
    expect(outperformance(all[0], avg)).toBeCloseTo(1000 / 550, 2);
  });
  it("flags a breakout above the threshold", () => {
    const strong = post({ shortCode: "x", likes: 2000 });
    const withStrong = buildCreatorAverages([...all, strong]);
    const insight = enrich(strong, withStrong);
    expect(insight.ratio).toBeGreaterThanOrEqual(BREAKOUT_RATIO);
    expect(insight.breakout).toBe(true);
  });
});

describe("sortPosts", () => {
  const items: ScoredPost[] = [
    post({ shortCode: "a", likes: 10, comments: 0, timestamp: "2026-01-01T00:00:00Z" }),
    post({ shortCode: "b", likes: 5, comments: 50, timestamp: "2026-08-01T00:00:00Z" }),
  ].map((p) => ({ post: p, insight: enrich(p, {}) }));
  const ctx = { averages: {}, now: Date.parse("2026-09-01T00:00:00Z") };

  it("sorts by most liked", () => {
    expect(sortPosts(items, "liked", ctx)[0].post.shortCode).toBe("a");
  });
  it("sorts by most commented", () => {
    expect(sortPosts(items, "commented", ctx)[0].post.shortCode).toBe("b");
  });
  it("sorts newest by timestamp", () => {
    expect(sortPosts(items, "newest", ctx)[0].post.shortCode).toBe("b");
  });
});

describe("similarPosts", () => {
  it("surfaces posts sharing a topic", () => {
    const target: ScoredPost = {
      post: post({ shortCode: "t", caption: "CPF tips" }),
      insight: enrich(post({ shortCode: "t", caption: "CPF tips" }), {}),
    };
    const pool: ScoredPost[] = [
      { post: post({ shortCode: "s1", caption: "More CPF advice" }), insight: enrich(post({ shortCode: "s1", caption: "More CPF advice" }), {}) },
      { post: post({ shortCode: "s2", caption: "cooking recipes" }), insight: enrich(post({ shortCode: "s2", caption: "cooking recipes" }), {}) },
    ];
    const out = similarPosts(target, pool, 5);
    expect(out[0].post.shortCode).toBe("s1");
    expect(out.find((x) => x.post.shortCode === "t")).toBeUndefined();
  });
});

describe("personalisation", () => {
  const positioning: Positioning = {
    oneLiner: "I help parents",
    audience: "parent",
    audienceDetail: "young parents",
    topics: ["insurance", "cpf"],
    edge: "",
    platform: "instagram",
    cadence: 3,
    updatedAt: "",
  };
  it("builds a target and matches on audience + topic", () => {
    const target = personalTargetFromPositioning(positioning);
    expect(target).not.toBeNull();
    const p = post({ caption: "term life insurance for your family", audience: ["parent"] });
    const insight = enrich(p, {});
    expect(personalMatch(insight, target)).toBeGreaterThan(0);
  });
  it("returns null for an empty positioning", () => {
    expect(personalTargetFromPositioning(null)).toBeNull();
  });
  it("lifts matching posts only under Best for you", () => {
    const target = personalTargetFromPositioning(positioning);
    const items: ScoredPost[] = [
      post({ shortCode: "loud", likes: 120, caption: "my weekend cooking haul" }),
      post({ shortCode: "mine", likes: 100, caption: "term life insurance for your family", audience: ["parent"] }),
    ].map((p) => ({ post: p, insight: enrich(p, {}) }));
    const ctx = { averages: {}, now: Date.parse("2026-06-02T00:00:00Z"), target };
    expect(sortPosts(items, "for-you", ctx)[0].post.shortCode).toBe("mine");
    expect(sortPosts(items, "engagement", ctx)[0].post.shortCode).toBe("loud");
    expect(sortPosts(items, "trending", ctx)[0].post.shortCode).toBe("loud");
  });
});

describe("formatsWorkingNow", () => {
  const NOW = Date.parse("2026-10-01T00:00:00.000Z");
  const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
  const item = (over: Partial<TopPostWithAdvisor>, ratio: number, topic: string | null, angle: string | null): ScoredPost => ({
    post: post(over),
    insight: { topic, angle, audiences: [], tags: [], trigger: null, structure: "", ratio, breakout: false } as ScoredPost["insight"],
  });

  it("ranks formats by mean ratio and ignores posts outside the window", () => {
    const items = [
      item({ shortCode: "r1", productType: "clips", type: "Video", timestamp: day(5) }, 2, "CPF", "Educational"),
      item({ shortCode: "r2", productType: "clips", type: "Video", timestamp: day(40) }, 1, "CPF", null),
      item({ shortCode: "c1", productType: "carousel_container", type: "Sidecar", timestamp: day(10) }, 0.8, "Insurance", "Educational"),
      item({ shortCode: "old", productType: "carousel_container", type: "Sidecar", timestamp: day(200) }, 9, "Insurance", null),
      item({ shortCode: "nots", timestamp: null }, 9, "CPF", null),
    ];
    const w = formatsWorkingNow(items, NOW, 90);
    expect(w.posts).toBe(3);
    expect(w.formats.map((f) => [f.value, f.posts, f.ratio])).toEqual([
      ["short-video", 2, 1.5],
      ["carousel", 1, 0.8],
    ]);
    expect(w.formats[0].label).toBe("Reels");
    expect(w.topics.map((t) => [t.label, t.posts])).toEqual([["CPF", 2], ["Insurance", 1]]);
    expect(w.angles.map((a) => [a.label, a.posts])).toEqual([["Educational", 2]]);
  });

  it("is empty, not invented, when nothing is recent", () => {
    const w = formatsWorkingNow([item({ timestamp: day(400) }, 3, "CPF", null)], NOW, 90);
    expect(w).toMatchObject({ posts: 0, formats: [], topics: [], angles: [] });
  });
});

describe("most viewed sort", () => {
  it("ranks by video views", async () => {
    const mk = (id: string, views: number) => ({ post: { shortCode: id, views, likes: 0, comments: 0 }, insight: {} }) as never;
    const out = sortPosts([mk("a", 10), mk("b", 500), mk("c", 0)], "viewed", { averages: {}, now: 0 });
    expect(out.map((p: { post: { shortCode: string } }) => p.post.shortCode)).toEqual(["b", "a", "c"]);
  });
});
