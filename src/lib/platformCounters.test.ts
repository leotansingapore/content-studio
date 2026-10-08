import { describe, expect, it } from "vitest";
import { checkLimits, findLinks, foldAt, moveLinksToComment } from "@/lib/platformCounters";

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
