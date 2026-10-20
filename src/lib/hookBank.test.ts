import { describe, expect, it } from "vitest";
import type { FollowedAccount, TrackedPost } from "@/lib/following";
import type { PatternsState } from "@/lib/patterns";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { HOOK_BANK, type HookLine, WHY, followingLines, hookCards, openingLine, readBank } from "./hookBank";

const NOW = Date.now();
const DAY = 86_400_000;
const line = (id: string, formula: string, ratio: number, o: Partial<HookLine> = {}): HookLine =>
  ({ id, text: `Line ${id}`, formula, psychology: null, from: "@mrbrown", ratio, url: `https://www.instagram.com/p/${id}/`, ...o });

describe("the committed bank", () => {
  it("lists all 21 formulas even before the first drop has lines", () => {
    expect(HOOK_FORMULAS).toHaveLength(21);
    expect(hookCards([], {}, {})).toHaveLength(21);
    expect(Array.isArray(HOOK_BANK.hooks)).toBe(true);
  });

  it("reads a bad or partial drop as no lines, keeping only real formulas at ratio 1.0 or more", () => {
    expect(readBank(null)).toEqual({ fetched: null, formulas: {}, hooks: [] });
    const b = readBank({
      fetched: "2026-10-25",
      formulas: { contrarian: "contrast", mistake: "other", "number-reveal": 7 },
      hooks: [line("a", "contrarian", 2.1, { psychology: "other" }), line("b", "made-up", 3), line("c", "mistake", 0.9), line("d", "mistake", 1.2, { text: " " }), null],
    });
    expect(b.formulas).toEqual({ contrarian: "contrast", mistake: null, "number-reveal": null });
    expect(b.hooks.map((h) => h.id)).toEqual(["a"]);
    expect(b.hooks[0].psychology).toBeNull();
  });
});

describe("hookCards: search and both filters", () => {
  const lines = [
    line("a", "contrarian", 1.4, { psychology: "contrast", text: "Everyone says pay off your home loan first" }),
    line("b", "contrarian", 3.4, { psychology: "curiosity" }),
    line("c", "number-reveal", 2, { psychology: "authority", text: "I reviewed 40 client files this year" }),
    line("d", "number-reveal", 1.1, { following: true }),
  ];
  const why = { contrarian: "contrast", "number-reveal": "authority" };

  it("files the lines under their formula, best ratio first", () => {
    const cards = hookCards(lines, {}, why);
    expect(cards.find((c) => c.formula.id === "contrarian")!.lines.map((l) => l.id)).toEqual(["b", "a"]);
    expect(cards.find((c) => c.formula.id === "number-reveal")!.why).toBe("authority");
  });

  it("filters by formula", () => {
    expect(hookCards(lines, { formula: "number-reveal" }, why).map((c) => c.formula.id)).toEqual(["number-reveal"]);
    expect(hookCards(lines, { formula: "all" }, why)).toHaveLength(21);
  });

  it("filters by why it works: the formula's own, or a line's, a Following line taking its formula's", () => {
    const cards = hookCards(lines, { why: "authority" }, why);
    expect(cards.map((c) => c.formula.id)).toEqual(["number-reveal"]);
    expect(cards[0].lines.map((l) => l.id)).toEqual(["c", "d"]);
    const curious = hookCards(lines, { why: "curiosity" }, why);
    expect(curious.map((c) => c.formula.id)).toEqual(["contrarian"]);
    expect(curious[0].lines.map((l) => l.id)).toEqual(["b"]);
    expect(WHY.map((w) => w.id)).not.toContain("other");
  });

  it("searches the template, the example and the real lines", () => {
    const byTemplate = hookCards(lines, { q: "disagree" }, why);
    expect(byTemplate.map((c) => c.formula.id)).toEqual(["contrarian"]);
    expect(byTemplate[0].lines).toHaveLength(2);
    expect(hookCards(lines, { q: "31 had the same gap" }, why).map((c) => c.formula.id)).toEqual(["number-reveal"]);
    const byLine = hookCards(lines, { q: "client files" }, why);
    expect(byLine.map((c) => c.formula.id)).toEqual(["number-reveal"]);
    expect(byLine[0].lines.map((l) => l.id)).toEqual(["c"]);
    expect(hookCards(lines, { q: "zzz nothing" }, why)).toEqual([]);
  });
});

describe("lines from your Following", () => {
  const post = (id: string, views: number, caption = `Opening ${id}. More words after.`): TrackedPost =>
    ({ id, url: `https://www.instagram.com/p/${id}/`, format: "image", caption, postedAt: new Date(NOW - (5 + Number(id.slice(1))) * DAY).toISOString(), views, likes: 10, comments: 1 });
  const a: FollowedAccount = {
    platform: "instagram", handle: "mrbrown", addedAt: "", history: [], seen: [], fresh: [], checkedAt: new Date(NOW).toISOString(),
    posts: [post("p1", 9000), post("p2", 1000), post("p3", 1000), post("p4", 1000), post("p5", 500, `${"long ".repeat(40)}end.`)],
  };
  const tags = { p1: { formula: "contrarian", structure: null, topic: null }, p2: { formula: "mistake", structure: null, topic: null }, p3: { formula: "none", structure: null, topic: null }, p5: { formula: "mistake", structure: null, topic: null }, gone: { formula: "mistake", structure: null, topic: null } };
  const patterns = { "instagram:mrbrown": { tags, patterns: [], ideas: [], from: "patterns", checkedAt: "", ranAt: "", best: [] } } as unknown as PatternsState;

  it("keeps tagged posts at the account's usual or better, with a real formula, marked From your Following", () => {
    const got = followingLines([a], patterns, NOW);
    expect(got.map((l) => l.id)).toEqual(["instagram:p1", "instagram:p2"]);
    expect(got[0]).toMatchObject({ text: "Opening p1.", formula: "contrarian", from: "@mrbrown", ratio: 9, following: true, psychology: null });
    expect(followingLines([a], {}, NOW)).toEqual([]);
  });

  it("cuts an opening line to 140 characters at a word", () => {
    const t = openingLine(`${"long ".repeat(40)}end.`);
    expect(t.length).toBeLessThanOrEqual(140);
    expect(t.endsWith("...")).toBe(true);
    expect(openingLine("First.  Second.")).toBe("First.");
  });
});
