import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { buildIdeasPrompt } from "../_shared/postIdeas";
import { HONEST_LINE } from "../_shared/profession";
import type { RatedPost } from "../_shared/socialAudit";

const rated = (id: string, caption: string, ratio: number | null): RatedPost => ({
  id, url: `https://example.com/${id}`, format: "video", caption, postedAt: "2026-09-01T00:00:00.000Z", views: 1000, likes: 10,
  comments: 1, shares: null, saves: null, durationSec: 40, pinned: false, collab: false, interactions: 11, ratio, young: false,
});
const POSTS = [rated("p1", "The one habit that changed my mornings", 5.2), rated("p2", "Day in my life", 0.3), rated("p3", "What nobody tells you on day one", 1)];
const BODIES = [
  { platform: "instagram" as const, profile: { handle: "jane", url: "", fullName: "Jane Tan", bio: "Helping you start", followers: 900, postsCount: 3, verified: false, isPrivate: false } },
  { platform: "tiktok" as const, profile: null },
];
const prompts = (extra: { profession?: string } = {}) =>
  BODIES.map((b) => buildIdeasPrompt({ ...b, stats: { topIds: ["p1"], weakIds: ["p2"] }, posts: POSTS, previous: [{ hook: "Start small", status: "dismissed" }], count: 8, ...extra }));

describe("post ideas in your style for the brand's profession", () => {
  it("a caller with no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it("puts the profession in cleaned and as typed, never read as a replace pattern", () => {
    expect(prompts({ profession: "$&-maker" })[0].system).toContain("strategist for a &-maker. You study");
  });

  it.each(PROFESSIONS)("$raw gets ideas written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(`You are a short-form content strategist for a ${said}. You study`);
      expect(p.system).toContain(`- Stay honest: ${HONEST_LINE}`);
      expect(p.system).toContain("Write in the language their captions use.\n- hook:");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
