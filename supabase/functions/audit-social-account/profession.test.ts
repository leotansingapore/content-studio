import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { buildAdvicePrompt, computeAudit, type AuditPlatform, type SocialPost } from "../_shared/socialAudit";

const NOW = Date.parse("2026-09-15T00:00:00Z");
const post = (id: string, views: number, daysAgo: number): SocialPost => ({
  id, url: `https://example.com/${id}`, format: "video", caption: `Three things to try this week, part ${id}`,
  postedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(), views, likes: views / 100, comments: 2,
  shares: 0, saves: 0, durationSec: 30, pinned: false, collab: false,
});
const POSTS = [post("a", 1000, 9), post("b", 4000, 8), post("c", 900, 7), post("d", 1200, 6), post("e", 300, 5), post("f", 5000, 0.04)];
const PROFILE = { handle: "jane", url: "", fullName: "Jane Tan", bio: "Helping you start", followers: 5000, postsCount: 6, verified: false, isPrivate: false };
const prompts = (extra: { profession?: string } = {}) =>
  (["instagram", "tiktok"] as AuditPlatform[]).map((platform) => {
    const { posts, stats } = computeAudit(POSTS, platform, 5000, NOW);
    return buildAdvicePrompt({ platform, profile: PROFILE, stats, posts, ...extra });
  });

describe("the account audit's advice for the brand's profession", () => {
  it("a caller with no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    for (const profession of ["", "Financial adviser", " financial ADVISOR "]) expect(prompts({ profession })).toEqual(prompts());
  });

  it("puts the profession in cleaned and as typed, never read as a replace pattern", () => {
    expect(prompts({ profession: "$&-maker" })[0].system).toContain("You audit the Instagram account of a &-maker. You get");
  });

  it.each(PROFESSIONS)("$raw gets advice written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of prompts({ profession: raw })) {
      expect(p.system).toContain(`account of a ${said}. You get their recent posts`);
      expect(p.system).toContain(`- Stay honest: ${HONEST_LINE}`);
      expect(p.system).toContain("- Write for them: plain English");
      expect(adviserWordsIn(JSON.stringify(p))).toEqual([]);
    }
  });
});
