import { describe, expect, it } from "vitest";
import { splitScriptCaption, withVideoCaption } from "./scriptCaption";
import type { DraftEntry } from "@/lib/draftHistory";

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

describe("withVideoCaption", () => {
  const entry: DraftEntry = {
    id: "d1", createdAt: "2026-10-20T01:00:00.000Z", hook: "3 CPF myths", draft: "HOOK: 3 CPF myths\nBODY: One.\n\n**CAPTION:**\nOld caption.\n#cpf",
    pillar: "topic", pillarDetail: "CPF", audience: "general", format: "short-video", platform: "instagram", ctaType: "save-share",
    status: "scheduled", scheduledFor: "2026-10-25T02:00:00.000Z", labels: ["l1"], storyboard: { script: "x", beats: [] } as never,
    source: { kind: "ad", id: "a1", title: "An ad", remixedAt: "2026-10-19T00:00:00.000Z" } as never,
  };

  it("replaces the caption half and keeps the script half, so it still splits, with every other field kept", () => {
    const out = withVideoCaption(entry, "  The video's caption.\n#money ");
    expect(out.draft).toBe("HOOK: 3 CPF myths\nBODY: One.\n\n---\n\nCAPTION:\nThe video's caption.\n#money");
    expect(splitScriptCaption(out.draft)).toEqual({ script: "HOOK: 3 CPF myths\nBODY: One.", caption: "The video's caption.\n#money" });
    expect({ ...out, draft: entry.draft }).toEqual(entry);
    // saved again, it round-trips to the same text
    expect(withVideoCaption(out, "The video's caption.\n#money").draft).toBe(out.draft);
  });

  it("keeps a post with no caption heading as the script, and gives a heading-only post just the new caption", () => {
    const plain = withVideoCaption({ ...entry, draft: "HOOK: x\nBODY: y" }, "New.");
    expect(splitScriptCaption(plain.draft)).toEqual({ script: "HOOK: x\nBODY: y", caption: "New." });
    for (const draft of ["Caption: Old one.", "", "  "]) {
      expect(splitScriptCaption(withVideoCaption({ ...entry, draft }, "New.").draft)).toEqual({ script: null, caption: "New." });
    }
  });
});
