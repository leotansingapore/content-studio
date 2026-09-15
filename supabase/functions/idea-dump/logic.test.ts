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
