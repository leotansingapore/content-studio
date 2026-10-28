import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildVisualsPrompt, parseVisualsRequest, visualsFormat } from "./logic";

const FRAME = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const BODY = {
  frames: [{ t: 0, image: FRAME }, { t: 2.5, image: FRAME }],
  pacing: { durationSec: 21, cuts: 6, avgShotSec: 3, cutsFirst3s: 1 },
  beats: ["Most people start too late.", "Here is the one step that makes the rest easy.", "Comment START and I'll send the list."],
};
const prompts = (extra: Record<string, unknown> = {}) => {
  const r = parseVisualsRequest({ ...BODY, ...extra });
  if (!r.ok) throw new Error(r.error);
  return [{ ...buildVisualsPrompt(r.value), format: visualsFormat(r.value.profession) }];
};

describe("Clone a reel's shot plan for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildVisualsPrompt({ ...BODY, profession: "$&-maker" }).system).toContain("You help a $&-maker learn how short videos");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt and schema byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/visuals-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets the shot plan and its schema written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(`You help a ${said} learn how short videos that did well LOOK`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(p.parts.at(-1)).toEqual({ type: "text", text: `For myVisuals only, their version, one beat per line:\n${BODY.beats.map((b, i) => `${i + 1}. ${b}`).join("\n")}` });
      expect(p.format.json_schema.schema.properties.myVisuals.description).toBe("One shot per beat of their version");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
