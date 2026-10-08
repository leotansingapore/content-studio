import { describe, expect, it } from "vitest";
import { buildTopPosts, pickTop } from "./build-top-posts.mjs";

const advisors = [
  { handle: "@adv", platform: "instagram", tier: 1 },
  { handle: "@inf", platform: "instagram", tier: 2 },
  { handle: "@gone", platform: "instagram", tier: 1 },
];
const item = (owner, shortCode, likes, productType = "feed") => ({
  ownerUsername: owner,
  shortCode,
  likesCount: likes,
  commentsCount: 0,
  type: productType === "clips" ? "Video" : "Image",
  productType,
  caption: "x",
});

describe("pickTop", () => {
  const posts = [
    { shortCode: "a", eng: 50, productType: "feed" },
    { shortCode: "b", eng: 40, productType: "clips" },
    { shortCode: "c", eng: 30, productType: "feed" },
    { shortCode: "d", eng: 10, productType: "clips" },
  ];
  it("keeps the top 3 by engagement and drops the score", () => {
    expect(pickTop(posts).map((p) => p.shortCode)).toEqual(["a", "b", "c"]);
    expect(pickTop(posts)[0]).not.toHaveProperty("eng");
  });
  it("puts reels first for influencers, topped up with other formats", () => {
    expect(pickTop(posts, true).map((p) => p.shortCode)).toEqual(["b", "d", "a"]);
  });
});

describe("buildTopPosts", () => {
  it("ranks advisors by engagement and influencers by reels", () => {
    const { out, scraped } = buildTopPosts(
      [
        item("adv", "a1", 90), item("adv", "a2", 80, "clips"), item("adv", "a3", 70), item("adv", "a4", 1),
        item("inf", "i1", 900), item("inf", "i2", 5, "clips"),
        item("stranger", "s1", 9999),
        { ownerUsername: "adv", error: "not found" },
      ],
      advisors,
    );
    expect(scraped).toBe(2);
    expect(out.adv.map((p) => p.shortCode)).toEqual(["a1", "a2", "a3"]);
    expect(out.inf.map((p) => p.shortCode)).toEqual(["i2", "i1"]);
    expect(out.stranger).toBeUndefined();
  });

  it("keeps last run's posts for a profile the scrape missed, and carries ideas and covers", () => {
    const prev = {
      gone: [{ shortCode: "g1", likes: 1 }],
      adv: [{ shortCode: "a1", idea: { hook: "h" }, cover: "/covers/a1.jpg" }],
    };
    const { out } = buildTopPosts([item("adv", "a1", 10)], advisors, prev);
    expect(out.gone).toEqual(prev.gone);
    expect(out.adv[0]).toMatchObject({ shortCode: "a1", idea: { hook: "h" }, cover: "/covers/a1.jpg" });
  });

  it("treats hidden like counts (-1) as zero", () => {
    const { out } = buildTopPosts([item("adv", "a1", -1)], advisors);
    expect(out.adv[0].likes).toBe(0);
  });
});
