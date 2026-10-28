import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildIdeaDumpPrompt, buildLongPrompt, LONG_POSTS, parseIdeaDumpRequest, parseLongRequest } from "./logic";

const CONTEXT = {
  voice: "Warm and plain. Short sentences.",
  positioning: { oneLiner: "I help new managers lead", audienceDetail: "first-time team leads", topics: ["feedback", "one-to-ones"], edge: "Ten years in the job" },
  platforms: ["linkedin", "instagram"],
};
const NOTES = "people wait too long to ask for help\nthe one question I ask every new client\nwhy I stopped doing free calls";
const PIECE = Array.from({ length: 30 }, (_, i) => `Point ${i + 1}: most people start too late, and the fix is one small step each week.`).join(" ");
const FORMULAS = Array.from({ length: LONG_POSTS }, (_, i) => ({ id: `f-${"abcde"[i]}`, name: `Formula ${i + 1}`, template: `Shape ${i + 1} about {thing}` }));

/** What the function builds for everyone (not on NORTH_STAR_USERS): a brief run and a long run, as index.ts calls them. */
const prompts = (extra: Record<string, unknown> = {}) =>
  [{ notes: NOTES, ...CONTEXT }, { notes: NOTES }].flatMap((b) => {
    const brief = parseIdeaDumpRequest({ ...b, ...extra });
    const long = parseLongRequest({ ...b, mode: "long", text: PIECE, formulas: FORMULAS, ...extra });
    if (!brief.ok || !long.ok) throw new Error("bad fixture");
    return [buildIdeaDumpPrompt(brief.request), buildLongPrompt({ ...long.request, source: "text", speaker: "person" })];
  });

describe("Idea Dump and One long piece for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    const brief = parseIdeaDumpRequest({ notes: NOTES, ...CONTEXT });
    const long = parseLongRequest({ mode: "long", text: PIECE, formulas: FORMULAS, ...CONTEXT });
    if (!brief.ok || !long.ok) throw new Error("bad fixture");
    const context = { ...brief.request.context, profession: "$&-maker" };
    expect(buildIdeaDumpPrompt({ ...brief.request, context }).system).toContain("Develop what the $&-maker meant.");
    const week = buildLongPrompt({ ...long.request, context, source: "text", speaker: "person" }).system;
    expect(week).toContain("You are a content writer for a $&-maker. The $&-maker has pasted");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets briefs and a week of posts written for them, with none of the adviser words", ({ raw, said }) => {
    const [brief, long] = prompts({ profession: raw });
    expect(brief.system).toContain(`You are a content strategist for a ${said}.`);
    expect(long.system).toContain(`You are a content writer for a ${said}.`);
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain("never invent a client story, a statistic, a number, a result or a testimonial");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
