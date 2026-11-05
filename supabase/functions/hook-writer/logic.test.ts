import { describe, expect, it } from "vitest";
import { buildPrompt, COUNTS, FORMATS, MAX_EXAMPLES, MAX_HOOK, NEED_TOPIC, OTHER, parseHooks, parseRequest, type HookRequest } from "./logic.ts";

const req = (over: Record<string, unknown> = {}) => parseRequest({ topic: "planning a busy week", n: 10, profession: "Productivity app", name: "Tidy", ...over }) as HookRequest;

describe("the request", () => {
  it("needs a topic, and spends nothing to say so", () => {
    expect(parseRequest({ topic: " " })).toBe(NEED_TOPIC);
    expect(parseRequest({})).toBe(NEED_TOPIC);
  });
  it("keeps the count to 5, 10, 20 or 30 and the format to one of the six", () => {
    expect(COUNTS.map((n) => req({ n }).n)).toEqual([5, 10, 20, 30]);
    expect(req({ n: 500 }).n).toBe(10);
    expect(req({ format: "pov" }).format).toBe("pov");
    expect(req({ format: "made-up" }).format).toBeNull();
  });
  it("sends the newest examples only, each cut to a hook's length", () => {
    const many = Array.from({ length: 30 }, (_, i) => `hook number ${i} ${"x".repeat(300)}`);
    const r = req({ kept: many, rejected: ["", 7, "a real one"] });
    expect(r.kept).toHaveLength(MAX_EXAMPLES);
    expect(r.kept[0].startsWith("hook number 10")).toBe(true);
    expect(r.kept.every((k) => k.length <= MAX_HOOK)).toBe(true);
    expect(r.rejected).toEqual(["a real one"]);
  });
});

describe("the prompt", () => {
  it("writes for the brand's work, problem first, and spreads the batch over the formats", () => {
    const { system, user } = buildPrompt(req());
    expect(system).toContain("You write hooks for a productivity app called Tidy");
    expect(system).toContain("Open on the viewer's problem");
    for (const f of FORMATS) expect(system).toContain(`- ${f.id}: ${f.name}.`);
    expect(system).not.toContain("licensed in Singapore");
    expect(user).toContain("Write 10 hooks.");
  });
  it("holds one format when one is picked", () => {
    const { system } = buildPrompt(req({ format: "crash-out" }));
    expect(system).toContain("Write every hook in this format (format: crash-out)");
    expect(system).not.toContain("- pov: POV.");
  });
  it("keeps an adviser's limits when no other work is set", () => {
    expect(buildPrompt(req({ profession: "" })).system).toContain("licensed in Singapore");
  });
  it("asks for more like the kept hooks and nothing like the turned-down ones", () => {
    const { system } = buildPrompt(req({ kept: ["POV: your planner has 40 overdue tasks"], rejected: ["Plan better today"] }));
    expect(system).toContain("The person kept these hooks. Write more with the same feel");
    expect(system).toContain("- POV: your planner has 40 overdue tasks");
    expect(system).toContain("The person turned these down. Write nothing like them:\n- Plan better today");
  });
  it("puts the brand's facts in the material, not the rules", () => {
    const { system, user } = buildPrompt(req({ facts: "Tidy is free to download on the App Store", about: "A visual day planner for busy parents" }));
    expect(user).toContain("Facts a hook may state:");
    expect(user).toContain("Tidy is free to download");
    expect(system).not.toContain("Tidy is free to download");
  });
});

describe("the hooks that come back", () => {
  const r = { n: 5 as const, kept: ["POV: your planner has 40 overdue tasks"], rejected: ["Plan better today, seriously"] };
  it("strips quotes, drops repeats, blanks and copies of the examples, and keeps the format", () => {
    const raw = JSON.stringify({
      hooks: [
        { text: '"POV: you plan the whole week and Monday eats it"', format: "pov" },
        { text: "POV: you plan the whole week and Monday eats it!", format: "pov" },
        { text: "POV: your planner has 40 overdue tasks", format: "pov" },
        { text: "Plan better today, seriously", format: OTHER },
        { text: "been [doing everyday thing] for years", format: "years" },
        { text: "deleting my old to-do app after finding THIS", format: "cheat-code" },
        { text: "my week like I'm defusing a bomb", format: "made-up" },
      ],
    });
    expect(parseHooks(raw, r)).toEqual([
      { text: "POV: you plan the whole week and Monday eats it", format: "pov" },
      { text: "deleting my old to-do app after finding THIS", format: "cheat-code" },
      { text: "my week like I'm defusing a bomb", format: OTHER },
    ]);
  });
  it("refuses a thin batch or a broken answer", () => {
    expect(parseHooks(JSON.stringify({ hooks: [{ text: "one good hook here", format: "pov" }] }), { ...r, n: 10 })).toBeNull();
    expect(parseHooks("not json", r)).toBeNull();
    expect(parseHooks(JSON.stringify({ nope: [] }), r)).toBeNull();
  });
});
