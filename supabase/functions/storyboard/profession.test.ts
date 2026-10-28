import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildStoryboardPrompt, parseStoryboardRequest } from "./logic";

const SCRIPT = "HOOK: Most people start too late.\nBODY: Here is the one step that makes the rest easy.\nCTA: Comment START and I'll send the list.";
const BODIES = [{ script: SCRIPT, topic: "Starting early" }, { script: SCRIPT }];
const prompts = (extra: Record<string, unknown> = {}) =>
  BODIES.map((b) => {
    const r = parseStoryboardRequest({ ...b, ...extra });
    if (!r.ok) throw new Error(r.error);
    return buildStoryboardPrompt(r.value);
  });

describe("storyboard for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildStoryboardPrompt({ script: SCRIPT, topic: "", profession: "$&-maker" }).system).toContain("You turn a $&-maker's short-video script");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets a shot list prompt written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(`a ${said}'s short-video script`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
