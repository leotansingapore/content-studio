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
  it("treats text with no heading as all caption", () => {
    expect(splitScriptCaption("Just a caption")).toEqual({ script: null, caption: "Just a caption" });
  });
});
