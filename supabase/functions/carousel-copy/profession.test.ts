import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildCarouselPrompt, parseCarouselRequest } from "./logic";

const SLIDES = [
  { title: "Start before you feel ready", body: "" },
  { title: "Pick one step", body: "The smallest one you can do today." },
  { title: "Do it on the same day each week", body: "Habits beat motivation." },
  { title: "Check in after a month", body: "Look at what changed." },
  { title: "Comment START", body: "I'll send you the list." },
];
const BODIES = [
  { slides: SLIDES, platform: "instagram", recap: false },
  { slides: SLIDES, platform: "linkedin", recap: true },
  { slides: SLIDES.slice(0, 2), platform: "instagram" },
];
const prompts = (extra: Record<string, unknown> = {}) =>
  BODIES.map((b) => {
    const r = parseCarouselRequest({ ...b, ...extra });
    if (!r.ok) throw new Error(r.error);
    return buildCarouselPrompt(r.request);
  });

describe("Tighten with AI for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildCarouselPrompt({ slides: SLIDES, platform: "instagram", recap: false, profession: "$&-maker" }).system).toContain("carousel slides for a $&-maker.");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets slides edited for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(`carousel slides for a ${said}.`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
