import { describe, expect, it } from "vitest";

import {
  IG_REEL_ACTOR,
  TIKTOK_ACTOR,
  ageInDays,
  buildDiscoveryJobs,
  buildKitPrompt,
  buildTranscriptJobs,
  finalizeTrends,
  normalizeIgItem,
  normalizeTiktokItem,
  pickOutlierReels,
  rankPosts,
  tiktokSubtitleLink,
  vttToText,
} from "./trend-scout.mjs";

// Input fields each actor accepts, copied from the actors' published input
// schemas (api.apify.com/v2/actor-builds/<latest build>). Apify rejects or
// ignores anything else, which is how the old IG hashtag job silently returned
// nothing when it sent `hashtags` to apify~instagram-scraper.
const ACCEPTED_FIELDS = {
  [TIKTOK_ACTOR]: [
    "hashtags",
    "resultsPerPage",
    "profiles",
    "searchQueries",
    "postURLs",
    "downloadSubtitlesOptions",
    "oldestPostDateUnified",
    "newestPostDate",
  ],
  [IG_REEL_ACTOR]: [
    "username",
    "resultsLimit",
    "onlyPostsNewerThan",
    "skipPinnedPosts",
    "skipTrialReels",
    "includeSharesCount",
    "includeTranscript",
    "includeDownloadedVideo",
  ],
};
const SUBTITLE_OPTIONS = [
  "NEVER_DOWNLOAD_SUBTITLES",
  "DOWNLOAD_SUBTITLES",
  "DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES",
  "TRANSCRIBE_ALL_VIDEOS",
];

function expectAcceptedInputs(jobs) {
  for (const job of jobs) {
    const accepted = ACCEPTED_FIELDS[job.actor];
    expect(accepted, `unknown actor ${job.actor}`).toBeDefined();
    for (const field of Object.keys(job.input)) {
      expect(accepted, `${job.actor} does not accept "${field}"`).toContain(field);
    }
  }
}

describe("scrape plan", () => {
  it("discovery jobs only send fields each actor accepts", () => {
    const jobs = buildDiscoveryJobs({
      tiktokHashtags: ["fintok"],
      igCreators: ["humphreytalks"],
    });
    expectAcceptedInputs(jobs);
    expect(jobs.map((j) => j.actor)).toEqual([TIKTOK_ACTOR, IG_REEL_ACTOR]);
    expect(jobs[1].input.skipPinnedPosts).toBe(true);
  });

  it("skips the Instagram job when there are no creators", () => {
    const jobs = buildDiscoveryJobs({ tiktokHashtags: ["fintok"], igCreators: [] });
    expect(jobs.map((j) => j.label)).toEqual(["TikTok hashtags"]);
  });

  it("transcript jobs use valid inputs and a real subtitle option", () => {
    const jobs = buildTranscriptJobs({
      tiktokUrls: ["https://www.tiktok.com/@a/video/1"],
      igUrls: ["https://www.instagram.com/p/ABC/"],
    });
    expectAcceptedInputs(jobs);
    expect(SUBTITLE_OPTIONS).toContain(jobs[0].input.downloadSubtitlesOptions);
    expect(jobs[1].input.includeTranscript).toBe(true);
    expect(buildTranscriptJobs({ tiktokUrls: [], igUrls: [] })).toEqual([]);
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
      videoPlayCount: 88000,
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

  it("drops Instagram items that errored or have no URL, and floors hidden likes", () => {
    expect(normalizeIgItem({ error: "not found" })).toBeNull();
    expect(normalizeIgItem({ caption: "no link" })).toBeNull();
    expect(normalizeIgItem({ shortCode: "X", likesCount: -1 }).likes).toBe(0);
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

describe("ageInDays", () => {
  const now = Date.parse("2026-09-15T00:00:00Z");

  it("handles ISO strings and epoch seconds", () => {
    expect(ageInDays("2026-09-12T00:00:00Z", now)).toBe(3);
    expect(ageInDays(Date.parse("2026-09-14T00:00:00Z") / 1000, now)).toBe(1);
  });

  it("returns null for missing or unparseable timestamps", () => {
    expect(ageInDays(null, now)).toBeNull();
    expect(ageInDays("not a date", now)).toBeNull();
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

describe("pickOutlierReels", () => {
  const now = Date.parse("2026-09-15T00:00:00Z");
  const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
  const reel = (owner, code, views, age) => ({
    ownerUsername: owner,
    shortCode: code,
    type: "Video",
    videoPlayCount: views,
    likesCount: 10,
    commentsCount: 1,
    timestamp: daysAgo(age),
  });

  it("keeps recent reels that beat their creator's median, and nothing else", () => {
    const picks = pickOutlierReels(
      [
        // a: median 2000, the 12k reel is 6x.
        reel("a", "A1", 2000, 100),
        reel("a", "A2", 2000, 60),
        reel("a", "A3", 2000, 5),
        reel("a", "A4", 12000, 3),
        // b: a single reel is only ever 1x its own median.
        reel("b", "B1", 50000, 2),
        // c: 4x but under the minimum views.
        reel("c", "C1", 1000, 30),
        reel("c", "C2", 1000, 20),
        reel("c", "C3", 4000, 1),
        // d: 10x but too old.
        reel("d", "D1", 3000, 50),
        reel("d", "D2", 3000, 45),
        reel("d", "D3", 30000, 40),
        { error: "no_items" },
      ],
      { now },
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({
      url: "https://www.instagram.com/p/A4/",
      author: "@a",
      views: 12000,
      outlier: 6,
    });
  });
});

describe("transcripts", () => {
  it("prefers the English subtitle file", () => {
    const item = {
      videoMeta: {
        subtitleLinks: [
          { language: "spa-ES", downloadLink: "https://x/es.vtt" },
          { language: "eng-US", downloadLink: "https://x/en.vtt" },
        ],
      },
    };
    expect(tiktokSubtitleLink(item)).toBe("https://x/en.vtt");
    expect(tiktokSubtitleLink({ videoMeta: { subtitleLinks: [] } })).toBeNull();
    expect(tiktokSubtitleLink({})).toBeNull();
  });

  it("turns WebVTT into plain text without timings or repeats", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:00.000 --> 00:00:02.000",
      "Here is my payday routine",
      "",
      "2",
      "00:00:02.000 --> 00:00:04.000",
      "<c>Here is my payday routine</c>",
      "step one, pay the bills",
    ].join("\n");
    expect(vttToText(vtt)).toBe("Here is my payday routine step one, pay the bills");
  });
});

describe("buildKitPrompt", () => {
  it("gives Claude the transcript, real numbers and outlier ratio", () => {
    const prompt = buildKitPrompt(
      [
        {
          platform: "instagram",
          format: "short-video",
          author: "@a",
          caption: "renting on purpose",
          transcript: "the first ten years are mostly interest",
          likes: 2002,
          comments: 96,
          views: 96646,
          outlier: 3,
        },
      ],
      12,
      "2026-09-15",
    );
    expect(prompt).toContain("Transcript: the first ten years are mostly interest");
    expect(prompt).toContain("96.6k views");
    expect(prompt).toContain("about 3x this creator's usual views");
    expect(prompt).toContain("Do NOT include a URL");
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
    trend_type: "culture",
    trend_source: "A loud-budgeting video with 9k likes.",
    title: "Loud budgeting, Singapore edition",
    hooks: ["I said no to a $90 dinner and kept my savings on track.", "Loud budgeting works."],
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
