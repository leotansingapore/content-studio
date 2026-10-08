import { describe, expect, it } from "vitest";
import {
  AI_MAX,
  MAX_SENTENCES,
  CAROUSEL_QUESTIONS,
  FACT_MIN,
  factQuestions,
  readFacts,
  IDEA_MIN,
  IDEA_QUESTIONS,
  SEQUENCE_MIN,
  readTextPostBetter,
  LEVEL_ROUND,
  PROFILE_LIMITS,
  buildProfileRewritePrompt,
  composeProfile,
  profileQuestions,
  readProfileRewrites,
  PICK_MARGIN,
  hookQuestions,
  ideaState,
  readIdeaThin,
  hookState,
  readHookPick,
  SHAPE_MIN,
  SPECIFIC_MIN,
  VOICE_MIN,
  humanQuestions,
  humanState,
  parseJudgeRequest,
  readHuman,
  splitSentences,
} from "./logic";

const post = "My client paid $0 for his ward stay.\nHis colleague paid $11,400.\n\nThe result? One rider at 3.5% of his premium. Thoughts?";

describe("splitSentences", () => {
  it("splits on lines and on . ! ? before a space, keeping decimals and amounts whole", () => {
    expect(splitSentences(post)).toEqual([
      "My client paid $0 for his ward stay.",
      "His colleague paid $11,400.",
      "The result?",
      "One rider at 3.5% of his premium.",
      "Thoughts?",
    ]);
  });

  it("drops units with no letters and keeps a line with no full stop", () => {
    expect(splitSentences("Start here\n\n🔥🔥\n$300!!! Then wait...  and see")).toEqual(["Start here", "Then wait...", "and see"]);
  });
});

describe("parseJudgeRequest", () => {
  it("takes a known mode, the draft and up to three trimmed samples", () => {
    const r = parseJudgeRequest({ mode: "human", text: `  ${post} `, samples: ["a", " ", 4, "b", "c", "d"] });
    expect(r).toEqual({ ok: true, request: { mode: "human", text: post, samples: ["a", "b", "c"] } });
  });

  it("refuses an unknown mode and a draft too short or too long", () => {
    expect(parseJudgeRequest({ mode: "poem", text: post })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "human", text: "Too short" })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "human", text: "x ".repeat(2600) })).toMatchObject({ ok: false });
    expect(parseJudgeRequest(null)).toMatchObject({ ok: false });
  });
});

describe("the human questions", () => {
  it("asks about voice only with samples, and one shape question per sentence with the one before it", () => {
    const { sentences, state } = humanState(post, []);
    expect(state).toEqual({ draft: post });
    const q = humanQuestions(sentences, false);
    expect(Object.keys(q)).toEqual(["ai", "specific", ...sentences.map((_, i) => `shape_${i}`)]);
    expect(q.shape_2).toMatchObject({ type: "choice", instructions: { sentence: "The result?", sentence_before: "His colleague paid $11,400." } });
    expect(Object.keys((q.shape_0 as { criteria: object }).criteria)[0]).toBe("none");
    expect(Object.keys(humanQuestions(sentences, true))).toContain("voice");
    expect(humanState(post, ["mine"]).state).toEqual({ draft: post, voice_samples: ["mine"] });
  });

  it("judges at most MAX_SENTENCES sentences", () => {
    expect(humanState("One two three. ".repeat(60).trim(), []).sentences).toHaveLength(MAX_SENTENCES);
  });
});

describe("readHuman", () => {
  const sentences = splitSentences(post);
  const shape = (choice: string, p: number) => ({ type: "choice" as const, choice, probabilities: { none: 1 - p, [choice]: p } });

  it("turns probabilities into yes or no at the thresholds and keeps only confident shapes", () => {
    const answers = {
      ai: { type: "noul" as const, noul: AI_MAX },
      specific: { type: "noul" as const, noul: SPECIFIC_MIN - 0.01 },
      voice: { type: "noul" as const, noul: VOICE_MIN },
      shape_0: shape("none", 0.9),
      shape_2: shape("reveal", SHAPE_MIN),
      shape_3: shape("triad", SHAPE_MIN - 0.01),
      shape_4: shape("bait", 0.99),
    };
    expect(readHuman(answers, sentences)).toEqual({
      aiSounding: true,
      specific: false,
      voiceMatch: true,
      shapes: [
        { text: "The result?", shape: "reveal" },
        { text: "Thoughts?", shape: "bait" },
      ],
    });
  });

  it("gives null for anything Jev did not answer, and nothing at all when Jev is down", () => {
    expect(readHuman({ ai: { type: "noul", noul: 0.1 } }, sentences)).toEqual({ aiSounding: false, specific: null, voiceMatch: null, shapes: [] });
    expect(readHuman(null, sentences)).toBeNull();
  });
});

describe("the hook pick", () => {
  const hooks = ["Your first pay is $4,200.", "CPF is important.", "Most people say ignore CPF."];

  it("takes two to five hooks with the audience, topic and platform", () => {
    expect(parseJudgeRequest({ mode: "hooks", hooks: [" a hook ", "b hook"], audience: "Parent", topic: "CPF", platform: "LinkedIn" })).toEqual({
      ok: true,
      request: { mode: "hooks", hooks: ["a hook", "b hook"], audience: "Parent", topic: "CPF", platform: "LinkedIn" },
    });
    expect(parseJudgeRequest({ mode: "hooks", hooks: ["only one"] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "hooks", hooks: ["a hook", ""] })).toMatchObject({ ok: false });
    expect(hookState({ hooks, audience: "", topic: "CPF", platform: "" })).toEqual({ platform: "social media", audience: "Singapore working adults", topic: "CPF" });
  });

  it("asks the same choice in written and reversed order", () => {
    const q = hookQuestions(hooks) as Record<string, { criteria: Record<string, string> }>;
    expect(Object.entries(q.pick_fwd.criteria)).toEqual([["A", hooks[0]], ["B", hooks[1]], ["C", hooks[2]]]);
    expect(Object.keys(q.pick_rev.criteria)).toEqual(["C", "B", "A"]);
  });

  const both = (f: Record<string, number>, r: Record<string, number>) => ({
    pick_fwd: { type: "choice" as const, probabilities: f },
    pick_rev: { type: "choice" as const, probabilities: r },
  });

  it("recommends the hook that leads on both orders by the margin", () => {
    expect(readHookPick(both({ A: 0.18, B: 0.51, C: 0.31 }, { A: 0.19, B: 0.7, C: 0.11 }), 3)).toEqual({ index: 1, p: 0.61 });
    const lead = 0.5 + PICK_MARGIN / 2;
    expect(readHookPick(both({ A: lead, B: 1 - lead }, { A: lead, B: 1 - lead }), 2)).toEqual({ index: 0, p: lead });
  });

  it("recommends nothing on a near tie or without an answer", () => {
    expect(readHookPick(both({ A: 0.47, B: 0.01, C: 0.52 }, { A: 0.55, B: 0.01, C: 0.44 }), 3)).toBeNull();
    expect(readHookPick(null, 3)).toBeNull();
    expect(readHookPick({ pick_fwd: both({ A: 1 }, {}).pick_fwd }, 3)).toBeNull();
  });
});

describe("the thin-idea check", () => {
  it("takes the topic, the notes and the kind of post", () => {
    expect(parseJudgeRequest({ mode: "idea", topic: " CPF top-ups ", notes: " ", kind: "Myth-busting" })).toEqual({
      ok: true,
      request: { mode: "idea", topic: "CPF top-ups", notes: "", kind: "Myth-busting" },
    });
    expect(parseJudgeRequest({ mode: "idea", topic: "" })).toMatchObject({ ok: false });
    expect(ideaState({ topic: "CPF", notes: "", kind: "" })).toEqual({ post_kind: "a social post", topic: "CPF", notes: "" });
    expect(Object.keys(IDEA_QUESTIONS)).toEqual(["specific"]);
  });

  it("asks first below the threshold, writes straight away at or above it, and says nothing without an answer", () => {
    const ans = (p: number) => ({ specific: { type: "noul" as const, noul: p } });
    expect(readIdeaThin(ans(IDEA_MIN - 0.01))).toBe(true);
    expect(readIdeaThin(ans(IDEA_MIN))).toBe(false);
    expect(readIdeaThin(null)).toBeNull();
    expect(readIdeaThin({})).toBeNull();
  });
});

describe("the profile score", () => {
  const base = { mode: "profile" as const, platform: "instagram" as const, name: "Jane Tan", bio: "Financial consultant.", pinned: ["My best post"], top: [], link: "" as string | null };
  const levels = (name: number, bio: number, pinned?: number) => ({
    name: { type: "score" as const, score: name },
    bio: { type: "score" as const, score: bio },
    ...(pinned === undefined ? {} : { pinned: { type: "score" as const, score: pinned } }),
  });

  it("parses the profile, keeping at most three pinned and best posts, and an unknown link as null", () => {
    const r = parseJudgeRequest({ mode: "profile", platform: "tiktok", name: " Jane ", bio: "Hi", pinned: ["a", "b", "c", "d"], top: [], link: undefined });
    expect(r).toEqual({ ok: true, request: { mode: "profile", platform: "tiktok", name: "Jane", bio: "Hi", pinned: ["a", "b", "c"], top: [], link: null } });
    expect(parseJudgeRequest({ mode: "profile", platform: "myspace", link: "x.sg" })).toMatchObject({ request: { platform: "instagram", link: "x.sg" } });
  });

  it("asks about the pinned posts only when there are some", () => {
    expect(Object.keys(profileQuestions(base))).toEqual(["name", "bio", "pinned"]);
    expect(Object.keys(profileQuestions({ ...base, pinned: [] }))).toEqual(["name", "bio"]);
  });

  it("turns each level into points, rounding at LEVEL_ROUND, and adds up to 100", () => {
    const full = composeProfile(levels(3, 3, 3), { ...base, link: "https://jane.sg" });
    expect(full).toEqual({
      score: 100,
      items: [
        { id: "name", earned: 25, points: 25, state: "full" },
        { id: "bio", earned: 35, points: 35, state: "full" },
        { id: "pinned", earned: 20, points: 20, state: "full" },
        { id: "contact", earned: 20, points: 20, state: "full" },
      ],
    });
    const mid = composeProfile(levels(2 - LEVEL_ROUND, 2 - LEVEL_ROUND - 0.01, 0), base)!;
    expect(mid.items.map((i) => i.earned)).toEqual([17, 12, 0, 0]);
    expect(mid.score).toBe(29);
  });

  it("counts a contact in the bio, and leaves the link out of the score when the audit never read it", () => {
    const inBio = composeProfile(levels(0, 0), { ...base, pinned: [], bio: "WhatsApp 9123 4567" })!;
    expect(inBio.items.find((i) => i.id === "contact")?.state).toBe("full");
    const unknown = composeProfile(levels(3, 3, 3), { ...base, link: null })!;
    expect(unknown.items.find((i) => i.id === "contact")).toEqual({ id: "contact", earned: 0, points: 20, state: "unknown" });
    expect(unknown.score).toBe(100);
  });

  it("scores an empty name or bio 0 without Jev, and nothing at all when Jev did not answer", () => {
    expect(composeProfile({}, { ...base, name: "", bio: "", pinned: [] })?.score).toBe(0);
    expect(composeProfile(null, base)).toBeNull();
    expect(composeProfile(levels(1, 1), base)).toBeNull();
  });

  it("asks the rewrite for the lost items only, and keeps a rewrite only within limits and compliant", () => {
    const { system } = buildProfileRewritePrompt(base, ["bio"]);
    expect(system).toContain('{"bio": "..."}');
    expect(system).toContain(`bio at most ${PROFILE_LIMITS.instagram.bio} characters`);
    const long = "x".repeat(PROFILE_LIMITS.instagram.name + 1);
    expect(readProfileRewrites(JSON.stringify({ name: long, bio: "I help SG parents \u2014 DM PLAN." }), base, ["name", "bio"])).toEqual({ bio: "I help SG parents, DM PLAN." });
    expect(readProfileRewrites(JSON.stringify({ bio: "Guaranteed returns of 8% a year." }), base, ["bio"])).toEqual({});
    expect(readProfileRewrites(null, base, ["bio"])).toEqual({});
  });
});

describe("the carousel or text post check", () => {
  it("takes the idea, and needs one", () => {
    expect(parseJudgeRequest({ mode: "carousel", idea: " Insurance is not an investment " })).toEqual({ ok: true, request: { mode: "carousel", idea: "Insurance is not an investment" } });
    expect(parseJudgeRequest({ mode: "carousel", idea: " " })).toMatchObject({ ok: false });
    expect(Object.keys(CAROUSEL_QUESTIONS)).toEqual(["sequence"]);
  });

  it("suggests a text post below the threshold, and says nothing without an answer", () => {
    const ans = (p: number) => ({ sequence: { type: "noul" as const, noul: p } });
    expect(readTextPostBetter(ans(SEQUENCE_MIN - 0.01))).toBe(true);
    expect(readTextPostBetter(ans(SEQUENCE_MIN))).toBe(false);
    expect(readTextPostBetter(null)).toBeNull();
  });
});

describe("the stated-facts check", () => {
  const sentences = ["Your SA is not like a savings account.", "It pays 4% a year.", "DM me PLAN."];

  it("takes the post, and needs something to check", () => {
    expect(parseJudgeRequest({ mode: "facts", text: " CPF LIFE payouts start at 65. " })).toEqual({ ok: true, request: { mode: "facts", text: "CPF LIFE payouts start at 65." } });
    expect(parseJudgeRequest({ mode: "facts", text: "Too short" })).toMatchObject({ ok: false });
  });

  it("asks one yes/no per sentence, with the sentence before it", () => {
    const q = factQuestions(sentences);
    expect(Object.keys(q)).toEqual(["fact_0", "fact_1", "fact_2"]);
    expect(q.fact_1).toMatchObject({ type: "noul", instructions: { sentence: "It pays 4% a year.", sentence_before: "Your SA is not like a savings account." } });
    expect(q.fact_0).toMatchObject({ instructions: { sentence_before: "" } });
  });

  it("flags the sentences at or above the threshold, in order, and nothing without an answer", () => {
    const n = (p: number) => ({ type: "noul" as const, noul: p });
    expect(readFacts({ fact_0: n(FACT_MIN - 0.01), fact_1: n(FACT_MIN), fact_2: n(0.03) }, sentences)).toEqual(["It pays 4% a year."]);
    expect(readFacts({}, sentences)).toEqual([]);
    expect(readFacts(null, sentences)).toBeNull();
  });
});
