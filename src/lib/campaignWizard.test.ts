import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campaignCost } from "./campaigns";
import {
  addedLine, adsCostLine, budgetLine, budgetProblems, budgetReason, confirmed, costLine, countryName, defaultName, firstOpen, formatLine, freshAngles, listJoin,
  loadWizard, matchCountry, nearestPace, NEW_BUDGET, newWork, openStep, overRunLine, PACES, paceLabel, parseMoney, pickAudience, previewPosts, readWork,
  runsLabel, saveWizard, shortDay, stepCount, stepsFor, successLine, summaryLines, toBudget, usd, whereLine, withAudience, withoutAudience, writeLimitLine,
  type BudgetWork, type WizardWork,
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
  it("opens the first unfinished step, and review once every step before it is confirmed", () => {
    expect(firstOpen(work())).toBe("who");
    expect(firstOpen(work({ done: ["who"] }))).toBe("angles");
    expect(firstOpen(work({ done: ["who", "angles"] }))).toBe("where");
    expect(firstOpen(work({ done: ["who", "angles", "where", "pace"] }))).toBe("accounts");
    expect(firstOpen(work({ done: ["who", "angles", "where", "accounts", "pace"] }))).toBe("review");
  });

  it("Where it runs comes after Angles; an ads option adds Budget, and Ads only drops the two posting steps", () => {
    expect(stepsFor("organic")).toEqual(["who", "angles", "where", "accounts", "pace", "review"]);
    expect(stepsFor("both")).toEqual(["who", "angles", "where", "budget", "accounts", "pace", "review"]);
    expect(stepsFor("ads")).toEqual(["who", "angles", "where", "budget", "review"]);
    expect(stepCount("where", "organic")).toBe("3 of 6");
    expect(stepCount("where", "both")).toBe("3 of 7");
    expect(stepCount("budget", "both")).toBe("4 of 7");
    expect(stepCount("review", "ads")).toBe("5 of 5");
    expect(["organic", "ads", "both"].map((r) => runsLabel(r as "ads"))).toEqual(["Organic posts", "Ads only", "Posts and ads"]);
    // picking an ads option after Where it runs: Budget opens next, and Review waits for it
    const done: WizardWork["done"] = ["who", "angles", "where", "accounts", "pace"];
    expect(firstOpen(work({ done, runs: "both" }))).toBe("budget");
    expect(openStep("review", work({ done, runs: "both" }))).toBe("budget");
    expect(openStep("review", work({ done: [...done, "budget"], runs: "both" }))).toBe("review");
    expect(firstOpen(work({ done: ["who", "angles", "where", "budget"], runs: "ads" }))).toBe("review");
    // ?step=pace on Ads only is no step of its: the first unfinished opens
    expect(openStep("pace", work({ done: ["who", "angles", "where"], runs: "ads" }))).toBe("budget");
  });

  it("?step= opens a confirmed step or the next one; a step further on, or an unknown one, opens the first unfinished", () => {
    const w = work({ done: ["who", "angles"] });
    expect(openStep(null, w)).toBe("where");
    expect(openStep("who", w)).toBe("who");
    expect(openStep("angles", w)).toBe("angles");
    expect(openStep("where", w)).toBe("where");
    expect(openStep("accounts", w)).toBe("where");
    expect(openStep("budget", w)).toBe("where");
    expect(openStep("pace", w)).toBe("where");
    expect(openStep("review", w)).toBe("where");
    expect(openStep("nope", w)).toBe("where");
    expect(openStep("review", work({ done: ["who", "angles", "where", "accounts", "pace"] }))).toBe("review");
    expect(openStep("angles", work())).toBe("who");
  });

  it("Confirm marks a step done once; Change keeps every answer", () => {
    const w = confirmed(confirmed(work({ weeks: 6, formats: ["carousel"] }), "pace"), "pace");
    expect(w.done).toEqual(["pace"]);
    expect(w).toMatchObject({ weeks: 6, formats: ["carousel"] });
    // Change only moves ?step=: the step reopens on the answers it had
    expect(openStep("pace", w)).toBe("pace");
    expect(openStep("accounts", w)).toBe("who");
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
    expect([undefined, 0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 25, 40].map(nearestPace)).toEqual([3, 3, 2, 2, 3, 3, 5, 5, 7, 7, 14, 28, 28]);
  });

  it("paces up to 4 a day, named per day from 7 a week", () => {
    expect(PACES.map(paceLabel)).toEqual(["2 a week", "3 a week", "5 a week", "1 a day", "2 a day", "3 a day", "4 a day"]);
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
  const cost = (formats: Parameters<typeof previewPosts>[0], perWeek: number, weeks: number, left: Parameters<typeof campaignCost>[1] = { video: null, remix: null }) =>
    campaignCost({ posts: previewPosts(formats, perWeek, weeks) }, left);

  it("the live summary counts the posts and prices what is made at Make", () => {
    expect(summaryLines(12, 4, ["LinkedIn", "Instagram"], cost(["text-post", "carousel"], 3, 4))).toEqual(["12 posts over 4 weeks, each on LinkedIn and Instagram."]);
    expect(summaryLines(12, 4, ["LinkedIn"], cost(["text-post", "ai-video"], 3, 4))).toEqual([
      "12 posts over 4 weeks, each on LinkedIn.",
      "4 of them AI videos, about US$11.08. One a week, so the daily limit of 2 covers them.",
    ]);
    expect(summaryLines(28, 4, ["Instagram", "TikTok"], cost(["slideshow", "wall", "ai-video"], 7, 4))).toEqual([
      "28 posts over 4 weeks, each on Instagram and TikTok.",
      "12 slideshows and 12 walls of text, about US$0.17, each made when you press Make.",
      "4 of them AI videos, about US$11.08. One a week, so the daily limit of 2 covers them.",
    ]);
    expect(summaryLines(2, 1, ["LinkedIn"], cost(["wall", "ai-video"], 2, 1))[1]).toBe("1 wall of text, under US$0.01, each made when you press Make.");
  });

  it("the cost line names free posts, makes, their price and today's coverage", () => {
    expect(costLine(cost(["text-post", "ai-video"], 3, 4, { video: 2, remix: 30 }))).toBe("8 posts cost nothing to make. 4 AI videos come to about US$11.08, and today's limit covers 2.");
    expect(costLine(cost(["slideshow", "wall", "ai-video"], 7, 4, { video: 2, remix: 30 }))).toBe(
      "12 slideshows and 12 walls of text come to about US$0.17, and today's limit covers all 24. 4 AI videos come to about US$11.08, and today's limit covers 2.",
    );
    expect(costLine(cost(["text-post", "carousel"], 3, 4))).toBe("12 posts cost nothing to make.");
    expect(costLine(cost(["slideshow"], 2, 1, { video: null, remix: null }))).toBe("2 slideshows come to about US$0.01.");
    expect(costLine(cost(["text-post", "ai-video"], 2, 1, { video: 0, remix: 0 }))).toBe("1 post costs nothing to make. 1 AI video comes to about US$2.77, and today's limit covers 0.");
  });

  it("counts the picture picks beside the remixes and names the tighter limit (live-p5dog D12: 20 picks for 24 makes)", () => {
    const line = (remix: number, pick: number) => costLine(cost(["slideshow", "wall", "ai-video"], 7, 4, { video: 2, remix, pick })).split(". 4 AI")[0];
    expect(line(30, 20)).toBe("12 slideshows and 12 walls of text come to about US$0.17, and today's limit for picking pictures covers 20");
    expect(line(18, 20)).toBe("12 slideshows and 12 walls of text come to about US$0.17, and today's remix limit covers 18");
    expect(line(30, 30)).toBe("12 slideshows and 12 walls of text come to about US$0.17, and today's limits cover all 24");
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

describe("the budget", () => {
  const b = (o: Partial<BudgetWork> = {}): BudgetWork => ({ ...NEW_BUDGET, daily: "50", url: "https://example.com", ...o });

  it("starts on Singapore and 18 to 65, with no budget typed: Confirm waits and no error shows yet", () => {
    expect(NEW_BUDGET).toEqual({ daily: "", url: null, countries: ["SG"], ageMin: "18", ageMax: "65" });
    expect(budgetProblems(NEW_BUDGET, "https://brand.example")).toEqual({});
    expect(budgetReason(NEW_BUDGET, "https://brand.example")).toBe("Type a daily budget.");
    expect(budgetReason(b())).toBeNull();
  });

  it("keeps the daily budget between US$25 and US$100,000, its error under the field and Confirm off", () => {
    const line = "Keep the daily budget between US$25 and US$100,000.";
    for (const daily of ["20", "24.99", "100000.01", "abc", "-50"]) {
      expect(budgetProblems(b({ daily })).daily).toBe(line);
      expect(budgetReason(b({ daily }))).toBe("");
    }
    for (const daily of ["25", "100000", "US$1,000", "$ 50", "50.5"]) expect(budgetProblems(b({ daily })).daily).toBeUndefined();
    expect(parseMoney("US$1,000")).toBe(1000);
    expect(parseMoney("")).toBeNaN();
  });

  it("the landing page is the brand's website until typed, and must be https on a real host", () => {
    expect(budgetProblems(b({ url: null }), "https://brand.example").url).toBeUndefined();
    expect(budgetProblems(b({ url: null }), "").url).toBe("Add the page the ads send people to.");
    expect(budgetProblems(b({ url: "" }), "https://brand.example").url).toBe("Add the page the ads send people to.");
    expect(budgetProblems(b({ url: "http://example.com" })).url).toBe("Use an https address on your own site.");
    expect(budgetProblems(b({ url: "example.com/book" })).url).toBeUndefined();
    expect(toBudget(b({ url: "example.com/book" })).url).toBe("https://example.com/book");
    expect(toBudget(b({ url: null }), "https://brand.example").url).toBe("https://brand.example/");
  });

  it("needs a country, and ages from 18 to 65 youngest first", () => {
    expect(budgetProblems(b({ countries: [] })).countries).toBe("Pick at least one country.");
    const ages = "Ages go from 18 to 65, the youngest first.";
    expect(budgetProblems(b({ ageMin: "17" })).ages).toBe(ages);
    expect(budgetProblems(b({ ageMax: "66" })).ages).toBe(ages);
    expect(budgetProblems(b({ ageMin: "40", ageMax: "30" })).ages).toBe(ages);
    expect(budgetProblems(b({ ageMin: "21.5" })).ages).toBe(ages);
    expect(budgetProblems(b({ ageMin: "25", ageMax: "54" })).ages).toBeUndefined();
  });

  it("countries are picked by name or code, and named back", () => {
    expect(matchCountry("singapore")).toBe("SG");
    expect(matchCountry(" Malaysia ")).toBe("MY");
    expect(matchCountry("my")).toBe("MY");
    expect(matchCountry("Niger")).toBe("NE");
    expect(matchCountry("Nigeria")).toBe("NG");
    expect(matchCountry("Atlantis")).toBeNull();
    expect(matchCountry("")).toBeNull();
    expect(countryName("SG")).toBe("Singapore");
  });

  it("the review's rows: the budget, over the run, and the collapsed row", () => {
    const kept = toBudget(b({ daily: "50", countries: ["SG", "MY"], ageMin: "25", ageMax: "54" }));
    expect(kept).toEqual({ daily: 50, url: "https://example.com/", countries: ["SG", "MY"], ages: [25, 54] });
    expect(usd(50)).toBe("US$50");
    expect(usd(12.5)).toBe("US$12.50");
    expect(overRunLine(50, 4)).toBe("US$1,400 across 4 weeks");
    expect(overRunLine(25, 1)).toBe("US$175 across 1 week");
    expect(budgetLine(kept)).toBe("US$50 a day | Singapore, Malaysia | 25 to 54");
    expect(adsCostLine(10)).toMatch(/^10 ads come to .+, each written when you press Make\.$/);
  });

  it("keeps a typed budget's cents and reads USD written out, so the review says what was typed", () => {
    expect(toBudget(b({ daily: "50.5" })).daily).toBe(50.5);
    expect(toBudget(b({ daily: "US$1,234.56" })).daily).toBe(1234.56);
    expect(budgetLine(toBudget(b({ daily: "50.5" })))).toBe("US$50.50 a day | Singapore | 18 to 65");
    for (const daily of ["USD 50", "50 usd"]) {
      expect(budgetProblems(b({ daily })).daily).toBeUndefined();
      expect(toBudget(b({ daily })).daily).toBe(50);
    }
  });

  it("never aims the ads at more than 10 countries, typed or kept from an earlier visit", () => {
    const twelve = ["SG", "MY", "ID", "TH", "PH", "VN", "AU", "NZ", "GB", "US", "CA", "IN"];
    expect(toBudget(b({ countries: twelve })).countries).toEqual(twelve.slice(0, 10));
    expect(readWork({ budget: { countries: twelve } })?.budget.countries).toEqual(twelve.slice(0, 10));
  });

  it("the result card for each place it runs", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, angleId: "a1", layout: "headline" as const }));
    const c = { angles: ANGLES, weeks: 4, perWeek: 3 as const, posts: previewPosts(["text-post"], 3, 4) };
    expect(addedLine({ ...c, runs: "both", ads }, ["LinkedIn"])).toBe("3 angles, LinkedIn, 3 a week for 4 weeks, 12 posts and 10 ad drafts. The posts' words are being written now, and you can leave this page.");
    expect(addedLine({ ...c, posts: [], runs: "ads", ads }, [])).toBe("3 angles, 10 ad drafts over 4 weeks. Each ad is written when you press Make on it.");
  });
});

describe("typed work", () => {
  it("round trips every field per brand, and clears on Add or Start over", () => {
    const w = work({
      audience: "au-1", angles: ANGLES, fresh: ["a1"], platforms: ["instagram", "tiktok"], accountIds: ["acc-1"], formats: ["slideshow", "ai-video"],
      weeks: 6, perWeek: 7, pictures: "mine", name: "My month", runs: "both",
      budget: { daily: "50", url: "https://example.com", countries: ["SG", "MY"], ageMin: "25", ageMax: "54" }, done: ["who", "angles", "where", "budget"],
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
    // a stored wizard from before Where it runs: organic, the default budget
    expect(readWork({ done: ["who"] })).toMatchObject({ runs: "organic", budget: NEW_BUDGET });
    expect(readWork({ runs: "billboards", budget: { daily: 50, countries: ["SG", "XX", "MY"], ageMin: "21" } })).toMatchObject({
      runs: "organic", budget: { daily: "", url: null, countries: ["SG", "MY"], ageMin: "21", ageMax: "65" },
    });
  });

  it("a blocked sessionStorage loses nothing on the page and throws nothing", () => {
    session.blocked = true;
    expect(() => saveWizard("u1", work())).not.toThrow();
    expect(loadWizard("u1")).toBeNull();
  });
});
