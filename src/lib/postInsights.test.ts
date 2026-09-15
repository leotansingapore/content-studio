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
});
