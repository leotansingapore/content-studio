import { describe, expect, it } from "vitest";
import { BLANKS_RULE, blankRanges, checkLimits, findBlanks, findLinks, foldAt, moveLinksToComment, reelLengthRule, reelTooLong, reelWordRange, spokenWords } from "@/lib/platformCounters";

describe("foldAt", () => {
  it("shows a short post whole", () => {
    expect(foldAt("Short hook.\nOne more line.", "linkedin")).toBeNull();
    expect(foldAt("anything", "tiktok")).toBeNull();
  });

  it("cuts long text at a word near the character limit", () => {
    const text = "word ".repeat(80).trim();
    const at = foldAt(text, "instagram")!;
    expect(at).toBeLessThanOrEqual(125);
    expect(at).toBeGreaterThan(100);
    expect(text[at]).toBe(" ");
  });

  it("cuts after the platform's line count even when the lines are short", () => {
    const text = "Hook\n\nLine two\nLine three\nLine four";
    // LinkedIn shows 3 lines: "Hook", "", "Line two"
    expect(text.slice(0, foldAt(text, "linkedin")!)).toBe("Hook\n\nLine two");
    // Instagram shows 2: "Hook", ""
    expect(text.slice(0, foldAt(text, "instagram")!)).toBe("Hook\n");
  });
});

describe("checkLimits", () => {
  it("counts hashtags, including ones in the sign-off", () => {
    const c = checkLimits("Post body #cpf\n\nLeo | FC #retirement #sg_money", "linkedin");
    expect(c.hashtags).toBe(3);
    expect(c.warnings).toEqual([]);
  });

  it("warns past LinkedIn's 3 and blocks past Instagram's 30", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`).join(" ");
    expect(checkLimits(tags(3), "linkedin").warnings).toEqual([]);
    expect(checkLimits(tags(5), "linkedin").warnings).toEqual([
      { level: "warn", message: "LinkedIn works best with 3 hashtags or fewer. Remove 2." },
    ]);
    expect(checkLimits(tags(30), "instagram").warnings).toEqual([]);
    expect(checkLimits(tags(32), "instagram").warnings).toEqual([
      { level: "over", message: "Instagram allows 30 hashtags. Remove 2." },
    ]);
    expect(checkLimits(tags(40), "facebook").warnings).toEqual([]);
  });

  it("flags text over each platform's character limit", () => {
    expect(checkLimits("a".repeat(2200), "instagram").warnings).toEqual([]);
    expect(checkLimits("a".repeat(2201), "tiktok").warnings).toEqual([
      { level: "over", message: "Over TikTok's 2,200 character limit by 1. Trim before posting." },
    ]);
    expect(checkLimits("a".repeat(3000), "linkedin").warnings).toEqual([]);
    expect(checkLimits("a".repeat(3005), "linkedin").maxChars).toBe(3000);
    expect(checkLimits("a".repeat(3005), "linkedin").warnings[0].level).toBe("over");
    expect(checkLimits("a".repeat(63207), "facebook").warnings[0].message).toContain("63,206");
  });
});

describe("links on LinkedIn", () => {
  it("finds http(s) and www links without a sentence's closing punctuation", () => {
    expect(findLinks("Book at https://cal.com/leo. Or www.cpf.gov.sg, or (https://a.sg/x?y=1)")).toEqual([
      "https://cal.com/leo",
      "www.cpf.gov.sg",
      "https://a.sg/x?y=1",
    ]);
    expect(findLinks("No link, just S$1.5k and e.g. this.")).toEqual([]);
  });

  it("warns about a link in a LinkedIn post only", () => {
    const warn = { level: "warn", message: "LinkedIn shows posts with a link to fewer people." };
    expect(checkLimits("Read https://x.sg", "linkedin").warnings).toEqual([warn]);
    expect(checkLimits("Read https://x.sg", "linkedin").links).toBe(1);
    expect(checkLimits("Read https://x.sg", "facebook").warnings).toEqual([]);
    expect(checkLimits("No link here.", "linkedin").warnings).toEqual([]);
  });

  it("moves each link out of the body into the first comment, once each", () => {
    expect(moveLinksToComment("Book here: https://cal.com/leo.\nAgain https://cal.com/leo and www.x.sg")).toEqual({
      body: "Book here: (link in the first comment).\nAgain (link in the first comment) and (link in the first comment)",
      comment: "https://cal.com/leo\nwww.x.sg",
    });
    expect(moveLinksToComment("Nothing to move.")).toBeNull();
  });

  it("adds to a first comment that already has links", () => {
    expect(moveLinksToComment("New https://b.sg", "https://a.sg")).toEqual({
      body: "New (link in the first comment)",
      comment: "https://a.sg\nhttps://b.sg",
    });
    expect(moveLinksToComment("Same https://a.sg", "https://a.sg")?.comment).toBe("https://a.sg");
  });
});

describe("reel script length", () => {
  it("gives the published word ranges at 15, 30 and 60 seconds", () => {
    expect(reelWordRange(15)).toEqual({ min: 35, max: 40 });
    expect(reelWordRange(30)).toEqual({ min: 70, max: 80 });
    expect(reelWordRange(60)).toEqual({ min: 125, max: 150 });
  });

  it("reads lengths in between off the line, and beyond at the nearest pace", () => {
    expect(reelWordRange(45)).toEqual({ min: 98, max: 115 });
    expect(reelWordRange(90)).toEqual({ min: 188, max: 225 });
    expect(reelWordRange(10)).toEqual({ min: 23, max: 27 });
  });

  it("counts only the spoken words: no section labels, stage directions or markdown", () => {
    const script = [
      "**HOOK (first 3 seconds):** Your CPF is not a savings account.",
      "",
      "[Point at camera]",
      "BODY: It pays you [your number] a year.",
      "On-screen text: CPF pays",
      "CTA: Comment CPF.",
    ].join("\n");
    expect(spokenWords(script)).toBe(7 + 7 + 2);
  });

  it("flags a script that runs long for its length and passes one that fits", () => {
    expect(reelTooLong(80, 30)).toBeNull();
    expect(reelTooLong(81, 30)).toBe("Long for 30s. Aim for 70-80 words.");
    expect(reelTooLong(96, 37)).toBeNull();
    expect(reelTooLong(97, 37)).toBe("Long for 37s. Aim for 83-96 words.");
  });

  it("tells the writer the length and the word range", () => {
    expect(reelLengthRule(15)).toContain("15 seconds");
    expect(reelLengthRule(15)).toContain("35-40 spoken words");
  });
});

describe("blanks left for the adviser", () => {
  it("finds each bracketed blank once, in order", () => {
    const post = "I reviewed [number] families. [number] had no will.\nAt [client's age] she asked me.";
    expect(findBlanks(post)).toEqual(["[number]", "[client's age]"]);
  });

  it("gives where each blank sits so it can be marked", () => {
    const post = "Pays [your number] a year.";
    expect(blankRanges(post)).toEqual([[5, 18]]);
    expect(post.slice(5, 18)).toBe("[your number]");
  });

  it("leaves out links, empty or numeric brackets and a stage direction on its own line", () => {
    const post = [
      "[Point at the camera]",
      "See [the guide](https://example.com) and tick [ ] or [3].",
      "  [Cut to the chart]  ",
      "Then [your number].",
    ].join("\n");
    expect(findBlanks(post)).toEqual(["[your number]"]);
  });

  it("tells the writer to leave a blank instead of inventing a fact", () => {
    expect(BLANKS_RULE).toContain("[your number]");
    expect(BLANKS_RULE).toMatch(/never invent/i);
  });
});
