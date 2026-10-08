import { describe, expect, it } from "vitest";
import { cleanKeywords, parseNews, searchTerm } from "./logic";

describe("keyword rules", () => {
  it("trims, drops duplicates, short or long ones, and stops at five", () => {
    expect(cleanKeywords([" Leo  Tan ", "leo tan", "x", "y".repeat(61), "CPF", 7, 'Shield "plan"', "a1", "a2", "a3"])).toEqual(["Leo Tan", "CPF", "Shield plan", "a1", "a2"]);
    expect(cleanKeywords("CPF")).toEqual([]);
  });

  it("searches a name as an exact phrase and a single word as is", () => {
    expect(searchTerm("Leo Tan")).toBe('"Leo Tan"');
    expect(searchTerm("MediShield")).toBe("MediShield");
  });
});

describe("parseNews", () => {
  it("reads news and top-story items newest first, once each, with ISO dates", () => {
    const body = { tasks: [{ result: [{ items: [
      { type: "news_search", title: "Older story", url: "https://a.sg/1", domain: "a.sg", snippet: "x", timestamp: "2026-10-01 02:00:00 +00:00" },
      { type: "top_stories", items: [
        { title: "Newest", url: "https://b.sg/2", source: "The Straits Times", timestamp: "2026-10-07 09:30:00 +00:00" },
        { title: "Dup", url: "https://a.sg/1", source: "A" },
      ] },
      { type: "news_search", title: "Bad link", url: "javascript:alert(1)" },
      { type: "news_search", title: "", url: "https://c.sg" },
    ] }] }] };
    expect(parseNews(body)).toEqual([
      { title: "Newest", url: "https://b.sg/2", source: "The Straits Times", snippet: "", date: "2026-10-07T09:30:00.000Z" },
      { title: "Older story", url: "https://a.sg/1", source: "a.sg", snippet: "x", date: "2026-10-01T02:00:00.000Z" },
    ]);
  });

  it("gives nothing for an empty or failed response", () => {
    expect(parseNews({ tasks: [{ status_code: 40000, result: null }] })).toEqual([]);
    expect(parseNews(null)).toEqual([]);
  });
});
