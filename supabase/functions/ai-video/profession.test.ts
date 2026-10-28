import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { parseVideoRequest, scriptPrompt } from "./logic";

// Leo's standing rule: AI people are Singaporean by default, whatever the brand does (kept, so not an adviser word here)
const SCRIPT_PEOPLE = "people are Singaporean (Chinese, Malay, Indian or Eurasian)";

const TOPIC = "Three things to check before you start";
const scriptPrompts = (extra: Record<string, unknown> = {}) => {
  const r = parseVideoRequest({ mode: "script", topic: TOPIC, ...extra });
  if (!r.ok || r.request.mode !== "script") throw new Error("bad fixture");
  return [scriptPrompt(r.request)];
};

describe("the explainer script for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(scriptPrompt({ topic: TOPIC, profession: "$&-maker" }).system).toContain("You write short explainer videos for a $&-maker to post");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(scriptPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/script-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(scriptPrompts({ profession })).toEqual(scriptPrompts());
  });

  it.each(PROFESSIONS)("$raw gets an explainer written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of scriptPrompts({ profession: raw })) {
      expect(p.system).toContain(`You write short explainer videos for a ${said} to post on Reels, TikTok and Shorts.`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(p.system).toContain(SCRIPT_PEOPLE);
      expect(adviserWordsIn(JSON.stringify(p).replace(SCRIPT_PEOPLE, ""))).toEqual([]);
    }
  });
});
