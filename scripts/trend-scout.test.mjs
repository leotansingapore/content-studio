import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPLIANCE_FLAGS } from "../src/lib/compliance.ts";
import {
  COMPLIANCE_RULES,
  GENERIC_TAGS,
  complianceIssues,
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
  runScout,
  tiktokSubtitleLink,
  updateHashtagStats,
  vttToText,
} from "./trend-scout.mjs";

// The integrator's live clockworks~tiktok-scraper answer (5 items, trimmed); read only.
const TIKTOK_FIXTURE = JSON.parse(
  fs.readFileSync(new URL("../supabase/functions/viral-search/fixtures/tiktok-search.json", import.meta.url), "utf8"),
);

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

describe("compliance", () => {
  it("mirrors the app's compliance rules exactly", () => {
    const shape = (rules) => rules.map((r) => [r.id, r.pattern.source, r.pattern.flags]);
    expect(shape(COMPLIANCE_RULES)).toEqual(shape(COMPLIANCE_FLAGS));
  });

  it("flags regulated wording and passes clean text", () => {
    expect(complianceIssues("The market is guaranteed to crash this month")).toEqual(["guarantee"]);
    expect(complianceIssues("Lock in a 5% return")).toContain("specific-return");
    expect(complianceIssues("Build a 3 to 6 month emergency fund first")).toEqual([]);
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

  it("drops a kit that trips a compliance rule anywhere in its text", () => {
    const risky = finalizeTrends(
      [{ ...kit, hooks: ["Someone said the market is guaranteed to crash this month.", "Here is why."] }],
      posts,
      "2026-09-15",
    );
    expect(risky).toEqual([]);
    const clean = finalizeTrends([kit], posts, "2026-09-15");
    expect(clean).toHaveLength(1);
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

describe("hashtags", () => {
  it("reads tags from the actor's hashtags field on the saved raw item", () => {
    const [first, , mangled] = TIKTOK_FIXTURE;
    expect(normalizeTiktokItem(first).tags).toEqual(["leasing", "propertymanagement", "leasingagent", "tipsandtricks", "sales"]);
    // this caption's #words are run together ("#Sal#SalesPsychologyl#..."), the field is clean
    expect(normalizeTiktokItem(mangled).tags).toEqual(["salespsychology", "salestraining", "closingdeals", "salestips"]);
  });

  it("falls back to the #words in the text when the field is missing or empty", () => {
    const { hashtags, ...bare } = TIKTOK_FIXTURE[1];
    expect(normalizeTiktokItem(bare).tags).toEqual(hashtags.map((h) => h.name));
    expect(normalizeTiktokItem({ ...bare, hashtags: [], text: "Payday plan #MoneyTok #budgeting #moneytok" }).tags).toEqual([
      "moneytok",
      "budgeting",
    ]);
    expect(normalizeTiktokItem({ ...bare, text: "no tags here" }).tags).toEqual([]);
  });

  const TODAY = "2026-10-20";
  const v = (n, tags, views = 0) => ({ url: `https://www.tiktok.com/@a/video/${n}`, tags, views });
  // moneytok on 6 videos (views 100..500 and 6000, so the median 350 is not the mean), fyp on 5, budgeting on 4,
  // savings on 1, and one repeat of video 1
  const videos = [
    v(1, ["moneytok", "fyp", "budgeting", "savings"], 100),
    { ...v(1, ["moneytok", "fyp"], 100), url: "https://www.tiktok.com/@a/video/1?lang=en" },
    v(2, ["moneytok", "fyp", "budgeting"], 200),
    v(3, ["moneytok", "fyp", "budgeting"], 300),
    v(4, ["moneytok", "fyp", "budgeting"], 400),
    v(5, ["moneytok", "fyp"], 500),
    v(6, ["moneytok"], 6000),
  ];

  it("counts tags on 5+ videos with their median views and the tags most often beside them", async () => {
    const stats = await updateHashtagStats(null, videos, TODAY, null);
    expect(stats.updated).toBe(TODAY);
    expect(Object.keys(stats.tags)).toEqual(["moneytok"]);
    expect(stats.tags.moneytok).toEqual({
      history: [{ day: TODAY, videos: 6, medianViews: 350 }],
      related: [
        { tag: "budgeting", overlap: 0.67 },
        { tag: "savings", overlap: 0.17 },
      ],
      finance: null,
    });
  });

  it("keeps the 5 tags most often beside a tag", async () => {
    const crowd = [1, 2, 3, 4, 5].map((n) => v(n, ["moneytok", ...(n === 1 ? ["a", "b", "c", "d", "e", "f"] : ["b"])]));
    const stats = await updateHashtagStats(null, crowd, TODAY, null);
    expect(stats.tags.moneytok.related).toEqual([
      { tag: "b", overlap: 1 },
      { tag: "a", overlap: 0.2 },
      { tag: "c", overlap: 0.2 },
      { tag: "d", overlap: 0.2 },
      { tag: "e", overlap: 0.2 },
    ]);
  });

  it("drops the six generic tags before counting when Jev is not available", async () => {
    expect(GENERIC_TAGS).toEqual(["fyp", "foryou", "foryoupage", "viral", "trending", "tiktok"]);
    const stats = await updateHashtagStats(null, videos, TODAY, null);
    expect(stats.tags.fyp).toBeUndefined();
    expect(stats.tags.moneytok.related.map((r) => r.tag)).not.toContain("fyp");
  });

  it("asks Jev once per new tag and lets its answer decide instead of the list", async () => {
    const ask = vi.fn(async (tag) => (tag === "moneytok" ? 0.9 : 0.1));
    const first = await updateHashtagStats(null, videos, TODAY, ask);
    expect(ask.mock.calls.map((c) => c[0]).sort()).toEqual(["fyp", "moneytok"]);
    expect(first.tags.moneytok.finance).toBe(true);
    expect(first.tags.fyp.finance).toBe(false);
    expect(first.tags.moneytok.related.map((r) => r.tag)).toEqual(["budgeting", "savings"]);
    ask.mockClear();
    await updateHashtagStats(first, videos, "2026-10-21", ask);
    expect(ask).not.toHaveBeenCalled();
  });

  it("calls a tag finance at 0.6 and above", async () => {
    const stats = await updateHashtagStats(null, videos, TODAY, async (tag) => (tag === "moneytok" ? 0.6 : 0.59));
    expect(stats.tags.moneytok.finance).toBe(true);
    expect(stats.tags.fyp.finance).toBe(false);
  });

  it("asks again next run when Jev gave no answer, except for a generic tag", async () => {
    const stats = await updateHashtagStats(null, videos, TODAY, async () => null);
    expect(stats.tags.moneytok.finance).toBeNull();
    expect(stats.tags.fyp.finance).toBe(false);
  });

  it("keeps 90 days of history, replaces a same-day rerun and drops tags with nothing left", async () => {
    const prev = {
      updated: "2026-10-19",
      tags: {
        moneytok: {
          history: [
            { day: "2026-07-22", videos: 9, medianViews: 1 }, // 90 days before today: goes
            { day: "2026-07-23", videos: 8, medianViews: 2 }, // 89 days: stays
            { day: TODAY, videos: 1, medianViews: 3 }, // an earlier run today: replaced
          ],
          related: [],
          finance: true,
        },
        oldtag: { history: [{ day: "2026-07-01", videos: 5, medianViews: 10 }], related: [], finance: true },
        broken: { history: "nope" },
      },
    };
    const stats = await updateHashtagStats(prev, videos, TODAY, null);
    expect(stats.tags.moneytok.history).toEqual([
      { day: "2026-07-23", videos: 8, medianViews: 2 },
      { day: TODAY, videos: 6, medianViews: 350 },
    ]);
    expect(stats.tags.moneytok.finance).toBe(true);
    expect(Object.keys(stats.tags)).toEqual(["moneytok"]);
  });
});

describe("runScout", () => {
  const rawTiktok = (n) => ({
    webVideoUrl: `https://www.tiktok.com/@creator${n}/video/${n}`,
    authorMeta: { name: `creator${n}` },
    text: `Budget tip ${n}`,
    diggCount: 5000 + n,
    commentCount: 10,
    playCount: 1000 * n,
    createTimeISO: "2026-10-18T00:00:00.000Z",
    hashtags: [{ name: "moneytok" }, { name: "fyp" }],
  });
  const goodKit = (index) => ({
    index,
    pillar: "topic",
    trend_type: "culture",
    trend_source: "A budgeting video with 5k likes.",
    title: `Payday plan number ${index}`,
    hooks: ["I split my pay into three pots on payday.", "Here is the split."],
    talking_points: ["Pay the bills first", "Pick one goal", "Automate it"],
    cta: "Save this for your next payday.",
    cta_type: "save-share",
    why_it_works: "Rides a proven format with an honest money angle.",
    how_to_film: "Talking head, first line on screen.",
  });
  const dirs = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  function setup() {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trend-scout-"));
    dirs.push(dir);
    const env = {
      APIFY_TOKEN: "fake",
      ANTHROPIC_API_KEY: "fake",
      TREND_MIN: "2",
      TREND_OUT: path.join(dir, "trends.json"),
      HASHTAG_OUT: path.join(dir, "hashtagStats.json"),
    };
    // TikTok gets 6 videos; the Instagram and transcript runs come back empty, so nothing is fetched
    const run = vi.fn(async (actor, input) => (input.hashtags ? [1, 2, 3, 4, 5, 6].map(rawTiktok) : []));
    return { env, run, files: () => fs.readdirSync(dir).sort() };
  }
  const now = Date.parse("2026-10-20T02:00:00Z");

  it("writes the trends and the day's hashtag stats on a good run", async () => {
    const { env, run, files } = setup();
    const ask = vi.fn(async (tag) => (tag === "moneytok" ? 0.95 : 0.05));
    await runScout({ env, run, kits: async () => [goodKit(0), goodKit(1)], ask, now });
    expect(files()).toEqual(["hashtagStats.json", "trends.json"]);
    const stats = JSON.parse(fs.readFileSync(env.HASHTAG_OUT, "utf8"));
    expect(stats.updated).toBe("2026-10-20");
    expect(stats.tags.moneytok).toMatchObject({ finance: true, history: [{ day: "2026-10-20", videos: 6, medianViews: 3500 }] });
    expect(stats.tags.fyp.finance).toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("writes nothing when Claude's kits fall short", async () => {
    const { env, run, files } = setup();
    const ask = vi.fn(async () => 0.9);
    await expect(runScout({ env, run, kits: async () => [goodKit(0)], ask, now })).rejects.toThrow(/refusing to overwrite/);
    expect(files()).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("writes nothing when Apify fails", async () => {
    const { env, files } = setup();
    const run = async () => {
      throw new Error("Apify 403 Monthly usage hard limit exceeded");
    };
    const kits = vi.fn(async () => [goodKit(0), goodKit(1)]);
    await expect(runScout({ env, run, kits, ask: null, now })).rejects.toThrow(/Only 0 candidate videos/);
    expect(kits).not.toHaveBeenCalled();
    expect(files()).toEqual([]);
  });
});
