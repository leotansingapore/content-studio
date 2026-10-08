import { describe, expect, it } from "vitest";
import { foldAt } from "@/lib/platformCounters";

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
