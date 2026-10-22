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

import { BUSINESS_VOICE } from "../remix/logic.ts";
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

  it("cuts over-length fields at a word and removes em dashes", () => {
    const got = validateCampaign(
      written({
        1: { hook: `Follow-ups — the part ${words(20, "nobody")}`, body: words(240) },
        2: { hook: "Seven words is too long for a cover", body: Array.from({ length: 9 }, (_, i) => `Point ${i} ${words(50)}`).join("\n\n") },
        5: { hook: words(14, "slide"), brief: words(50, "point") },
      }),
      campaignRequest(),
    )!;
    const [text, carousel] = got;
    expect(text.hook).toMatch(/^Follow-ups, the part nobody/);
    expect(countWords(text.hook)).toBe(15);
    expect(countWords(text.body!)).toBe(220);
    expect(carousel.hook).toBe("Seven words is too long for");
    expect(carousel.body!.split("\n\n")).toHaveLength(8);
    expect(carousel.body!.split("\n\n").every((p) => countWords(p) <= 40)).toBe(true);
    expect(countWords(got.find((p) => p.n === 5)!.hook)).toBe(12);
    expect(countWords(got.find((p) => p.n === 5)!.brief!)).toBe(40);
    expect(JSON.stringify(got)).not.toMatch(/[–—]/);
  });

  it("drops a post that can't meet its format: short bodies, too few points, scripts outside their length", () => {
    const keptOf = (over: Record<number, Record<string, string>>) => validateCampaign(written(over), campaignRequest())!.map((p) => p.n);
    expect(keptOf({ 1: { body: words(79) } })).not.toContain(1);
    expect(keptOf({ 1: { cta: "" } })).not.toContain(1);
    expect(keptOf({ 2: { body: "One.\n\nTwo.\n\nThree." } })).not.toContain(2);
    expect(keptOf({ 3: { script: `HOOK: Short.\nBODY: ${words(40)}\nCTA: Save it.` } })).not.toContain(3);
    expect(keptOf({ 3: { script: `HOOK: Long.\nBODY: ${words(95)}\nCTA: Save it.` } })).not.toContain(3);
    expect(keptOf({ 5: { brief: "" } })).not.toContain(5);
  });

  it("holds an AI video script to 36 to 48 spoken words, labels and all", () => {
    const ai = (script: string) => validateCampaign(written({ 4: { script } }), campaignRequest())!.find((p) => p.n === 4);
    expect(ai([1, 2, 3].map(tenWords).join(" ") + " Five more words right here.")).toBeUndefined(); // 35 words
    expect(countWords(ai([1, 2, 3].map(tenWords).join(" ") + " Six more words right here now.")!.script!)).toBe(36);
    expect(countWords(ai([1, 2, 3, 4].map(tenWords).join(" ") + " Eight more words fit in this one too.")!.script!)).toBe(48);
    // 49 words: the last sentence before the call to action goes (wave 1 live check fix), 39 words
    expect(ai([1, 2, 3, 4].map(tenWords).join(" ") + " Nine more words do not fit in this one.")!.script!.split("\n")).toEqual([...[1, 2, 3].map(tenWords), "Nine more words do not fit in this one."]);
    expect(ai([1, 2, 3, 4, 5].map(tenWords).join(" ") + " Six more words do not fit.")).toBeUndefined(); // 56 words
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
    body: "I understand why a busy father might leave money in the bank. It is familiar, accessible and easy to track between work deadlines and family routines.\n\nBut when everyday costs rise, the amount your cash can buy may change over time. That does not mean you should rush to invest it. It means it can help to be clear about what the money is for, when you may need it and how much you want readily available.\n\nI find that separating short-term needs from longer-term goals is a useful place to start. It turns “I’ll deal with this later” into a question you can actually work through, without making a decision on the spot.",
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
    expect(system).toContain("- Count the words: a post outside the word range on its Words line cannot be used.");
    expect(user).toContain("Post 1: text-post, attraction stage, call to action open-question, for linkedin\nAngle: Money sitting idle: Cash left in the bank feels safe but quietly loses ground to rising costs.\nWords: hook at most 15 words; body 80 to 220 words");
    expect(user).toContain("Angle: Jargon-free plans: A one-page plan beats a 40-page report you never read again.\nWords: cover at most 6 words; 4 to 8 points of at most 40 words each");
    expect(user).toContain("instead of daily.\nWords: script 60 to 90 words across its HOOK, BODY and CTA lines");
    expect(user).toContain("Start with what you need to stay liquid.\nWords: script 36 to 48 words in all");
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

  it("drops a script over its top by more than 15%, and cuts a short video's body sentences, never its HOOK or CTA line", () => {
    const body = (k: number) => Array.from({ length: k }, (_, i) => tenWords(i + 1)).join(" ");
    const short = (k: number) => `HOOK: Busy fathers can still invest well.\nBODY: ${body(k)}\nCTA: Comment PLAN below.`; // 6 + 10k + 3 words
    const dropped: [number, string][] = [];
    const got = validateCampaign(reply({ 3: short(9), 4: `${AI_51} Nothing gets decided on the spot.` }), live, dropped)!;
    expect(got.find((p) => p.n === 3)!.script).toBe(`HOOK: Busy fathers can still invest well.\nBODY: ${body(8)}\nCTA: Comment PLAN below.`); // 99 words to 89
    expect(dropped).toEqual([[4, "script 57 words, needs 36 to 48"]]);
    const over: [number, string][] = [];
    validateCampaign(reply({ 3: short(10) }), live, over);
    expect(over).toEqual([[3, "script 109 words, needs 60 to 90"], [4, "no script"]]);
  });

  it("names the rule each dropped post broke, for every format", () => {
    const dropped: [number, string][] = [];
    validateCampaign(
      written({ 1: { body: words(79) }, 2: { body: "One.\n\nTwo.\n\nThree." }, 3: { script: `HOOK: Short.\nBODY: ${words(40)}\nCTA: Save it.` }, 4: { script: "One line only" }, 5: { brief: "" }, 6: { cta: "" } }),
      campaignRequest(),
      dropped,
    );
    expect(dropped).toEqual([[1, "body 79 words, needs 80 to 220"], [2, "3 points, needs 4 to 8"], [3, "script 43 words, needs 60 to 90"], [4, "one line"], [5, "no brief"], [6, "no cta"]]);
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

import { MAS_QUESTION } from "../_shared/mas.ts";
import { masAsk, withMas } from "./logic.ts";

describe("campaign MAS question", () => {
  const posts = validateCampaign(written(), campaignRequest())!;

  it("asks mas_<n> on MAS_QUESTION about each post's own words, a script as written", () => {
    const { state, questions } = masAsk(posts);
    expect(Object.keys(questions)).toEqual(["mas_1", "mas_2", "mas_3", "mas_4", "mas_5", "mas_6"]);
    expect(questions.mas_4).toEqual({ type: "noul", instructions: `Read only \`post_4\`. ${MAS_QUESTION}` });
    expect(state.post_1).toBe(`Most reps lose the deal after the first call\n\n${words(100)}\n\nSave this for your next follow-up.`);
    expect(state.post_4).toBe(posts[3].script);
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
