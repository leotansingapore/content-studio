import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { buildProfileRewritePrompt, parseJudgeRequest, profileQuestions, profileState, type ProfileRequest } from "./logic";

const BODIES = [
  { mode: "profile", platform: "instagram", name: "Jane Tan", bio: "Helping you start", pinned: ["My story"], top: ["Three things to try"], link: null },
  { mode: "profile", platform: "tiktok", name: "", bio: "", pinned: [], top: [], link: "https://jane.example" },
];
const profile = (b: Record<string, unknown>) => {
  const r = parseJudgeRequest(b);
  if (!r.ok || r.request.mode !== "profile") throw new Error("not a profile request");
  return r.request as ProfileRequest;
};
const prompts = (extra: Record<string, unknown> = {}) =>
  BODIES.map((b) => {
    const r = profile({ ...b, ...extra });
    return { state: profileState(r), questions: profileQuestions(r), rewrite: buildProfileRewritePrompt(r, ["name", "bio"]) };
  });

describe("the profile score for the brand's profession", () => {
  it("a caller with no profession, or an adviser's, gets today's Jev questions and rewrite prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/profile-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it("puts the profession in cleaned and as typed, never read as a replace pattern", () => {
    const [p] = prompts({ profession: "$&-maker" });
    expect(p.state.role).toBe("a &-maker");
    expect(p.rewrite.system).toContain("You rewrite the profile of a &-maker on Instagram.");
  });

  it.each(PROFESSIONS)("$raw is scored and rewritten for their work, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.state.role).toBe(`a ${said}`);
      expect(p.questions.name.instructions).toContain("what this person (`role`) does and for whom");
      expect(p.questions.name.criteria).toContain("A name plus a job title or industry only.");
      expect(p.rewrite.system).toContain(`You rewrite the profile of a ${said} on`);
      expect(p.rewrite.system).toContain(`Rules: ${HONEST_LINE} No hashtags, no em dashes, plain words.`);
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
