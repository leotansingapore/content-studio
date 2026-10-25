import { describe, expect, it } from "vitest";
import { CAROUSEL_DESIGNS } from "@/lib/links";
import {
  DESIGN_IDS,
  DESIGN_MIN,
  DESIGN_QUESTIONS,
  designState,
  readDesignPick,
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
  THREAD_QUESTIONS,
  THREAD_YES,
  readThreadYes,
  CONFLICT_MIN,
  MAX_CONFLICT_NOTES,
  conflictQuestions,
  readConflict,
  GOAL_KINDS,
  GOAL_QUESTIONS,
  JEV_GOAL_MIN,
  goalPick,
  goalState,
  goalTop,
  ANGLE_CRITERIA,
  EN_WORDS_MIN,
  EVERGREEN_MIN,
  EVERGREEN_QUESTIONS,
  GRADE_CRITERIA,
  GRADE_MIN,
  GRADE_REASONS,
  MAX_PAIRS,
  MAX_TAG_POSTS,
  MODES,
  SAME_POST_MIN,
  TAG_MIN,
  TRY_MIN,
  evergreenState,
  gradeQuestions,
  gradeState,
  readEvergreen,
  readGrade,
  readSamePost,
  readTags,
  readTryNext,
  readsEnglish,
  samePostQuestions,
  tagsQuestions,
  tryNextQuestions,
  tryNextState,
  type GradeRequest,
} from "./logic";
import { ANGLES } from "@/lib/postLabels";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { TAG_MIN as SHARED_TAG_MIN } from "../_shared/tags";

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

describe("the reads-well-as-a-thread check", () => {
  const post = "Three things to check on your hospital plan before you renew it this year.";
  it("takes a post of 40 to 5,000 characters", () => {
    expect(parseJudgeRequest({ mode: "thread", post: ` ${post} ` })).toEqual({ ok: true, request: { mode: "thread", post } });
    expect(parseJudgeRequest({ mode: "thread", post: "Too short to judge." })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "thread", post: "a".repeat(5001) })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "thread", text: post })).toMatchObject({ ok: false });
  });
  it("asks Jev the spec's question as a noul", () => {
    expect(THREAD_QUESTIONS.thread.type).toBe("noul");
    expect(THREAD_QUESTIONS.thread.instructions).toBe(
      "This is a social media post by a Singapore financial adviser. Would it read better on Threads as a chain of 3 to 8 short posts than as one post? Yes when it has several separate points, steps or examples that each stand on their own; no when it is one short thought or one story that needs to be read in one piece.",
    );
    expect(THREAD_YES).toBe(0.6);
  });
  it("reads Jev's yes, and null when there is no answer, so no tag shows", () => {
    expect(readThreadYes({ thread: { type: "noul", noul: 0.72 } })).toBe(0.72);
    expect(readThreadYes({ thread: { type: "noul", noul: 1.2 } })).toBe(1);
    expect(readThreadYes({ thread: { type: "noul" } })).toBeNull();
    expect(readThreadYes({})).toBeNull();
    expect(readThreadYes(null)).toBeNull();
  });
});

describe("the carousel design pick", () => {
  const slide = (title: string, body = "") => ({ title, body });
  const four = [slide("3 things to check"), slide("Ward class", "Pick the ward you would stay in."), slide("Co-pay", "Know what you pay."), slide("Found this useful?")];

  it("names the same eight designs as the carousel maker, every one a choice for Jev", () => {
    expect([...DESIGN_IDS]).toEqual([...CAROUSEL_DESIGNS]);
    expect(Object.keys(DESIGN_QUESTIONS.design.criteria as Record<string, string>).sort()).toEqual([...DESIGN_IDS].sort());
    expect(DESIGN_QUESTIONS.design.type).toBe("choice");
  });

  it("takes 2 to 10 slides with some text, cut to size", () => {
    expect(parseJudgeRequest({ mode: "design", slides: four })).toEqual({ ok: true, request: { mode: "design", slides: four } });
    expect(parseJudgeRequest({ mode: "design", slides: [four[0]] })).toEqual({ ok: false, error: "Send 2 to 10 slides." });
    expect(parseJudgeRequest({ mode: "design", slides: Array(11).fill(four[1]) })).toEqual({ ok: false, error: "Send 2 to 10 slides." });
    expect(parseJudgeRequest({ mode: "design", slides: "slides" })).toEqual({ ok: false, error: "Send 2 to 10 slides." });
    expect(parseJudgeRequest({ mode: "design", slides: [four[0], null] })).toEqual({ ok: false, error: "Send 2 to 10 slides." });
    expect(parseJudgeRequest({ mode: "design", slides: [slide("Hi"), slide("", "")] })).toEqual({ ok: false, error: "Add some text to the slides first." });
    const long = parseJudgeRequest({ mode: "design", slides: [slide("x".repeat(300), "y".repeat(900)), { title: 5, body: " b " }] });
    expect(long).toEqual({ ok: true, request: { mode: "design", slides: [slide("x".repeat(200), "y".repeat(600)), slide("", "b")] } });
  });

  it("reads the slides to Jev in order", () => {
    expect(designState([slide("Hook"), slide("Point", "Body"), slide("", "Only body")])).toEqual({ slides: "Slide 1: Hook\n\nSlide 2: Point\nBody\n\nSlide 3: Only body" });
  });

  it("recommends Jev's likeliest design at 0.4 or more, and nothing below it or without an answer", () => {
    const answer = (probabilities: Record<string, number>) => ({ design: { type: "choice" as const, choice: "x", probabilities } });
    expect(readDesignPick(answer({ numbered: 0.62, checklist: 0.2, clean: 0.1 }))).toEqual({ pick: "numbered", p: 0.62 });
    expect(readDesignPick(answer({ numbered: DESIGN_MIN, checklist: 0.3 }))).toEqual({ pick: "numbered", p: 0.4 });
    expect(readDesignPick(answer({ numbered: 0.39, checklist: 0.31 }))).toEqual({ pick: null, p: 0.39 });
    // an id that is not a design is never picked
    expect(readDesignPick(answer({ skeleton: 0.9, quote: 0.45 }))).toEqual({ pick: "quote", p: 0.45 });
    expect(readDesignPick(answer({}))).toEqual({ pick: null, p: null });
    expect(readDesignPick({})).toEqual({ pick: null, p: null });
    expect(readDesignPick(null)).toEqual({ pick: null, p: null });
  });
});

describe("the learning conflict check", () => {
  const noul = (p: number) => ({ type: "noul" as const, noul: p });
  it("takes a note and 1 to 30 kept notes, each cut to 140 characters", () => {
    const r = parseJudgeRequest({ mode: "conflict", note: ` use lots of emoji ${"x".repeat(200)}`, notes: ["never use emoji in my posts", "end with a question"] });
    expect(r.ok && r.request).toMatchObject({ mode: "conflict", notes: ["never use emoji in my posts", "end with a question"] });
    expect(r.ok && r.request.mode === "conflict" && r.request.note.length).toBe(140);
    expect(parseJudgeRequest({ mode: "conflict", note: "a", notes: Array.from({ length: MAX_CONFLICT_NOTES }, () => "b") }).ok).toBe(true);
  });
  it("refuses an empty note, no kept notes, a blank one and more than 30", () => {
    for (const b of [
      { mode: "conflict", note: "  ", notes: ["never use emoji"] },
      { mode: "conflict", notes: ["never use emoji"] },
      { mode: "conflict", note: "use emoji", notes: [] },
      { mode: "conflict", note: "use emoji" },
      { mode: "conflict", note: "use emoji", notes: ["never use emoji", " "] },
      { mode: "conflict", note: "use emoji", notes: ["never use emoji", 3] },
      { mode: "conflict", note: "use emoji", notes: Array.from({ length: MAX_CONFLICT_NOTES + 1 }, () => "b") },
    ]) expect(parseJudgeRequest(b).ok, JSON.stringify(b)).toBe(false);
  });
  it("asks one yes/no per kept note, the spec's question", () => {
    const q = conflictQuestions("use lots of emoji", ["never use emoji in my posts", "end with a question"]);
    expect(Object.keys(q)).toEqual(["conflict_0", "conflict_1"]);
    expect(q.conflict_1).toEqual({
      type: "noul",
      instructions: {
        new_note: "use lots of emoji",
        old_note: "end with a question",
        question: "Does `new_note` change the rule in `old_note`, by reversing it, loosening or tightening it, or narrowing or widening where it applies?",
      },
      criteria: {
        true: "The new note is another version of the old note's rule on the same thing: its opposite ('use emoji' after 'never use emoji'), a looser or stricter limit ('one emoji at most' after 'no emoji', 'up to 5 hashtags' after 'no hashtags') or the same rule for fewer or more places ('no emoji on LinkedIn' after 'never use emoji').",
        false: "They are about different things, or the new note says the same as the old one.",
      },
    });
  });
  it("names the highest at or above 0.7, and nothing below it or without an answer", () => {
    expect(CONFLICT_MIN).toBe(0.7);
    expect(readConflict({ conflict_0: noul(0.72), conflict_1: noul(0.91), conflict_2: noul(0.3) }, 3)).toBe(1);
    expect(readConflict({ conflict_0: noul(0.7) }, 1)).toBe(0);
    expect(readConflict({ conflict_0: noul(0.69), conflict_1: noul(0.2) }, 2)).toBeNull();
    expect(readConflict(null, 2)).toBeNull();
    expect(readConflict({}, 2)).toBeNull();
    // an answer for a note that was not sent is ignored
    expect(readConflict({ conflict_0: noul(0.1), conflict_5: noul(0.99) }, 1)).toBeNull();
  });
});

describe("the goal kind (plan-goal)", () => {
  const choice = (c: string, p?: number) => ({ kind: { type: "choice" as const, choice: c, ...(p === undefined ? {} : { probabilities: { [c]: p } }) } });
  it("takes a typed goal of 4 to 120 characters, trimmed, on its own check rather than the 40-character one", () => {
    expect(parseJudgeRequest({ mode: "goal", text: "  more sign-ups  " })).toEqual({ ok: true, request: { mode: "goal", text: "more sign-ups" } });
    expect(parseJudgeRequest({ mode: "goal", text: "Grow" }).ok).toBe(true);
    expect(parseJudgeRequest({ mode: "goal", text: "x".repeat(120) }).ok).toBe(true);
    expect(parseJudgeRequest({ mode: "goal", text: " abc " })).toEqual({ ok: false, error: "Write a few more words." });
    for (const b of [{ mode: "goal", text: "x".repeat(121) }, { mode: "goal" }, { mode: "goal", text: 42 }]) expect(parseJudgeRequest(b).ok, JSON.stringify(b)).toBe(false);
  });
  it("asks one choice over the five kinds with the spec's criteria, in Singapore", () => {
    expect(goalState("more people booking a review")).toEqual({ goal: "more people booking a review", country: "Singapore", who: "a financial adviser or a small business that posts on social media" });
    expect(Object.keys(GOAL_QUESTIONS)).toEqual(["kind"]);
    expect(GOAL_QUESTIONS.kind).toEqual({
      type: "choice",
      instructions: "Which outcome does `who` most want from posting, going by `goal`?",
      criteria: {
        clients: "new clients, enquiries, appointments, leads or sales",
        audience: "more followers, reach, views or being known in a niche",
        trust: "existing clients and followers trusting them more, staying in touch or sending referrals",
        recruit: "recruiting people to join their team, agency or business",
        time: "posting regularly with less effort, time or stress",
      },
    });
    expect(Object.keys((GOAL_QUESTIONS.kind as { criteria: object }).criteria)).toEqual([...GOAL_KINDS]);
  });
  it("returns the kind at 0.6, null at 0.59, and null for an unknown choice or no answer", () => {
    expect(JEV_GOAL_MIN).toBe(0.6);
    expect(goalPick(choice("clients", 0.6))).toEqual({ kind: "clients", p: 0.6 });
    expect(goalPick(choice("audience", 0.913))).toEqual({ kind: "audience", p: 0.91 });
    expect(goalPick(choice("trust", 0.59))).toEqual({ kind: null, p: 0.59 });
    expect(goalPick(choice("money", 0.9))).toEqual({ kind: null, p: null });
    expect(goalPick(choice("time"))).toEqual({ kind: null, p: null });
    expect(goalPick({})).toEqual({ kind: null, p: null });
    expect(goalPick(null)).toEqual({ kind: null, p: null });
  });
  it("logs Jev's top kind below the cut too, so the cut can be read off real goals", () => {
    expect(goalTop(choice("trust", 0.59))).toEqual({ kind: "trust", p: 0.59 });
    expect(goalTop(null)).toEqual({ kind: null, p: null });
  });
});

// ---- North star phase 7: posts already out ----------------------------------------------------------

const english = "I sat with a client last Tuesday who had three hospital plans and no idea which one paid first. We spent an hour on it, and here is what we found.";
const malay = "Ramai orang fikir insurans itu mahal. Sebenarnya yang mahal ialah bila anda jatuh sakit dan tiada perlindungan. Minggu lepas seorang klien saya bayar $11,400 untuk wad hospital kerana plan dia sudah luput.";
const noul = (p: number) => ({ type: "noul" as const, noul: p });
const choice = (c: string, p: number) => ({ type: "choice" as const, choice: c, probabilities: { [c]: p } });

describe("readsEnglish", () => {
  it("reads English and Singlish as English, and Malay, Chinese or no letters as not", () => {
    expect(readsEnglish(english)).toBe(true);
    expect(readsEnglish("Wah CPF top up this year can or not? I checked already, the relief is only for the first $8,000 you put in lah.")).toBe(true);
    expect(readsEnglish(malay)).toBe(false);
    expect(readsEnglish("\u4fdd\u9669\u5176\u5b9e\u4e0d\u8d35\u3002\u771f\u6b63\u8d35\u7684\u662f\u53d1\u73b0\u81ea\u5df1\u6ca1\u6709\u4fdd\u969c\u3002")).toBe(false);
    expect(readsEnglish("12345 !!!")).toBe(false);
  });

  it("leaves hashtags, handles and links out of the count, and lets mostlyEnglish decide a short caption", () => {
    expect(readsEnglish("Medishield life vs integrated shield plans #singapore #medishield #insurance #medicalinsurance #cpf #sgfinance https://x.co/a")).toBe(true);
    expect(readsEnglish("Semak polisi anda hari ini")).toBe(true);
    expect(EN_WORDS_MIN).toBe(0.06);
  });
});

describe("parseJudgeRequest, the post modes", () => {
  const pair = (k: string) => ({ key: k, draft: english, live: english, platform: "linkedin" });

  it("joins the five post modes to MODES", () => {
    for (const m of ["same-post", "grade", "tags", "try-next", "evergreen"]) expect(MODES).toContain(m);
  });

  it("takes 1 to 10 same-post pairs, cut to 600 and 300 characters, and refuses 11, repeats or a missing half", () => {
    const r = parseJudgeRequest({ mode: "same-post", pairs: [{ key: "p1|d1", draft: "x".repeat(900), live: "y".repeat(500), platform: "instagram" }] });
    expect(r).toEqual({ ok: true, request: { mode: "same-post", pairs: [{ key: "p1|d1", draft: "x".repeat(600), live: "y".repeat(300), platform: "instagram" }] } });
    expect(parseJudgeRequest({ mode: "same-post", pairs: Array.from({ length: MAX_PAIRS }, (_, i) => pair(`k${i}`)) })).toMatchObject({ ok: true });
    expect(parseJudgeRequest({ mode: "same-post", pairs: Array.from({ length: MAX_PAIRS + 1 }, (_, i) => pair(`k${i}`)) })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "same-post", pairs: [pair("a"), pair("a")] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "same-post", pairs: [{ ...pair("a"), live: " " }] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "same-post", pairs: [] })).toMatchObject({ ok: false });
  });

  it("takes 1 to 20 posts to tag and refuses 21", () => {
    const posts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, text: english, needHook: i % 2 === 0 }));
    const r = parseJudgeRequest({ mode: "tags", posts: posts(MAX_TAG_POSTS) });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.request.mode === "tags" && r.request.posts[1]).toEqual({ id: "d1", text: english, needHook: false });
    expect(parseJudgeRequest({ mode: "tags", posts: posts(MAX_TAG_POSTS + 1) })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "tags", posts: [{ id: "d1", text: "" }] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "tags", posts: [{ id: "d1", text: english, needHook: "yes" }] })).toMatchObject({ ok: true, request: { posts: [{ needHook: false }] } });
  });

  it("takes a grade with all five reasons by default, only the known ones offered, and at least two", () => {
    const base = { mode: "grade", text: english, platform: "linkedin", format: "text-post", posted: "2026-10-20T01:00:00.000Z", words: 31.4, ratio: 2.43, direction: "above" };
    const r = parseJudgeRequest({ ...base, best: [{ firstLine: "Three plans, one claim.", format: "carousel", posted: "2026-10-01T01:00:00.000Z" }, {}, 4, { firstLine: "a" }, { firstLine: "b" }] });
    expect(r).toEqual({
      ok: true,
      request: { ...base, words: 31, reasons: [...GRADE_REASONS], best: [{ firstLine: "Three plans, one claim.", format: "carousel", posted: "2026-10-01T01:00:00.000Z" }, { firstLine: "a", format: "", posted: "" }, { firstLine: "b", format: "", posted: "" }] },
    });
    expect(parseJudgeRequest({ ...base, reasons: ["ask", "hook", "weather"] })).toMatchObject({ ok: true, request: { reasons: ["hook", "ask"] } });
    expect(parseJudgeRequest({ ...base, reasons: ["hook"] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ ...base, direction: "same" })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ ...base, ratio: "2" })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ ...base, text: "x".repeat(2000) })).toMatchObject({ ok: true, request: { text: "x".repeat(1500) } });
  });

  it("takes try-next with the known formula ids only, and needs an audience or topics", () => {
    const r = parseJudgeRequest({ mode: "try-next", audience: "young parents", topics: "CPF, hospital plans", best: ["a", "b", "c", "d"], untried: ["myth-bust", "made-up", "list"] });
    expect(r).toEqual({ ok: true, request: { mode: "try-next", audience: "young parents", topics: ["CPF", "hospital plans"], best: ["a", "b", "c"], untried: ["list", "myth-bust"] } });
    expect(parseJudgeRequest({ mode: "try-next", audience: "", topics: [], untried: ["list"] })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "try-next", audience: "parents", untried: ["made-up"] })).toMatchObject({ ok: false });
  });

  it("takes an evergreen check of a post with some text", () => {
    expect(parseJudgeRequest({ mode: "evergreen", text: ` ${english} ` })).toEqual({ ok: true, request: { mode: "evergreen", text: english } });
    expect(parseJudgeRequest({ mode: "evergreen", text: "Hi" })).toMatchObject({ ok: false });
  });
});

describe("the same-post check (learn-real-numbers)", () => {
  const pairs = [
    { key: "p1|d1", draft: english, live: english, platform: "linkedin" },
    { key: "p1|d2", draft: `${english} Again.`, live: english, platform: "linkedin" },
    { key: "p2|d3", draft: english, live: `${english} #cpf`, platform: "instagram" },
  ];

  it("asks one yes/no per pair with both halves, and none for a pair with a half not in English", () => {
    const q = samePostQuestions([...pairs, { key: "p3|d4", draft: english, live: malay, platform: "tiktok" }]);
    expect(Object.keys(q)).toEqual(["same_0", "same_1", "same_2"]);
    expect(q.same_0).toMatchObject({ type: "noul", instructions: { platform: "LinkedIn", draft: english, live: english } });
    expect((q.same_0 as { criteria: { true: string } }).criteria.true).toBe("Yes: same topic, same points in the same order, mostly the same sentences.");
  });

  it("links a pair at 0.7, only when it is the one pair for that pulled post that clears it", () => {
    expect(SAME_POST_MIN).toBe(0.7);
    const read = readSamePost({ same_0: noul(0.7), same_1: noul(0.69), same_2: noul(0.91) }, pairs);
    expect(read).toEqual({ links: ["p1|d1", "p2|d3"], p: { "p1|d1": 0.7, "p1|d2": 0.69, "p2|d3": 0.91 } });
    expect(readSamePost({ same_0: noul(0.8), same_1: noul(0.75), same_2: noul(0.2) }, pairs).links).toEqual([]);
    expect(readSamePost({ same_0: noul(0.699), same_2: noul(0.5) }, pairs)).toEqual({ links: [], p: { "p1|d1": 0.7, "p1|d2": null, "p2|d3": 0.5 } });
    expect(readSamePost({ same_0: noul(0.6949) }, pairs).links).toEqual([]);
    expect(readSamePost(null, pairs)).toEqual({ links: [], p: { "p1|d1": null, "p1|d2": null, "p2|d3": null } });
  });
});

describe("the grade reason (learn-post-grade)", () => {
  const r: GradeRequest = {
    mode: "grade", text: english, platform: "linkedin", format: "text-post", posted: "2026-10-20T01:00:00.000Z", words: 31, ratio: 2.43, direction: "above",
    best: [{ firstLine: "Three plans, one claim.", format: "carousel", posted: "2026-10-01T01:00:00.000Z" }], reasons: [...GRADE_REASONS],
  };

  it("names better or worse by direction, with the five criteria or only the ones offered", () => {
    const up = gradeQuestions(r).reason as { type: string; instructions: string; criteria: Record<string, string> };
    expect(up.type).toBe("choice");
    expect(up.instructions).toBe("This post by a Singapore financial adviser got 2.4x their usual engagement on LinkedIn. Which ONE thing most likely explains why it did better than usual? `best` are their best recent posts on the same network.");
    expect(up.criteria).toEqual(GRADE_CRITERIA);
    expect(Object.keys(GRADE_CRITERIA)).toEqual(["hook", "topic", "format", "timing", "ask"]);
    const down = gradeQuestions({ ...r, ratio: 0.4, direction: "below", reasons: ["topic", "ask"] }).reason as { instructions: string; criteria: object };
    expect(down.instructions).toContain("got 0.4x their usual engagement on LinkedIn");
    expect(down.instructions).toContain("why it did worse than usual");
    expect(Object.keys(down.criteria)).toEqual(["topic", "ask"]);
    expect(gradeState(r)).toEqual({
      post: english, platform: "LinkedIn", format: "text-post", posted: r.posted, words: 31, vs_usual: "2.4x",
      best: [{ first_line: "Three plans, one claim.", format: "carousel", posted: "2026-10-01T01:00:00.000Z" }],
    });
  });

  it("gives the reason at 0.4 and nothing just under it, and nulls for a missing or unoffered answer", () => {
    expect(GRADE_MIN).toBe(0.4);
    expect(readGrade({ reason: choice("hook", 0.4) }, GRADE_REASONS)).toEqual({ reason: "hook", p: 0.4 });
    expect(readGrade({ reason: choice("hook", 0.39) }, GRADE_REASONS)).toEqual({ reason: null, p: 0.39 });
    expect(readGrade({ reason: choice("hook", 0.399) }, GRADE_REASONS)).toEqual({ reason: null, p: 0.4 });
    expect(readGrade({ reason: choice("timing", 0.9) }, ["hook", "ask"])).toEqual({ reason: null, p: null });
    expect(readGrade({}, GRADE_REASONS)).toEqual({ reason: null, p: null });
    expect(readGrade(null, GRADE_REASONS)).toEqual({ reason: null, p: null });
  });
});

describe("the post tags (learn-format-winners)", () => {
  const posts = [
    { id: "d1", text: `Most people say clear your home loan early.\n${english}`, needHook: true },
    { id: "d2", text: english, needHook: false },
    { id: "d3", text: malay, needHook: true },
  ];

  it("keeps the angles in step with /swipe's ANGLES and the hook options with the 21 formulas plus none", () => {
    expect(Object.keys(ANGLE_CRITERIA)).toEqual([...ANGLES]);
    const q = tagsQuestions(posts.slice(0, 1));
    const hook = q["hook:d1"] as { criteria: Record<string, string> };
    expect(Object.keys(hook.criteria)).toEqual([...HOOK_FORMULAS.map((f) => f.id), "none"]);
    const list = HOOK_FORMULAS.find((f) => f.id === "list")!;
    expect(hook.criteria.list).toBe(`${list.name}: ${list.template}`);
    expect(hook.criteria.none).toBe("None of these shapes");
    expect(Object.values((q["angle:d1"] as { criteria: Record<string, string> }).criteria)).toEqual(Object.values(ANGLE_CRITERIA));
    expect(TAG_MIN).toBe(SHARED_TAG_MIN);
  });

  it("asks an angle per English post and a hook on its first line only when needHook; a Malay post gets no question", () => {
    const q = tagsQuestions(posts);
    expect(Object.keys(q)).toEqual(["angle:d1", "hook:d1", "angle:d2"]);
    expect(q["angle:d1"]).toMatchObject({ type: "choice", instructions: { post: posts[0].text, question: "Which angle does `post` mainly take?" } });
    expect(q["hook:d1"]).toMatchObject({ type: "choice", instructions: { first_line: "Most people say clear your home loan early." } });
  });

  it("keeps a pick at 0.5, stores 'unclear' just under it and for the Malay post, and keeps a 'none' hook", () => {
    const answers = { "angle:d1": choice("contrarian", 0.5), "hook:d1": choice("contrarian", 0.88), "angle:d2": choice("objection-handling", 0.49) };
    expect(readTags(answers, posts).tags).toEqual({
      d1: { angle: "Contrarian", hook: "contrarian" },
      d2: { angle: "unclear" },
      d3: { angle: "unclear", hook: "unclear" },
    });
    expect(readTags({ "angle:d2": choice("objection-handling", 0.6), "hook:d1": choice("none", 0.7) }, posts).tags).toMatchObject({
      d1: { angle: "unclear", hook: "none" },
      d2: { angle: "Objection Handling" },
    });
    expect(readTags({ "hook:d1": choice("made-up", 0.99) }, posts).tags.d1).toEqual({ angle: "unclear", hook: "unclear" });
    expect(readTags({ "angle:d2": choice("humour", 0.4999) }, posts).tags.d2).toEqual({ angle: "unclear" });
  });

  it("logs Jev's picks and p whatever the cut, never the words", () => {
    const { log } = readTags({ "angle:d1": choice("contrarian", 0.5), "hook:d1": choice("list", 0.3) }, posts);
    expect(log).toEqual([["contrarian", 0.5, "list", 0.3], [null, null], [null, null, null, null]]);
    expect(JSON.stringify(log)).not.toContain("client");
  });
});

describe("what to try next (learn-format-winners)", () => {
  it("asks one yes/no per untried formula about their audience and topics", () => {
    const q = tryNextQuestions(["myth-bust", "list"]);
    expect(Object.keys(q)).toEqual(["try_list", "try_myth-bust"]);
    expect(q["try_list"]).toMatchObject({ type: "noul", instructions: 'Would opening a post with the "The list" hook ("{N} things I wish I knew before {milestone}.") suit this adviser\'s `audience` and `topics`?' });
    expect(tryNextState({ mode: "try-next", audience: "parents", topics: ["CPF"], best: ["a"], untried: [] })).toEqual({ audience: "parents", topics: ["CPF"], best_hooks: ["a"], writer: "a Singapore financial adviser" });
  });

  it("keeps 0.6 and up, the top 2, likeliest first", () => {
    expect(TRY_MIN).toBe(0.6);
    const read = readTryNext({ try_list: noul(0.6), "try_myth-bust": noul(0.9), try_receipt: noul(0.75), try_callout: noul(0.59) }, ["list", "myth-bust", "receipt", "callout"]);
    expect(read.hooks).toEqual(["myth-bust", "receipt"]);
    expect(readTryNext({ try_list: noul(0.6), try_callout: noul(0.599) }, ["list", "callout"]).hooks).toEqual(["list"]);
    expect(readTryNext(null, ["list"])).toEqual({ hooks: [], p: { list: null } });
  });
});

describe("the evergreen check (remix-own-winners)", () => {
  it("asks one yes/no about posting a fresh version next month", () => {
    expect(EVERGREEN_QUESTIONS.evergreen).toMatchObject({ type: "noul", instructions: "Would a fresh version of `post` still make sense to post next month?" });
    expect(evergreenState(english)).toEqual({ post: english, writer: "a Singapore financial adviser" });
  });

  it("keeps the post at 0.5, marks it dated just under, and answers null with no answer (the app keeps it)", () => {
    expect(EVERGREEN_MIN).toBe(0.5);
    expect(readEvergreen({ evergreen: noul(0.5) })).toEqual({ evergreen: true, p: 0.5 });
    expect(readEvergreen({ evergreen: noul(0.49) })).toEqual({ evergreen: false, p: 0.49 });
    expect(readEvergreen({ evergreen: noul(0.4999) })).toEqual({ evergreen: false, p: 0.5 });
    expect(readEvergreen({})).toEqual({ evergreen: null, p: null });
    expect(readEvergreen(null)).toEqual({ evergreen: null, p: null });
  });
});
