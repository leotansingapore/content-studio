import { describe, expect, it } from "vitest";
import { buildNewsWriteUrl, byMonth, clientMessageText, searchStories, topicCounts, type NewsStory } from "./industryNews";

const story: NewsStory = {
  id: "abc",
  title: "LIA to review critical illness definitions",
  gist: "The LIA will review how critical illnesses are defined.",
  talkingPoint: "Ask clients when they last checked their CI cover.",
  clientMessage: "Hi [Client name], saw this and thought of you.",
  source: "Mothership",
  url: "https://mothership.sg/x",
  publishedAt: "2026-10-07T08:00:00+08:00",
  topic: "Insurance",
};

describe("buildNewsWriteUrl", () => {
  it("pre-fills Write as a news hook with the story as context", () => {
    const url = buildNewsWriteUrl(story);
    expect(url.startsWith("/generate?")).toBe(true);
    const p = new URLSearchParams(url.split("?")[1]);
    expect(p.get("pillar")).toBe("topic");
    expect(p.get("idea")).toBe("news-hook");
    expect(p.get("detail")).toBe(story.title);
    const ctx = p.get("ctx")!;
    expect(ctx).toContain("Mothership, 2026-10-07, https://mothership.sg/x");
    expect(ctx).toContain(story.gist);
    expect(ctx).toContain(story.talkingPoint);
  });
});

describe("clientMessageText", () => {
  it("puts the article link on its own line, and offers nothing without a message", () => {
    expect(clientMessageText(story)).toBe(`${story.clientMessage}\n\nhttps://mothership.sg/x`);
    expect(clientMessageText({ ...story, clientMessage: null })).toBeNull();
  });
});

describe("finding stories", () => {
  const list: NewsStory[] = [
    story,
    { ...story, id: "b", title: "CPF payouts rise", topic: "CPF and retirement", publishedAt: "2026-09-12T08:00:00+08:00", gist: "Payouts go up." },
    { ...story, id: "c", title: "MediShield premiums", topic: "Insurance", publishedAt: "2026-10-01T08:00:00+08:00", source: "CNA" },
  ];
  it("matches every word across title, gist, talking point and source", () => {
    expect(searchStories(list, "cpf payouts").map((s) => s.id)).toEqual(["b"]);
    expect(searchStories(list, "cna").map((s) => s.id)).toEqual(["c"]);
    expect(searchStories(list, "  ").length).toBe(3);
  });
  it("counts topics, most first", () => {
    expect(topicCounts(list)).toEqual([{ topic: "Insurance", n: 2 }, { topic: "CPF and retirement", n: 1 }]);
  });
  it("groups by month, newest first", () => {
    expect(byMonth(list).map((g) => [g.label, g.stories.map((s) => s.id)])).toEqual([
      ["October 2026", ["abc", "c"]],
      ["September 2026", ["b"]],
    ]);
  });
});
