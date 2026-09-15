import { describe, expect, it } from "vitest";
import {
  buildIdeasPrompt,
  buildRepeatCheckPrompt,
  isRepeat,
  parseRepeats,
  seenTexts,
  similarity,
  validateIdeas,
} from "./postIdeas.ts";
import type { RatedPost } from "./socialAudit.ts";

function rated(id: string, caption: string, ratio: number | null): RatedPost {
  return {
    id,
    url: `https://example.com/${id}`,
    format: "video",
    caption,
    postedAt: "2026-09-01T00:00:00.000Z",
    views: 1000,
    likes: 10,
    comments: 1,
    shares: null,
    saves: null,
    durationSec: 40,
    pinned: false,
    collab: false,
    interactions: 11,
    engagementRate: 1,
    ratio,
    young: false,
  };
}

describe("repeat detection", () => {
  it("treats a reworded hook as a repeat", () => {
    expect(similarity("How much house can you actually afford?", "Can you really afford that house?")).toBeGreaterThanOrEqual(0.5);
    expect(isRepeat("Can you really afford that house?", ["How much house can you actually afford?"])).toBe(true);
  });

  it("lets a different topic through", () => {
    expect(isRepeat("3 CPF myths nobody tells you", ["How much house can you actually afford?"])).toBe(false);
    expect(similarity("", "anything at all")).toBe(0);
  });

  it("counts past suggestions and each post's first line as seen", () => {
    expect(
      seenTexts([rated("p1", "Rent vs buy\nlong caption body", 1)], [{ hook: "3 CPF myths", status: "dismissed" }]),
    ).toEqual(["3 CPF myths", "Rent vs buy"]);
  });
});

describe("repeat check by meaning", () => {
  const idea = (hook: string, text: string) => ({ hook, idea: text, format: "video" as const, basedOn: null, why: "" });

  it("numbers the new ideas and lists what came before", () => {
    const { system, user } = buildRepeatCheckPrompt(
      [idea("Small habits keep you broke", "Daily coffee and rides add up."), idea("CPF basics", "Three accounts explained.")],
      ["Pengeluaran kecil bikin boncos (Kebiasaan kecil tiap hari)"],
    );
    expect(system).toContain("another language");
    expect(user).toContain("Earlier ideas and posts:\n- Pengeluaran kecil bikin boncos");
    expect(user).toContain("New ideas:\n1. Small habits keep you broke (Daily coffee and rides add up.)\n2. CPF basics");
  });

  it("reads 1-based repeat numbers and ignores junk", () => {
    expect([...parseRepeats('{"repeats": [2, "3", 9, 0, "x"]}', 3)].sort()).toEqual([1, 2]);
    expect(parseRepeats("not json", 3).size).toBe(0);
    expect(parseRepeats('{"repeats": []}', 3).size).toBe(0);
  });
});

describe("validateIdeas", () => {
  const seen = ["Has everyone lied to you about buying a house?", "Why renting is not throwing money away"];

  it("keeps compliant new ideas and drops repeats", () => {
    const raw = JSON.stringify({
      formula: "Myth-busting hooks — with real numbers win.",
      ideas: [
        { hook: "Everyone lied to you about buying a house", idea: "Same as the old post.", format: "video", basedOn: "p1", why: "x" },
        { hook: "3 CPF myths nobody tells you", idea: "Bust three CPF myths.", format: "carousel", basedOn: "p1", why: "Myths did 5x." },
        { hook: "Guaranteed ways to grow your savings", idea: "Not allowed.", format: "video", basedOn: "p1", why: "x" },
        { hook: "CPF myths nobody tells you about", idea: "Repeats the one above.", format: "video", basedOn: "p1", why: "x" },
        { hook: "What a $5k salary really buys in Singapore", idea: "Break down one month.", format: "podcast", basedOn: "ghost", why: "Numbers travel." },
        { hook: "", idea: "No hook." },
      ],
    });
    const result = validateIdeas(raw, { knownPostIds: ["p1", "p2"], seen, max: 5 });
    expect(result?.formula).toBe("Myth-busting hooks, with real numbers win.");
    expect(result?.ideas.map((i) => i.hook)).toEqual([
      "3 CPF myths nobody tells you",
      "What a $5k salary really buys in Singapore",
    ]);
    expect(result?.ideas[0]).toMatchObject({ format: "carousel", basedOn: "p1" });
    expect(result?.ideas[1]).toMatchObject({ format: "video", basedOn: null });
  });

  it("stops at the batch size and returns null when nothing survives", () => {
    const hooks = [
      "Why your emergency fund is too small",
      "The hidden cost of buying a car",
      "What nobody says about CPF top-ups",
      "How couples should split bills",
      "The first-job money checklist",
      "Insurance mistakes in your twenties",
      "Renting versus buying for singles",
      "Planning for your parents' retirement",
    ];
    const many = { ideas: hooks.map((hook) => ({ hook, idea: "An idea.", format: "video" })) };
    expect(validateIdeas(many, { knownPostIds: [], seen: [], max: 5 })?.ideas).toHaveLength(5);
    expect(validateIdeas("nope", { knownPostIds: [], seen: [] })).toBeNull();
    expect(validateIdeas({ ideas: [{ hook: "Guaranteed profit", idea: "x" }] }, { knownPostIds: [], seen: [] })).toBeNull();
  });
});

describe("buildIdeasPrompt", () => {
  it("shows best posts, flops, what's been posted and what's been suggested", () => {
    const posts = [
      rated("p1", "Has everyone lied to you about buying a house?", 5.2),
      rated("p2", "Day in my life", 0.3),
      rated("p3", "Rent vs buy in 2026", 1),
      rated("p4", "My morning routine\nmore text", 0.8),
    ];
    const { system, user } = buildIdeasPrompt({
      platform: "instagram",
      profile: null,
      stats: { topIds: ["p1", "p3"], weakIds: ["p2"] },
      posts,
      previous: [{ hook: "3 CPF myths", status: "dismissed" }],
      count: 8,
    });
    expect(system).toContain("write 8 post ideas");
    expect(user).toContain("[p1] | reel 40s | 5.2x their usual | 1,000 views");
    expect(user).toContain("Fell flat:\n[p2]");
    expect(user).toContain("Already posted (don't repeat):\n- My morning routine");
    expect(user).toContain("- 3 CPF myths (rejected)");
  });
});
