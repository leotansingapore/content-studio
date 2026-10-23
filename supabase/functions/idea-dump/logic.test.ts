import { describe, expect, it } from "vitest";
import { FUNNEL_STAGES } from "../../../src/data/funnelFramework.ts";
import {
  FUNNEL_STAGE_IDS,
  IDEA_BRIEF_SCHEMA,
  MAX_IDEAS,
  MAX_NOTES_CHARS,
  NO_IDEAS_MESSAGE,
  buildIdeaDumpPrompt,
  cleanText,
  isUsableIdea,
  parseIdeaDumpRequest,
  splitIdeas,
  validateBriefs,
} from "./logic.ts";

describe("splitIdeas", () => {
  it("treats each line as one idea and strips bullets and numbering", () => {
    const out = splitIdeas(
      "- why young adults skip hospital plans\n2. CPF top ups before December\n• the day I left engineering for this job\n(4) three questions to ask before buying any policy",
    );
    expect(out.ideas).toEqual([
      "why young adults skip hospital plans",
      "CPF top ups before December",
      "the day I left engineering for this job",
      "three questions to ask before buying any policy",
    ]);
    expect(out.tooShort).toEqual([]);
    expect(out.overflow).toEqual([]);
  });

  it("keeps numbers that are part of the idea", () => {
    expect(splitIdeas("3 CPF myths nobody tells you\n5:30am routine that saved my business").ideas).toEqual([
      "3 CPF myths nobody tells you",
      "5:30am routine that saved my business",
    ]);
  });

  it("sets aside notes too thin to develop, and drops headings, blanks and repeats", () => {
    const out = splitIdeas("Ideas for this week:\nhospital plans\nCPF top ups before December\ncpf top ups before december.\n!!!\n");
    expect(out.ideas).toEqual(["CPF top ups before December"]);
    expect(out.tooShort).toEqual(["hospital plans"]);
  });

  it("drops a heading instead of joining it to the paragraph below", () => {
    expect(
      splitIdeas("Ideas for this week:\nwhy young adults skip hospital plans\n\nThe real cost of waiting\nto buy insurance").ideas,
    ).toEqual(["why young adults skip hospital plans", "The real cost of waiting to buy insurance"]);
  });

  it("never glues a symbol-only line into a paragraph", () => {
    expect(
      splitIdeas("first idea about hospital plans\n!!!\nstill the same idea here\n\nsecond idea about CPF top ups").ideas,
    ).toEqual(["first idea about hospital plans still the same idea here", "second idea about CPF top ups"]);
  });

  it("counts Chinese notes by characters", () => {
    expect(isUsableIdea("年轻人为什么不买住院保险")).toBe(true);
    expect(isUsableIdea("保险")).toBe(false);
  });

  it(`develops at most ${MAX_IDEAS} and leaves the rest for next time`, () => {
    const lines = Array.from({ length: 13 }, (_, i) => `post idea number ${i + 1} about savings`);
    const out = splitIdeas(lines.join("\n"));
    expect(out.ideas).toHaveLength(MAX_IDEAS);
    expect(out.overflow).toEqual(lines.slice(MAX_IDEAS));
  });

  it("keeps a dictated paragraph as one note for the model to split", () => {
    const para =
      "okay so one idea is how young people ignore hospital plans and another is CPF top ups before December and maybe why I left engineering";
    expect(splitIdeas(para).ideas).toEqual([para]);
  });

  it("joins hard-wrapped paragraphs separated by blank lines, but still splits bulleted lists", () => {
    const out = splitIdeas(
      "A client asked me why her premiums went up\nafter she turned 40 and I explained it badly\n\nThe real cost of waiting\nto buy insurance until you have kids\n\nQuick list:\n- claims myths people believe\n- what a hospital bill really looks like",
    );
    expect(out.ideas).toEqual([
      "A client asked me why her premiums went up after she turned 40 and I explained it badly",
      "The real cost of waiting to buy insurance until you have kids",
      "claims myths people believe",
      "what a hospital bill really looks like",
    ]);
  });

  it("gives the same ideas back when its own output is split again", () => {
    const first = splitIdeas("- why young adults skip hospital plans\n\nThe real cost of waiting\nto buy insurance\n\nCPF top ups before December");
    expect(splitIdeas(first.ideas.join("\n")).ideas).toEqual(first.ideas);
  });

  it("ignores anything past the character cap and non-string input", () => {
    const long = `${"a".repeat(MAX_NOTES_CHARS)}\nthis line is past the cap entirely`;
    expect(splitIdeas(long).ideas).toEqual([]);
    expect(splitIdeas(undefined)).toEqual({ ideas: [], tooShort: [], overflow: [] });
    expect(splitIdeas({ notes: "x" })).toEqual({ ideas: [], tooShort: [], overflow: [] });
  });
});

describe("parseIdeaDumpRequest", () => {
  it("refuses a missing or empty notes field", () => {
    expect(parseIdeaDumpRequest(null)).toMatchObject({ ok: false, status: 400, code: "no_notes" });
    expect(parseIdeaDumpRequest({ notes: "   " })).toMatchObject({ ok: false, status: 400, code: "no_notes" });
  });

  it("refuses notes with nothing usable in them", () => {
    expect(parseIdeaDumpRequest({ notes: "cpf\nhospital plans" })).toEqual({
      ok: false,
      status: 422,
      code: "no_ideas",
      error: NO_IDEAS_MESSAGE,
    });
  });

  it("cleans the optional context", () => {
    const parsed = parseIdeaDumpRequest({
      notes: "why young adults skip hospital plans",
      voice: `  casual,   short sentences ${"x".repeat(3000)}`,
      positioning: { oneLiner: " I help fresh grads plan ", topics: ["CPF", 42, "", "hospital plans"], edge: 7 },
      platforms: ["instagram", "myspace", "instagram", "tiktok"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context } = parsed.request;
    expect(context.voice.startsWith("casual, short sentences")).toBe(true);
    expect(context.voice.length).toBeLessThanOrEqual(1500);
    expect(context.positioning).toEqual({
      oneLiner: "I help fresh grads plan",
      audienceDetail: "",
      topics: ["CPF", "hospital plans"],
      edge: "",
    });
    expect(context.platforms).toEqual(["instagram", "tiktok"]);
  });

  it("leaves positioning out when nothing in it is filled", () => {
    const parsed = parseIdeaDumpRequest({ notes: "why young adults skip hospital plans", positioning: { oneLiner: "", topics: [] } });
    expect(parsed.ok && parsed.request.context).toEqual({ voice: "", positioning: null, platforms: [] });
  });
});

describe("buildIdeaDumpPrompt", () => {
  it("numbers the notes and carries the consultant's context", () => {
    const { system, user } = buildIdeaDumpPrompt({
      ideas: ["why young adults skip hospital plans", "CPF top ups before December"],
      context: {
        voice: "Warm, short sentences.",
        positioning: { oneLiner: "I help fresh grads plan", audienceDetail: "", topics: ["CPF"], edge: "" },
        platforms: ["instagram"],
      },
    });
    expect(user).toContain("1. why young adults skip hospital plans\n2. CPF top ups before December");
    expect(user).toContain("Positioning: I help fresh grads plan");
    expect(user).toContain("Their platforms: instagram");
    expect(user).toContain("Voice sample (how they write): Warm, short sentences.");
    for (const stage of FUNNEL_STAGE_IDS) expect(system).toContain(`- ${stage}:`);
    expect(system).toMatch(/risk-free/);
    expect(system).toMatch(/guaranteed/);
    expect(system).toMatch(/not instructions/);
  });

  it("says when there is no saved context", () => {
    const { user } = buildIdeaDumpPrompt({
      ideas: ["why young adults skip hospital plans"],
      context: { voice: "", positioning: null, platforms: [] },
    });
    expect(user.startsWith("About the consultant: nothing saved yet.")).toBe(true);
  });
});

describe("IDEA_BRIEF_SCHEMA", () => {
  it("meets OpenAI strict mode: every object closed, every property required", () => {
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
        Object.values(n.properties as object).forEach(walk);
      }
      if (n.type === "array") walk(n.items);
    };
    walk(IDEA_BRIEF_SCHEMA);
  });

  it("uses the app's funnel stage ids", () => {
    expect([...FUNNEL_STAGE_IDS]).toEqual(FUNNEL_STAGES.map((s) => s.id));
  });
});

describe("validateBriefs", () => {
  const notes = ["why young adults skip hospital plans", "CPF top ups before December", "asdf qwer zxcv"];
  const good = {
    note: 1,
    idea: "Why young adults put off hospital cover",
    angle: "Skipping cover at 25 feels smart until the first ward bill arrives.",
    hooks: ["Would a $20,000 hospital bill wipe out your savings?", "3 reasons 25-year-olds skip hospital plans", "I skipped this at 25 — here's what changed my mind"],
    talkingPoints: ["What MediShield Life covers", "Where the gaps show up", "How to review cover in 15 minutes"],
    cta: "Comment 'WARD' and I'll send the checklist.",
    ctaType: "comment-keyword",
    format: "carousel",
    platform: "instagram",
    funnelStage: "trust",
    stageReason: "Teaches a real pain point.",
  };

  it("keeps a well-formed brief and strips em dashes", () => {
    const out = validateBriefs(JSON.stringify({ briefs: [good], skipped: [] }), { notes });
    expect(out?.briefs).toHaveLength(1);
    expect(out?.briefs[0]).toMatchObject({ note: 1, format: "carousel", platform: "instagram", funnelStage: "trust" });
    expect(out?.briefs[0].hooks[2]).toBe("I skipped this at 25, here's what changed my mind");
  });

  it("reads JSON wrapped in a code fence", () => {
    expect(validateBriefs("```json\n" + JSON.stringify({ briefs: [good] }) + "\n```", { notes })?.briefs).toHaveLength(1);
  });

  it("dedupes and caps hooks at 3 and talking points at 5", () => {
    const out = validateBriefs(
      {
        briefs: [
          {
            ...good,
            hooks: ["Same hook here", "same hook here", "Second hook", "Third hook", "Fourth hook"],
            talkingPoints: ["a1", "a2", "a3", "a4", "a5", "a6"],
          },
        ],
      },
      { notes },
    );
    expect(out?.briefs[0].hooks).toEqual(["Same hook here", "Second hook", "Third hook"]);
    expect(out?.briefs[0].talkingPoints).toHaveLength(5);
  });

  it("drops briefs missing the essentials", () => {
    const out = validateBriefs(
      {
        briefs: [
          { ...good, hooks: ["Only one hook"] },
          { ...good, talkingPoints: ["just one"] },
          { ...good, angle: "  " },
          { ...good, cta: "" },
          "not an object",
        ],
      },
      { notes },
    );
    expect(out).toEqual({ briefs: [], skipped: [] });
  });

  it("falls back to safe values for unknown enums and out-of-range notes", () => {
    const out = validateBriefs(
      { briefs: [{ ...good, note: 9, ctaType: "buy-now", format: "podcast", platform: "myspace", funnelStage: "hype" }] },
      { notes, platforms: ["tiktok"] },
    );
    expect(out?.briefs[0]).toMatchObject({
      note: null,
      ctaType: "open-question",
      format: "text-post",
      platform: "tiktok",
      funnelStage: "attraction",
    });
  });

  it("uses the note as the idea when the model leaves it blank", () => {
    expect(validateBriefs({ briefs: [{ ...good, idea: "" }] }, { notes })?.briefs[0].idea).toBe(notes[0]);
  });

  it(`returns at most ${MAX_IDEAS} briefs`, () => {
    const many = Array.from({ length: 14 }, () => good);
    expect(validateBriefs({ briefs: many }, { notes })?.briefs).toHaveLength(MAX_IDEAS);
  });

  it("reports skipped notes once, and not when a brief covers them", () => {
    const out = validateBriefs(
      {
        briefs: [good],
        skipped: [
          { note: 3, reason: "No idea in there." },
          { note: 3, reason: "Duplicate" },
          { note: 1, reason: "Contradiction" },
          { note: 0, reason: "Out of range" },
          { note: 2, reason: "" },
        ],
      },
      { notes },
    );
    expect(out?.skipped).toEqual([
      { note: 3, idea: "asdf qwer zxcv", reason: "No idea in there." },
      { note: 2, idea: "CPF top ups before December", reason: "Too vague to develop." },
    ]);
  });

  it("returns null for output that isn't the expected JSON", () => {
    expect(validateBriefs("sorry, I can't help", { notes })).toBeNull();
    expect(validateBriefs({ ideas: [] }, { notes })).toBeNull();
    expect(validateBriefs(null, { notes })).toBeNull();
  });

  it("cleanText cuts at a word boundary", () => {
    expect(cleanText("one two three four", 10)).toBe("one two…");
    expect(cleanText(5, 10)).toBe("");
  });
});

// ---- One long piece into a week of posts (mode "long") ------------------------

import {
  LONG_POSTS,
  LONG_SCHEMA,
  MAX_LONG_CHARS,
  buildLongPrompt,
  parseLongRequest,
  validateLong,
} from "./logic.ts";

const FORMULAS = [
  { id: "contrarian", name: "Contrarian take", template: "Most people say {x}. I disagree." },
  { id: "number-reveal", name: "Number reveal", template: "I did {x} {N} times." },
  { id: "mistake", name: "Mistake confession", template: "{Cost} is what {mistake} cost me." },
  { id: "before-after", name: "Before and after", template: "{Then}. Now {now}." },
  { id: "list", name: "The list", template: "{N} things I wish I knew." },
];
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Sentence ${i} about CPF top-ups and why clients wait too long.`).join(" ");

describe("parseLongRequest", () => {
  it("takes the piece, five distinct formulas and the context", () => {
    const r = parseLongRequest({ mode: "long", text: LONG_TEXT, formulas: FORMULAS, platforms: ["linkedin"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.text).toBe(LONG_TEXT);
    expect(r.request.truncated).toBe(false);
    expect(r.request.formulas.map((f) => f.id)).toEqual(FORMULAS.map((f) => f.id));
    expect(r.request.context.platforms).toEqual(["linkedin"]);
  });

  it("cuts a piece past the cap and says so", () => {
    const r = parseLongRequest({ text: "word ".repeat(6000), formulas: FORMULAS });
    expect(r.ok && r.request.text.length <= MAX_LONG_CHARS && r.request.truncated).toBe(true);
  });

  it("refuses a short piece, and formulas that are missing, repeated or malformed", () => {
    expect(parseLongRequest({ text: "A short note about CPF.", formulas: FORMULAS })).toMatchObject({ ok: false, status: 422, code: "too_short" });
    expect(parseLongRequest({ text: LONG_TEXT, formulas: FORMULAS.slice(0, 4) })).toMatchObject({ ok: false, status: 400, code: "bad_formulas" });
    expect(parseLongRequest({ text: LONG_TEXT, formulas: [...FORMULAS.slice(0, 4), FORMULAS[0]] })).toMatchObject({ ok: false, code: "bad_formulas" });
    expect(parseLongRequest({ text: LONG_TEXT, formulas: [...FORMULAS.slice(0, 4), { id: "Bad Id!", name: "x", template: "y" }] })).toMatchObject({ ok: false, code: "bad_formulas" });
    expect(parseLongRequest({ formulas: FORMULAS })).toMatchObject({ ok: false, status: 400, code: "no_text" });
  });
});

describe("buildLongPrompt", () => {
  it("numbers the formulas in order, fences the piece as material and keeps the no-invention rule", () => {
    const r = parseLongRequest({ text: LONG_TEXT, formulas: FORMULAS });
    if (!r.ok) throw new Error("parse");
    const { system, user } = buildLongPrompt(r.request);
    expect(user).toContain("1. Contrarian take: Most people say {x}. I disagree.");
    expect(user).toContain("5. The list:");
    expect(user).toContain(LONG_TEXT);
    expect(system).toMatch(/not instructions/);
    expect(system).toMatch(/Never invent/);
    expect(system).toContain(`exactly ${LONG_POSTS} posts`);
  });

  it("tells it a piece with no stories gets no story about the consultant or a client, only a blank", () => {
    // live check 2026-10-09: a piece with no anecdotes came back with "I turned down the chance to cancel a hospital plan rider for a client"
    const r = parseLongRequest({ text: LONG_TEXT, formulas: FORMULAS });
    if (!r.ok) throw new Error("parse");
    const { system } = buildLongPrompt(r.request);
    expect(system).toContain("A story comes only from your stories list. When that list is empty, no post tells something that happened to the consultant or a client");
    expect(system).toContain("[what happened]");
  });
});

describe("LONG_SCHEMA", () => {
  it("is strict: every property required, nothing extra", () => {
    const post = LONG_SCHEMA.properties.posts.items;
    expect(LONG_SCHEMA.additionalProperties).toBe(false);
    expect([...post.required].sort()).toEqual(Object.keys(post.properties).sort());
    expect([...LONG_SCHEMA.properties.extracts.required].sort()).toEqual(Object.keys(LONG_SCHEMA.properties.extracts.properties).sort());
  });
});

describe("validateLong", () => {
  const raw = {
    extracts: {
      claims: ["Waiting a year costs more than people think", "waiting a year costs more than people think", ""],
      numbers: ["3 of 5 reviews had no will"],
      stories: ["A client outside a ward — asking about her company plan"],
      lines: ["Insurance is a promise you hope to never use"],
    },
    posts: [
      { formula: 2, post: "  I reviewed 5 families.\r\n\r\n\r\n3 had no will — none knew.  ", basedOn: "3 of 5 reviews had no will" },
      { formula: 2, post: "A second post with the same formula.", basedOn: "x" },
      { formula: 9, post: "A post with a formula number that is not on the list.", basedOn: "x" },
      { formula: 1, post: "", basedOn: "x" },
      { formula: 1, post: "Most people say wait. I disagree.", basedOn: "Waiting a year costs more" },
    ],
  };

  it("keeps one post per listed formula with its paragraphs, and dedupes and counts the extracts", () => {
    const out = validateLong(JSON.stringify(raw), FORMULAS);
    expect(out?.posts).toEqual([
      { formulaId: "number-reveal", post: "I reviewed 5 families.\n\n3 had no will, none knew.", basedOn: "3 of 5 reviews had no will" },
      { formulaId: "contrarian", post: "Most people say wait. I disagree.", basedOn: "Waiting a year costs more" },
    ]);
    expect(out?.extracts.claims).toEqual(["Waiting a year costs more than people think"]);
    expect(out?.extracts.stories).toEqual(["A client outside a ward, asking about her company plan"]);
  });

  it("returns null for output that is not the expected JSON", () => {
    expect(validateLong("not json", FORMULAS)).toBeNull();
    expect(validateLong({ extracts: {} }, FORMULAS)).toBeNull();
  });
});

// ---- Pins (phase 5): today's prompts, byte for byte ---------------------------

import { COMPLIANCE_LINES } from "./logic.ts";
// Never update these with vitest -u: the default and long modes are live for everyone, and every later change
// to logic.ts (COMPLIANCE_LINES, the plan modes) must leave them exactly as they are.

const PIN_BODY = {
  positioning: {
    oneLiner: "I help young families in Singapore plan for the big costs.",
    audienceDetail: "Parents in their 30s with an HDB flat and a first child",
    topics: ["Hospital cover", "CPF", "Saving for school"],
    edge: "Ex-engineer who explains with numbers",
  },
  platforms: ["linkedin", "instagram"],
  voice: "Short sentences. I say what I think. No jargon.",
};
const promptText = (p: { system: string; user: string }) => `${p.system}\n\n===== user =====\n\n${p.user}\n`;

describe("pinned prompts", () => {
  it("sends COMPLIANCE_LINES in the default prompt as one block", () => {
    const r = parseIdeaDumpRequest({ notes: "why young adults skip hospital plans" });
    if (!r.ok) throw new Error("parse");
    expect(buildIdeaDumpPrompt(r.request).system).toContain(`\n\n${COMPLIANCE_LINES.join("\n")}\n\n`);
    expect(COMPLIANCE_LINES).toHaveLength(7);
  });

  it("keeps the default prompt with a saved profile", async () => {
    const r = parseIdeaDumpRequest({ ...PIN_BODY, notes: "- why young adults skip hospital plans\n- CPF top ups before December\n- the day I left engineering for this job" });
    if (!r.ok) throw new Error("parse");
    await expect(promptText(buildIdeaDumpPrompt(r.request))).toMatchFileSnapshot("./fixtures/default-prompt.txt");
  });

  it("keeps the default prompt with nothing saved", async () => {
    const r = parseIdeaDumpRequest({ notes: "why young adults skip hospital plans" });
    if (!r.ok) throw new Error("parse");
    await expect(promptText(buildIdeaDumpPrompt(r.request))).toMatchFileSnapshot("./fixtures/default-prompt-empty.txt");
  });

  it("keeps the long prompt", async () => {
    const r = parseLongRequest({ ...PIN_BODY, mode: "long", text: LONG_TEXT, formulas: FORMULAS });
    if (!r.ok) throw new Error("parse");
    await expect(promptText(buildLongPrompt(r.request))).toMatchFileSnapshot("./fixtures/long-prompt.txt");
  });
});

// ---- Plan modes (phase 5): angles ----------------------------------------------

import { BUSINESS_VOICE, sentenceCase } from "../remix/logic.ts";
import {
  ANGLE_CANDIDATES,
  PLAN_LINES,
  angleAsk,
  buildAnglesPrompt,
  cutWords,
  keepAngles,
  parseAnglesRequest,
  parsePlanContext,
  validateAngles,
} from "./logic.ts";

const PLAN_CONTEXT = {
  positioning: { oneLiner: "I help young families in Singapore plan for the big costs.", audienceDetail: "Parents in their 30s", topics: ["Hospital cover", "CPF"], edge: "Ex-engineer" },
  goal: "Get more enquiries from parents",
  platforms: ["instagram", "tiktok", "myspace"],
  voice: "Short sentences. I say what I think.",
  memory: "What the AI may say and has learned:\nFacts: Ten years in practice\nKeep: Never use emoji",
  speaker: "person",
  product: "Write a post about what I offer: a family protection review.\nWhat it is: a one-hour review of a family's cover.",
  rules: "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): Use no hashtags.",
  questions: ["How much hospital cover does a baby need?"],
  examples: ["Nobody tells new parents this about hospital bills."],
};
const BUSINESS_CONTEXT = {
  positioning: { oneLiner: "ActivityTracker keeps sales reps' clients, chats and targets in one app.", audienceDetail: "Sales reps and coaches", topics: ["Follow-ups"], edge: "" },
  goal: "Get more sign-ups and enquiries",
  platforms: ["instagram"],
  speaker: "business",
};
const ANGLES_ASK = { mode: "angles", audience: "Parents in their 30s with a first child", avoid: ["Hospital bills shock"], context: PLAN_CONTEXT };
const anglesRequest = (body: unknown = ANGLES_ASK) => {
  const r = parseAnglesRequest(body);
  if (!r.ok) throw new Error(r.error);
  return r.request;
};
const fullPrompt = (p: { system: string; user: string }) => `${p.system}\n${p.user}`;

describe("parsePlanContext", () => {
  it("reads every field, clipped, with known platforms only and person by default", () => {
    const c = parsePlanContext({ ...PLAN_CONTEXT, speaker: "robot", goal: "g".repeat(200), questions: Array(9).fill("Why?"), examples: ["x".repeat(400)] });
    expect(c.speaker).toBe("person");
    expect(c.platforms).toEqual(["instagram", "tiktok"]);
    expect(c.goal).toHaveLength(120);
    expect(c.questions).toHaveLength(5);
    expect(c.examples[0]).toHaveLength(300);
    expect(c.memory).toBe(PLAN_CONTEXT.memory);
    expect(parsePlanContext(BUSINESS_CONTEXT).speaker).toBe("business");
    expect(parsePlanContext(undefined)).toMatchObject({ positioning: null, goal: "", platforms: [], speaker: "person", questions: [] });
  });
});

describe("cutWords", () => {
  it("keeps short text, and cuts long text at a sentence end when that keeps over half, else at a word", () => {
    expect(cutWords("One two three.", 5)).toBe("One two three.");
    expect(cutWords("One two three four. Five six seven eight.", 6)).toBe("One two three four.");
    expect(cutWords("One. Two three four five six seven, eight", 6)).toBe("One. Two three four five six");
    expect(cutWords("Line one here.\n\nLine two is longer than that", 6)).toBe("Line one here.\n\nLine two is");
  });
});

describe("mode angles", () => {
  it("needs an audience and clamps what it is sent", () => {
    expect(parseAnglesRequest({ mode: "angles", context: PLAN_CONTEXT })).toMatchObject({ ok: false });
    const r = anglesRequest({ ...ANGLES_ASK, avoid: Array.from({ length: 40 }, (_, i) => `Saved angle ${i}`) });
    expect(r.avoid).toHaveLength(30);
    expect(r.context.goal).toBe("Get more enquiries from parents");
  });

  it("asks for 8 candidates under COMPLIANCE_LINES and PLAN_LINES, with the context and the saved titles", () => {
    const { system, user } = buildAnglesPrompt(anglesRequest());
    expect(system).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
    expect(system).toContain(`exactly ${ANGLE_CANDIDATES} candidates`);
    expect(system).toContain("licensed financial adviser in Singapore");
    expect(user).toContain("Angles already saved (suggest different ones):\n- Hospital bills shock");
    expect(user).toContain("The audience: Parents in their 30s with a first child");
    expect(user).toContain("The goal of these posts: Get more enquiries from parents");
    expect(user).toContain("Questions this audience asks:\n- How much hospital cover does a baby need?");
    expect(user).toContain("structure only: never copy their words");
    // brand rules first, then learnings and facts, then the voice
    const at = (s: string) => user.indexOf(s);
    expect(at("MY BRAND RULES")).toBe(0);
    expect(at("MY BRAND RULES")).toBeLessThan(at("What the AI may say"));
    expect(at("What the AI may say")).toBeLessThan(at("What the adviser sells"));
    expect(at("What the adviser sells")).toBeLessThan(at("Voice summary"));
  });

  it("writes for a business as the business, and never says adviser", () => {
    const p = fullPrompt(buildAnglesPrompt(anglesRequest({ ...ANGLES_ASK, context: BUSINESS_CONTEXT })));
    expect(p).toContain(BUSINESS_VOICE);
    expect(p).toContain("a business in Singapore");
    expect(p).not.toMatch(/adviser/i);
    expect(fullPrompt(buildAnglesPrompt(anglesRequest()))).not.toContain(BUSINESS_VOICE);
  });

  it("validateAngles drops empty, over-length, one-word, repeated and already saved titles", () => {
    const got = validateAngles(
      JSON.stringify({
        angles: [
          { title: "Follow-ups that stick", line: "Most deals die in the follow-up, not the pitch." },
          { title: "", line: "No title." },
          { title: "Follow ups that STICK", line: "The same title again." },
          { title: "Six words is one too many", line: "Too long." },
          { title: "A title far longer than forty characters", line: "Too long." },
          { title: "Pipeline", line: "One word." },
          { title: "hospital bills SHOCK", line: "Saved already." },
          { title: "No line here", line: "" },
          { title: "Clients first — always", line: "An em dash goes, and a long line is cut: " + "word ".repeat(30) },
        ],
      }),
      ["Hospital bills shock"],
    );
    expect(got?.map((a) => a.title)).toEqual(["Follow-ups that stick", "Clients first, always"]);
    expect(got?.[1].line.split(" ").length).toBeLessThanOrEqual(19);
    expect(validateAngles("not json")).toBeNull();
    const many = { angles: Array.from({ length: 12 }, (_, i) => ({ title: `Angle number ${i}`, line: "A line." })) };
    expect(validateAngles(many)).toHaveLength(ANGLE_CANDIDATES);
  });

  it("puts Title Case titles in sentence case, keeping acronyms and names (wave 1 live check, calls/010)", () => {
    // calls/010's five kept titles and lines, as they came back
    const live = [
      ["Shared Chat Visibility", "We bring team WhatsApp conversations into one shared inbox, so you can see where client chats stand."],
      ["Clear Follow-Up Ownership", "See who owns each next step, so client follow-ups are easier to coordinate across your team."],
      ["Target Progress View", "Track team goals alongside activity, so you can review progress and discuss what needs attention."],
      ["Coaching From Activity", "Use recorded follow-ups and tasks as talking points for practical team coaching."],
      ["Fewer App Switches", "We bring CRM, chats, tasks and goals into one phone app, reducing the need to jump between tools."],
    ];
    const more = [
      ["One CRM For Teams", "Keep clients and chats in one place."],
      ["Shared WhatsApp Inbox", "See every chat."],
      ["Why Fastlane Works", "Teams switch to Fastlane for one inbox."],
      ["Grow With Northstar Today", "One app for the team."],
      ["Follow-ups that stick", "Already in sentence case."],
      ["Shared Inbox", "Two words too, since wave 2."],
    ];
    const got = validateAngles({ angles: [...live, ...more].map(([title, line]) => ({ title, line })) }, [], "Sales teams pick Northstar for its inbox.");
    expect(got?.map((a) => a.title)).toEqual([
      "Shared chat visibility",
      "Clear follow-up ownership",
      "Target progress view",
      "Coaching from activity",
      "Fewer app switches",
      "One CRM for teams",
      "Shared WhatsApp inbox",
      "Why Fastlane works",
    ]);
    expect(validateAngles({ angles: more.slice(2).map(([title, line]) => ({ title, line })) }, [], "Sales teams pick Northstar for its inbox.")?.map((a) => a.title)).toEqual([
      "Why Fastlane works",
      "Grow with Northstar today",
      "Follow-ups that stick",
      "Shared inbox",
    ]);
    expect(validateAngles({ angles: [{ title: "Grow With Northstar Today", line: "One app." }] })?.[0].title).toBe("Grow with northstar today");
  });

  it("puts two-word Title Case titles in sentence case too (wave 2 live check, calls/004 and calls/008)", () => {
    // live-p5w2 calls/008's five titles and lines, and calls/004's "Smoother Handoffs", as they came back
    const live = [
      ["Follow-up Tasks", "Keep follow-ups beside your client chats, instead of relying on memory."],
      ["One-Tap Activity", "Log a call or client update in one tap while the details are fresh."],
      ["Deal Pipeline", "Track where each deal stands so you can review your next steps."],
      ["Call Visibility", "See which calls need logging and keep your daily activity in one place."],
      ["Daily Priorities", "Bring calls, tasks and client follow-ups together to plan your day."],
      ["Smoother Handoffs", "Keep client conversation context accessible when work moves between team members."],
      ["Shared WhatsApp view", "See how a shared inbox can help your team coordinate client chats in one place."],
    ];
    const names = "ActivityTracker: CRM, a shared WhatsApp inbox, tasks and goals in one phone app. SGD 34 a person a month.";
    expect(validateAngles({ angles: live.map(([title, line]) => ({ title, line })) }, [], names)?.map((a) => a.title)).toEqual([
      "Follow-up tasks",
      "One-tap activity",
      "Deal pipeline",
      "Call visibility",
      "Daily priorities",
      "Smoother handoffs",
      "Shared WhatsApp view",
    ]);
    // acronyms and brand names keep their capitals, in two words as in more
    const two = [["CRM Basics", "Start here."], ["WhatsApp Inbox", "One place."], ["Meet ActivityTracker", "One app."], ["Coca-Cola Deals", "Teams at Coca-Cola use it."]];
    expect(validateAngles({ angles: two.map(([title, line]) => ({ title, line })) })?.map((a) => a.title)).toEqual(["CRM basics", "WhatsApp inbox", "Meet ActivityTracker", "Coca-Cola deals"]);
  });

  it("leaves remix's callers as they were: two words unchanged, a hyphenated first word kept", () => {
    expect(sentenceCase("Save More", "")).toBe("Save More");
    expect(sentenceCase("One-Tap Activity Logs", "")).toBe("One-Tap activity logs");
    expect(sentenceCase("Save More", "", { short: true })).toBe("Save more");
    expect(sentenceCase("One-Tap Activity Logs", "", { short: true })).toBe("One-tap activity logs");
  });

  it("asks Jev whether the audience would stop and whether it is unsafe, from the adviser or the business", () => {
    const a = { title: "Follow-ups that stick", line: "Most deals die in the follow-up." };
    const person = angleAsk(anglesRequest(), a);
    expect(person.state).toEqual({ audience: "Parents in their 30s with a first child", adviser: PLAN_CONTEXT.positioning.oneLiner, goal: PLAN_CONTEXT.goal, country: "Singapore", angle: "Follow-ups that stick: Most deals die in the follow-up." });
    expect(Object.keys(person.questions)).toEqual(["fits", "unsafe"]);
    expect(person.questions.fits.instructions).toContain("from `adviser`");
    const business = angleAsk(anglesRequest({ ...ANGLES_ASK, context: BUSINESS_CONTEXT }), a);
    expect(business.state.business).toBe(BUSINESS_CONTEXT.positioning.oneLiner);
    expect(JSON.stringify(business)).not.toMatch(/adviser/i);
  });

  const cands = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Angle ${i} here`, line: `Line ${i}.` }));
  const ans = (fits: number | null, unsafe: number | null = 0.1) => ({ fits: { type: "noul" as const, noul: fits ?? undefined }, unsafe: { type: "noul" as const, noul: unsafe ?? undefined } });

  it("keepAngles keeps at fits 0.5, drops at 0.49 and at unsafe 0.5, top 5 by fit", () => {
    const r = keepAngles(cands(8), [ans(0.5), ans(0.49), ans(0.9, 0.5), ans(0.7), ans(0.8), ans(0.6), ans(0.95), ans(0.55)]);
    expect(r.scored).toBe(true);
    expect(r.angles.map((a) => a.fit)).toEqual([0.95, 0.8, 0.7, 0.6, 0.55]);
    expect(keepAngles(cands(2), [ans(0.5), ans(0.49)]).angles.map((a) => a.title)).toEqual(["Angle 0 here"]);
  });

  it("keepAngles falls back to the first 5 pattern-clean candidates, unscored, when Jev gives nothing", () => {
    const list = cands(8);
    list[1] = { title: "Guaranteed returns here", line: "Risk-free growth." };
    const r = keepAngles(list, Array(8).fill(null));
    expect(r.scored).toBe(false);
    expect(r.angles.map((a) => a.title)).toEqual(["Angle 0 here", "Angle 2 here", "Angle 3 here", "Angle 4 here", "Angle 5 here"]);
    expect(r.angles.every((a) => a.fit === null)).toBe(true);
    // fits answered but unsafe left out: the patterns decide
    expect(keepAngles(list.slice(0, 2), [ans(0.9, null), ans(0.9, null)]).angles.map((a) => a.title)).toEqual(["Angle 0 here"]);
  });
});

// ---- Plan modes (phase 5): campaign --------------------------------------------

import {
  AI_VIDEO_WORDS,
  CAMPAIGN_SCHEMA,
  MAX_CAMPAIGN_POSTS,
  buildCampaignPrompt,
  campaignCap,
  parseCampaignRequest,
  validateCampaign,
  type CampaignFormat,
} from "./logic.ts";

const postAskOf = (n: number, format: CampaignFormat, extra: Record<string, unknown> = {}) => ({
  n,
  angle: { title: "Follow-ups that stick", line: "Most deals die in the follow-up, not the pitch." },
  format,
  stage: "trust",
  ctaType: "save-share",
  platforms: ["instagram"],
  ...extra,
});
const CAMPAIGN_ASK = {
  mode: "campaign",
  posts: [
    postAskOf(1, "text-post", { formula: { name: "Contrarian take", template: "Most people say {x}. I disagree." } }),
    postAskOf(2, "carousel"),
    postAskOf(3, "short-video"),
    postAskOf(4, "ai-video", { stage: "conversion", ctaType: "dm-keyword" }),
    postAskOf(5, "slideshow"),
    postAskOf(6, "wall"),
  ],
  context: { ...PLAN_CONTEXT, audience: "Parents in their 30s with a first child" },
  avoid: ["Your follow-up is the real pitch"],
};
const campaignRequest = (body: unknown = CAMPAIGN_ASK) => {
  const r = parseCampaignRequest(body);
  if (!r.ok) throw new Error(r.error);
  return r.request;
};
/** n words, the last one closing the only sentence. */
const words = (n: number, w = "word") => Array.from({ length: n }, (_, i) => (i === n - 1 ? `${w}.` : w)).join(" ");
const tenWords = (k: number) => `Sentence ${k} has exactly ten words in it right here.`;
const countWords = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
const written = (over: Record<number, Record<string, string>> = {}) => ({
  posts: [
    { n: 1, hook: "Most reps lose the deal after the first call", body: words(100), script: "", brief: "", cta: "Save this for your next follow-up." },
    { n: 2, hook: "Five follow-up habits", body: [1, 2, 3, 4, 5].map((i) => `Point ${i}: ${words(10)}`).join("\n\n"), script: "", brief: "", cta: "Save this." },
    { n: 3, hook: "", body: "", script: `HOOK: Nobody remembers your first call.\nBODY: ${words(60)}\nCTA: Save this for later.`, brief: "", cta: "" },
    { n: 4, hook: "", body: "", script: [1, 2, 3, 4].map(tenWords).join(" "), brief: "", cta: "" },
    { n: 5, hook: "Three messages that bring a lead back", body: "", script: "", brief: "The check-in\nThe useful link\nThe honest close", cta: "Follow for more." },
    { n: 6, hook: "Stop sending just checking in", body: "", script: "", brief: "One bold line on why checking in fails.", cta: "Comment FOLLOW." },
  ].map((p) => ({ ...p, ...over[p.n] })),
});

describe("mode campaign", () => {
  it("refuses 0 or 8 posts, unknown formats or stages, bad or repeated numbers, and a swap of more than one post", () => {
    const bad = (body: Record<string, unknown>) => expect(parseCampaignRequest({ ...CAMPAIGN_ASK, ...body })).toMatchObject({ ok: false });
    bad({ posts: [] });
    bad({ posts: Array.from({ length: MAX_CAMPAIGN_POSTS + 1 }, (_, i) => postAskOf(i + 1, "text-post")) });
    bad({ posts: [postAskOf(1, "story" as CampaignFormat)] });
    bad({ posts: [postAskOf(1, "text-post", { stage: "awareness" })] });
    bad({ posts: [postAskOf(0, "text-post")] });
    bad({ posts: [postAskOf(57, "text-post")] });
    bad({ posts: [postAskOf(1, "text-post"), postAskOf(1, "carousel")] });
    bad({ posts: [postAskOf(1, "text-post", { angle: { title: "", line: "x" } })] });
    bad({ swap: true, posts: [postAskOf(1, "text-post"), postAskOf(2, "carousel")] });
    expect(parseCampaignRequest({ ...CAMPAIGN_ASK, swap: true, posts: [postAskOf(4, "carousel")] })).toMatchObject({ ok: true, request: { swap: true } });
    expect(campaignRequest({ ...CAMPAIGN_ASK, posts: Array.from({ length: 7 }, (_, i) => postAskOf(i + 50, "wall")) }).posts).toHaveLength(7);
  });

  it("reads the audience, clamps avoid to 20 hooks, and fills a bad call to action or formula safely", () => {
    const r = campaignRequest({
      ...CAMPAIGN_ASK,
      avoid: Array.from({ length: 30 }, (_, i) => `Hook ${i}`),
      posts: [postAskOf(1, "text-post", { ctaType: "buy-now", stage: "conversion", formula: { name: "Only a name" }, platforms: ["instagram", "myspace"] })],
    });
    expect(r.audience).toBe("Parents in their 30s with a first child");
    expect(r.avoid).toHaveLength(20);
    expect(r.posts[0]).toMatchObject({ ctaType: "dm-keyword", formula: null, platforms: ["instagram"] });
    expect(r.swap).toBe(false);
  });

  it("spends campaign-swap for a swap and campaign-draft otherwise", () => {
    expect(campaignCap({ swap: true })).toBe("campaign-swap");
    expect(campaignCap({ swap: false })).toBe("campaign-draft");
    expect(campaignCap(campaignRequest())).toBe("campaign-draft");
  });

  it("asks under COMPLIANCE_LINES and PLAN_LINES with the goal, the brand rules, each angle, the formula and the hooks to avoid", () => {
    const { system, user } = buildCampaignPrompt(campaignRequest());
    expect(system).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
    expect(system).toContain(`${AI_VIDEO_WORDS.low} to ${AI_VIDEO_WORDS.high} words`);
    expect(AI_VIDEO_WORDS).toEqual({ low: 36, high: 48 });
    expect(system).toContain("Write in the first person, as the adviser");
    expect(user).toContain("The goal of these posts: Get more enquiries from parents");
    expect(user).toContain(PLAN_CONTEXT.rules);
    expect(user).toContain("The audience: Parents in their 30s with a first child");
    expect(user).toContain("Hooks already used (open differently):\n- Your follow-up is the real pitch");
    expect(user).toContain("Post 1: text-post, trust stage, call to action save-share, for instagram\nAngle: Follow-ups that stick: Most deals die in the follow-up, not the pitch.\nHook formula: Contrarian take: Most people say {x}. I disagree.");
    expect(user).toContain("Post 4: ai-video, conversion stage, call to action dm-keyword");
    expect(user).not.toContain("again: the same angle");
    expect(buildCampaignPrompt(campaignRequest({ ...CAMPAIGN_ASK, swap: true, posts: [postAskOf(4, "carousel")] })).user).toContain("Write post 4 again: the same angle, format and stage");
  });

  it("writes for a business as the business, and never says adviser", () => {
    const p = fullPrompt(buildCampaignPrompt(campaignRequest({ ...CAMPAIGN_ASK, context: { ...BUSINESS_CONTEXT, audience: "Sales reps" } })));
    expect(p).toContain(BUSINESS_VOICE);
    expect(p).toContain("a business in Singapore");
    expect(p).not.toMatch(/adviser/i);
  });

  it("asks a person's campaign and swap exactly as pinned (never update these with vitest -u)", async () => {
    await expect(promptText(buildCampaignPrompt(campaignRequest()))).toMatchFileSnapshot("./fixtures/campaign-prompt-person.txt");
    const list = { name: "The list", template: "{N} things I wish I knew before {milestone}." };
    const swap = campaignRequest({ ...CAMPAIGN_ASK, swap: true, posts: [postAskOf(5, "text-post", { formula: list })] });
    await expect(promptText(buildCampaignPrompt(swap))).toMatchFileSnapshot("./fixtures/campaign-swap-prompt-person.txt");
  });

  it("has a strict schema", () => {
    const item = CAMPAIGN_SCHEMA.properties.posts.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });

  it("keeps each format's words in its own fields, in the order asked", () => {
    const got = validateCampaign(JSON.stringify(written()), campaignRequest())!;
    expect(got.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(got[0]).toEqual({ n: 1, hook: "Most reps lose the deal after the first call", body: words(100), cta: "Save this for your next follow-up.", ctaType: "save-share", mas: null });
    expect(got[1].body!.split("\n\n")).toHaveLength(5);
    expect(got[2]).toMatchObject({ hook: "Nobody remembers your first call.", cta: "Save this for later." });
    expect(got[2].script!.split("\n")[0]).toBe("HOOK: Nobody remembers your first call.");
    expect(got[3]).toMatchObject({ hook: tenWords(1), cta: tenWords(4), ctaType: "dm-keyword" });
    expect(got[3].script!.split("\n")).toEqual([1, 2, 3, 4].map(tenWords));
    expect(got[4]).toEqual({ n: 5, hook: "Three messages that bring a lead back", brief: "The check-in\nThe useful link\nThe honest close", cta: "Follow for more.", ctaType: "save-share", mas: null });
    expect(got[5].brief).toBe("One bold line on why checking in fails.");
  });

  it("cuts over-length bodies and briefs at a word, keeps a hook's whole sentences (live-p5dog D5), and removes em dashes", () => {
    const got = validateCampaign(
      written({
        1: { hook: `Follow-ups \u2014 the part nobody plans for. ${words(10, "nobody")}`, body: words(240) },
        2: { hook: "Seven words. Is too long for a cover", body: Array.from({ length: 9 }, (_, i) => `Point ${i} ${words(50)}`).join("\n\n") },
        5: { hook: `Short cover here. ${words(14, "slide")}`, brief: words(50, "point") },
      }),
      campaignRequest(),
    )!;
    const [text, carousel] = got;
    expect(text.hook).toBe("Follow-ups, the part nobody plans for.");
    expect(countWords(text.body!)).toBe(220);
    // its whole first sentence, its count then set to the 8 points kept (live-p5dog day 2 N6)
    expect(carousel.hook).toBe("Eight words.");
    expect(carousel.body!.split("\n\n")).toHaveLength(8);
    expect(carousel.body!.split("\n\n").every((p) => countWords(p) <= 40)).toBe(true);
    expect(got.find((p) => p.n === 5)!.hook).toBe("Short cover here.");
    expect(countWords(got.find((p) => p.n === 5)!.brief!)).toBe(40);
    expect(JSON.stringify(got)).not.toMatch(/[\u2013\u2014]/);
  });

  it("drops a post that can't meet its format: short bodies, too few points, scripts outside their length", () => {
    const keptOf = (over: Record<number, Record<string, string>>) => validateCampaign(written(over), campaignRequest())!.map((p) => p.n);
    expect(keptOf({ 1: { body: words(79) } })).not.toContain(1);
    expect(keptOf({ 1: { cta: "" } })).not.toContain(1);
    expect(keptOf({ 2: { body: "One.\n\nTwo.\n\nThree." } })).not.toContain(2);
    expect(keptOf({ 3: { script: `HOOK: Short.\nBODY: ${words(40)}\nCTA: Save it.` } })).not.toContain(3);
    expect(keptOf({ 3: { script: `HOOK: Long.\nBODY: ${words(95)}\nCTA: Save it.` } })).not.toContain(3);
    expect(keptOf({ 5: { hook: "" } })).not.toContain(5);
  });

  it("holds an AI video script to 36 to 48 spoken words, labels and all", () => {
    const ai = (script: string) => validateCampaign(written({ 4: { script } }), campaignRequest())!.find((p) => p.n === 4);
    expect(ai([1, 2, 3].map(tenWords).join(" ") + " Five more words right here.")).toBeUndefined(); // 35 words
    expect(countWords(ai([1, 2, 3].map(tenWords).join(" ") + " Six more words right here now.")!.script!)).toBe(36);
    expect(countWords(ai([1, 2, 3, 4].map(tenWords).join(" ") + " Eight more words fit in this one too.")!.script!)).toBe(48);
    // 49 words: the last sentence before the call to action goes (wave 1 live check fix), 39 words
    expect(ai([1, 2, 3, 4].map(tenWords).join(" ") + " Nine more words do not fit in this one.")!.script!.split("\n")).toEqual([...[1, 2, 3].map(tenWords), "Nine more words do not fit in this one."]);
    // 56 words, past the old 15% band: cut too (wave 2 live check), 46 words
    expect(ai([1, 2, 3, 4, 5].map(tenWords).join(" ") + " Six more words do not fit.")!.script!.split("\n")).toEqual([...[1, 2, 3, 4].map(tenWords), "Six more words do not fit."]);
    const labelled = ai(`HOOK: ${tenWords(1)}\n${tenWords(2)} ${tenWords(3)}\nCTA: ${tenWords(4)}`)!;
    expect(labelled.script).toBe([1, 2, 3, 4].map(tenWords).join("\n"));
    expect(labelled.cta).toBe(tenWords(4));
  });

  it("drops posts not asked for, a later post that opens like an earlier one, and a hook it was told to avoid", () => {
    const reply = written({ 5: { hook: "Most reps lose sleep over follow-ups" }, 6: { hook: "your FOLLOW-UP is the real pitch" } });
    reply.posts.push({ n: 9, hook: "Not asked for", body: words(100), script: "", brief: "", cta: "Save this." });
    expect(validateCampaign(reply, campaignRequest())!.map((p) => p.n)).toEqual([1, 2, 3, 4]);
    expect(validateCampaign("not json", campaignRequest())).toBeNull();
    expect(validateCampaign({ posts: [] }, campaignRequest())).toEqual([]);
  });
});

// ---- Wave 1 live check (22 Oct): calls/014 asked 4 posts and got 2 back, both scripts missing ----------------

import { SHORT_VIDEO_WORDS } from "./logic.ts";

// calls/014, the person draft: the asks and context as sent, posts 1 and 2 as they came back
const LIVE_014 = {
  mode: "campaign",
  posts: [
    { n: 1, angle: { title: "Money sitting idle", line: "Cash left in the bank feels safe but quietly loses ground to rising costs." }, format: "text-post", stage: "attraction", formula: null, ctaType: "open-question", platforms: ["linkedin"] },
    { n: 2, angle: { title: "Jargon-free plans", line: "A one-page plan beats a 40-page report you never read again." }, format: "carousel", stage: "trust", formula: null, ctaType: "save-share", platforms: ["instagram"] },
    { n: 3, angle: { title: "No time to invest", line: "Busy fathers can set up a plan once and review it quarterly instead of daily." }, format: "short-video", stage: "trust", formula: null, ctaType: "comment-keyword", platforms: ["instagram"] },
    { n: 4, angle: { title: "Five-year commitment fears", line: "Worried about locking money away for years? Start with what you need to stay liquid." }, format: "ai-video", stage: "conversion", formula: null, ctaType: "book-call", platforms: ["instagram"] },
  ],
  context: {
    positioning: {
      oneLiner: "I help busy working fathers achieve financial freedom and peace of mind through my F.A.T. Method",
      audienceDetail: "Auditor / Accountant, aged 30-48, Middle to upper-middle income",
      topics: ["Not taking action", "Letting money sit in bank", "Afraid of >5yr commitment", "Lack of time to invest", "Too much information and jargon"],
      edge: "Quarterly one-page plan with decision log, proactive check-ins after major life events",
    },
    goal: "Get 3 new client meetings a month",
    platforms: ["linkedin", "instagram"],
    speaker: "person",
    audience: "Working fathers in audit and accounting: Auditors and accountants aged 30 to 48, with middle to upper-middle incomes, balancing work and family while seeking financial freedom and peace of mind.",
  },
};
const LIVE_014_POSTS = [
  {
    n: 1,
    hook: "Cash can feel safe while costs keep moving.",
    body: "I understand why a busy father might leave money in the bank. It is familiar, accessible and easy to track between work deadlines and family routines.\n\nBut when everyday costs rise, the amount your cash can buy may change over time. That does not mean you should rush to invest it. It means it can help to be clear about what the money is for, when you may need it and how much you want readily available.\n\nI find that separating short-term needs from longer-term goals is a useful place to start. It turns \u201cI\u2019ll deal with this later\u201d into a question you can actually work through, without making a decision on the spot.",
    script: "",
    brief: "",
    cta: "How do you decide what to keep accessible and what to plan for long term?",
  },
  {
    n: 2,
    hook: "A plan you can actually use",
    body: "I start with the priorities that matter to you, not a stack of jargon.\n\nI put the key decisions and next steps on one page, so you can revisit them without digging through a lengthy report.\n\nI note why each decision was made. That gives you context when work or family circumstances change.\n\nI keep short-term cash needs distinct from longer-term goals. Each has a different job in the plan.\n\nI review the plan quarterly with you, and check in after major life events. A plan should stay relevant as life changes.",
    script: "",
    brief: "",
    cta: "Save this for your next money review, or share it with a working parent who prefers plain English.",
  },
];
// the scripts never reached the record (it holds the reply after validation), so these stand in at the lengths that drop
const SHORT_50 = "HOOK: No time to invest? You are not alone.\nBODY: You do not need to watch the markets every day. Set up a plan once, then review it every quarter. That keeps it simple, and it leaves room for family time.\nCTA: Comment PLAN and I will share how a quarterly review works.";
const AI_51 = "Worried about locking money away for five years? That worry makes sense when you have a family to provide for. Start by working out how much you need to keep within reach. Then we can look at longer-term goals separately. Book a short call and we can map it out together.";

describe("campaign scripts (wave 1 live check: 3 of 4 scripts asked for came back missing)", () => {
  const live = campaignRequest(LIVE_014);
  const reply = (scripts: Record<number, string>) => ({ posts: [...LIVE_014_POSTS, ...[3, 4].map((n) => ({ n, hook: "", body: "", script: scripts[n] ?? "", brief: "", cta: "" }))] });

  it("states each post's word range on the post itself", () => {
    const { system, user } = buildCampaignPrompt(live);
    expect(system).toContain("- Count the words: a post outside the word range on its Words line cannot be used, and a hook ends on a whole sentence inside its limit.");
    expect(user).toContain("Post 1: text-post, attraction stage, call to action open-question, for linkedin\nAngle: Money sitting idle: Cash left in the bank feels safe but quietly loses ground to rising costs.\nWords: hook at most 15 words; body 80 to 220 words");
    expect(user).toContain("Angle: Jargon-free plans: A one-page plan beats a 40-page report you never read again.\nWords: cover at most 6 words; 4 to 8 points of at most 40 words each");
    expect(user).toContain("instead of daily.\nWords: script about 75 spoken words in all (60 to 90) across its HOOK, BODY and CTA lines, the labels not counted");
    expect(user).toContain("Start with what you need to stay liquid.\nWords: script about 42 spoken words in all (36 to 48), counted across every line");
    expect(SHORT_VIDEO_WORDS).toEqual({ low: 60, high: 90 });
  });

  it("cuts a 51-word AI video script at a sentence end inside 36 to 48, keeping its hook and call to action", () => {
    const dropped: [number, string][] = [];
    const got = validateCampaign(reply({ 3: SHORT_50, 4: AI_51 }), live, dropped)!;
    expect(countWords(AI_51)).toBe(51);
    expect(got.map((p) => p.n)).toEqual([1, 2, 4]);
    const ai = got[2];
    expect(ai.script!.split("\n")).toEqual([
      "Worried about locking money away for five years?",
      "That worry makes sense when you have a family to provide for.",
      "Start by working out how much you need to keep within reach.",
      "Book a short call and we can map it out together.",
    ]);
    expect(countWords(ai.script!)).toBe(43);
    expect(ai).toMatchObject({ hook: "Worried about locking money away for five years?", cta: "Book a short call and we can map it out together." });
    // a short script is never padded: it is dropped, and the log gets its number and the rule, never its words
    expect(dropped).toEqual([[3, "script 50 words, needs 60 to 90"]]);
  });

  it("cuts a script well past its top too (wave 2 live check), and a short video's body sentences, never its HOOK or CTA line", () => {
    const body = (k: number) => Array.from({ length: k }, (_, i) => tenWords(i + 1)).join(" ");
    const short = (k: number) => `HOOK: Busy fathers can still invest well.\nBODY: ${body(k)}\nCTA: Comment PLAN below.`; // 6 + 10k + 3 words
    const dropped: [number, string][] = [];
    const got = validateCampaign(reply({ 3: short(9), 4: `${AI_51} Nothing gets decided on the spot.` }), live, dropped)!;
    expect(got.find((p) => p.n === 3)!.script).toBe(`HOOK: Busy fathers can still invest well.\nBODY: ${body(8)}\nCTA: Comment PLAN below.`); // 99 words to 89
    // 57 words: the last line is now the call to action, so "Book a short call..." is the body sentence that goes
    expect(got.find((p) => p.n === 4)!.script!.split("\n")).toEqual([
      "Worried about locking money away for five years?",
      "That worry makes sense when you have a family to provide for.",
      "Start by working out how much you need to keep within reach.",
      "Then we can look at longer-term goals separately.",
      "Nothing gets decided on the spot.",
    ]);
    expect(dropped).toEqual([]);
    expect(validateCampaign(reply({ 3: short(10) }), live)!.find((p) => p.n === 3)!.script).toBe(`HOOK: Busy fathers can still invest well.\nBODY: ${body(8)}\nCTA: Comment PLAN below.`); // 109 to 89
  });

  it("names the rule each dropped post broke, for every format", () => {
    const dropped: [number, string][] = [];
    validateCampaign(
      written({ 1: { body: words(79) }, 2: { body: "One.\n\nTwo.\n\nThree." }, 3: { script: `HOOK: Short.\nBODY: ${words(40)}\nCTA: Save it.` }, 4: { script: "One line only" }, 5: { hook: "" }, 6: { cta: "" } }),
      campaignRequest(),
      dropped,
    );
    expect(dropped).toEqual([[1, "body 79 words, needs 80 to 220"], [2, "3 points, needs 4 to 8"], [3, "script 43 words, needs 60 to 90"], [4, "one line"], [5, "no hook"], [6, "no cta"]]);
    const missing: [number, string][] = [];
    const reply2 = written({ 5: { hook: "Most reps lose sleep over follow-ups" }, 6: { hook: "your FOLLOW-UP is the real pitch" } });
    reply2.posts.splice(1, 1);
    validateCampaign(reply2, campaignRequest(), missing);
    expect(missing).toEqual([[2, "not written"], [5, "opens like an earlier post"], [6, "repeats a hook to avoid"]]);
  });
});

// calls/011, the business draft: posts 1 and 5 as asked and as they came back (the body ending on the cta)
const LIVE_011_CONTEXT = {
  positioning: {
    oneLiner: "We help sales reps manage clients, chats, follow-ups and targets in one app so they can keep their work moving.",
    audienceDetail: "Sales-oriented self-employed professionals and coaches",
    topics: ["Sales follow-ups", "WhatsApp workflows", "Client management", "Activity tracking", "Sales goals"],
    edge: "It brings CRM, a shared WhatsApp inbox, tasks and goals together in one phone app, with activity logged in one tap.",
  },
  goal: "Get more sales team managers to book a demo",
  platforms: ["linkedin", "instagram"],
  speaker: "business",
  product: "ActivityTracker: CRM, a shared WhatsApp inbox, tasks and goals in one phone app. SGD 34 a person a month.",
  audience: "Sales team managers: People coordinating a sales team who want a shared WhatsApp inbox, team activity records and a view of progress toward targets.",
};
const LIVE_011_ASK_1 = {
  n: 1,
  angle: { title: "Shared Chat Visibility", line: "We bring team WhatsApp conversations into one shared inbox, so you can see where client chats stand." },
  format: "text-post",
  stage: "attraction",
  formula: { name: "Contrarian", template: "Most [audience] think [belief]. Here is why that is wrong." },
  ctaType: "open-question",
  platforms: ["linkedin"],
};
const LIVE_011_ASK_5 = { n: 5, angle: { title: "Coaching From Activity", line: "Use recorded follow-ups and tasks as talking points for practical team coaching." }, format: "text-post", stage: "trust", formula: null, ctaType: "dm-keyword", platforms: ["linkedin"] };
const LIVE_011_POST_1 = {
  n: 1,
  hook: "Most sales managers think visibility means reading every chat. Here is why that is wrong.",
  body: "Visibility is not the same as watching every message come in. When conversations are spread across individual phones, managers can end up asking for updates just to understand what is happening. That takes time, and it can leave the team repeating information or missing who is handling the next step.\n\nA clearer view starts with knowing where a client conversation stands and who is following up. It does not mean monitoring every word or taking over the relationship. It means making it easier for the team to coordinate and for managers to spot where support may be useful.\n\nWhat helps you keep track of client chats without hovering over your team?",
  script: "",
  brief: "",
  cta: "What helps you keep track of client chats without hovering over your team?",
};
const LIVE_011_POST_5 = {
  n: 5,
  hook: "Useful coaching can start with the next step.",
  body: "A coaching conversation does not have to begin with a target that feels far away. Recorded follow-ups and tasks can help managers talk through the work in front of the team.\n\nStart by looking at what was agreed with a client. Is the next action clear? Does it have an owner and a due date? If a task is still open, ask what is getting in the way before deciding what support could help.\n\nThis keeps the conversation practical and focused on the workflow, rather than relying on memory or assumptions. It also gives the team a chance to clarify priorities and handovers.\n\nGood activity records are not a score by themselves. They are useful prompts for a thoughtful check-in.\n\nDM COACH if you would like to discuss ways to structure team coaching around follow-ups.",
  script: "",
  brief: "",
  cta: "DM COACH if you would like to discuss ways to structure team coaching around follow-ups.",
};

describe("campaign call to action (wave 1 live check: calls/011 posts 1 and 5 ended the body with the cta)", () => {
  const live = campaignRequest({ mode: "campaign", posts: [LIVE_011_ASK_1, LIVE_011_ASK_5], context: LIVE_011_CONTEXT });

  it("removes a last body line that repeats the cta and keeps the rest of the body as written", () => {
    const [p1, p5] = validateCampaign({ posts: [LIVE_011_POST_1, LIVE_011_POST_5] }, live)!;
    expect(p1.body).toBe(LIVE_011_POST_1.body.slice(0, LIVE_011_POST_1.body.lastIndexOf("\n\n")));
    expect(p1.cta).toBe(LIVE_011_POST_1.cta);
    expect(p5.body).toBe(LIVE_011_POST_5.body.slice(0, LIVE_011_POST_5.body.lastIndexOf("\n\n")));
    expect(p5.body!.endsWith("They are useful prompts for a thoughtful check-in.")).toBe(true);
    expect(p5.cta).toBe(LIVE_011_POST_5.cta);
  });

  it("matches in any case or punctuation, keeps a body whose last line only mentions the cta, and does the same for a carousel's last point", () => {
    const loose = { ...LIVE_011_POST_1, body: LIVE_011_POST_1.body.replace("What helps you keep track of client chats without hovering over your team?", "what helps you keep track of client chats, without hovering over your team") };
    expect(validateCampaign({ posts: [loose] }, live)![0].body!.endsWith("useful.")).toBe(true);
    const kept = { ...LIVE_011_POST_1, body: `${LIVE_011_POST_1.body} Tell us below.` };
    expect(validateCampaign({ posts: [kept] }, live)![0].body).toBe(kept.body);
    const points = [1, 2, 3, 4].map((i) => `Point ${i}: ${words(10)}`);
    const got = validateCampaign(written({ 2: { body: [...points, "Save this."].join("\n\n") } }), campaignRequest())!.find((p) => p.n === 2)!;
    expect(got.body!.split("\n\n")).toEqual(points);
  });
});

// wave 4 live check (22 Oct), live-p5w4 calls/003: posts 1, 2, 5 and 6 as asked and as they came back (1 and 2 end the
// body on a near copy of the cta; 5 and 6 end on a line that only shares the campaign's topic)
const P5W4_003_ASKS = [
  { n: 1, angle: { title: "Fewer app switches", line: "Use one phone app for CRM, WhatsApp, tasks and goals." }, format: "text-post", stage: "attraction", formula: { name: "Contrarian take", template: "Most people say {common advice}. After {what you have seen}, I disagree." }, ctaType: "open-question", platforms: ["linkedin"] },
  { n: 2, angle: { title: "Follow-up tasks", line: "Keep sales follow-ups as tasks so they stay part of your workday." }, format: "carousel", stage: "attraction", formula: { name: "Number reveal", template: "I {did something} {N} times. Here is what came out of it." }, ctaType: "open-question", platforms: ["linkedin"] },
  { n: 5, angle: { title: "Goals in view", line: "Bring sales goals into the same app where you manage clients and follow-ups." }, format: "text-post", stage: "trust", formula: { name: "The list", template: "{N} things I wish I knew before {milestone}." }, ctaType: "save-share", platforms: ["linkedin"] },
  { n: 6, angle: { title: "Fewer app switches", line: "Use one phone app for CRM, WhatsApp, tasks and goals." }, format: "carousel", stage: "trust", formula: { name: "Insider view", template: "After {N} years as {role}, here is what nobody tells you about {topic}." }, ctaType: "save-share", platforms: ["linkedin"] },
];
const P5W4_003_POSTS = [
  {
    n: 1,
    hook: "Most people say more apps mean more control. We disagree.",
    body: "When client details, WhatsApp chats, follow-ups and goals sit in different places, switching between them becomes part of the workday.\n\nThe practical question is not how many tools you can add. It is whether you can see what needs attention and keep moving between client work and sales tasks.\n\nWe bring CRM, a shared WhatsApp inbox, tasks and goals together in one phone app. Sales activity can also be logged in one tap.\n\nThat gives you one place to check client context, manage conversations, keep follow-ups as tasks and view goals. It keeps the tools close to the work, instead of making you move between separate apps.\n\nFor self-employed professionals and coaches, what part of your sales workflow currently involves the most app switching?",
    cta: "What part of your sales workflow involves the most app switching?",
  },
  {
    n: 2,
    hook: "Put follow-ups on the task list",
    body: "A follow-up written as a task has a place in your workday.\n\nKeep the next step with the client details, so you can check what needs attention.\n\nA WhatsApp conversation can be part of the sales workflow, not a separate reminder to remember.\n\nReview your tasks as you plan the day, then make time for the follow-ups that are due.\n\nHow do you keep your sales follow-ups visible during a busy day?",
    cta: "How do you keep sales follow-ups visible during a busy day?",
  },
  {
    n: 5,
    hook: "3 things to check when setting sales goals",
    body: "Goals are easier to keep in view when they sit alongside the work that moves them forward.\n\nBefore setting your next sales goal, check these three parts of your workflow.\n\nFirst, can you see the client details you need to follow up? Second, are follow-ups recorded as tasks, so they can be part of your workday? Third, can you view your goals in the same place you manage clients and conversations?\n\nWe bring CRM, a shared WhatsApp inbox, tasks and goals together in one phone app. Sales activity can be logged in one tap, too.\n\nThe point is to keep client work, follow-ups and goals connected to the way you work each day.",
    cta: "Save this checklist for your next planning session, or share it with a sales professional who sets their own goals.",
  },
  {
    n: 6,
    hook: "One app for sales work",
    body: "CRM, a shared WhatsApp inbox, tasks and goals can sit together in one phone app.\n\nKeep client information close to the conversations you manage.\n\nMake sales follow-ups tasks, so they have a place in your workday.\n\nLog sales activity in one tap while moving between client work.\n\nKeep goals in the same app where you manage clients and follow-ups.",
    cta: "Which part of your sales workflow would you most like to keep together?",
  },
].map((p) => ({ ...p, script: "", brief: "" }));

describe("a body that ends on a near copy of its cta (wave 4 live check: calls/003 posts 1 and 2 asked twice)", () => {
  const live = campaignRequest({ mode: "campaign", posts: P5W4_003_ASKS, context: LIVE_011_CONTEXT });
  const cut = (body: string) => body.slice(0, body.lastIndexOf("\n\n"));

  it("removes the last sentence when it asks the cta's question again, and keeps every line that only shares the topic", () => {
    const dropped: [number, string][] = [];
    const [p1, p2, p5, p6] = validateCampaign({ posts: P5W4_003_POSTS }, live, dropped)!;
    expect(dropped).toEqual([]);
    expect(p1.body).toBe(cut(P5W4_003_POSTS[0].body));
    expect(p1.body!.endsWith("instead of making you move between separate apps.")).toBe(true);
    expect(p2.body).toBe(cut(P5W4_003_POSTS[1].body));
    expect(p2.body!.split("\n\n")).toHaveLength(4);
    expect(p5.body).toBe(P5W4_003_POSTS[2].body);
    expect(p6.body).toBe(P5W4_003_POSTS[3].body);
    expect([p1, p2, p5, p6].map((p) => p.cta)).toEqual(P5W4_003_POSTS.map((p) => p.cta));
  });

  it("removes only the repeating sentence of a last line, a two-sentence cta's both, and never a statement on the cta's words", () => {
    const post1 = (end: string, cta = P5W4_003_POSTS[0].cta) => validateCampaign({ posts: [{ ...P5W4_003_POSTS[0], body: `${cut(P5W4_003_POSTS[0].body)}\n\n${end}`, cta }] }, live)![0].body!;
    expect(post1("Tell us. What part of your sales workflow really involves the most app switching?").endsWith("\n\nTell us.")).toBe(true);
    expect(post1("Save this. Then share it with a coach who switches apps all day.", "Save this. Share it with a coach who switches apps all day.")).toBe(cut(P5W4_003_POSTS[0].body));
    const statement = "The part of your sales workflow that involves the most app switching is where follow-ups slip.";
    expect(post1(statement).endsWith(statement)).toBe(true);
    expect(post1("What part of your week goes to admin?").endsWith("What part of your week goes to admin?")).toBe(true);
  });
});

// wave 4 live check (22 Oct), live-p5w4 calls/004: the swap of post 5 on ActivityTracker as asked and as it came back
const P5W4_004_SWAP = {
  mode: "campaign",
  swap: true,
  posts: [P5W4_003_ASKS[2]],
  avoid: ["3 things to check when setting sales goals", "Most people say more apps mean more control. We disagree.", "Put follow-ups on the task list", "The cost of skipping one tap is missing activity context.", "Before, client details and sales conversations can be scattered across different places.", "One app for sales work", "If you still rely on memory for every follow-up, stop."],
  context: LIVE_011_CONTEXT,
};
const P5W4_004_POST = {
  n: 5,
  hook: "5 things I wish I knew before tracking sales goals",
  body: "Sales goals are easier to review when they sit close to the work that moves them forward.\n\nHere are five practical reminders:\n\n1. Keep the goal visible alongside client and follow-up work.\n2. Check your activity as well as the target. Logged activity gives you context for your sales work.\n3. Make it easy to record activity. With one-tap logging, you can add it as you go.\n4. Keep follow-ups organised so the next action is clear.\n5. Review your goals in the same place you manage clients, tasks and conversations.\n\nWhen goals, client management, tasks and a shared WhatsApp inbox are together in one phone app, you have fewer places to check during the day. That gives you a clearer view of how your sales work is moving, without relying on memory alone.",
  script: "",
  brief: "",
  cta: "Save this checklist or share it with a sales professional who tracks goals.",
};

describe("a business brand's hooks never say I (wave 4 live check: calls/004 swapped in \"5 things I wish I knew\")", () => {
  const business = campaignRequest(P5W4_004_SWAP);
  const person = campaignRequest({ ...P5W4_004_SWAP, context: { ...PLAN_CONTEXT, audience: "Parents in their 30s with a first child" } });

  it("tells a business's writer to say a formula as the business, in the campaign and the swap prompts", () => {
    const line = 'never "I" ("I {did something} {N} times" becomes "We {did something} {N} times")';
    expect(buildCampaignPrompt(business).system).toContain(line);
    expect(buildCampaignPrompt(campaignRequest({ ...P5W4_004_SWAP, swap: false })).system).toContain(line);
    expect(buildCampaignPrompt(person).system).not.toContain(line);
  });

  it("drops a business's post whose hook says I and logs its number and rule, so the job's retry writes it again", () => {
    const dropped: [number, string][] = [];
    expect(validateCampaign({ posts: [P5W4_004_POST] }, business, dropped)).toEqual([]);
    expect(dropped).toEqual([[5, "says I in a business hook"]]);
    expect(validateCampaign({ posts: [P5W4_004_POST] }, person)!.map((p) => p.hook)).toEqual([P5W4_004_POST.hook]);
  });

  it("catches I and its contractions as the speaker, and keeps a quoted I and words that only contain the letter", () => {
    const hookOf = (hook: string) => validateCampaign({ posts: [{ ...P5W4_004_POST, hook }] }, business)!.map((p) => p.hook);
    for (const hook of ["I tracked sales goals 40 times. Here is what came out of it.", "Here is what I learned about sales goals", "I'd keep sales goals in view, always", "Sales goals? I\u2019ve stopped guessing", "Nobody tracks goals better than I."]) expect(hookOf(hook)).toEqual([]);
    for (const hook of ['"I never have time," reps tell us about sales goals', "5 things we wish every rep knew about sales goals", "Is your sales goal in view?"]) expect(hookOf(hook)).toEqual([hook]);
  });
});

// wave 2 live check (22 Oct), live-p5w2 calls/001: the business draft's two scripts as asked; post 3 as it came back
const P5W2_001_ASK_3 = { n: 3, angle: { title: "Fewer App Switches", line: "We bring CRM, chats, tasks and goals into one phone app, reducing the need to jump between tools." }, format: "short-video", stage: "attraction", formula: null, ctaType: "comment-keyword", platforms: ["instagram"] };
const P5W2_001_ASK_4 = { n: 4, angle: { title: "Target Progress View", line: "Track team goals alongside activity, so you can review progress and discuss what needs attention." }, format: "ai-video", stage: "conversion", formula: null, ctaType: "book-call", platforms: ["instagram"] };
const P5W2_001_SCRIPT_3 =
  "HOOK: Switching between sales apps can make simple follow-ups harder to keep in view.\nBODY: Your CRM may hold client details, WhatsApp may hold conversations, and tasks may live somewhere else. When goals sit in another tool, checking the full picture takes extra steps. We bring CRM, chats, tasks and goals into one phone app, with activity logged in one tap. Fewer switches can make the workday feel more connected, while your team still decides what needs attention.\nCTA: Comment APP if you want to see how the pieces fit together.";
// post 4 never reached the record (dropped: "script 70 words, needs 36 to 48"), so this stands in at the same 70 words
const P5W2_001_AI_70 = [
  "Is your team on pace for this month's targets?",
  "Most sales managers only find out at the end of the month.",
  "By then, there is little time left to help.",
  "ActivityTracker keeps team goals beside each rep's daily activity.",
  "You can see calls, follow-ups and progress in one phone app.",
  "That makes weekly check-ins shorter and more useful.",
  "Book a short demo to see the target view for your team.",
].join(" ");

describe("campaign scripts past the old 15% band (wave 2 live check: calls/001 dropped a 70-word AI video)", () => {
  const live = campaignRequest({ mode: "campaign", posts: [P5W2_001_ASK_3, P5W2_001_ASK_4], context: LIVE_011_CONTEXT });
  const reply = (ai: string) => ({ posts: [{ n: 3, hook: "", body: "", script: P5W2_001_SCRIPT_3, brief: "", cta: "" }, { n: 4, hook: "", body: "", script: ai, brief: "", cta: "" }] });

  it("states each script's length as spoken words to aim at, on the post itself", () => {
    const { user } = buildCampaignPrompt(live);
    expect(user).toContain("Angle: Target Progress View: Track team goals alongside activity, so you can review progress and discuss what needs attention.\nWords: script about 42 spoken words in all (36 to 48), counted across every line");
    expect(user).toContain("reducing the need to jump between tools.\nWords: script about 75 spoken words in all (60 to 90) across its HOOK, BODY and CTA lines, the labels not counted");
  });

  it("cuts the 70-word script's last body sentences into 36 to 48, keeping its hook and call to action", () => {
    expect(countWords(P5W2_001_AI_70)).toBe(70);
    const dropped: [number, string][] = [];
    const got = validateCampaign(reply(P5W2_001_AI_70), live, dropped)!;
    expect(dropped).toEqual([]);
    expect(got.map((p) => p.n)).toEqual([3, 4]);
    expect(got[0].script).toBe(P5W2_001_SCRIPT_3); // 76 words, in range: untouched
    expect(got[1].script!.split("\n")).toEqual([
      "Is your team on pace for this month's targets?",
      "Most sales managers only find out at the end of the month.",
      "By then, there is little time left to help.",
      "Book a short demo to see the target view for your team.",
    ]);
    expect(countWords(got[1].script!)).toBe(42);
    expect(got[1]).toMatchObject({ hook: "Is your team on pace for this month's targets?", cta: "Book a short demo to see the target view for your team." });
  });

  it("passes over a sentence whose loss would go under 36, and drops only what cannot fit", () => {
    // 10 + 7 + 30 + 4 words: losing the last body sentence (30) leaves 21, so the 7-word one goes instead (44)
    const long = `Here is a hook for a team of sales reps. Then a short one sits here now. ${words(30, "long")} Book a demo now.`;
    const dropped: [number, string][] = [];
    const got = validateCampaign(reply(long), live, dropped)!.find((p) => p.n === 4)!;
    expect(got.script!.split("\n")).toEqual(["Here is a hook for a team of sales reps.", words(30, "long"), "Book a demo now."]);
    // one body sentence of 50 words cannot lose it and keep a body: dropped, never cut mid-sentence or padded
    validateCampaign(reply(`Hook line here. ${words(50, "body")} Book a demo now.`), live, dropped);
    expect(dropped).toEqual([[4, "script 57 words, needs 36 to 48"]]);
  });
});

describe("campaign swap hook (wave 1 live check: calls/013 changed two words of calls/011's post 1 hook)", () => {
  // calls/013 as sent: the swap of post 1, with every hook of calls/011 in avoid
  const avoid = [LIVE_011_POST_1.hook, "Who owns the next follow-up?", "If your sales day means jumping between apps, it is easy to lose track of the next step.", LIVE_011_POST_5.hook, "A shared inbox, clearer handovers"];
  const swap = campaignRequest({ mode: "campaign", swap: true, posts: [LIVE_011_ASK_1], avoid, context: LIVE_011_CONTEXT });
  const LIVE_013_POST_1 = {
    n: 1,
    hook: "Most sales teams think visibility means checking every chat. Here is why that is wrong.",
    body: "Visibility is not the same as reading every message. When conversations sit across individual WhatsApp accounts, a manager can spend the day checking in and still miss the useful question: where does each client conversation stand?\n\nA shared view can make it easier to spot chats that need a reply, a handover or a follow-up. It also gives the team a clearer picture of what is moving without turning every conversation into a status meeting.\n\nThe point is not to watch every message. It is to make the next step easier to see, while keeping client conversations in context. That can make coordination feel less like chasing updates and more like helping the team keep work moving.",
    script: "",
    brief: "",
    cta: "What makes it hardest to see where team chats stand?",
  };

  it("refuses the live swap's hook, which shares 'every chat here is' with the old one", () => {
    const dropped: [number, string][] = [];
    expect(validateCampaign({ posts: [LIVE_013_POST_1] }, swap, dropped)).toEqual([]);
    expect(dropped).toEqual([[1, "shares 4 words with a used hook"]]);
  });

  it("keeps a new hook in the same formula, whose shared words are only the formula's own, and leaves a draft (not a swap) alone", () => {
    const fresh = { ...LIVE_013_POST_1, hook: "Most sales teams think more chats mean more sales. Here is why that is wrong." };
    expect(validateCampaign({ posts: [fresh] }, swap)!.map((p) => p.hook)).toEqual([fresh.hook]);
    // the formula's words count only for its own post: "here is why that" from another hook still echoes
    expect(validateCampaign({ posts: [fresh] }, { ...swap, posts: [{ ...swap.posts[0], formula: null }] })).toEqual([]);
    expect(validateCampaign({ posts: [LIVE_013_POST_1] }, { ...swap, swap: false })!.map((p) => p.n)).toEqual([1]);
  });

  it("tells the writer the hook must be new", () => {
    expect(buildCampaignPrompt(swap).user).toContain(
      "Write post 1 again: the same angle, format and stage, with new words and a different opening. The hook must be new: it shares no run of four words with a hook already used, apart from the hook formula's own words.",
    );
  });
});

import { MAS_QUESTION } from "../_shared/mas.ts";
import { masAsk, withMas } from "./logic.ts";

describe("campaign MAS question", () => {
  const posts = validateCampaign(written(), campaignRequest())!;

  it("asks mas_<n> on MAS_QUESTION about each post's own words, a script as written", () => {
    const { state, questions } = masAsk(posts);
    expect(Object.keys(questions)).toEqual(["mas_1", "mas_2", "mas_3", "mas_4", "mas_5", "mas_6"]);
    expect(questions.mas_4).toEqual({ type: "noul", instructions: `Read only \`post_4\`. ${MAS_QUESTION}` });
    expect(state.post_1).toBe(`Most reps lose the deal after the first call\n\n${words(100)}\n\nSave this for your next follow-up.`);
    // an AI video's caption is read with its script (live-p5dog day 2: the caption is new words a person posts)
    expect(state.post_4).toBe(`${posts[3].script}\n\nMost deals die in the follow-up, not the pitch.`);
    expect(state.post_5).toBe("Three messages that bring a lead back\n\nThe check-in\nThe useful link\nThe honest close\n\nFollow for more.");
  });

  it("warns a person's post at MAS_WARN, gives null when Jev said nothing, and null for a business", () => {
    const answers = { mas_1: { type: "noul" as const, noul: 0.5 }, mas_2: { type: "noul" as const, noul: 0.49 } };
    expect(withMas(posts, answers, "person").map((p) => p.mas)).toEqual([true, false, null, null, null, null]);
    expect(withMas(posts, null, "person").every((p) => p.mas === null)).toBe(true);
    expect(withMas(posts, answers, "business").every((p) => p.mas === null)).toBe(true);
  });
});

// ---- Long piece source and speaker (phase 5, plan-interview) ------------------

describe("long piece source and speaker", () => {
  const longOf = (extra: Record<string, unknown>) => {
    const r = parseLongRequest({ ...PIN_BODY, mode: "long", text: LONG_TEXT, formulas: FORMULAS, ...extra });
    if (!r.ok) throw new Error("parse");
    return r.request;
  };

  it("keeps interview and voice, reads anything else as text, and reads speaker at the top level or in context", () => {
    expect(longOf({ source: "interview" }).source).toBe("interview");
    expect(longOf({ source: "voice" }).source).toBe("voice");
    for (const source of [undefined, "text", "podcast", 3]) expect(longOf({ source }).source).toBe("text");
    expect(longOf({}).speaker).toBe("person");
    expect(longOf({ speaker: "business" }).speaker).toBe("business");
    expect(longOf({ context: { speaker: "business" } }).speaker).toBe("business");
    expect(longOf({ speaker: "robot" }).speaker).toBe("person");
  });

  it("keeps the text prompt byte for byte when the source is sent as text", async () => {
    await expect(promptText(buildLongPrompt(longOf({ source: "text", speaker: "person" })))).toMatchFileSnapshot("./fixtures/long-prompt.txt");
  });

  it("opens an interview with the first-person line and keeps the compliance block", () => {
    const { system } = buildLongPrompt(longOf({ source: "interview" }));
    expect(system.split("\n")[0]).toContain(
      "A consultant answered interview questions in their own words. The questions came from the app; only the answers are the consultant's. Turn the answers into a week of posts in the consultant's first person. Never quote, answer or mention the questions.",
    );
    expect(system).toContain("Compliance (MAS fair dealing and advertising rules): never promise or imply guaranteed returns");
    expect(system).not.toContain("has pasted one long piece");
  });

  it("opens a voice note with the transcription line", () => {
    const { system } = buildLongPrompt(longOf({ source: "voice" }));
    expect(system.split("\n")[0]).toContain("A consultant recorded a voice note, transcribed by machine. Ignore filler words, false starts and words that were clearly misheard, and never guess what they meant.");
  });

  it("writes a business's interview as the business, never as a consultant or an adviser", () => {
    for (const source of ["interview", "voice", "text"]) {
      const p = buildLongPrompt(longOf({ source, speaker: "business" }));
      expect(p.system).toContain(BUSINESS_VOICE);
      expect(p.system).toContain("Compliance (MAS fair dealing");
      expect(p.user).toContain("About the business:");
      expect(`${p.system}\n${p.user}`).not.toMatch(/consultant|adviser/i);
    }
    expect(buildLongPrompt(longOf({ source: "interview", speaker: "business" })).system.split("\n")[0]).toContain("Someone at the business answered interview questions in their own words.");
    expect(buildLongPrompt(longOf({ source: "interview" })).system).not.toContain(BUSINESS_VOICE);
  });
});

// ---- Wave 2 live check (22 Oct): calls/014's interview posts opened on the formula's blanks ------------------

import LIVE_014_LONG from "./fixtures/live-p5w2-014-long.json";
import { withoutBlanks } from "./logic.ts";

describe("long piece blanks for a listed caller (wave 2 live check: calls/014)", () => {
  const req = (source: string) => {
    const r = parseLongRequest({ ...LIVE_014_LONG.body, source });
    if (!r.ok) throw new Error("parse");
    return r.request;
  };
  const FILL = "- Every blank in a hook formula, in {braces} or [brackets], is replaced with real words from the piece. A post that keeps a blank in brackets or braces, or asks the reader to fill anything in, cannot be used.";

  it("asks a listed caller to fill every formula blank, whatever the source; everyone else's prompt keeps today's blanks", () => {
    const [interview, text, voice] = ["interview", "text", "voice"].map((s) => buildLongPrompt(req(s), { listed: true }).system.split("\n"));
    for (const lines of [interview, text, voice]) {
      expect(lines).toContain(FILL);
      expect(lines.join("\n")).not.toMatch(/write a short blank|put a blank such as/);
    }
    // the interview's prompt differs from pasted text's only in its first line: the blanks were never the interview's doing
    expect(interview.slice(1)).toEqual(text.slice(1));
    expect(interview[0]).not.toBe(text[0]);
    const today = buildLongPrompt(req("text")).system;
    expect(today).toContain("write a short blank in square brackets such as [your number]");
    expect(today).not.toContain(FILL);
  });

  it("drops the four posts that kept the formula's blanks and keeps the filled one, naming each rule", () => {
    const got = validateLong(LIVE_014_LONG.reply, req("interview").formulas)!;
    expect(got.posts.map((p) => p.post.split("\n")[0])).toEqual([
      "[What it cost] is what [one mistake] cost me.",
      "[Some time ago] I [low point]. Now I [better point]. One change did it.",
      "[N] things I wish I knew before [milestone].",
      "After [N] years as [role], here is what nobody tells you about [topic].",
      "If you still wait for the perfect time, stop.",
    ]);
    const dropped: [number, string][] = [];
    expect(withoutBlanks(got.posts, dropped).map((p) => p.formulaId)).toEqual(["callout"]);
    expect(dropped).toEqual([[1, "a blank left in"], [2, "a blank left in"], [3, "a blank left in"], [4, "a blank left in"]]);
    // post 3's body told the reader to fill the blanks in; with its hook filled, that line still drops it
    const filled = { ...got.posts[2], post: got.posts[2].post.replace("[N] things I wish I knew before [milestone].", "3 things I wish I knew before I started to plan.") };
    const why: [number, string][] = [];
    expect(withoutBlanks([filled, { ...got.posts[1], post: "A {low point} kept in braces." }], why)).toEqual([]);
    expect(why).toEqual([[1, "asks the reader to fill in"], [2, "a blank left in"]]);
    expect(withoutBlanks([got.posts[4], { ...got.posts[4], post: "Fill in the CPF nomination form this week." }])).toHaveLength(2);
  });
});

// ---- Plan modes (phase 5): ideas -----------------------------------------------

import { IDEAS_SCHEMA, IDEA_FITS, IDEA_SAFE, buildIdeasPrompt, ideaAsk, parseIdeasRequest, rankIdeas, validateIdeas } from "./logic.ts";

const IDEAS_ASK = {
  mode: "ideas",
  count: 6,
  context: { ...PLAN_CONTEXT, labels: ["Money basics", "Family cover"] },
  posted: ["Nobody tells new parents this about hospital bills"],
  best: ["What a ward stay really costs"],
  seeds: [{ key: "news:cpf-rate", kind: "news", title: "CPF interest rates reviewed for the next quarter" }],
};
const ideasRequest = (body: unknown = IDEAS_ASK) => {
  const r = parseIdeasRequest(body);
  if (!r.ok) throw new Error(r.error);
  return r.request;
};
const idea = (k: number, extra: Record<string, unknown> = {}) => ({
  title: `Idea number ${k} for parents`,
  angle: `What idea ${k} looks like for a first child.`,
  why: `New parents meet idea ${k} in their first year.`,
  format: "carousel",
  stage: "trust",
  label: "",
  seedKey: "",
  ...extra,
});

describe("mode ideas", () => {
  it("parseIdeasRequest clamps count to 3 to 8, posted to 15, seeds to 10, steer to 200 and labels to 12", () => {
    expect(ideasRequest({ ...IDEAS_ASK, count: 1 }).count).toBe(3);
    expect(ideasRequest({ ...IDEAS_ASK, count: 20 }).count).toBe(8);
    expect(ideasRequest({ ...IDEAS_ASK, count: undefined }).count).toBe(6);
    const r = ideasRequest({
      ...IDEAS_ASK,
      posted: Array.from({ length: 20 }, (_, i) => `Hook ${i}`),
      best: Array.from({ length: 9 }, (_, i) => `Best ${i}`),
      seeds: Array.from({ length: 14 }, (_, i) => ({ key: `news:${i}`, kind: "news", title: `Story ${i}` })),
      steer: "s".repeat(300),
      context: { ...PLAN_CONTEXT, labels: Array.from({ length: 15 }, (_, i) => `Label ${i}`) },
    });
    expect(r.posted).toHaveLength(15);
    expect(r.best).toHaveLength(5);
    expect(r.seeds).toHaveLength(10);
    expect(r.steer).toHaveLength(200);
    expect(r.context.labels).toHaveLength(12);
    expect(r.context.goal).toBe(PLAN_CONTEXT.goal);
    // a seed key is echoed back, so a bad one is dropped, never cut
    expect(ideasRequest({ ...IDEAS_ASK, seeds: [{ key: "k".repeat(201), title: "x" }, { key: "has space", title: "x" }, { key: "ok", title: "" }] }).seeds).toEqual([]);
    expect(ideasRequest({ ...IDEAS_ASK, like: { title: "Idea one", angle: "Its take." } }).like).toEqual({ title: "Idea one", angle: "Its take." });
  });

  it("needs a positioning to write ideas about", () => {
    expect(parseIdeasRequest({ mode: "ideas", context: { goal: "More enquiries" } })).toEqual({ ok: false, error: "Say who you serve first, so ideas are about them." });
  });

  it("asks for count + 2 under COMPLIANCE_LINES and PLAN_LINES, with the posted hooks, the steer and the like idea", () => {
    const { system, user } = buildIdeasPrompt(ideasRequest({ ...IDEAS_ASK, count: 4, steer: "CPF top-ups", like: { title: "Hospital cover for a newborn", angle: "What it covers in year one." } }));
    expect(system).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
    expect(system).toContain("Write exactly 6 candidates");
    expect(system).toContain("general education for people in Singapore: no named insurer or product, and no promised return");
    expect(user).toContain("Posted lately (never repeat these):\n- Nobody tells new parents this about hospital bills");
    expect(user).toContain("Make the ideas about: CPF top-ups");
    expect(user).toContain("Write ideas close to this one, each a different take: Hospital cover for a newborn: What it covers in year one.");
    expect(user).toContain("Labels (pick one per idea when one fits):\n- Money basics\n- Family cover");
    expect(user).toContain("- news:cpf-rate (news): CPF interest rates reviewed for the next quarter");
    expect(user).toContain("Hooks of their best posts (build on what worked; never copy):\n- What a ward stay really costs");
    expect(user.indexOf("MY BRAND RULES")).toBe(0);
    const plain = buildIdeasPrompt(ideasRequest());
    expect(plain.user).not.toContain("Make the ideas about");
    expect(plain.user).not.toContain("close to this one");
  });

  it("writes a business's ideas as the business, and never says adviser", () => {
    const req = ideasRequest({ ...IDEAS_ASK, context: { ...BUSINESS_CONTEXT, labels: [] } });
    const p = fullPrompt(buildIdeasPrompt(req));
    expect(p).toContain(BUSINESS_VOICE);
    expect(p).toContain("a business in Singapore");
    expect(p).not.toMatch(/adviser/i);
    expect(JSON.stringify(ideaAsk(req, validateIdeas({ ideas: [idea(1)] }, req)![0]))).not.toMatch(/adviser/i);
    expect(fullPrompt(buildIdeasPrompt(ideasRequest()))).not.toContain(BUSINESS_VOICE);
  });

  it("IDEAS_SCHEMA is strict: every property required, nothing extra", () => {
    const item = IDEAS_SCHEMA.properties.ideas.items;
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
    expect(item.additionalProperties).toBe(false);
  });

  it("validateIdeas drops unknown formats and stages, unknown labels and seed keys, and trims over-long fields", () => {
    const req = ideasRequest({ ...IDEAS_ASK, count: 3 });
    const got = validateIdeas(
      JSON.stringify({
        ideas: [
          idea(1, { label: "money BASICS", seedKey: "news:cpf-rate" }),
          idea(2, { format: "story" }),
          idea(3, { stage: "awareness" }),
          idea(4, { label: "Not a label", seedKey: "news:made-up" }),
          idea(5, { title: "Idea number 1 for PARENTS" }),
          idea(6, { title: "nobody tells new parents this about hospital bills" }),
          idea(7, { why: "" }),
          idea(8, { title: "One two three four five six seven eight nine ten eleven twelve thirteen", angle: `Angle — ${"word ".repeat(40)}`, why: "word ".repeat(30) }),
          idea(9),
          idea(10),
          idea(11),
        ],
      }),
      req,
    )!;
    expect(got.map((i) => i.title)).toEqual(["Idea number 1 for parents", "Idea number 4 for parents", "One two three four five six seven eight nine ten eleven twelve", "Idea number 9 for parents", "Idea number 10 for parents"]);
    expect(got[0]).toMatchObject({ label: "Money basics", seedKey: "news:cpf-rate", format: "carousel", stage: "trust" });
    expect(got[1]).not.toHaveProperty("label");
    expect(got[1]).not.toHaveProperty("seedKey");
    expect(countWords(got[2].angle)).toBe(25);
    expect(got[2].angle).not.toMatch(/—/);
    expect(countWords(got[2].why)).toBe(20);
    expect(validateIdeas("not json", req)).toBeNull();
  });

  it("asks Jev whether the people served would stop and whether it is safe, from the brand's positioning", () => {
    const req = ideasRequest();
    const ask = ideaAsk(req, validateIdeas({ ideas: [idea(1)] }, req)![0]);
    expect(ask.state).toEqual({
      brand: PLAN_CONTEXT.positioning.oneLiner,
      serves: "Parents in their 30s",
      topics: "Hospital cover, CPF",
      goal: PLAN_CONTEXT.goal,
      country: "Singapore",
      idea: "Idea number 1 for parents: What idea 1 looks like for a first child.",
    });
    expect(Object.keys(ask.questions)).toEqual(["fits", "safe"]);
    expect(ask.questions.safe.instructions).toBe("Can a financial adviser in Singapore post about `idea` in general terms, without recommending a product, naming an insurer's plan or promising a return?");
  });

  const cands = (n: number) => Array.from({ length: n }, (_, k) => ({ ...idea(k), format: "carousel" as const, stage: "trust" as const }));
  const ans = (fits: number | null, safe: number | null = 0.9) => ({ fits: { type: "noul" as const, noul: fits ?? undefined }, safe: { type: "noul" as const, noul: safe ?? undefined } });

  it("rankIdeas keeps fits and safe at 0.6, drops at 0.59, sorts by fits and returns count", () => {
    expect([IDEA_FITS, IDEA_SAFE]).toEqual([0.6, 0.6]);
    const r = rankIdeas(cands(8), [ans(0.6), ans(0.59), ans(0.95, 0.59), ans(0.7), ans(0.8, 0.6), ans(0.65), ans(0.9), ans(0.75)], 4);
    expect(r.scored).toBe(true);
    expect(r.ideas.map((i) => i.fit)).toEqual([0.9, 0.8, 0.75, 0.7]);
    expect(rankIdeas(cands(3), [ans(0.6), ans(0.59), ans(0.95, 0.59)], 3).ideas.map((i) => i.title)).toEqual(["Idea number 0 for parents"]);
  });

  it("rankIdeas falls back to the first count pattern-clean candidates, unscored, when Jev gives nothing", () => {
    const list = cands(6);
    list[1] = { ...list[1], title: "Guaranteed returns for parents" };
    const r = rankIdeas(list, Array(6).fill(null), 3);
    expect(r.scored).toBe(false);
    expect(r.ideas.map((i) => i.title)).toEqual(["Idea number 0 for parents", "Idea number 2 for parents", "Idea number 3 for parents"]);
    expect(r.ideas.every((i) => i.fit === null)).toBe(true);
    // fits answered but safe left out: the patterns decide
    expect(rankIdeas(list.slice(0, 2), [ans(0.9, null), ans(0.9, null)], 3).ideas.map((i) => i.title)).toEqual(["Idea number 0 for parents"]);
  });
});

// ---- live-p5w3 D2 (22 Oct): a business brand's plan copy hedged like an adviser ----------------------------------
// calls/012 as sent (ActivityTracker, posts 8 to 12). Posts 2, 7 and 12 of the campaign closed on "not a promise about
// results" lines and autopilot's post 3 on "avoid presenting an app as a source of tax advice": the business got the
// adviser's MAS block, whose "never promise an outcome" reads as an instruction to disclaim.

import { BUSINESS_RULE_LINES } from "./logic.ts";

const LIVE_P5W3_CONTEXT = {
  positioning: {
    oneLiner: "We help sales reps manage clients, chats, follow-ups and targets in one app so they can keep their work moving.",
    audienceDetail: "Sales-oriented self-employed professionals and coaches",
    topics: ["Sales follow-ups", "WhatsApp workflows", "Client management", "Activity tracking", "Sales goals"],
    edge: "It brings CRM, a shared WhatsApp inbox, tasks and goals together in one phone app, with activity logged in one tap.",
  },
  goal: "",
  platforms: ["linkedin"],
  voice: "Use plain, direct language and describe practical actions. Keep the focus on what the app does in a sales rep\u2019s day.",
  memory: "",
  speaker: "business",
  product: "",
  rules: "",
  questions: [],
  examples: ["Dangerous types of salespeople.\n\n#solar #pestcontrol #lifeinsurance #d2d #sales", "Agree?"],
};
const LIVE_P5W3_AUDIENCE =
  "WRITE FOR THIS AUDIENCE: Sales representatives. Sales reps who track calls, deals, follow-ups and weekly goals, individually or with a team. How they talk about it: I want to see who I need to call and whether I am on pace for my targets";
const LIVE_P5W3_012 = {
  mode: "campaign",
  posts: [
    { n: 8, angle: { title: "Task reminders", line: "Put follow-up tasks beside client conversations to keep the next step visible during a busy day." }, format: "carousel", stage: "trust", formula: { name: "Real dilemma", template: "{A specific situation with a real cost}. What would you do?" }, ctaType: "save-share", platforms: ["linkedin"] },
    { n: 9, angle: { title: "Calls to make", line: "We bring your call list and client details together so you can see who needs a call." }, format: "short-video", stage: "conversion", formula: { name: "Cold open", template: "\"{A line someone said}\" Then who said it, when, and why it stuck." }, ctaType: "dm-keyword", platforms: ["linkedin"] },
    { n: 10, angle: { title: "Team deal visibility", line: "Bring deal updates into one view so you and your team can see what needs attention." }, format: "text-post", stage: "attraction", formula: { name: "The receipt", template: "{A hard number you can show}. {One line of context}." }, ctaType: "open-question", platforms: ["linkedin"] },
    { n: 12, angle: { title: "Weekly target pace", line: "We show your tracked activity against your weekly goals, so you can check where you are in the week." }, format: "short-video", stage: "conversion", formula: null, ctaType: "dm-keyword", platforms: ["linkedin"] },
  ],
  context: { ...LIVE_P5W3_CONTEXT, audience: LIVE_P5W3_AUDIENCE },
  avoid: ["Most people say follow up where you had the conversation. We disagree.", "One weekly check on activity"],
};
// calls/010 (angles) and calls/014 (ideas, two of its ten seeds) as sent
const LIVE_P5W3_010 = { mode: "angles", audience: LIVE_P5W3_AUDIENCE, avoid: [], context: LIVE_P5W3_CONTEXT };
const LIVE_P5W3_014 = {
  mode: "ideas",
  count: 6,
  context: { ...LIVE_P5W3_CONTEXT, labels: LIVE_P5W3_CONTEXT.positioning.topics },
  posted: ["Most say hustle. We disagree.", "A missed cap check can cost clarity."],
  best: [],
  seeds: [
    { key: "news:560f95d9b01c", kind: "News", title: "At least $83,000 lost in phishing scams linked to fake Simba websites since March: Police" },
    { key: "news:e59ef9db7033", kind: "News", title: "OCBC to let customers hold Malaysian ringgit in Singapore savings accounts from Oct 23" },
  ],
};
/** Words only the adviser's compliance block brings into a plan prompt's rules. */
const ADVISER_RULES = /\bMAS\b|Notice 307|FAA-N03|returns?\b|payouts?|guaranteed|interest rate|insurer|financial|\btax\b|general education|product advice|promise an outcome|promised return/i;
const asPerson = <T extends { context: object }>(b: T): T => ({ ...b, context: { ...b.context, speaker: "person" } });

describe("a business's plan prompts (live-p5w3 D2: calls/011 and 012 hedged like an adviser)", () => {
  const prompts = (person: boolean) => {
    const as = <T extends { context: object }>(b: T) => (person ? asPerson(b) : b);
    const c = parseCampaignRequest(as(LIVE_P5W3_012));
    const a = parseAnglesRequest(as(LIVE_P5W3_010));
    const i = parseIdeasRequest(as(LIVE_P5W3_014));
    if (!c.ok || !a.ok || !i.ok) throw new Error("parse");
    return { campaign: buildCampaignPrompt(c.request).system, angles: buildAnglesPrompt(a.request).system, ideas: buildIdeasPrompt(i.request).system };
  };

  it("gives a business the honesty lines in place of the adviser's MAS block, in the campaign, angles and ideas prompts", () => {
    for (const [mode, system] of Object.entries(prompts(false))) {
      expect(system, mode).toContain(BUSINESS_RULE_LINES.join("\n"));
      expect(system, mode).not.toMatch(ADVISER_RULES);
      expect(system, mode).not.toContain(COMPLIANCE_LINES[0]);
      expect(system, mode).not.toContain(PLAN_LINES[1]);
    }
    // the honesty a business keeps: nothing invented, no claim the message does not make, no pressure, no disclaimers
    expect(BUSINESS_RULE_LINES.join("\n")).toMatch(/never invent a customer story, a statistic, a number or a testimonial/);
    expect(BUSINESS_RULE_LINES.join("\n")).toMatch(/never claim the product does something the message does not say/);
    expect(BUSINESS_RULE_LINES.join("\n")).toMatch(/no disclaimer/);
    expect(BUSINESS_RULE_LINES.join("\n")).not.toMatch(/[^\x20-\x7e\n]/);
  });

  it("keeps the person's compliance block as it was, in the same place", () => {
    for (const [mode, system] of Object.entries(prompts(true))) {
      expect(system, mode).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
      expect(system, mode).not.toContain(BUSINESS_RULE_LINES[0]);
    }
  });
});

// ---- live-p5w3 D4 (22 Oct): a short video's HOOK line had no word limit -------------------------------------------
// calls/012 posts 9 and 12 as they came back: post 9 opened on a 32-word first line, post 12 on 17 words

import { SHORT_VIDEO_HOOK_WORDS } from "./logic.ts";

const LIVE_P5W3_POST_9 = {
  n: 9,
  hook: "\u201cWho do I need to call today?\u201d It\u2019s a question sales reps can ask at the start of a busy day, and it sticks because the answer should be easy to find.",
  body: "",
  script:
    "HOOK: \u201cWho do I need to call today?\u201d It\u2019s a question sales reps can ask at the start of a busy day, and it sticks because the answer should be easy to find.\nBODY: When the call list and client details sit together, you can check who needs a call and see the context before reaching out. Our app brings those details into one phone view, alongside follow-ups and tasks.\nCTA: DM us \u201cCALLS\u201d to see how it works.",
  brief: "",
  cta: "DM us \u201cCALLS\u201d to see how it works.",
};
const LIVE_P5W3_POST_12 = {
  n: 12,
  hook: "Weekly goals beside tracked activity, or activity without a pace check? The second can leave you guessing.",
  body: "",
  script:
    "HOOK: Weekly goals beside tracked activity, or activity without a pace check? The second can leave you guessing.\nBODY: When you can compare your logged activity with your weekly goals, you can see where you are in the week and what still needs attention. Our app brings activity and goals together on your phone, so checking your pace can fit into your regular workflow.\nCTA: DM us \u201cPACE\u201d to see how it works.",
  brief: "",
  cta: "DM us \u201cPACE\u201d to see how it works.",
};

describe("a short video's HOOK line (live-p5w3 D4: calls/012 post 9 opened on 32 words)", () => {
  const live = campaignRequest(LIVE_P5W3_012);
  const video = (script: string, n = 9) => validateCampaign({ posts: [{ ...LIVE_P5W3_POST_9, n, script }] }, live)!.find((p) => p.n === n);
  const spoken = (script: string) => countWords(script.replace(/^(HOOK|BODY|CTA):/gm, ""));

  it("asks for a HOOK line of at most 15 words, in the format list and on each short video", () => {
    expect(SHORT_VIDEO_HOOK_WORDS).toBe(15);
    const { system, user } = buildCampaignPrompt(live);
    expect(system).toContain("in three lines that start HOOK:, BODY: and CTA:. The HOOK line is at most 15 words.");
    expect(user).toContain("Post 9: short-video, conversion stage");
    expect(user).toContain("the labels not counted; HOOK line at most 15 words");
  });

  it("keeps the live hooks' first sentences and opens the body with the rest, so no spoken word is lost", () => {
    const dropped: [number, string][] = [];
    const scripts = campaignRequest({ ...LIVE_P5W3_012, posts: LIVE_P5W3_012.posts.filter((p) => p.format === "short-video") });
    const got = validateCampaign({ posts: [LIVE_P5W3_POST_9, LIVE_P5W3_POST_12] }, scripts, dropped)!;
    expect(dropped).toEqual([]);
    const [p9, p12] = got;
    // quotes come back straight since live-p5dog D14
    expect(p9.hook).toBe('"Who do I need to call today?"');
    expect(p9.script!.split("\n")).toEqual([
      'HOOK: "Who do I need to call today?"',
      "BODY: It's a question sales reps can ask at the start of a busy day, and it sticks because the answer should be easy to find. When the call list and client details sit together, you can check who needs a call and see the context before reaching out. Our app brings those details into one phone view, alongside follow-ups and tasks.",
      'CTA: DM us "CALLS" to see how it works.',
    ]);
    expect(spoken(p9.script!)).toBe(spoken(LIVE_P5W3_POST_9.script));
    expect(p12.hook).toBe("Weekly goals beside tracked activity, or activity without a pace check?");
    expect(p12.script!.split("\n")[1]).toMatch(/^BODY: The second can leave you guessing\. When you can compare/);
    expect(got.every((p) => countWords(p.hook) <= SHORT_VIDEO_HOOK_WORDS)).toBe(true);
  });

  it("cuts a first sentence over 15 words at a word, the rest spoken in the body, and adds a body line when there is none", () => {
    const long = `HOOK: ${Array.from({ length: 20 }, (_, i) => `w${i + 1}`).join(" ")} end.\nBODY: ${words(50)}\nCTA: DM us PACE.`;
    const cut = video(long)!;
    expect(cut.hook).toBe(Array.from({ length: 15 }, (_, i) => `w${i + 1}`).join(" "));
    expect(cut.script!.split("\n")[1]).toBe(`BODY: w16 w17 w18 w19 w20 end. ${words(50)}`);
    expect(spoken(cut.script!)).toBe(spoken(long));
    const two = video(`HOOK: Who needs a call today? ${words(60)}\nCTA: DM us CALLS.`)!;
    expect(two.script!.split("\n")).toEqual(["HOOK: Who needs a call today?", `BODY: ${words(60)}`, "CTA: DM us CALLS."]);
    // a HOOK line inside the limit is left as written
    expect(video(`HOOK: Who needs a call today? Here is how.\nBODY: ${words(60)}\nCTA: DM us CALLS.`)!.script!.split("\n")[0]).toBe("HOOK: Who needs a call today? Here is how.");
  });
});

import { ANSWER_PICK_MIN, answerAsk, buildAnswerPrompt, parseAnswerRequest, pickAd, validateAnswer, type AnswerRequest } from "./logic.ts";

describe("mode answer (phase 6 agent-skills)", () => {
  const AD = { id: "111", advertiser: "Finch Advisory", text: "Retire at 55 with our guaranteed income plan.\nBook a free review today.\nLimited slots.", days: 4, format: "video" };
  const ADS = [AD, { id: "222", advertiser: "Owl Planners", text: "Your CPF is not enough.", days: 6, format: "image" }, { id: "333", advertiser: "Lark", text: "Free will writing.", days: 6, format: "carousel" }];
  const req = (speaker = "person", ads: unknown[] = ADS): AnswerRequest => {
    const r = parseAnswerRequest({ mode: "answer", ads, context: { ...PLAN_CONTEXT, speaker } });
    if (!r.ok) throw new Error(r.error);
    return r.request;
  };
  const choice = (pick: string, p: number) => ({ ad: { type: "choice" as const, choice: pick, probabilities: { [pick]: p } } });

  it("takes 1 to 10 ads, cutting each field and dropping repeats and empty ones", () => {
    expect(parseAnswerRequest({ ads: [] })).toEqual({ ok: false, error: "Send 1 to 10 competitor ads." });
    expect(parseAnswerRequest({ ads: Array.from({ length: 11 }, (_, i) => ({ ...AD, id: String(i) })) })).toMatchObject({ ok: false });
    const r = req("person", [{ ...AD, advertiser: "a".repeat(100), text: `${"t".repeat(400)}`, days: -3 }, AD, { id: "9", text: "" }, "junk", { ...AD, id: "2", days: 2.6, format: "" }]);
    expect(r.ads.map((a) => [a.id, a.advertiser.length, a.text.length, a.days, a.format])).toEqual([["111", 80, 300, 0, "video"], ["2", 14, AD.text.length, 3, "ad"]]);
    expect(r.ads[1].text.split("\n")).toHaveLength(3);
  });

  it("asks Jev to choose among 2 or more ads by advertiser, first two lines, days running and format; never with one", () => {
    expect(answerAsk(req("person", [AD]))).toBeNull();
    const ask = answerAsk(req())!;
    expect(Object.keys(ask.questions)).toEqual(["ad"]);
    const q = ask.questions.ad as { type: string; instructions: string; criteria: Record<string, string> };
    expect(q.type).toBe("choice");
    expect(q.instructions).toMatch(/^A Singapore financial adviser wants to answer one competitor ad this week/);
    expect(q.criteria).toEqual({
      a1: "Finch Advisory: Retire at 55 with our guaranteed income plan. Book a free review today., running 4 days, video",
      a2: "Owl Planners: Your CPF is not enough., running 6 days, image",
      a3: "Lark: Free will writing., running 6 days, carousel",
    });
    expect(ask.state).toEqual({ adviser: PLAN_CONTEXT.positioning.oneLiner, serves: "Parents in their 30s", country: "Singapore" });
    const biz = answerAsk(req("business"))!;
    expect(biz.questions.ad.instructions).toMatch(/^A Singapore business wants to answer/);
    expect(JSON.stringify(biz)).not.toMatch(/adviser/i);
  });

  it(`takes Jev's pick at ${ANSWER_PICK_MIN} and the longest-running ad (the first of a tie) under it or with no answer`, () => {
    expect(pickAd(ADS, choice("a1", 0.4))).toEqual({ ad: ADS[0], p: 0.4, scored: true });
    expect(pickAd(ADS, choice("a1", 0.39))).toEqual({ ad: ADS[1], p: 0.39, scored: false });
    expect(pickAd(ADS, null)).toEqual({ ad: ADS[1], p: null, scored: false });
    // a pick that was not offered is no pick
    expect(pickAd(ADS, choice("a9", 0.9))).toEqual({ ad: ADS[1], p: null, scored: false });
  });

  it("writes a person's angles under the MAS lines, from the ad's words without its advertiser", () => {
    const { system, user } = buildAnswerPrompt(req(), AD);
    expect(system).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
    expect(system).toContain("never reuse the ad's wording, its brand or its claims");
    expect(system).toContain("exactly 5 candidates");
    expect(user).toContain(`The competitor's video ad, running 4 days:\n"""${AD.text}"""`);
    expect(user).not.toContain("Finch");
  });

  it("gives a business its honesty lines and no adviser line", () => {
    const { system, user } = buildAnswerPrompt(req("business"), AD);
    expect(system).toContain(BUSINESS_RULE_LINES.join("\n"));
    expect(system).toContain(BUSINESS_VOICE);
    expect(system).toContain("a business in Singapore");
    expect(system).not.toMatch(ADVISER_RULES);
    expect(`${system}\n${user}`).not.toMatch(/adviser/i);
  });

  it("keeps the first 3 angles that neither echo 4 of the ad's words, name its advertiser nor trip the compliance patterns", () => {
    const angles = [
      { title: "Retire at 55 myth", line: "Retire at 55 with our plan is a line worth questioning." },
      { title: "Fees they leave out", line: "The fees Finch Advisory never mentions in a retirement plan." },
      { title: "Guaranteed income claims", line: "Why guaranteed income is never as simple as it sounds." },
      { title: "Your CPF at 55", line: "What really happens to your CPF savings at 55." },
      { title: "Questions to ask first", line: "Three questions to ask before any retirement review." },
      { title: "When to start planning", line: "Planning early beats a rushed review at 54." },
      { title: "One more angle here", line: "This one is past the three kept." },
    ];
    expect(validateAnswer(JSON.stringify({ angles }), AD)).toEqual(angles.slice(3, 6));
    expect(validateAnswer("not json", AD)).toBeNull();
  });
});

// ---- Phase 5 dogfood (23 Oct, live-p5dog): the campaign writer's defects ------------------------------------

describe("curly quotes (live-p5dog D14: hooks 6, 9, 21, 23, 26 and cta 27 came back curly)", () => {
  it("comes back with straight quotes and apostrophes in every field", () => {
    const got = validateCampaign(
      written({
        1: { hook: "“I’ll follow up later.” Then it’s gone", body: `It’s ${words(100)}` },
        3: { script: `HOOK: Here’s the setup.\nBODY: ${words(60)}\nCTA: DM us “APP”.` },
        5: { brief: "We’d keep it ‘simple’.", cta: "DM us “FOLLOW-UP” to learn more." },
      }),
      campaignRequest(),
    )!;
    expect(JSON.stringify(got)).not.toMatch(/[‘’“”]/);
    expect(got[0].hook).toBe("\"I'll follow up later.\" Then it's gone");
    expect(got[2].hook).toBe("Here's the setup.");
    expect(got[4]).toMatchObject({ brief: "We'd keep it 'simple'.", cta: 'DM us "FOLLOW-UP" to learn more.' });
  });
});

describe("a wall or slideshow with no brief (live-p5dog D3: 4 of 12 walls and 3 of 5 wall swaps dropped for 'no brief')", () => {
  it("tells the writer a wall's words go in brief, never body", () => {
    const { system } = buildCampaignPrompt(campaignRequest());
    expect(system).toContain("- wall: hook is at most 12 words. brief, not body, is at most 40 words on what the wall of text says; the wall is written from it later. body and script stay empty. cta is one line.");
  });

  it("takes the brief from body when the writer put it there, else from the angle's line, so the post is kept", () => {
    const dropped: [number, string][] = [];
    const got = validateCampaign(
      written({ 5: { brief: "", body: `Checking in tells them nothing new. ${words(20)}` }, 6: { brief: "  ", body: "" } }),
      campaignRequest(),
      dropped,
    )!;
    expect(dropped).toEqual([]);
    expect(got.find((p) => p.n === 5)!.brief).toBe(`Checking in tells them nothing new. ${words(20)}`);
    expect(got.find((p) => p.n === 6)!.brief).toBe("Most deals die in the follow-up, not the pitch.");
    expect(got.find((p) => p.n === 6)!.body).toBeUndefined();
  });
});

describe("hooks end on a whole sentence (live-p5dog D5: wall 2 ended 'Here is what comes out of', wall 9 'after a sales')", () => {
  // walls 2 and 9 as the writer most likely sent them, one word over 12
  const WALL_2 = "One sales chat, one follow-up task. Here is what comes out of it.";
  const WALL_9 = "“I’ll follow up later.” A familiar note to yourself after a sales chat.";

  it("tells the writer a hook is whole sentences inside its limit", () => {
    expect(buildCampaignPrompt(campaignRequest()).system).toContain("- Count the words: a post outside the word range on its Words line cannot be used, and a hook ends on a whole sentence inside its limit.");
  });

  it("keeps an over-long hook's first sentences that fit, never cutting one", () => {
    const got = validateCampaign(written({ 5: { hook: WALL_2 }, 6: { hook: WALL_9 } }), campaignRequest())!;
    expect(got.find((p) => p.n === 5)!.hook).toBe("One sales chat, one follow-up task.");
    expect(got.find((p) => p.n === 6)!.hook).toBe("\"I'll follow up later.\"");
    const text = validateCampaign(written({ 1: { hook: `Most reps lose the deal. ${words(12, "after")}` } }), campaignRequest())!;
    expect(text[0].hook).toBe("Most reps lose the deal.");
  });

  it("drops a post whose first sentence alone is over the limit, with the rule for the log, so the job writes it again", () => {
    const dropped: [number, string][] = [];
    const got = validateCampaign(written({ 1: { hook: words(16) }, 2: { hook: "Seven words is too long for a cover" }, 5: { hook: words(13, "slide") } }), campaignRequest(), dropped)!;
    expect(got.map((p) => p.n)).toEqual([3, 4, 6]);
    expect(dropped).toEqual([[1, "hook 16 words, needs at most 15"], [2, "hook 8 words, needs at most 6"], [5, "hook 13 words, needs at most 12"]]);
  });
});

describe("a body that ends on the cta's keyword ask (live-p5dog D6: 'message me PLAN' over 'Message me PLAN if...')", () => {
  // calls/209 post 3 (a person's text post) and calls/198 post 3 (a business's short video), as they came back
  const BODY_209 =
    "When a parent puts off reviewing family protection, it can become harder to see what needs attention and what can wait. That does not mean buying a bundle is automatically the answer.\n\nI start by mapping the family’s responsibilities, existing cover and questions. For a parent and child, those needs may differ. I explain the trade-offs in plain language and help organise the next steps, without assuming one solution fits every family.\n\nWe can document priorities in a one-page plan and record the reasons behind decisions. I also check in after major life events, when circumstances or responsibilities may have changed. There is no need to decide everything in one meeting.\n\nIf you want to understand what a review could involve, message me “PLAN”.";
  const CTA_209 = "Message me “PLAN” if you’d like to discuss what a review could involve.";
  const SCRIPT_198 =
    "HOOK: Scattered sales work costs focus. Separate tools are one mistake.\nBODY: When your client records, WhatsApp conversations, tasks and goals live in different places, keeping track of the next step can mean switching between apps. We bring CRM, a shared WhatsApp inbox, tasks and goals together in one phone app. You can log activity in one tap and manage sales work alongside client conversations. If you want to see how it fits your workflow, message us the word APP.\nCTA: DM us APP to enquire about signing up.";
  const ask = (n: number, format: CampaignFormat) => postAskOf(n, format, { stage: "conversion", ctaType: "dm-keyword" });

  it("removes the text post's last sentence that asks for the same keyword (calls/209)", () => {
    const req = campaignRequest({ ...CAMPAIGN_ASK, posts: [ask(3, "text-post")] });
    const [got] = validateCampaign({ posts: [{ n: 3, hook: "What delay can cost is clarity about family cover.", body: BODY_209, script: "", brief: "", cta: CTA_209 }] }, req)!;
    expect(got.body!.endsWith("There is no need to decide everything in one meeting.")).toBe(true);
    expect(got.cta).toBe("Message me \"PLAN\" if you'd like to discuss what a review could involve.");
  });

  it("says a short video's keyword once, in its CTA line (calls/198)", () => {
    const req = campaignRequest({ ...CAMPAIGN_ASK, context: { ...BUSINESS_CONTEXT, audience: "Sales reps" }, posts: [ask(3, "short-video")] });
    const [got] = validateCampaign({ posts: [{ n: 3, hook: "", body: "", script: SCRIPT_198, brief: "", cta: "" }] }, req)!;
    const lines = got.script!.split("\n");
    expect(lines[1].endsWith("alongside client conversations.")).toBe(true);
    expect(lines[2]).toBe("CTA: DM us APP to enquire about signing up.");
  });

  it("removes a brief's last sentence that asks for the keyword, and keeps one that only names a word in capitals", () => {
    const got = validateCampaign(
      written({
        5: { brief: "Log sales activity in one tap as you work. DM us ACTIVITY to learn how the app fits your day.", cta: "DM us ACTIVITY to learn more." },
        6: { brief: "Keep chats beside your CRM.", cta: "DM us CRM to learn more." },
      }),
      campaignRequest(),
    )!;
    expect(got.find((p) => p.n === 5)!.brief).toBe("Log sales activity in one tap as you work.");
    expect(got.find((p) => p.n === 6)!.brief).toBe("Keep chats beside your CRM.");
  });
});

import { ANGLE_SAME, sameAsk } from "./logic.ts";

describe("distinct angles (live-p5dog D9: two follow-up angles and two one-app angles kept, 'Sales goals' left 6th)", () => {
  // the run's 8 candidates (function-logs 00:47:21) with their fits; lines not logged, so these stand in
  const LIVE = [
    ["Client details together", 0.63],
    ["WhatsApp workflow", 0.68],
    ["Follow-up tasks", 0.68],
    ["One-tap activity log", 0.68],
    ["Sales goals", 0.66],
    ["Work in one app", 0.7],
    ["Chat to follow-up", 0.69],
    ["Track daily activity", 0.62],
  ] as const;
  const cands = LIVE.map(([title]) => ({ title, line: `Why ${title.toLowerCase()} matters.` }));
  const fitsOf = LIVE.map(([, fit]) => ({ fits: { type: "noul" as const, noul: fit }, unsafe: { type: "noul" as const, noul: 0.1 } }));
  const sameOf = (pairs: [number, number, number][]) => Object.fromEntries(pairs.map(([i, j, p]) => [`same_${i}_${j}`, { type: "noul" as const, noul: p }]));

  it("asks Jev once whether each pair of candidates is the same reason to care", () => {
    const ask = sameAsk(cands.slice(0, 3))!;
    expect(ask.state).toEqual({ angle_0: "Client details together: Why client details together matters.", angle_1: "WhatsApp workflow: Why whatsapp workflow matters.", angle_2: "Follow-up tasks: Why follow-up tasks matters." });
    expect(Object.keys(ask.questions)).toEqual(["same_0_1", "same_0_2", "same_1_2"]);
    expect(ask.questions.same_0_2).toMatchObject({ type: "noul" });
    expect(String(ask.questions.same_0_2.instructions)).toContain("`angle_0` and `angle_2`");
    expect(sameAsk(cands.slice(0, 1))).toBeNull();
    expect(Object.keys(sameAsk(cands)!.questions)).toHaveLength(28);
  });

  it("keeps the best fit of each reason: the live run gives Sales goals in place of a second follow-up angle", () => {
    // follow-up tasks ~ chat to follow-up, client details ~ work in one app, track daily activity ~ one-tap log
    const same = sameOf([[2, 6, 0.9], [0, 5, 0.8], [3, 7, 0.85], [1, 2, 0.2]]);
    expect(keepAngles(cands, fitsOf).angles.map((a) => a.title)).toEqual(["Work in one app", "Chat to follow-up", "WhatsApp workflow", "Follow-up tasks", "One-tap activity log"]);
    expect(keepAngles(cands, fitsOf, same).angles.map((a) => a.title)).toEqual(["Work in one app", "Chat to follow-up", "WhatsApp workflow", "One-tap activity log", "Sales goals"]);
  });

  it(`counts a pair as one at ${ANGLE_SAME}, two at 0.49 or with no answer, and applies to the unscored fallback too`, () => {
    expect(ANGLE_SAME).toBe(0.5);
    expect(keepAngles(cands, fitsOf, sameOf([[2, 6, 0.5]])).angles.map((a) => a.title)).not.toContain("Follow-up tasks");
    expect(keepAngles(cands, fitsOf, sameOf([[2, 6, 0.49]])).angles.map((a) => a.title)).toContain("Follow-up tasks");
    expect(keepAngles(cands, Array(8).fill(null), sameOf([[0, 1, 0.9]])).angles.map((a) => a.title)).toEqual(["Client details together", "Follow-up tasks", "One-tap activity log", "Sales goals", "Work in one app"]);
  });

  it("asks the writer for candidates that differ in feature, problem or moment", () => {
    expect(buildAnglesPrompt(anglesRequest()).system).toContain("- Each candidate is a different reason to care, with no two on the same feature, problem or moment.");
  });
});

describe("openings across a campaign's batches (live-p5dog D9)", () => {
  it("tells the writer no hook opens like one already used in earlier batches", () => {
    const { system, user } = buildCampaignPrompt(campaignRequest());
    expect(system).toContain("- No two posts in your reply open with the same three words, and no hook opens with the same three words as one listed under 'Hooks already used' or repeats one.");
    expect(user).toContain("Hooks already used (open differently):\n- Your follow-up is the real pitch");
  });
});

// ---- live-p5dog day 2 (23 Oct): posts 4 and 11's AI video scripts described ActivityTracker but never named it ------
// calls/day2/294: context.product was "" and no field carried the brand's name

describe("a business's AI video names the business (live-p5dog day 2: neither ActivityTracker script said its name)", () => {
  const NAMED = { ...BUSINESS_CONTEXT, name: "ActivityTracker", audience: "Sales reps" };
  const ask = (context: Record<string, unknown>) => campaignRequest({ ...CAMPAIGN_ASK, context });

  it("reads the brand's name, clipped", () => {
    expect(parsePlanContext(NAMED).name).toBe("ActivityTracker");
    expect(parsePlanContext({ ...NAMED, name: "x".repeat(90) }).name).toHaveLength(60);
    expect(parsePlanContext(undefined).name).toBe("");
  });

  it("gives a business's name under About, and asks its AI video script to say it once, after the first line", () => {
    const { system, user } = buildCampaignPrompt(ask(NAMED));
    expect(user).toContain("About the business:\nName: ActivityTracker\nWhat they do: ActivityTracker keeps");
    expect(system).toContain("and the last line is the call to action. hook is the first line and cta the last. The script says the business's name once, plainly, after the first line and never in it.");
    expect(user).toContain("Post 4: ai-video, conversion stage");
    expect(user).toContain("Words: script about 42 spoken words in all (36 to 48), counted across every line; caption at most 40 words; ActivityTracker said once");
    // only the AI video's Words line names it
    expect(user.match(/said once/g)).toHaveLength(1);
  });

  it("leaves a business with no name, and a person with one, as they were", () => {
    const none = buildCampaignPrompt(ask({ ...NAMED, name: "" }));
    expect(none.system).not.toContain("says the business's name");
    expect(none.user).not.toContain("Name:");
    expect(none.user).not.toContain("said once");
    const person = buildCampaignPrompt(ask({ ...PLAN_CONTEXT, name: "Leo Tan", audience: "Parents in their 30s with a first child" }));
    expect(person).toEqual(buildCampaignPrompt(campaignRequest()));
    expect(person.system).toContain([...COMPLIANCE_LINES, ...PLAN_LINES].join("\n"));
  });

  it("gives the name in the angles prompt's About too", () => {
    expect(buildAnglesPrompt(anglesRequest({ ...ANGLES_ASK, context: NAMED })).user).toContain("About the business:\nName: ActivityTracker");
  });
});

// ---- live-p5dog day 2 (23 Oct): posts 4 and 11 reached the editor with an empty caption -----------------------------
// calls/day2/AV-04 and AV-11: the writer gave an AI video a hook, a script and a cta, and nothing to post under it

describe("an AI video's caption (live-p5dog day 2: both AI video posts had no caption or call to action)", () => {
  // calls/day2/AV-04's script as it came back, with a caption the writer would now send
  const AV_04 = "Before, follow-ups can sit apart from client chats.\nNow, keep them as tasks in the app you use to manage clients and chats.\nYour next action stays with the client work.\nSave this to revisit your follow-up workflow.";
  const req = campaignRequest({ ...CAMPAIGN_ASK, posts: [postAskOf(4, "ai-video")] });
  const video = (body: string) => validateCampaign({ posts: [{ n: 4, hook: "", body, script: AV_04, brief: "", cta: "" }] }, req)![0];

  it("asks for a caption in body, without the call to action, on the format and on the post's Words line", () => {
    const { system, user } = buildCampaignPrompt(req);
    expect(system).toContain("hook is the first line and cta the last. body is the post's caption: one to three sentences, at most 40 words, on what the video is about, without the call to action.");
    expect(user).toContain("Words: script about 42 spoken words in all (36 to 48), counted across every line; caption at most 40 words");
  });

  it("keeps the caption in body beside the spoken cta, so caption and cta make the post's words", () => {
    const got = video("Follow-ups get lost when they sit apart from the chat. Keep each one as a task beside the client.");
    expect(got).toMatchObject({ body: "Follow-ups get lost when they sit apart from the chat. Keep each one as a task beside the client.", cta: "Save this to revisit your follow-up workflow." });
    expect(got.script).toBe(AV_04);
  });

  it("takes the angle's line when the caption is missing, and drops a caption line that repeats the cta", () => {
    expect(video("").body).toBe("Most deals die in the follow-up, not the pitch.");
    expect(video("Keep each follow-up beside the client. Save this to revisit your follow-up workflow.").body).toBe("Keep each follow-up beside the client.");
    expect(video(words(60)).body!.split(" ")).toHaveLength(40);
  });

  it("lets a person's MAS question read the caption as well as the script", () => {
    const got = video("Follow-ups get lost when they sit apart from the chat.");
    expect(masAsk([got]).state.post_4).toBe(`${AV_04}\n\nFollow-ups get lost when they sit apart from the chat.`);
  });
});

// ---- live-p5dog day 2 (23 Oct): check campaign post 5, a carousel, promised 3 and listed 5 --------------------------
// calls/day2/CK-campaign-store.json post 5 as it came back; Fastlane's post 13 made the same mismatch

describe("a hook's count matches its list (live-p5dog day 2 N6: '3 things we wish we knew' over 5 points)", () => {
  const POST_5 = {
    n: 2,
    hook: "3 things we wish we knew",
    body: "Keep client tasks beside client details.\n\nSee follow-ups and sales activity in one phone app.\n\nUse the shared WhatsApp inbox alongside your client work.\n\nLog activity in one tap and keep goals in view.\n\nBring CRM, chats, tasks and goals together in your sales routine.",
    script: "",
    brief: "",
    cta: 'DM us "TASKS" to learn how the app can fit into your sales routine.',
  };
  const one = (over: Record<string, string>, dropped: [number, string][] = []) => validateCampaign(written({ ...over }), campaignRequest(), dropped)!;
  const carousel = (hook: string, dropped: [number, string][] = []) => validateCampaign({ posts: [{ ...POST_5, hook }] }, campaignRequest({ ...CAMPAIGN_ASK, posts: [postAskOf(2, "carousel")] }), dropped)!.find((p) => p.n === 2);

  it("tells the writer a carousel's and a slideshow's count matches the hook's", () => {
    const { system } = buildCampaignPrompt(campaignRequest());
    expect(system).toContain("each point becomes one slide. A hook that names a number of points has exactly that many. cta is one line.");
    expect(system).toContain("one point per line, for the slides made from it later. A hook that names a number has exactly that many lines. cta is one line.");
  });

  it("sets a carousel cover's number to its points, as a digit or a word, and keeps one that matches", () => {
    expect(carousel("3 things we wish we knew")).toMatchObject({ hook: "5 things we wish we knew", body: POST_5.body });
    expect(carousel("Three ways to log calls")!.hook).toBe("Five ways to log calls");
    expect(carousel("our top 7 sales habits")!.hook).toBe("our top 5 sales habits");
    expect(carousel("Five follow-up habits")!.hook).toBe("Five follow-up habits");
    expect(carousel("One tap logs sales activity")!.hook).toBe("One tap logs sales activity");
  });

  it("drops a cover whose number can't be set safely, with the rule for the log, so the job writes it again", () => {
    const dropped: [number, string][] = [];
    expect(carousel("3 things in 3 taps", dropped)).toBeUndefined();
    expect(dropped).toEqual([[2, "hook promises 3, body has 5 points"]]);
  });

  it("sets a slideshow hook's number to its brief's lines, and leaves a one-line brief and a wall alone", () => {
    const got = one({});
    expect(got.find((p) => p.n === 5)!.hook).toBe("Three messages that bring a lead back");
    const set = validateCampaign(
      written({ 5: { hook: "5 signs a lead has gone cold", brief: "No reply in a week\nRead, not answered\nA meeting moved twice" }, 6: { hook: "3 mistakes we see", brief: "One bold line on why checking in fails." } }),
      campaignRequest(),
    )!;
    expect(set.find((p) => p.n === 5)!.hook).toBe("3 signs a lead has gone cold");
    expect(set.find((p) => p.n === 6)!.hook).toBe("3 mistakes we see");
    const prose = validateCampaign(written({ 5: { hook: "5 signs a lead has gone cold", brief: "Why silence after a demo means the timing is off." } }), campaignRequest())!;
    expect(prose.find((p) => p.n === 5)!.hook).toBe("5 signs a lead has gone cold");
  });
});

// ---- live-p5dog day 2 (23 Oct): the D9 round kept "Log activity quickly", the used "One-tap activity log" again --------
// function-logs-day2 02:59:15: the 8 candidates with their fits; calls/day2/292 sent the 5 used titles as avoid

describe("new angles against used ones (live-p5dog day 2 D9: 'Log activity quickly' was 'One-tap activity log' again)", () => {
  const LIVE = [
    ["Client details in reach", 0.68],
    ["Targets on your phone", 0.68],
    ["A shared inbox", 0.65],
    ["Log activity quickly", 0.69],
    ["Tasks beside client work", 0.67],
    ["A clearer sales routine", 0.71],
    ["For independent sales", 0.68],
    ["For coaching sales", 0.67],
  ] as const;
  const USED = ["One-tap activity log", "Follow-up tasks", "WhatsApp workflow", "Chat to follow-up", "Work in one app"];
  const cands = LIVE.map(([title]) => ({ title, line: `Why ${title.toLowerCase()} matters.` }));
  const fitsOf = LIVE.map(([, fit]) => ({ fits: { type: "noul" as const, noul: fit }, unsafe: { type: "noul" as const, noul: 0.1 } }));
  const noul = (noul: number) => ({ type: "noul" as const, noul });
  // the live run's one close pair, and the used reads this adds
  const SAME = { same_0_5: noul(0.8) };

  it("asks in the same request whether each candidate is a used angle again, and only the pairs with nothing used", () => {
    const ask = sameAsk(cands, USED)!;
    expect(Object.keys(ask.questions)).toHaveLength(28 + 8);
    expect(Object.keys(ask.questions).slice(-8)).toEqual(["used_0", "used_1", "used_2", "used_3", "used_4", "used_5", "used_6", "used_7"]);
    expect(String(ask.questions.used_3.instructions)).toContain("`angle_3`");
    expect(String(ask.questions.used_3.instructions)).toContain("any angle listed in `used`");
    expect(ask.state.used).toBe("- One-tap activity log\n- Follow-up tasks\n- WhatsApp workflow\n- Chat to follow-up\n- Work in one app");
    expect(ask.state.angle_3).toBe("Log activity quickly: Why log activity quickly matters.");
    expect(Object.keys(sameAsk(cands.slice(0, 1), USED)!.questions)).toEqual(["used_0"]);
    expect(sameAsk(cands)).toEqual({ state: Object.fromEntries(cands.map((a, i) => [`angle_${i}`, `${a.title}: ${a.line}`])), questions: sameAsk(cands)!.questions });
    expect(Object.keys(sameAsk(cands)!.questions)).toHaveLength(28);
    expect(sameAsk(cands.slice(0, 1), [])).toBeNull();
  });

  it("drops a candidate Jev reads as a used angle at ANGLE_SAME, so the live round keeps two others in place of the near-copies", () => {
    expect(keepAngles(cands, fitsOf, SAME).angles.map((a) => a.title)).toEqual(["A clearer sales routine", "Log activity quickly", "Targets on your phone", "For independent sales", "Tasks beside client work"]);
    const same = { ...SAME, used_3: noul(0.9), used_4: noul(0.5), used_2: noul(0.49) };
    expect(keepAngles(cands, fitsOf, same).angles.map((a) => a.title)).toEqual(["A clearer sales routine", "Targets on your phone", "For independent sales", "For coaching sales", "A shared inbox"]);
    // the unscored fallback leaves them out too
    expect(keepAngles(cands, Array(8).fill(null), { used_0: noul(0.7) }).angles.map((a) => a.title)).toEqual(["Targets on your phone", "A shared inbox", "Log activity quickly", "Tasks beside client work", "A clearer sales routine"]);
  });
});
