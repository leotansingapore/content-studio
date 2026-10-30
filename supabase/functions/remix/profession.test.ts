// The slideshow make (on for everyone 30 Oct) for the brand's profession: an adviser, or a caller that sends none, gets
// today's prompt byte for byte (pinned before the change); any other profession gets none of the adviser words.
import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { buildMakePrompt, parseMakeRequest } from "./logic";

const SOURCE = {
  key: "top:jane-instagram-C1",
  kind: "top-post",
  format: "carousel",
  platform: "instagram",
  author: "@jane",
  title: "3 signs",
  text: "3 signs your week is too full. 1. You eat lunch at your desk. 2. You answer email at midnight. 3. You skip the gym.",
};
const BRAND = { name: "Jane Tan", oneLiner: "", audience: "busy parents", topics: [], facts: "", mention: true, offer: null, rules: "" };
const BODIES = [
  { mode: "make", as: "slideshow", topic: "Signs your week is too full" },
  { mode: "make", as: "slideshow", source: SOURCE },
  { mode: "make", as: "slideshow", topic: "Signs your week is too full", brandAt: "inside", note: "I run a 6am class on Tuesdays." },
  { mode: "make", as: "slideshow", source: SOURCE, brand: { ...BRAND, topics: ["Morning routines"], mention: false } },
];
const prompts = (brand: Record<string, unknown> = {}) =>
  BODIES.map((b) => {
    const r = parseMakeRequest({ ...b, brand: { ...BRAND, ...(b as { brand?: object }).brand, ...brand } });
    if (!r.ok) throw new Error(r.error);
    return buildMakePrompt(r.value);
  });

describe("the slideshow make for the brand's profession", () => {
  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-slideshow-prompts.json");
    for (const profession of ["", "Financial adviser", "financial advisor"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets a slideshow prompt written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(said);
      expect(p.system).toContain(HONEST_LINE);
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });

  it("puts the profession in as typed, never read as a replace pattern", () => {
    const r = parseMakeRequest({ ...BODIES[0], brand: BRAND });
    if (!r.ok) throw new Error(r.error);
    expect(buildMakePrompt({ ...r.value, brand: { ...r.value.brand, profession: "$&-maker" } }).system).toContain("You help a $&-maker write a new post");
  });

  it("leaves a business brand's prompt alone, whatever profession is sent", () => {
    expect(prompts({ speaker: "business", profession: "Coach" })).toEqual(prompts({ speaker: "business" }));
  });
});

describe("Jev's make questions for the brand's profession", () => {
  it("asks about the coach, not the adviser, and leaves the adviser's and a business's questions as they were", async () => {
    const { MAKE_QUESTIONS, makeQuestions } = await import("./logic");
    expect(makeQuestions("person")).toBe(MAKE_QUESTIONS);
    expect(makeQuestions("person", "")).toBe(MAKE_QUESTIONS);
    const coach = makeQuestions("person", "coach");
    expect(coach.copied_claim).toEqual(MAKE_QUESTIONS.copied_claim);
    expect(coach.invented_self.instructions).toBe("Does `post` say something about the coach, their clients or their results that is not in `facts`?");
    expect(makeQuestions("business", "coach")).toEqual(makeQuestions("business"));
  });
});
