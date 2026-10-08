import { describe, expect, it } from "vitest";
import { checkLimits, foldAt } from "@/lib/platformCounters";

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

  it("warns past LinkedIn's 3-5 and blocks past Instagram's 30", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`).join(" ");
    expect(checkLimits(tags(6), "linkedin").warnings).toEqual([
      { level: "warn", message: "LinkedIn works best with 3-5 hashtags. Remove 1." },
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
