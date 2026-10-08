import { describe, expect, it } from "vitest";
import { dedupeStories, storyId } from "./industry-news.mjs";

const NOW = Date.parse("2026-10-08T00:00:00Z");
const row = (over) => ({
  id: "r1",
  district_id: "d1",
  url: "https://example.sg/a",
  source: "The Straits Times",
  title: "A story",
  published_at: "2026-10-06T00:00:00Z",
  topic: "cost",
  gist: "What happened.",
  talking_point: "What to say.",
  client_message: "Hi [Client name]",
  hidden_at: null,
  created_at: "2026-10-07T23:30:00Z",
  ...over,
});

describe("dedupeStories", () => {
  it("folds per-district copies into one story with every copy's clipping path", () => {
    const out = dedupeStories([row({}), row({ id: "r2", district_id: "d2" })], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: storyId("https://example.sg/a"),
      title: "A story",
      talkingPoint: "What to say.",
      clientMessage: "Hi [Client name]",
      publishedAt: "2026-10-06T00:00:00Z",
      topic: "Cost of living",
    });
    expect(out[0]._clips).toEqual(["d1/all/news-r1.jpg", "d2/all/news-r2.jpg"]);
  });

  it("drops a story any district hid, and anything older than a given window", () => {
    const out = dedupeStories(
      [
        row({}),
        row({ id: "r2", district_id: "d2", hidden_at: "2026-10-07T01:00:00Z" }),
        row({ id: "old", url: "https://example.sg/old", created_at: "2026-08-01T00:00:00Z" }),
      ],
      { now: NOW, days: 30 },
    );
    expect(out).toEqual([]);
  });

  it("keeps the whole library by default, old seeded clippings included", () => {
    const out = dedupeStories([row({}), row({ id: "old", url: "https://example.sg/old", created_at: "2024-10-01T00:00:00Z" })], { now: NOW });
    expect(out.map((s) => s.url)).toEqual(["https://example.sg/a", "https://example.sg/old"]);
  });

  it("orders newest first, caps the list and falls back to created_at for the date", () => {
    const out = dedupeStories(
      [
        row({ url: "https://e.sg/1", created_at: "2026-10-01T00:00:00Z" }),
        row({ url: "https://e.sg/2", created_at: "2026-10-05T00:00:00Z", published_at: null, client_message: null }),
        row({ url: "https://e.sg/3", created_at: "2026-10-03T00:00:00Z" }),
      ],
      { now: NOW, cap: 2 },
    );
    expect(out.map((s) => s.url)).toEqual(["https://e.sg/2", "https://e.sg/3"]);
    expect(out[0]).toMatchObject({ publishedAt: "2026-10-05T00:00:00Z", clientMessage: null });
  });
});
