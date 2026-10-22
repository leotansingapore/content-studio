import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campaignCost } from "./campaigns";
import {
  addedLine, confirmed, costLine, defaultName, firstOpen, formatLine, freshAngles, listJoin, loadWizard, nearestPace, newWork, openStep, pickAudience, previewPosts,
  readWork, saveWizard, shortDay, successLine, summaryLines, whereLine, withAudience, withoutAudience, writeLimitLine, type WizardWork,
} from "./campaignWizard";

class MemStorage {
  s = new Map<string, string>();
  blocked = false;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.blocked) throw new Error("SecurityError"); this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let session: MemStorage;
beforeEach(() => {
  session = new MemStorage();
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("localStorage", new MemStorage());
});
afterEach(() => vi.unstubAllGlobals());

const ANGLES = ["a1", "a2", "a3"].map((id) => ({ id, title: `Angle ${id}`, line: "" }));
const work = (o: Partial<WizardWork> = {}): WizardWork => ({ ...newWork("linkedin"), ...o });

describe("the steps", () => {
  it("opens the first unfinished step, and review once the four are confirmed", () => {
    expect(firstOpen(work())).toBe("who");
    expect(firstOpen(work({ done: ["who"] }))).toBe("angles");
    expect(firstOpen(work({ done: ["who", "angles", "pace"] }))).toBe("where");
    expect(firstOpen(work({ done: ["who", "angles", "where", "pace"] }))).toBe("review");
  });

  it("?step= opens a confirmed step or the next one; a step further on, or an unknown one, opens the first unfinished", () => {
    const w = work({ done: ["who", "angles"] });
    expect(openStep(null, w)).toBe("where");
    expect(openStep("who", w)).toBe("who");
    expect(openStep("angles", w)).toBe("angles");
    expect(openStep("where", w)).toBe("where");
    expect(openStep("pace", w)).toBe("where");
    expect(openStep("review", w)).toBe("where");
    expect(openStep("nope", w)).toBe("where");
    expect(openStep("review", work({ done: ["who", "angles", "where", "pace"] }))).toBe("review");
    expect(openStep("angles", work())).toBe("who");
  });

  it("Confirm marks a step done once; Change keeps every answer", () => {
    const w = confirmed(confirmed(work({ weeks: 6, formats: ["carousel"] }), "pace"), "pace");
    expect(w.done).toEqual(["pace"]);
    expect(w).toMatchObject({ weeks: 6, formats: ["carousel"] });
    // Change only moves ?step=: the step reopens on the answers it had
    expect(openStep("pace", w)).toBe("pace");
    expect(openStep("where", w)).toBe("who");
  });

  it("another audience drops the angles it confirmed; the same one keeps them", () => {
    const w = work({ audience: "au-1", angles: ANGLES, fresh: ["a1"], done: ["who", "angles", "where"] });
    expect(withAudience(w, "au-1")).toEqual(w);
    expect(withAudience(w, "au-2")).toMatchObject({ audience: "au-2", angles: [], fresh: [], done: ["who", "where"] });
    expect(withAudience(work(), "au-1")).toMatchObject({ audience: "au-1", done: ["who"] });
    expect(firstOpen(withAudience(work(), "au-1"))).toBe("angles");
    expect(withoutAudience(w)).toMatchObject({ audience: null, angles: [], done: ["where"] });
    // picking another row before Confirm already drops them, and leaves step 1 unconfirmed until Confirm
    expect(pickAudience(work({ audience: "au-1", angles: ANGLES, done: ["angles"] }), "au-2")).toMatchObject({ audience: "au-2", angles: [], done: [] });
  });

  it("marks an angle new when Confirm first saved it, and keeps it new through a second Confirm", () => {
    const saved = [
      { id: "a1", createdAt: "2026-10-22T08:00:00.000Z", usedAt: "2026-10-22T08:00:00.000Z" },
      { id: "a2", createdAt: "2026-10-01T08:00:00.000Z", usedAt: "2026-10-22T08:00:00.000Z" },
    ];
    expect(freshAngles(ANGLES, saved, [])).toEqual(["a1", "a3"]);
    const again = saved.map((a) => ({ ...a, usedAt: "2026-10-22T09:00:00.000Z" }));
    expect(freshAngles(ANGLES, again, ["a1"])).toEqual(["a1", "a3"]);
  });
});

describe("the answers", () => {
  it("the pace nearest the weekly goal, ties to the slower, else 3 a week", () => {
    expect([undefined, 0, 1, 2, 3, 4, 5, 6, 7, 14].map(nearestPace)).toEqual([3, 3, 2, 2, 3, 3, 5, 5, 7, 7]);
  });

  it("names the campaign after the audience and the start week's month, at most 80 characters", () => {
    expect(defaultName("Young families", new Date(2026, 9, 26))).toBe("Young families | October");
    expect(defaultName("w".repeat(90), new Date(2026, 10, 2)).length).toBeLessThanOrEqual(80);
    expect(shortDay(new Date(2026, 9, 26))).toBe("Mon 26 Oct");
  });

  it("says why Confirm waits", () => {
    expect(whereLine(0)).toBe("Pick at least one place.");
    expect(whereLine(2)).toBeNull();
    expect(formatLine([])).toBe("Pick at least one format.");
    expect(formatLine(["ai-video"])).toBe("Pick at least one format besides AI video.");
    expect(formatLine(["ai-video", "wall"])).toBeNull();
  });

  it("joins lists in words", () => {
    expect([[], ["LinkedIn"], ["LinkedIn", "Instagram"], ["LinkedIn", "Instagram", "TikTok"]].map(listJoin)).toEqual(["", "LinkedIn", "LinkedIn and Instagram", "LinkedIn, Instagram and TikTok"]);
  });
});

describe("the lines", () => {
  const cost = (formats: Parameters<typeof previewPosts>[0], perWeek: number, weeks: number, left = { video: null as number | null, remix: null as number | null }) =>
    campaignCost({ posts: previewPosts(formats, perWeek, weeks) }, left);

  it("the live summary counts the posts and prices what is made at Make", () => {
    expect(summaryLines(12, 4, ["LinkedIn", "Instagram"], cost(["text-post", "carousel"], 3, 4))).toEqual(["12 posts over 4 weeks, each on LinkedIn and Instagram."]);
    expect(summaryLines(12, 4, ["LinkedIn"], cost(["text-post", "ai-video"], 3, 4))).toEqual([
      "12 posts over 4 weeks, each on LinkedIn.",
      "4 of them AI videos, about US$11.08. One a week, so the daily limit of 2 covers them.",
    ]);
    expect(summaryLines(28, 4, ["Instagram", "TikTok"], cost(["slideshow", "wall", "ai-video"], 7, 4))).toEqual([
      "28 posts over 4 weeks, each on Instagram and TikTok.",
      "12 slideshows and 12 walls of text, about US$0.48, each made when you press Make.",
      "4 of them AI videos, about US$11.08. One a week, so the daily limit of 2 covers them.",
    ]);
    expect(summaryLines(2, 1, ["LinkedIn"], cost(["wall", "ai-video"], 2, 1))[1]).toBe("1 wall of text, about US$0.02, each made when you press Make.");
  });

  it("the cost line names free posts, makes, their price and today's coverage", () => {
    expect(costLine(cost(["text-post", "ai-video"], 3, 4, { video: 2, remix: 30 }))).toBe("8 posts cost nothing to make. 4 AI videos come to about US$11.08, and today's limit covers 2.");
    expect(costLine(cost(["slideshow", "wall", "ai-video"], 7, 4, { video: 2, remix: 30 }))).toBe(
      "12 slideshows and 12 walls of text come to about US$0.48, and today's limit covers all 24. 4 AI videos come to about US$11.08, and today's limit covers 2.",
    );
    expect(costLine(cost(["text-post", "carousel"], 3, 4))).toBe("12 posts cost nothing to make.");
    expect(costLine(cost(["slideshow"], 2, 1, { video: null, remix: null }))).toBe("2 slideshows come to about US$0.04.");
    expect(costLine(cost(["text-post", "ai-video"], 2, 1, { video: 0, remix: 0 }))).toBe("1 post costs nothing to make. 1 AI video comes to about US$2.77, and today's limit covers 0.");
  });

  it("Add's limit line when today's uses write only some of the posts", () => {
    expect(writeLimitLine(12, null)).toBeNull();
    expect(writeLimitLine(12, 2)).toBeNull();
    expect(writeLimitLine(28, 2)).toBe("Today's limit writes 14 of these posts. The rest are written after 8am Singapore time.");
    expect(writeLimitLine(12, 0)).toBe("Today's limit for writing campaign posts is used. They are written after 8am Singapore time.");
  });

  it("the result card and the success row", () => {
    const c = { angles: [...ANGLES, ...ANGLES.slice(0, 2)], weeks: 4, perWeek: 3 as const, posts: previewPosts(["text-post"], 3, 4) };
    expect(addedLine(c, ["LinkedIn", "Instagram"])).toBe("5 angles, LinkedIn and Instagram, 3 a week for 4 weeks, 12 posts. The words are being written now, and you can leave this page.");
    expect(addedLine({ ...c, weeks: 1, perWeek: 7, posts: previewPosts(["text-post"], 7, 1) }, ["TikTok"])).toContain("1 a day for 1 week, 7 posts.");
    expect(successLine({ posts: 12, winners: 1 })).toBe("12 posts, 1 winner");
    expect(successLine({ posts: 28, winners: 2 })).toBe("28 posts, 2 winners");
  });
});

describe("typed work", () => {
  it("round trips every field per brand, and clears on Add or Start over", () => {
    const w = work({
      audience: "au-1", angles: ANGLES, fresh: ["a1"], platforms: ["instagram", "tiktok"], accountIds: ["acc-1"], formats: ["slideshow", "ai-video"],
      weeks: 6, perWeek: 7, pictures: "mine", name: "My month", done: ["who", "angles", "where"],
    });
    saveWizard("u1", w);
    expect(session.getItem("cs-campaign-wizard-u1")).not.toBeNull();
    expect(loadWizard("u1")).toEqual(w);
    expect(loadWizard("u2")).toBeNull();
    saveWizard("u1", null);
    expect(loadWizard("u1")).toBeNull();
  });

  it("keeps an untouched answer null, so the page shows its default", () => {
    saveWizard("u1", work());
    expect(loadWizard("u1")).toMatchObject({ accountIds: null, perWeek: null, name: null });
  });

  it("reads bad JSON as none and bad fields as their defaults", () => {
    session.setItem("cs-campaign-wizard-u1", "{nope");
    expect(loadWizard("u1")).toBeNull();
    expect(readWork([])).toBeNull();
    expect(readWork({ formats: ["text-post", "story"], weeks: 12, perWeek: 4, done: ["who", "review", "x"], platforms: ["linkedin", "myspace"], angles: [{ id: 1 }, { id: "a", title: "T" }] })).toMatchObject({
      formats: ["text-post"], weeks: 4, perWeek: null, done: ["who"], platforms: ["linkedin"], angles: [{ id: "a", title: "T", line: "" }], audience: null,
    });
  });

  it("a blocked sessionStorage loses nothing on the page and throws nothing", () => {
    session.blocked = true;
    expect(() => saveWizard("u1", work())).not.toThrow();
    expect(loadWizard("u1")).toBeNull();
  });
});
