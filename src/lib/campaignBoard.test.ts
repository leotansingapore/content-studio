import { describe, expect, it } from "vitest";
import { boardCounts, boardWeeks, countsText, frames, plannedByDay } from "./campaignBoard";
import type { CampaignPost } from "./campaigns";

const post = (n: number, day: string, o: Partial<CampaignPost> = {}): CampaignPost => ({
  n, day, angleId: "a1", format: "text-post", stage: "awareness" as CampaignPost["stage"], pillar: "educate" as CampaignPost["pillar"], ctaType: "follow", state: "ready", hook: `Hook ${n}`, ...o,
});

describe("All posts by week", () => {
  it("groups posts by week from the start day, with each week's dates and what is still to make", () => {
    const posts = [
      post(3, "2026-11-23", { format: "ai-video" }),
      post(1, "2026-11-16", { format: "ai-video" }),
      post(2, "2026-11-22", { format: "ai-video", state: "made" }),
      post(4, "2026-12-07", { format: "slideshow", state: "skipped" }),
    ];
    const weeks = boardWeeks({ startDay: "2026-11-16" }, posts, (p) => (p.format === "ai-video" ? 2.77 : 0.5));
    expect(weeks.map((w) => [w.week, w.from, w.to, w.posts.map((p) => p.n), w.usd])).toEqual([
      [1, "2026-11-16", "2026-11-22", [1, 2], 2.77],
      [2, "2026-11-23", "2026-11-29", [3], 2.77],
      // week 3 has no post and is left out; a skipped post costs nothing
      [4, "2026-12-07", "2026-12-13", [4], 0],
    ]);
  });

  it("lists a week's posts in post order, whatever order they arrive in", () => {
    const weeks = boardWeeks({ startDay: "2026-11-16" }, [post(3, "2026-11-23"), post(2, "2026-11-16"), post(1, "2026-11-18")], () => 0);
    expect(weeks.map((w) => w.posts.map((p) => p.n))).toEqual([[1, 2], [3]]);
  });

  it("keeps a post on its own week where the clocks go forward (a brand outside Singapore)", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York"; // clocks go forward on Sunday 14 March 2027, so that week is an hour short
    try {
      const weeks = boardWeeks({ startDay: "2027-03-08" }, [post(1, "2027-03-14"), post(2, "2027-03-15")], () => 0);
      expect(weeks.map((w) => [w.week, w.posts.map((p) => p.n)])).toEqual([[1, [1]], [2, [2]]]);
    } finally {
      process.env.TZ = tz;
    }
  });

  it("counts made, making and drafts over the posts not skipped", () => {
    const k = boardCounts([post(1, "d", { state: "made" }), post(2, "d", { state: "making" }), post(3, "d"), post(4, "d", { state: "waiting" }), post(5, "d", { state: "failed" }), post(6, "d", { state: "skipped" })]);
    expect(k).toEqual({ made: 1, making: 1, drafts: 3 });
    expect(countsText(k)).toBe("1 made, 1 making, 3 drafts");
    expect(countsText({ made: 0, making: 0, drafts: 1 })).toBe("0 made, 1 draft");
  });
});

describe("a post as storyboard frames", () => {
  it("a video is its script beats, a slideshow or wall its hook and brief lines, a text post its words, and nothing before it is written", () => {
    expect(frames(post(1, "d", { format: "ai-video", script: "HOOK: Stop guessing\nBODY: Count the calls.\nCTA: Follow." }))).toEqual([
      { label: "HOOK", text: "Stop guessing" }, { label: "BODY", text: "Count the calls." }, { label: "CTA", text: "Follow." },
    ]);
    expect(frames(post(2, "d", { format: "short-video", script: "Just say it plainly." }))).toEqual([{ label: "SCRIPT", text: "Just say it plainly." }]);
    expect(frames(post(3, "d", { format: "wall", brief: "Open quiet\n\nName the habit" }))).toEqual([
      { label: "Hook", text: "Hook 3" }, { label: "Beat 1", text: "Open quiet" }, { label: "Beat 2", text: "Name the habit" },
    ]);
    expect(frames(post(4, "d", { body: "The body." }))[0]).toMatchObject({ label: "Post" });
    expect(frames(post(4, "d", { body: "The body." }))[0].text).toContain("The body.");
    expect(frames(post(5, "d", { format: "carousel", body: "One.\n\nTwo.\n\nThree." })).length).toBeGreaterThan(1);
    expect(frames(post(6, "d", { hook: undefined, state: "waiting" }))).toEqual([]);
    // a beat label with nothing after it makes no empty frame
    expect(frames(post(7, "d", { format: "short-video", script: "HOOK:\nBODY: Count the calls.\nCTA: Follow." })).map((f) => f.label)).toEqual(["BODY", "CTA"]);
    // a video whose script isn't written yet shows its hook, never an empty script frame
    expect(frames(post(8, "d", { format: "ai-video" }))).toEqual([{ label: "HOOK", text: "Hook 8" }]);
  });
});

describe("the calendar's campaign drafts", () => {
  it("lists each campaign's posts still to make on their day, never a made, making or skipped one", () => {
    const by = plannedByDay([
      { id: "c1", name: "One", posts: [post(1, "2026-11-16"), post(2, "2026-11-16", { state: "made" }), post(3, "2026-11-17", { state: "skipped" }), post(4, "2026-11-18", { state: "waiting", hook: undefined })] },
      { id: "c2", name: "Two", posts: [post(1, "2026-11-16"), post(2, "2026-11-19", { state: "making" })] },
    ]);
    expect([...by.keys()].sort()).toEqual(["2026-11-16", "2026-11-18"]);
    expect(by.get("2026-11-16")?.map((x) => `${x.c.id}:${x.p.n}`)).toEqual(["c1:1", "c2:1"]);
  });
});
