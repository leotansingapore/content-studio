import { describe, expect, it } from "vitest";
import { splitScriptCaption } from "./scriptCaption";

describe("splitScriptCaption", () => {
  it("finds the caption under the headings the generator writes", () => {
    for (const heading of ["**CAPTION:**", "Suggested caption:", "SUGGESTED POST CAPTION:", "Post caption:"]) {
      const out = splitScriptCaption(`HOOK: x\nBODY: y\n---\n${heading}\nThe caption line.\n#tag`);
      expect(out.caption).toBe("The caption line.\n#tag");
      expect(out.script).toBe("HOOK: x\nBODY: y");
    }
  });
  it("finds a bracketed [CAPTION SUGGESTION] heading, so the reel word count is the script alone", () => {
    // live check 2026-10-09: a 30s draft under this heading was counted as 172 spoken words, caption and hashtags included
    const out = splitScriptCaption("[VIDEO SCRIPT]\n\nHOOK (first 3 seconds):\nThink again.\n\n[CAPTION SUGGESTION]\nIt's a myth. #SGInsure");
    expect(out.script).toBe("[VIDEO SCRIPT]\n\nHOOK (first 3 seconds):\nThink again.");
    expect(out.caption).toBe("It's a myth. #SGInsure");
    expect(splitScriptCaption("HOOK: x\n[Caption on screen: hi]").script).toBeNull();
  });
  it("treats text with no heading as all caption", () => {
    expect(splitScriptCaption("Just a caption")).toEqual({ script: null, caption: "Just a caption" });
  });
});
