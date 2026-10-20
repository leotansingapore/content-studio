import { describe, expect, it } from "vitest";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { TOPICS as APP_TOPICS } from "@/lib/postInsights";
import { slug } from "@/lib/links";
import { STRUCTURES } from "../_shared/tags.ts";
import {
  FORMULAS,
  FORMULA_MIN,
  PROMPT_CAPTIONS,
  QUESTIONS,
  TOPICS,
  allowedPatterns,
  ideasPrompt,
  parseIdeas,
  parseRequest,
  patternName,
  strongestPatterns,
  tagsFrom,
  type PatternsRequest,
  type PostIn,
  type PostTags,
} from "./logic.ts";

const post = (id: string, format: PostIn["format"] = "video", caption = `Post ${id}: a long caption about the account's own subject`): PostIn => ({ id, caption, format });
const request = (extra: Record<string, unknown> = {}) => ({
  account: { platform: "instagram", handle: "@mrbrown" },
  checkedAt: "2026-10-12T02:00:00.000Z",
  posts: Array.from({ length: 12 }, (_, k) => post(`p${k}`)),
  best: ["p0", "p1", "p2"],
  brand: { name: "ActivityTracker", serves: "Self-employed salespeople", sells: "A daily sales activity tracker", topics: ["Prospecting habits", "Follow-ups"] },
  voice: null,
  ...extra,
});
const parsed = (extra: Record<string, unknown> = {}) => parseRequest(request(extra)) as PatternsRequest;
const tag = (formula: string | null, structure: string | null = null, topic: string | null = null): PostTags => ({ formula, structure, topic });

describe("the copies edge functions can't import", () => {
  it("FORMULAS match the app's 21 hook formulas", () => {
    expect(FORMULAS.map(({ id, name, template }) => ({ id, name, template }))).toEqual(HOOK_FORMULAS.map(({ id, name, template }) => ({ id, name, template })));
    expect(FORMULAS).toHaveLength(21);
  });

  it("TOPICS match postInsights' topics as slugs", () => {
    expect(TOPICS.map((t) => t.label)).toEqual([...APP_TOPICS]);
    expect(TOPICS.map((t) => t.id)).toEqual(APP_TOPICS.map(slug));
  });
});

describe("the request", () => {
  it("cleans the account, the posts and the best ids", () => {
    const r = parsed({ best: ["p1", "nope", "p1"], posts: [post("p1"), { id: "p2", caption: "x".repeat(400), format: "reel" }] });
    expect(r.account).toEqual({ platform: "instagram", handle: "mrbrown" });
    expect(r.best).toEqual(["p1"]);
    expect(r.posts[1]).toEqual({ id: "p2", caption: "x".repeat(240), format: "image" });
  });

  it("refuses what it can't run on", () => {
    expect(parseRequest(request({ account: { platform: "youtube", handle: "x" } }))).toBe("Pick a followed Instagram or TikTok account.");
    expect(parseRequest(request({ checkedAt: "soon" }))).toBe("Check the account first.");
    expect(parseRequest(request({ posts: [] }))).toBe("Send 1 to 12 posts.");
    expect(parseRequest(request({ posts: Array.from({ length: 13 }, (_, k) => post(`p${k}`)) }))).toBe("Send 1 to 12 posts.");
    expect(parseRequest(request({ posts: [post("a"), post("a")] }))).toBe("Each post needs its own id.");
    expect(parseRequest(request({ best: ["p0", "p1", "p2", "p3"] }))).toBe("Send at most 3 best posts.");
    expect(parseRequest(null)).toBe("Pick a followed Instagram or TikTok account.");
  });
});

describe("the three Jev questions", () => {
  it("formula is a Choice over the 21 formulas plus none; structure over STRUCTURES; topic over TOPICS plus other", () => {
    expect(QUESTIONS.formula.type).toBe("choice");
    const formula = QUESTIONS.formula as { criteria: Record<string, string> };
    expect(Object.keys(formula.criteria)).toEqual([...FORMULAS.map((f) => f.id), "none"]);
    expect(formula.criteria["number-reveal"]).toBe("Number reveal: I {did something} {N} times. Here is what came out of it.");
    expect(Object.keys((QUESTIONS.structure as { criteria: object }).criteria)).toEqual(STRUCTURES.map((s) => s.id));
    expect(Object.keys((QUESTIONS.topic as { criteria: object }).criteria)).toEqual([...TOPICS.map((t) => t.id), "other"]);
  });

  it("keeps a formula at 0.4, a structure or topic at 0.5, and reads none, other and off-list picks as no tag", () => {
    const answers = [
      { formula: { choice: "list", probabilities: { list: FORMULA_MIN } }, structure: { choice: "story", probabilities: { story: 0.5 } }, topic: { choice: "cpf", probabilities: { cpf: 0.5 } } },
      { formula: { choice: "list", probabilities: { list: 0.39 } }, structure: { choice: "story", probabilities: { story: 0.49 } }, topic: { choice: "cpf", probabilities: { cpf: 0.49 } } },
      { formula: { choice: "none", probabilities: { none: 0.9 } }, structure: { choice: "other", probabilities: { other: 0.9 } }, topic: { choice: "other", probabilities: { other: 0.9 } } },
      { formula: { choice: "made-up", probabilities: { "made-up": 0.9 } } },
    ];
    const tags = tagsFrom([post("a"), post("b"), post("c"), post("d"), post("e")], [...answers, null] as never);
    expect(tags).toEqual({ a: tag("list", "story", "cpf"), b: tag(null), c: tag(null), d: tag(null) });
  });

  it("gives {} when Jev answered for no post", () => {
    expect(tagsFrom([post("a"), post("b")], [null, null])).toEqual({});
  });
});

describe("strongestPatterns", () => {
  const posts = Array.from({ length: 12 }, (_, k) => post(`p${k}`, k < 3 ? "carousel" : "video"));
  const best = ["p0", "p1", "p2"];

  it("keeps a value 2 of the 3 best posts share at twice its share of the rest, with the counts", () => {
    // number-reveal: 2 of 3 best (0.67), 1 of 9 rest (0.11)
    const tags = { p0: tag("number-reveal"), p1: tag("number-reveal"), p2: tag("list"), p3: tag("number-reveal") };
    expect(strongestPatterns(posts, tags, best)).toEqual([
      { field: "format", value: "carousel", inBest: 3, inRest: 0, rest: 9 },
      { field: "formula", value: "number-reveal", inBest: 2, inRest: 1, rest: 9 },
    ]);
  });

  it("needs 2 of the best posts, not 1", () => {
    const tags = { p0: tag("list"), p1: tag("receipt"), p2: tag("myth-bust") };
    expect(strongestPatterns(posts.map((p) => ({ ...p, format: "video" as const })), tags, best)).toEqual([]);
  });

  it("drops a value that is just as common in the rest (an even spread)", () => {
    // list: 2 of 3 best (0.67) against 4 of 9 rest (0.44): under twice
    const tags: Record<string, PostTags> = { p0: tag("list"), p1: tag("list"), p3: tag("list"), p4: tag("list"), p5: tag("list"), p6: tag("list") };
    const even = posts.map((p) => ({ ...p, format: "video" as const }));
    expect(strongestPatterns(even, tags, best)).toEqual([]);
    // exactly twice the share still counts: 2 of 3 against 3 of 9
    delete tags.p6;
    expect(strongestPatterns(even, tags, best).map((p) => p.value)).toEqual(["list"]);
  });

  it("returns at most 3, strongest first", () => {
    const all = (k: number) => tag("receipt", "list", k === 2 ? null : "cpf");
    const tags = { p0: all(0), p1: all(1), p2: all(2) };
    const found = strongestPatterns(posts, tags, best);
    expect(found).toHaveLength(3);
    expect(found.map((p) => `${p.field}:${p.inBest}`)).toEqual(["formula:3", "structure:3", "format:3"]);
  });

  it("finds nothing with fewer than 2 best posts", () => {
    expect(strongestPatterns(posts, { p0: tag("list") }, ["p0"])).toEqual([]);
    expect(strongestPatterns(posts, {}, [])).toEqual([]);
  });

  it("names each pattern for the screen", () => {
    expect(patternName({ field: "formula", value: "number-reveal" })).toBe("Number reveal hooks");
    expect(patternName({ field: "structure", value: "list" })).toBe("List posts");
    expect(patternName({ field: "topic", value: "cpf" })).toBe("Posts on CPF");
    expect(patternName({ field: "format", value: "carousel" })).toBe("Carousels");
  });
});

describe("the ideas prompt", () => {
  const captions = ["Their own CPF top-up story that should never be copied word for word. ".repeat(4), "Second best post caption with its own claims and numbers. ".repeat(4), "Third ".repeat(40)];
  const req = parsed({ posts: Array.from({ length: 12 }, (_, k) => post(`p${k}`, "video", captions[k] ?? `Other post ${k}`)) });

  it("carries the MAS lines, the pattern rule and the brand's own topics, audience and offer", () => {
    const { system, user } = ideasPrompt(req, [{ field: "formula", value: "list", inBest: 2, inRest: 0, rest: 9 }], {});
    expect(system).toContain("Use the pattern, never their words or topic.");
    expect(system).toContain("No promised returns, no market timing, no specific stock, fund or ETF picks, no named insurer products, no fear-mongering.");
    expect(system).toContain("No invented numbers");
    expect(system).toContain("Compliance (the post is published in Singapore):");
    expect(user).toContain("Prospecting habits; Follow-ups");
    expect(user).toContain("It serves: Self-employed salespeople");
    expect(user).toContain("It sells: A daily sales activity tracker");
    expect(user).toContain("The list hooks: {N} things I wish I knew before {milestone}.");
    expect(`${system}\n${user}`).not.toMatch(/financial adviser/i);
  });

  it("quotes none of their captions when a pattern holds, and leaves the topic pattern out", () => {
    const { user } = ideasPrompt(req, [{ field: "topic", value: "cpf", inBest: 3, inRest: 0, rest: 9 }, { field: "structure", value: "story", inBest: 2, inRest: 1, rest: 9 }], {});
    expect(user).not.toContain("CPF top-up story");
    expect(user).not.toContain("Posts on CPF");
    expect(user).toContain("Story posts: A story with a before, a turn and an after");
  });

  it("writes from the 3 best posts when no pattern holds (or Jev was down), never quoting more than 300 characters of them", () => {
    const { user } = ideasPrompt(req, [], {});
    expect(user).toContain("share no clear pattern");
    const quoted = [...user.matchAll(/It opens: "([^"]*)"/g)].map((m) => m[1]);
    expect(quoted).toHaveLength(3);
    expect(quoted.join("").length).toBeLessThanOrEqual(PROMPT_CAPTIONS);
    expect(quoted[0]).toBe(req.posts[0].caption.slice(0, 100));
    expect(user).not.toContain("Other post 5");
  });

  it("says so when the brand has no topics", () => {
    expect(ideasPrompt(parsed({ brand: { name: "X", topics: [] } }), [], {}).user).toContain("pick ones that fit what it sells and who it serves");
  });
});

describe("the ideas answer", () => {
  const idea = (k: number, extra: Record<string, unknown> = {}) => ({ hook: `I checked [N] pipelines this year, number ${k}`, format: "carousel", angle: "Why follow-ups slip", patterns: ["The list hooks", "Made up"], ...extra });

  it("keeps three ideas and only the pattern names it was given", () => {
    const ideas = parseIdeas(JSON.stringify({ ideas: [idea(1), idea(2, { format: "reel" }), idea(3), idea(4)] }), ["The list hooks"]);
    expect(ideas).toHaveLength(3);
    expect(ideas?.[0].patterns).toEqual(["The list hooks"]);
    expect(ideas?.[1].format).toBe("post");
  });

  it("is null with fewer than three usable ideas", () => {
    expect(parseIdeas(JSON.stringify({ ideas: [idea(1), idea(2), idea(3, { hook: "short" })] }), [])).toBeNull();
    expect(parseIdeas("not json", [])).toBeNull();
    expect(parseIdeas(null, [])).toBeNull();
  });

  it("allows the given patterns, or the best posts' shapes when there are none", () => {
    const posts = [post("a", "carousel"), post("b")];
    expect(allowedPatterns([{ field: "formula", value: "list", inBest: 2, inRest: 0, rest: 9 }], posts, {})).toEqual(["The list hooks"]);
    expect(allowedPatterns([], posts, { a: tag("receipt", "how-to") })).toEqual(["The receipt hooks", "How-to posts", "Carousels", "Videos"]);
  });
});
