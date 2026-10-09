import { describe, expect, it } from "vitest";
import { parseFeed, parseViews, pickQuestions, pickVideos } from "./sg-feeds.mjs";

const NOW = Date.parse("2026-10-09T00:00:00Z");

describe("sg-feeds drop", () => {
  it("reads RSS items and Atom entries, entities and CDATA decoded", () => {
    const rss = `<rss><channel><title>Money Mind</title>
      <item><title><![CDATA[How to buy Tbills? I &amp; my wife]]></title><link>https://forums.hardwarezone.com.sg/threads/a.1/</link><pubDate>Wed, 08 Oct 2026 10:00:00 +0800</pubDate></item>
      <item><title>No link</title></item></channel></rss>`;
    const atom = `<feed><title>newest submissions</title><entry><title>Does my plan to retire at 55 make sense?</title>
      <link href="https://www.reddit.com/r/singaporefi/comments/x/"/><published>2026-10-05T01:02:03+00:00</published></entry></feed>`;
    expect(parseFeed(rss)).toEqual([
      { title: "How to buy Tbills? I & my wife", url: "https://forums.hardwarezone.com.sg/threads/a.1/", publishedAt: "2026-10-08T02:00:00.000Z" },
    ]);
    expect(parseFeed(atom)[0]).toMatchObject({ url: "https://www.reddit.com/r/singaporefi/comments/x/", publishedAt: "2026-10-05T01:02:03.000Z" });
  });

  it("reads YouTube's view text as a number", () => {
    expect(parseViews("47,974 views")).toBe(47974);
    expect(parseViews("No views")).toBe(0);
    expect(parseViews(undefined)).toBe(0);
  });

  it("keeps Jev's yes, falls back to a question mark only without Jev, newest first, recent, one per link", () => {
    const item = (title, day, url = `https://x/${title}`) => ({ title, url, source: "r/singaporefi", publishedAt: `2026-10-0${day}T00:00:00.000Z` });
    const items = [
      item("Old but yes", 1),
      item("Should I top up CPF?", 3),
      item("Rules thread", 4),
      item("No Jev, a question?", 5),
      item("No Jev, a statement", 6),
      item("Should I top up CPF?", 7, "https://x/Should I top up CPF?"),
      item("Too old", 1),
    ];
    items[6].publishedAt = "2026-09-01T00:00:00.000Z";
    const got = pickQuestions(items, [0.9, 0.8, 0.2, null, null, 0.8, 0.95], NOW);
    expect(got.map((q) => q.question)).toEqual(["No Jev, a question?", "Should I top up CPF?", "Old but yes"]);
    expect(got[1]).toEqual({ question: "Should I top up CPF?", url: "https://x/Should I top up CPF?", source: "r/singaporefi", publishedAt: "2026-10-03T00:00:00.000Z" });
  });

  it("keeps real video ids Jev did not reject, most viewed first", () => {
    const rows = [
      { id: "aaaaaaaaaaa", title: "CPF", channel: "Jiabao", views: "1,000 views", published: "2 wk ago" },
      { id: "bbbbbbbbbbb", title: "Advert", views: "9,000,000 views" },
      { id: "ccccccccccc", title: "No Jev", views: "5,000 views" },
      { id: "../evil", title: "Bad id", views: "1 view" },
    ];
    expect(pickVideos(rows, [0.9, 0.04, null, 0.99]).map((v) => [v.id, v.views])).toEqual([["ccccccccccc", 5000], ["aaaaaaaaaaa", 1000]]);
  });
});
