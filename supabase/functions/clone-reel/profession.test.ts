import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildClonePrompt, buildConceptPrompt, type CloneSource, type HookFormulaInput, type VoiceInput } from "./logic";

const SOURCE: CloneSource = {
  platform: "instagram",
  postId: "abc",
  url: "https://www.instagram.com/reel/abc/",
  author: "someone",
  caption: "Three things I would do again.",
  transcript: "Here are three things I would do again if I started today.",
  isVideo: true,
  postedAt: "2026-10-01T00:00:00Z",
  durationSec: 32,
  metrics: { views: 120000, likes: 4000, comments: 210, shares: 90, saves: 300 },
  metricsAsOf: "2026-10-02T00:00:00Z",
};
const VOICE: VoiceInput = { summary: "Warm and plain.", samples: ["Short lines. One idea."], winners: [{ hook: "Start small", result: "2,000 views" }] };
const FORMULAS: HookFormulaInput[] = [
  { name: "Question", template: "Did you know {thing}?", example: "Did you know most people start too late?", trap: "A question nobody asks" },
  { name: "Mistake", template: "The mistake I made with {thing}", example: "", trap: "" },
  { name: "List", template: "{N} things about {thing}", example: "3 things about starting", trap: "Too many points" },
];
const BRIEF = { angle: "What I wish I knew in year one", positioning: { oneLiner: "I help new managers lead", audience: "working adult", topics: ["feedback"], edge: "Ten years in the job" } };
const CONCEPT = { title: "Three things I would do again", keeps: "The list and the pace", changes: "The topic" };

const prompts = (profession?: string) => {
  const brief = (b: object) => (profession === undefined ? b : { ...b, profession });
  const extra = profession === undefined ? [] : [profession];
  return [
    profession === undefined ? buildClonePrompt(SOURCE, null) : buildClonePrompt(SOURCE, null, [], { profession }),
    buildClonePrompt(SOURCE, VOICE, FORMULAS, brief({})),
    buildClonePrompt(SOURCE, VOICE, FORMULAS, brief(BRIEF)),
    buildClonePrompt({ ...SOURCE, transcript: null, metrics: null }, null, [], brief({ angle: "My first year" })),
    buildConceptPrompt(SOURCE, VOICE, CONCEPT, FORMULAS, ...extra),
    buildConceptPrompt(SOURCE, null, CONCEPT, [], ...extra),
  ];
};

describe("Clone a reel for the brand's profession", () => {
  it("a caller that sends no profession, or an adviser's, gets today's prompts byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts(profession)).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets the breakdown, concepts and their version written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts(raw)) {
      expect(p.system).toContain(`You help a ${said} learn from short videos`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
