import { describe, expect, it } from "vitest";

import {
  buildScrapeJobs,
  finalizeTrends,
  normalizeIgItem,
  normalizeTiktokItem,
  rankPosts,
} from "./trend-scout.mjs";

// Input fields each actor accepts, copied from the actors' published input
// schemas (api.apify.com/v2/actor-builds/<latest build>). Apify rejects or
// ignores anything else, which is how the IG hashtag job silently returned
// nothing when it sent `hashtags` to apify~instagram-scraper.
const ACCEPTED_FIELDS = {
  "apify~instagram-scraper": [
    "resultsType",
    "directUrls",
    "resultsLimit",
    "onlyPostsNewerThan",
    "search",
    "searchType",
    "searchLimit",
    "addParentData",
  ],
  "apify~instagram-hashtag-scraper": [
    "hashtags",
    "keywordSearch",
    "resultsType",
    "resultsLimit",
  ],
  "clockworks~tiktok-scraper": [
    "hashtags",
    "resultsPerPage",
    "profiles",
    "searchQueries",
    "postURLs",
  ],
};

const plan = {
  igHashtags: ["fintok", "sgfinance"],
  tiktokHashtags: ["moneytok"],
  creatorUrls: ["https://www.instagram.com/example_advisor/"],
  igLimit: 40,
  tiktokLimit: 40,
};

describe("buildScrapeJobs", () => {
  it("only sends each actor fields it accepts", () => {
    for (const job of buildScrapeJobs(plan)) {
      const accepted = ACCEPTED_FIELDS[job.actor];
      expect(accepted, `unknown actor ${job.actor}`).toBeDefined();
      for (const field of Object.keys(job.input)) {
        expect(accepted, `${job.actor} does not accept "${field}"`).toContain(field);
      }
    }
  });

  it("routes hashtags to the hashtag actor, not the general IG scraper", () => {
    const jobs = buildScrapeJobs(plan);
    const igHashtags = jobs.find((j) => j.label === "IG hashtags");
    expect(igHashtags.actor).toBe("apify~instagram-hashtag-scraper");
    expect(igHashtags.input.hashtags).toEqual(["fintok", "sgfinance"]);
    const general = jobs.filter((j) => j.actor === "apify~instagram-scraper");
    expect(general.every((j) => !("hashtags" in j.input))).toBe(true);
  });

  it("skips the creators job when there are no creator URLs", () => {
    const jobs = buildScrapeJobs({ ...plan, creatorUrls: [] });
    expect(jobs.map((j) => j.label)).toEqual(["IG hashtags", "TikTok hashtags"]);
  });
});

describe("normalizers", () => {
  it("maps an Instagram reel to a short-video with real metrics", () => {
    const post = normalizeIgItem({
      shortCode: "ABC123",
      type: "Video",
      ownerUsername: "moneycoach",
      caption: "  Stop   doing this with your bonus  ",
      likesCount: 5200,
      commentsCount: 310,
      videoViewCount: 88000,
    });
    expect(post).toMatchObject({
      platform: "instagram",
      format: "short-video",
      url: "https://www.instagram.com/p/ABC123/",
      author: "@moneycoach",
      caption: "Stop doing this with your bonus",
      likes: 5200,
      comments: 310,
      views: 88000,
    });
  });

  it("drops Instagram items that errored or have no URL", () => {
    expect(normalizeIgItem({ error: "not found" })).toBeNull();
    expect(normalizeIgItem({ caption: "no link" })).toBeNull();
  });

  it("maps a TikTok item including shares", () => {
    const post = normalizeTiktokItem({
      webVideoUrl: "https://www.tiktok.com/@a/video/1",
      authorMeta: { name: "a" },
      text: "loud budgeting",
      diggCount: 9000,
      commentCount: 100,
      shareCount: 40,
      playCount: 120000,
    });
    expect(post).toMatchObject({ platform: "tiktok", author: "@a", shares: 40, views: 120000 });
  });
});

describe("rankPosts", () => {
  const mk = (url, author, likes, comments = 0) => ({ url, author, likes, comments });

  it("drops posts under the floor, dedupes URLs and caps each author", () => {
    const ranked = rankPosts(
      [
        mk("https://x/1", "@a", 9000),
        mk("https://x/1?utm=dup", "@a", 9000),
        mk("https://x/2", "@a", 8000),
        mk("https://x/3", "@a", 7000),
        mk("https://x/4", "@b", 500),
        mk("https://x/5", "@c", 2000, 1500),
      ],
      { minEngagement: 3000, perAuthorCap: 2 },
    );
    // Scores: x/1 9000, x/2 8000, x/3 7000 (third @a post, capped out),
    // x/5 2000 + 1500×3 = 6500; x/4 is under the 3000 floor.
    expect(ranked.map((p) => p.url)).toEqual(["https://x/1", "https://x/2", "https://x/5"]);
  });
});

describe("finalizeTrends", () => {
  const posts = [
    {
      platform: "tiktok",
      format: "short-video",
      url: "https://www.tiktok.com/@a/video/1",
      author: "@a",
      likes: 9000,
      comments: 100,
      shares: 40,
      views: 120000,
    },
  ];
  const kit = {
    index: 0,
    pillar: "topic",
    trend_type: "meme",
    trend_source: "A loud-budgeting video with 9k likes.",
    title: "Loud budgeting, Singapore edition",
    hooks: ["I said no to a $90 dinner and saved my CPF top-up.", "Loud budgeting works."],
    talking_points: ["Say the number out loud", "Pick one goal", "Automate it"],
    cta: "Save this for your next payday.",
    cta_type: "save-share",
    why_it_works: "Rides a proven format with an honest money angle.",
    how_to_film: "Talking head, first line on screen.",
  };

  it("takes the URL and engagement from the real post, never the model", () => {
    const [trend] = finalizeTrends(
      [{ ...kit, url: "https://fabricated.example" }],
      posts,
      "2026-09-15",
    );
    expect(trend.source_url).toBe("https://www.tiktok.com/@a/video/1");
    expect(trend).toMatchObject({ platform: "tiktok", likes: 9000, views: 120000 });
    expect(trend.id).toBe("trend-2026-09-15-loud-budgeting-singapore-edition");
  });

  it("rejects kits with a bad index, enum or too few hooks", () => {
    const out = finalizeTrends(
      [
        { ...kit, index: 7 },
        { ...kit, pillar: "vibes" },
        { ...kit, hooks: ["only one"] },
      ],
      posts,
      "2026-09-15",
    );
    expect(out).toEqual([]);
  });
});
