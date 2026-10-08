import { describe, expect, it } from "vitest";
import { FACTORS, FACTOR_IDS, SCORE_QUESTIONS, composeScore, mostlyEnglish, parseScoreRequest, scoreState } from "./logic";

const post = "I paid $0 for my first hospital stay. My friend paid $11,400.\n\nSame ward. Same week.";

describe("parseScoreRequest", () => {
  it("takes a draft and a known platform, Instagram otherwise", () => {
    expect(parseScoreRequest({ text: `  ${post}  `, platform: "linkedin" })).toEqual({ ok: true, text: post, platform: "linkedin" });
    expect(parseScoreRequest({ text: post, platform: "myspace" })).toMatchObject({ ok: true, platform: "instagram" });
  });

  it("refuses a draft too short or too long to score", () => {
    expect(parseScoreRequest({ text: "Too short" })).toMatchObject({ ok: false });
    expect(parseScoreRequest({ text: "x ".repeat(2600) })).toMatchObject({ ok: false });
    expect(parseScoreRequest(null)).toMatchObject({ ok: false });
  });
});

describe("mostlyEnglish", () => {
  it("scores English posts, with a few other words, and skips posts in another script", () => {
    expect(mostlyEnglish(post)).toBe(true);
    expect(mostlyEnglish(`${post} Huat ah! 加油`)).toBe(true);
    expect(mostlyEnglish("保险其实不贵。真正贵的是发现自己没有保障。今天就检查你的保单。")).toBe(false);
    expect(mostlyEnglish("12345 !!!")).toBe(false);
  });
});

describe("the questions", () => {
  it("asks one yes/no per factor about the post's own fields", () => {
    expect(Object.keys(SCORE_QUESTIONS)).toEqual(FACTOR_IDS);
    for (const q of Object.values(SCORE_QUESTIONS)) expect(q.type).toBe("noul");
    expect(scoreState(`\n  ${post}`, "tiktok")).toEqual({ platform: "TikTok", first_line: "I paid $0 for my first hospital stay. My friend paid $11,400.", post: `\n  ${post}` });
  });

  it("weights add up to 10", () => {
    expect(FACTOR_IDS.reduce((s, id) => s + FACTORS[id].weight, 0)).toBe(10);
  });
});

describe("composeScore", () => {
  it("weighs the answers into a score out of 10", () => {
    const strong = { hook: 0.88, oneIdea: 0.92, specific: 0.99, cta: 0.98, readable: 0.9 };
    expect(composeScore(strong)).toEqual({ score: 9.3, down: [] });
  });

  it("names the costliest misses first, at most three", () => {
    const weak = { hook: 0.1, oneIdea: 0.11, specific: 0.04, cta: 0.07, readable: 0.37 };
    expect(composeScore(weak)).toEqual({ score: 1.3, down: ["hook", "specific", "oneIdea"] });
  });

  it("tops up to two with a doubtful check when only one is a clear miss", () => {
    const mid = { hook: 0.2, oneIdea: 0.9, specific: 0.7, cta: 0.95, readable: 0.55 };
    expect(composeScore(mid)?.down).toEqual(["hook", "readable"]);
  });

  it("gives no score when an answer is missing (Jev down)", () => {
    expect(composeScore({ hook: 0.5, oneIdea: 0.5, specific: 0.5, cta: 0.5, readable: null })).toBeNull();
    expect(composeScore({})).toBeNull();
  });
});
