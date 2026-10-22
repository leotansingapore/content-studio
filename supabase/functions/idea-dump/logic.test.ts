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
