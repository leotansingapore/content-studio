import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { buildCaptionsMessages, keywordCandidates, keywordQuestion, parseCaptionsRequest, type Keyword } from "./captions";
import { buildHooksMessages, hooksState, parseHooksRequest } from "./hooks";

const SAID = "Most people start too late. Here is the one step that makes the rest easy. Comment START and I will send you the list.";
const KEYWORD: Keyword = { word: "START", verb: "comment" };
const BODIES = [
  { transcript: SAID },
  { transcript: SAID, instagram: "One step today.", title: "Start early", rules: "Use one emoji at most." },
];
const prompts = (extra: Record<string, unknown> = {}) =>
  BODIES.flatMap((b) => {
    const c = parseCaptionsRequest({ ...b, ...extra });
    if (!c.ok) throw new Error(c.error);
    const args = [c.transcript, c.instagram, c.title, c.rules] as const;
    return [
      buildCaptionsMessages(...args, null, c.profession),
      buildCaptionsMessages(...args, KEYWORD, c.profession),
      keywordQuestion(keywordCandidates(c.transcript), c.profession),
    ];
  });

describe("video captions for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(JSON.stringify(buildCaptionsMessages(SAID, "", "", "", null, "$&-maker"))).toContain("a short video a $&-maker filmed");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts and keyword question byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/captions-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets captions and the keyword question written for them, with none of the adviser words", ({ raw, said }) => {
    const out = prompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`a short video a ${said} filmed`);
    expect(JSON.stringify(out[2])).toContain(`A ${said} says this in a short video.`);
    expect(JSON.stringify(out[0])).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("the hook card for the brand's profession", () => {
  const LINES = [
    { s: 0, e: 2.5, text: "Most people start too late." },
    { s: 2.5, e: 6, text: "Here is the one step that makes the rest easy." },
  ];
  const FORMULAS = [
    { id: "warning", name: "Warning", template: "Stop doing {thing} before it costs you.", example: "Stop doing this before it costs you.", trap: "A vague threat" },
    { id: "list", name: "List", template: "{N} ways to {thing}", example: "3 ways to start", trap: "Too many points" },
  ];
  const hookPrompts = (extra: Record<string, unknown> = {}) => {
    const h = parseHooksRequest({ sentences: LINES, duration: 6, formulas: FORMULAS, ...extra });
    if (!h.ok) throw new Error(h.error);
    return [buildHooksMessages(h.lines, h.formulas, h.profession), hooksState(["Start today", "One step"], h.lines, h.profession)];
  };

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(JSON.stringify(buildHooksMessages(LINES, FORMULAS, "$&-maker"))).toContain("a short video a $&-maker filmed");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt and Jev state byte for byte", async () => {
    await expect(JSON.stringify(hookPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/hooks-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(hookPrompts({ profession })).toEqual(hookPrompts());
  });

  it.each(PROFESSIONS)("$raw gets hooks written for them, with none of the adviser words", ({ raw, said }) => {
    const out = hookPrompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`a short video a ${said} filmed`);
    expect(JSON.stringify(out[0])).toContain(HONEST_LINE);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});
