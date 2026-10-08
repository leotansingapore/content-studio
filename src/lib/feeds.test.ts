import { describe, expect, it } from "vitest";
import { labelFor, mergeStories, storyWriteUrl, SUGGESTED_FEEDS } from "@/lib/feeds";

describe("your feeds", () => {
  it("labels a suggestion by its name, a pasted feed by its title or site", () => {
    expect(labelFor(SUGGESTED_FEEDS[0].url, "Whatever the feed says")).toBe("Straits Times Business");
    expect(labelFor("https://www.example.sg/rss", "Example Money")).toBe("Example Money");
    expect(labelFor("https://www.example.sg/rss")).toBe("example.sg");
  });

  it("merges stories newest first, once each, with their source", () => {
    const feeds = [{ url: "https://a.sg/rss", label: "A" }, { url: "https://b.sg/rss", label: "B" }];
    const stories = mergeStories(feeds, [
      { url: "https://a.sg/rss", items: [{ title: "Old", link: "https://a.sg/1", date: "2026-10-01T00:00:00Z", summary: "" }] },
      { url: "https://b.sg/rss", items: [{ title: "New", link: "https://b.sg/2", date: "2026-10-07T00:00:00Z", summary: "" }, { title: "Dup", link: "https://a.sg/1", date: "2026-10-01T00:00:00Z", summary: "" }] },
    ]);
    expect(stories.map((s) => [s.title, s.source])).toEqual([["New", "B"], ["Old", "A"]]);
  });

  it("briefs Write with the facts and the source, and no product push", () => {
    const url = storyWriteUrl({ title: "CPF rates hold", link: "https://a.sg/1", date: "2026-10-07T00:00:00Z", summary: "Rates stay at 4%.", source: "A" });
    const p = new URLSearchParams(url.split("?")[1]);
    expect(p.get("detail")).toBe("CPF rates hold");
    expect(p.get("ctx")).toContain("(A, 2026-10-07, https://a.sg/1)");
    expect(p.get("ctx")).toContain("do not recommend a product");
  });
});
