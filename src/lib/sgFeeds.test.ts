import { describe, expect, it } from "vitest";
import { REAL_QUESTIONS, TREND_VIDEOS, buildVideoWriteUrl, questionsFor, videoUrl, withQuestion, type RealQuestion } from "./sgFeeds";

describe("sgFeeds", () => {
  it("puts a picked question above what the consultant typed, never over it", () => {
    expect(withQuestion("", "Is my SA enough at 32?")).toBe("Is my SA enough at 32?");
    expect(withQuestion("  ", "Q?")).toBe("Q?");
    expect(withQuestion("My client is 32.", "Q?")).toBe("Q?\n\nMy client is 32.");
    expect(withQuestion("Q?\n\nMy client is 32.", "Q?")).toBe("Q?\n\nMy client is 32.");
  });

  it("opens Write on the video's topic without lifting its words", () => {
    const url = new URL(buildVideoWriteUrl({ id: "abcdefghijk", title: "CPF at 55", channel: "Jiabao", views: 48521, published: "4 wk ago", length: "12:24" }), "https://x");
    expect(url.pathname).toBe("/generate");
    expect(url.searchParams.get("idea")).toBe("news-hook");
    expect(url.searchParams.get("detail")).toBe("CPF at 55");
    expect(url.searchParams.get("ctx")).toMatch(/"CPF at 55" by Jiabao, 48,521 views[\s\S]*Do not reuse its wording/);
  });

  it("ships only safe links in the committed drops", () => {
    for (const q of REAL_QUESTIONS) expect(q.url).toMatch(/^https:\/\/(www\.reddit\.com|forums\.hardwarezone\.com\.sg)\//);
    for (const v of TREND_VIDEOS) expect(videoUrl(v.id)).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
  });
});

describe("real questions for an adviser's audience", () => {
  const q = (n: number, audience?: RealQuestion["audience"]) => ({ question: `Q${n}?`, url: `https://x/${n}`, source: "r/singaporefi", publishedAt: null, audience });
  const list = [q(1, "young-adult"), q(2, "parent"), q(3, "general"), q(4, "parent"), q(5, "pre-retiree"), q(6, "parent"), q(7, "general"), q(8, "parent")];

  it("shows only their audience's questions when there are 3 or more, under their group's name", () => {
    expect(questionsFor("parent", list)).toEqual({ label: "Asked this week by parents in Singapore", questions: [q(2, "parent"), q(4, "parent"), q(6, "parent"), q(8, "parent")] });
  });

  it("puts their audience first, then general, then the rest, under the usual label when there are fewer than 3", () => {
    expect(questionsFor("pre-retiree", list)).toEqual({ label: "Asked this week in Singapore", questions: [q(5, "pre-retiree"), q(3, "general"), q(7, "general"), q(1, "young-adult"), q(2, "parent")] });
  });

  it("keeps the newest five for no audience, general, or questions from before audiences", () => {
    expect(questionsFor(undefined, list).questions.map((x) => x.question)).toEqual(["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"]);
    expect(questionsFor("general", list).label).toBe("Asked this week in Singapore");
    const old = [q(1), q(2), q(3)];
    expect(questionsFor("parent", old)).toEqual({ label: "Asked this week in Singapore", questions: old });
  });
});
