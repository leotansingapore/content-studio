import { describe, expect, it } from "vitest";
import { MAKE_VIDEO, cutAtWord, fitScript, makeVideoHref, postFill, spokenScript, splitScriptCaption, withVideoCaption } from "./scriptCaption";
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

describe("spokenScript", () => {
  it("keeps only the words said, under every caption heading the splitter knows", () => {
    for (const heading of ["**CAPTION:**", "Suggested caption:", "SUGGESTED POST CAPTION:", "Post caption:", "[CAPTION SUGGESTION]"]) {
      const text = `## HOOK (first 3 seconds): 3 CPF myths.\n**BODY:** One. [smiles] Two.\n(B-roll of a desk)\nText on screen: CPF\nCTA: Save this.\n---\n${heading}\nThe caption. #cpf`;
      expect(spokenScript(text)).toBe("3 CPF myths. One. Two. Save this.");
    }
  });
  it("reads a post with no caption heading as all script", () => {
    expect(spokenScript("HOOK: Hi there.\n\nBODY: More to say.")).toBe("Hi there. More to say.");
    expect(spokenScript("")).toBe("");
  });
});

describe("cutAtWord", () => {
  const long = "Why most people in Singapore never top up their CPF Special Account before they turn fifty five and what it costs them later in life";
  it("cuts at the last whole word under the limit, for the montage theme (80) and a template line (200)", () => {
    for (const max of [80, 40]) {
      const out = cutAtWord(long, max);
      expect(out.length).toBeLessThanOrEqual(max);
      expect(long.startsWith(out) && long[out.length] === " ").toBe(true);
    }
    expect(cutAtWord(long.repeat(2), 200).length).toBeLessThanOrEqual(200);
    expect(cutAtWord("Short one.", 80)).toBe("Short one.");
    expect(cutAtWord("Plans, budgets, savings", 10)).toBe("Plans");
  });
});

describe("fitScript", () => {
  const text = "One two. Three four five! Six seven? Eight.";
  it("keeps whole sentences only and says how many were left out", () => {
    expect(fitScript(text, 20)).toEqual({ text: "One two.", kept: 1, left: 3 });
    expect(fitScript(text, 600)).toEqual({ text, kept: 4, left: 0 });
    expect(fitScript(text, 600, 7)).toEqual({ text: "One two. Three four five! Six seven?", kept: 3, left: 1 });
    // a long script ends on a sentence, as said
    const many = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i + 1}, said slowly.`).join(" ");
    const fit = fitScript(many, 600);
    expect(fit.text.length).toBeLessThanOrEqual(600);
    expect(many.startsWith(fit.text) && fit.text.endsWith(".") && many[fit.text.length] === " ").toBe(true);
    expect(fit.kept + fit.left).toBe(40);
  });
  it("cuts only a first sentence too long on its own, at a word", () => {
    const one = fitScript("word ".repeat(200).trim() + ".", 600, 75);
    expect(one.text.split(" ").length).toBeLessThanOrEqual(75);
    expect(one).toMatchObject({ kept: 1, left: 0 });
  });
});

describe("postFill", () => {
  const limits = { say: 600, sayWords: 75, theme: 80, line: 200 };
  const script = "HOOK: 3 CPF myths that quietly cost you thousands every single year, and how to fix them before it is too late for good.\nBODY: First myth. Second myth.";
  const entry: DraftEntry = {
    id: "d1", createdAt: "", hook: "**3 CPF myths that quietly cost you thousands every single year, and how to fix them before it is too late**",
    draft: `${script}\n---\nCAPTION:\nSave this. #cpf`, pillar: "topic", pillarDetail: "", audience: "general", format: "short-video", platform: "instagram", ctaType: "save-share",
  };

  it("fills each kind from the spoken script, within its box", () => {
    const f = postFill(entry, limits)!;
    expect(f.id).toBe("d1");
    expect(f.title).toBe("3 CPF myths that quietly cost you thousands every single year, and how to fix them before it is too late");
    expect(f.say).toEqual({ text: spokenScript(script), kept: 3, left: 0 });
    expect(f.theme).toBe("3 CPF myths that quietly cost you thousands every single year, and how to fix");
    expect(f.theme.length).toBeLessThanOrEqual(80);
    expect(f.line).toBe("3 CPF myths that quietly cost you thousands every single year, and how to fix them before it is too late for good.");
    expect(postFill(entry, { ...limits, line: 40 })!.line.length).toBeLessThanOrEqual(40);
    // no hook: the first spoken sentence names it
    expect(postFill({ ...entry, hook: "[VIDEO SCRIPT]" }, limits)!.title).toBe(f.line);
  });

  it("says the storyboard's lines only while the storyboard was made from this script", () => {
    const beats = [{ say: "Line from the board.", onScreen: "", visual: "", seconds: 3 }, { say: " ", onScreen: "", visual: "", seconds: 1 }, { say: "Another.", onScreen: "", visual: "", seconds: 2 }];
    const board = { beats, script: script.trim(), madeAt: "" };
    expect(postFill({ ...entry, storyboard: board }, limits)!.say.text).toBe("Line from the board. Another.");
    expect(postFill({ ...entry, storyboard: { ...board, script: "An older script." } }, limits)!.say.text).toBe(spokenScript(script));
  });

  it("cuts a long script at a sentence end to fit the box and 30 seconds", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Point ${i + 1} is worth saying out loud.`).join(" ");
    const f = postFill({ ...entry, draft: long }, limits)!;
    expect(f.say.text.length).toBeLessThanOrEqual(600);
    expect(f.say.text.split(" ").length).toBeLessThanOrEqual(75);
    expect(f.say.left).toBeGreaterThan(0);
    expect(f.say.text.endsWith("out loud.")).toBe(true);
  });

  it("is null for a post with nothing to say yet", () => {
    expect(postFill({ ...entry, draft: "" }, limits)).toBeNull();
    expect(postFill({ ...entry, draft: "HOOK: Idea only\n[B-roll]" }, limits)).toBeNull();
  });
});

describe("makeVideoHref", () => {
  it("opens each kind on the AI panel with the post, the explainer as A draft, and Film it in Write's prompter", () => {
    expect(MAKE_VIDEO.map((m) => m.label)).toEqual(["You speaking (AI)", "Explainer", "Stock montage", "Film it"]);
    expect(makeVideoHref("avatar", "d1")).toBe("/edit?panel=ai&kind=avatar&draft=d1");
    expect(makeVideoHref("explainer", "d1")).toBe("/edit?panel=ai&kind=explainer&from=draft&draft=d1");
    expect(makeVideoHref("montage", "d1")).toBe("/edit?panel=ai&kind=montage&draft=d1");
    expect(makeVideoHref("film", "d1")).toBe("/generate?draft=d1&view=prompter");
  });
});
