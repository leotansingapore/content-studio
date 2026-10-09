import { describe, expect, it } from "vitest";
import { REAL_QUESTIONS, TREND_VIDEOS, buildVideoWriteUrl, videoUrl, withQuestion } from "./sgFeeds";

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
