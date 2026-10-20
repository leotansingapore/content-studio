import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Found, inPeriod, parseRequest, relevanceAsks, RELEVANT, sortFound, splitRelevant, tiktokFound, tiktokInput, tiktokResults, youtubeFound,
  youtubeResults, youtubeTask,
} from "./logic";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const TIKTOK: Record<string, unknown>[] = fixture("tiktok-search.json");
const YOUTUBE = fixture("youtube-organic.json");

describe("the request", () => {
  it("trims, keeps 2 to 60 characters and both platforms by default", () => {
    expect(parseRequest({ q: "  cold   calling " })).toEqual({ q: "cold calling", platforms: ["tiktok", "youtube"], brand: { sells: "", serves: "" } });
    expect(parseRequest({ q: " a " })).toBe("Search for 2 to 60 characters.");
    expect(parseRequest({ q: "x".repeat(61) })).toBe("Search for 2 to 60 characters.");
    expect(parseRequest({ q: "x".repeat(60) })).toMatchObject({ q: "x".repeat(60) });
    expect(parseRequest({})).toBe("Search for 2 to 60 characters.");
    expect(parseRequest(null)).toBe("Search for 2 to 60 characters.");
  });

  it("refuses an unknown or empty platform list, and keeps the brand short", () => {
    expect(parseRequest({ q: "cpf", platforms: ["instagram"] })).toBe("Platforms are tiktok and youtube.");
    expect(parseRequest({ q: "cpf", platforms: [] })).toBe("Platforms are tiktok and youtube.");
    expect(parseRequest({ q: "cpf", platforms: "tiktok" })).toBe("Platforms are tiktok and youtube.");
    expect(parseRequest({ q: "cpf", platforms: ["youtube", "youtube"] })).toMatchObject({ platforms: ["youtube"] });
    const r = parseRequest({ q: "cpf", brand: { sells: "s".repeat(900), serves: 7 } });
    expect(r).toMatchObject({ brand: { serves: "" } });
    expect(typeof r !== "string" && r.brand.sells.length).toBe(600);
  });

  it("asks TikTok for 20 videos with no paid add-ons and YouTube for one Singapore block", () => {
    expect(tiktokInput("cpf")).toEqual({ searchQueries: ["cpf"], resultsPerPage: 20, searchSection: "/video" });
    expect(youtubeTask("cpf")).toEqual({ keyword: "cpf", location_code: 2702, language_code: "en", block_depth: 20 });
  });
});

describe("the integrator's fixtures as Found", () => {
  it("reads a real TikTok item, with the reach ratio from its followers", () => {
    expect(tiktokFound(TIKTOK[0])).toEqual({
      id: "tiktok:7614311442182982925",
      platform: "tiktok",
      url: "https://www.tiktok.com/@faithindevelopment/video/7614311442182982925",
      author: "@faithindevelopment",
      title: null,
      caption: expect.stringMatching(/^Spice up your follow up!/),
      cover: expect.stringMatching(/^https:\/\/p19-common-sign\.tiktokcdn-us\.com\//),
      views: 19200,
      likes: 1589,
      comments: 27,
      shares: 370,
      followers: 6109,
      postedAt: "2026-03-07T00:57:30.000Z",
      durationSec: 51,
      ratio: 3.1,
      relevance: null,
    });
    expect(tiktokResults(TIKTOK)).toHaveLength(5);
  });

  it("gives nulls where a TikTok item has no data, and no ratio without followers", () => {
    const bare = tiktokFound({ id: "7614311442182982925", webVideoUrl: "https://www.tiktok.com/@x/video/7614311442182982925" })!;
    expect(bare).toMatchObject({ author: null, caption: null, cover: null, views: null, likes: null, followers: null, postedAt: null, durationSec: null, ratio: null });
    const noFans = { ...TIKTOK[0], authorMeta: { ...(TIKTOK[0].authorMeta as object), fans: 0 } };
    expect(tiktokFound(noFans)!.ratio).toBeNull();
    expect(tiktokFound({ ...TIKTOK[0], playCount: undefined })!.ratio).toBeNull();
    expect(tiktokFound({ ...TIKTOK[0], id: "nope" })).toBeNull();
    expect(tiktokFound({ ...TIKTOK[0], isAd: true })).toBeNull();
    expect(tiktokFound({ ...TIKTOK[0], webVideoUrl: "javascript:alert(1)" })!.url).toBe("https://www.tiktok.com/@faithindevelopment/video/7614311442182982925");
    expect(tiktokResults([TIKTOK[0], TIKTOK[0], "junk", null])).toHaveLength(1);
  });

  it("reads the real YouTube block: a clean watch link, the date, and nulls for what search pages don't show", () => {
    const all = youtubeResults(YOUTUBE);
    expect(all).toHaveLength(20);
    expect(all[0]).toEqual({
      id: "youtube:fRbGYknaN74",
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=fRbGYknaN74",
      author: "Jeff Shore Real Estate Sales Training",
      title: "The Sales Follow-Up Blueprint | 5 Minute Sales Training",
      caption: expect.stringMatching(/^Are you struggling to close more sales/),
      cover: expect.stringMatching(/^https:\/\/i\.ytimg\.com\/vi\/fRbGYknaN74\//),
      views: 5763,
      likes: null,
      comments: null,
      shares: null,
      followers: null,
      postedAt: "2024-10-20T11:11:57.000Z",
      durationSec: 348,
      ratio: null,
      relevance: null,
    });
    const item = YOUTUBE.tasks[0].result[0].items[0];
    expect(youtubeFound({ ...item, is_shorts: true })!.url).toBe("https://www.youtube.com/shorts/fRbGYknaN74");
    expect(youtubeFound({ ...item, type: "youtube_channel" })).toBeNull();
    expect(youtubeFound({ type: "youtube_video", video_id: "fRbGYknaN74" })).toMatchObject({ author: null, title: null, views: null, postedAt: null });
    expect(youtubeResults({ tasks: [{ status_code: 20000, result: null }] })).toEqual([]);
  });

  it("keeps captions to 200 characters", () => {
    expect(tiktokFound({ ...TIKTOK[0], text: "word ".repeat(100) })!.caption!.length).toBeLessThanOrEqual(200);
  });
});

const found = (id: string, o: Partial<Found> = {}): Found => ({
  id, platform: "tiktok", url: `https://x.sg/${id}`, author: null, title: null, caption: null, cover: null, views: null, likes: null, comments: null,
  shares: null, followers: null, postedAt: null, durationSec: null, ratio: null, relevance: null, ...o,
});

describe("sorting and filtering", () => {
  const list = [
    found("yt-big", { platform: "youtube", views: 900_000 }),
    found("tt-3x", { views: 3000, ratio: 3, likes: 10 }),
    found("yt-small", { platform: "youtube", views: 50 }),
    found("tt-14x", { views: 14000, ratio: 14, likes: 2 }),
    found("yt-none", { platform: "youtube" }),
  ];
  const ids = (l: Found[]) => l.map((f) => f.id);

  it("Beat their size puts every result with a ratio first, then the rest by views, unknowns last", () => {
    expect(ids(sortFound(list, "reach"))).toEqual(["tt-14x", "tt-3x", "yt-big", "yt-small", "yt-none"]);
  });

  it("sorts by views, engagement and date with unknowns last, without touching the list", () => {
    expect(ids(sortFound(list, "views"))).toEqual(["yt-big", "tt-14x", "tt-3x", "yt-small", "yt-none"]);
    expect(ids(sortFound(list, "engagement"))).toEqual(["tt-3x", "tt-14x", "yt-big", "yt-small", "yt-none"]);
    const dated = [found("old", { postedAt: "2025-01-01T00:00:00Z" }), found("undated"), found("new", { postedAt: "2026-10-01T00:00:00Z" })];
    expect(ids(sortFound(dated, "newest"))).toEqual(["new", "old", "undated"]);
    expect(ids(list)[0]).toBe("yt-big");
  });

  it("keeps the period, and an undated result only for any time", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    const at = (days: number) => found(`d${days}`, { postedAt: new Date(now - days * 86_400_000).toISOString() });
    expect([at(29), at(31), at(89), at(91), found("undated")].filter((f) => inPeriod(f, "30d", now)).map((f) => f.id)).toEqual(["d29"]);
    expect([at(29), at(31), at(89), at(91), found("undated")].filter((f) => inPeriod(f, "90d", now)).map((f) => f.id)).toEqual(["d29", "d31", "d89"]);
    expect(inPeriod(found("undated"), "any", now)).toBe(true);
  });

  it("puts results under 0.4 behind Show N less relevant, and shows every result Jev didn't answer for", () => {
    expect(RELEVANT).toBe(0.4);
    const split = splitRelevant([found("a", { relevance: 0.39 }), found("b", { relevance: 0.4 }), found("c"), found("d", { relevance: 0.05 })]);
    expect(ids(split.relevant)).toEqual(["b", "c"]);
    expect(ids(split.less)).toEqual(["a", "d"]);
  });
});

describe("the Jev ask", () => {
  const results = [...tiktokResults(TIKTOK), ...youtubeResults(YOUTUBE)];
  const brand = { sells: "A daily activity tracker", serves: "Sales-oriented self-employed professionals and coaches" };

  it("asks one question per result, 10 to a call, numbered across the whole list", () => {
    const asks = relevanceAsks("sales follow up tips", brand, results);
    expect(results).toHaveLength(25);
    expect(asks.map((a) => a.indexes.length)).toEqual([10, 10, 5]);
    expect(asks.flatMap((a) => Object.keys(a.questions))).toEqual(results.map((_, n) => `r${n}`));
    expect(asks[2].state.results[0]).toMatch(/^Result 20: YouTube, /);
    expect(asks[0].state.results[0]).toMatch(/^Result 0: TikTok, @faithindevelopment, 19200 views\. Spice up/);
    expect(relevanceAsks("x", brand, [])).toEqual([]);
  });

  it("names the brand's own offer and audience, never a financial adviser", () => {
    const q = relevanceAsks("cold calling", brand, results.slice(0, 1))[0].questions.r0.instructions;
    expect(q).toBe(
      'Is result 0 about "cold calling", and something a business that sells A daily activity tracker to Sales-oriented self-employed professionals and coaches could learn from or remake for its own posts?',
    );
    expect(relevanceAsks("cpf", { sells: "", serves: "" }, results.slice(0, 1))[0].questions.r0.instructions).toContain("something a small business could");
    expect(JSON.stringify(relevanceAsks("cpf", brand, results))).not.toMatch(/adviser|advisor/i);
  });
});
