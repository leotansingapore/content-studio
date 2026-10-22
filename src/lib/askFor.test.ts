import { describe, expect, it } from "vitest";
import { askForExamples } from "./askFor";

const examples = (...a: Parameters<typeof askForExamples>) => askForExamples(...a).map((t) => t.example);

describe("askForExamples", () => {
  it("uses the first topic and the audience detail", () => {
    expect(examples({ topics: [" CPF LIFE ", "Wills"], audienceDetail: "fresh grads earning $3.5-4.5K" }, "person")).toEqual([
      "Remix a post from my Swipe file",
      "Make a carousel about CPF LIFE",
      "Make a 20-second video of me explaining CPF LIFE",
      "Plan a month of posts for fresh grads earning $3.5-4.5K",
      "Write 3 hooks for my next post",
    ]);
  });

  it("falls back on each line when they are empty", () => {
    const fallback = [
      "Remix a post from my Swipe file",
      "Make a carousel about a money mistake my clients make",
      "Make a 20-second video of me explaining how I help my clients",
      "Plan a month of posts for young families",
      "Write 3 hooks for my next post",
    ];
    expect(examples({ topics: [], audienceDetail: "" }, "person")).toEqual(fallback);
    expect(examples({ topics: ["  "], audienceDetail: "  " }, "person")).toEqual(fallback);
    expect(examples(null, "person")).toEqual(fallback);
  });

  it("words a business brand's tiles with no adviser or client words", () => {
    const biz = examples({ topics: [], audienceDetail: "" }, "business");
    expect(biz).toEqual([
      "Remix a post from my Swipe file",
      "Make a carousel about a mistake our customers make",
      "Make a 20-second video explaining what we do",
      "Plan a month of posts for our customers",
      "Write 3 hooks for my next post",
    ]);
    for (const line of biz) expect(line).not.toMatch(/client|advis|MAS|money/i);
    expect(examples({ topics: ["team habits"], audienceDetail: "sales managers" }, "business").slice(1, 4)).toEqual([
      "Make a carousel about team habits",
      "Make a 20-second video explaining team habits",
      "Plan a month of posts for sales managers",
    ]);
  });

  it("titles the five tiles and their folded words", () => {
    const tiles = askForExamples(null, "person");
    expect(tiles.map((t) => t.title)).toEqual(["Remix a post", "Carousels", "Videos", "Campaigns", "Hooks and scripts"]);
    expect(tiles.map((t) => t.short)).toEqual(["Remixes", "Carousels", "Videos", "Campaigns", "Scripts"]);
  });
});
