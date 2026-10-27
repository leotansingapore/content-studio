import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaignArgs,
  campaignLink,
  campaignName,
  formProblem,
  lastPrivacyUrl,
  loadLaunches,
  metricsWindow,
  preflightArgs,
  resultDue,
  saveLaunch,
  startOf,
  statusWord,
  webAddress,
  type AdForm,
  type AdLaunch,
} from "./adlauncher";

const FORM: AdForm = {
  pageId: "p1",
  adAccountId: "1234",
  goal: "leads",
  url: "",
  privacyUrl: "leotan.sg/privacy",
  headline: "Three CPF moves before 55",
  primaryText: "Most people check CPF once a year. Here is what to look at.",
  cta: "LEARN_MORE",
  dailyBudget: "20",
  days: "7",
  approval: "",
};
// 27 Oct 2026, 6pm in Singapore
const NOW = Date.parse("2026-10-27T10:00:00Z");

describe("the sheet's rules", () => {
  it("needs the firm's approval code on an adviser's brand, and never on a business's", () => {
    expect(formProblem(FORM, true)).toBe("Add the firm's approval code.");
    expect(formProblem({ ...FORM, approval: " " }, true)).toBe("Add the firm's approval code.");
    expect(formProblem({ ...FORM, approval: "MAS-2026-118" }, true)).toBeNull();
    expect(formProblem(FORM, false)).toBeNull();
  });
  it("needs a budget above 0 and 1 to 90 whole days", () => {
    for (const b of ["0", "-5", "", "abc"]) expect(formProblem({ ...FORM, dailyBudget: b }, false), b).toBe("Set a daily budget above 0.");
    expect(formProblem({ ...FORM, dailyBudget: "0.5" }, false)).toBeNull();
    for (const d of ["0", "91", "2.5", ""]) expect(formProblem({ ...FORM, days: d }, false), d).toBe("Run it for 1 to 90 days.");
    expect(formProblem({ ...FORM, days: "90" }, false)).toBeNull();
  });
  it("keeps AdLauncher's copy limits: 200 for the headline, 2000 for the text", () => {
    expect(formProblem({ ...FORM, headline: "h".repeat(200) }, false)).toBeNull();
    expect(formProblem({ ...FORM, headline: "h".repeat(201) }, false)).toBe("Shorten the headline to 200 characters.");
    expect(formProblem({ ...FORM, primaryText: "t".repeat(2000) }, false)).toBeNull();
    expect(formProblem({ ...FORM, primaryText: "t".repeat(2001) }, false)).toBe("Shorten the text to 2000 characters.");
    expect(formProblem({ ...FORM, headline: "  " }, false)).toBe("Add a headline.");
    expect(formProblem({ ...FORM, primaryText: "" }, false)).toBe("Add the ad's text.");
  });
  it("needs a privacy policy for a lead form and an address for a website ad", () => {
    expect(formProblem({ ...FORM, privacyUrl: "" }, false)).toMatch(/privacy policy/);
    expect(formProblem({ ...FORM, goal: "website" }, false)).toBe("Add the website address the ad opens.");
    expect(formProblem({ ...FORM, goal: "website", url: "leotan.sg" }, false)).toBeNull();
    expect(formProblem({ ...FORM, pageId: "" }, false)).toBe("Pick a Facebook Page.");
    expect(formProblem({ ...FORM, adAccountId: "" }, false)).toBe("Pick an ad account.");
  });
  it("reads an address with or without https://, and refuses one that isn't https", () => {
    expect(webAddress("leotan.sg/privacy")).toBe("https://leotan.sg/privacy");
    expect(webAddress(" https://leotan.sg ")).toBe("https://leotan.sg/");
    expect(webAddress("http://leotan.sg")).toBe("");
    expect(webAddress("javascript:alert(1)")).toBe("");
    expect(webAddress("localhost")).toBe("");
    expect(webAddress("")).toBe("");
  });
});

describe("the create-campaign call", () => {
  it("is a paused Singapore lead ad with the standard questions, checked first", () => {
    const a = campaignArgs(FORM, { name: "n", imageUrl: "https://hub/a.jpg", now: NOW });
    expect(a).toEqual({
      name: "n",
      pageId: "p1",
      adAccountId: "1234",
      objective: "OUTCOME_LEADS",
      destinationType: "ON_AD",
      formQuestions: ["full_name", "email", "phone_number"],
      privacyPolicyUrl: "https://leotan.sg/privacy",
      dailyBudget: 20,
      startDate: "2026-10-27T16:00:00.000Z",
      endDate: "2026-11-03T16:00:00.000Z",
      locations: [{ key: "SG", type: "country" }],
      adCreative: { headline: "Three CPF moves before 55", primaryText: "Most people check CPF once a year. Here is what to look at." },
      cta: "LEARN_MORE",
      mediaType: "image",
      imageUrl: "https://hub/a.jpg",
      dryRun: true,
    });
    expect(a).not.toHaveProperty("templateId");
    expect(a).not.toHaveProperty("appendToCampaignId");
  });
  it("is a traffic ad to the address for a website goal", () => {
    const a = campaignArgs({ ...FORM, goal: "website", url: "leotan.sg/book" }, { name: "n", imageUrl: "https://hub/a.jpg", now: NOW });
    expect(a).toMatchObject({ objective: "OUTCOME_TRAFFIC", destinationType: "WEBSITE", destinationUrl: "https://leotan.sg/book" });
    expect(a).not.toHaveProperty("formQuestions");
    expect(a).not.toHaveProperty("privacyPolicyUrl");
  });
  it("starts at midnight tomorrow in Singapore", () => {
    expect(startOf(Date.parse("2026-10-27T15:59:00Z")).toISOString()).toBe("2026-10-27T16:00:00.000Z");
    expect(startOf(Date.parse("2026-10-27T16:00:00Z")).toISOString()).toBe("2026-10-28T16:00:00.000Z");
  });
  it("names the campaign by its headline, the approval code on an adviser's brand, and the day", () => {
    expect(campaignName({ ...FORM, approval: " MAS-118 " }, true, NOW)).toBe("Three CPF moves before 55 | MAS-118 | 27 Oct 2026");
    expect(campaignName({ ...FORM, approval: "MAS-118" }, false, NOW)).toBe("Three CPF moves before 55 | 27 Oct 2026");
    expect(campaignName({ ...FORM, headline: "x".repeat(80) }, false, NOW)).toBe(`${"x".repeat(57)}... | 27 Oct 2026`);
  });
  it("preflights the same Page, account, budget and place", () => {
    expect(preflightArgs(FORM)).toEqual({ pageId: "p1", adAccountId: "1234", dailyBudget: 20, locations: [{ key: "SG", type: "country" }] });
  });
  it("links the campaign in AdLauncher by its own id", () => {
    expect(campaignLink("6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f")).toBe("https://autoadslauncher.com/campaigns/6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f");
  });
});

describe("the launches store", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", { localStorage: ls });
  });
  afterEach(() => vi.unstubAllGlobals());
  const launch = (campaignId: string, extra: Partial<AdLaunch> = {}): AdLaunch => ({
    id: `l-${campaignId}`,
    at: "2026-10-27T10:00:00.000Z",
    campaignId,
    metaCampaignId: null,
    name: "n",
    goal: "leads",
    dailyBudget: 20,
    days: 7,
    currency: "SGD",
    ...extra,
  });

  it("keeps each brand's launches under a synced key, newest first, one per campaign", () => {
    expect(saveLaunch("u1", launch("c1", { privacyUrl: "https://leotan.sg/privacy", approval: "MAS-1" }))).toBe(true);
    saveLaunch("u1", launch("c2"));
    saveLaunch("u1", launch("c1", { name: "again" }));
    expect(loadLaunches("u1").map((l) => [l.campaignId, l.name])).toEqual([["c1", "again"], ["c2", "n"]]);
    expect([...store.keys()]).toEqual(["content-studio-ad-launches-u1"]);
    // another brand of the same sign-in has its own list
    store.set("content-studio-profiles-u1", JSON.stringify([{ id: "me", name: "Leo", createdAt: "" }, { id: "pab12", name: "MoneyBees", createdAt: "" }]));
    store.set("cs-active-profile-u1", "pab12");
    expect(loadLaunches("u1")).toEqual([]);
    saveLaunch("u1", launch("c9"));
    expect(store.has("content-studio-ad-launches-u1~pab12")).toBe(true);
  });
  it("starts the next lead ad with the privacy address used last", () => {
    expect(lastPrivacyUrl("u1")).toBe("");
    saveLaunch("u1", launch("c1", { privacyUrl: "https://leotan.sg/privacy" }));
    saveLaunch("u1", launch("c2", { goal: "website" }));
    expect(lastPrivacyUrl("u1")).toBe("https://leotan.sg/privacy");
  });
  it("reads a broken or foreign value as no launches", () => {
    store.set("content-studio-ad-launches-u1", "not json");
    expect(loadLaunches("u1")).toEqual([]);
    store.set("content-studio-ad-launches-u1", JSON.stringify([{ nope: 1 }, launch("c1")]));
    expect(loadLaunches("u1").map((l) => l.campaignId)).toEqual(["c1"]);
  });
});

describe("results", () => {
  it("reads a campaign again only after 30 minutes", () => {
    expect(resultDue(undefined, NOW)).toBe(true);
    expect(resultDue({ at: NOW - 29 * 60_000, status: "Paused", spend: 0, leads: 0, cpl: null }, NOW)).toBe(false);
    expect(resultDue({ at: NOW - 30 * 60_000, status: "Paused", spend: 0, leads: 0, cpl: null }, NOW)).toBe(true);
  });
  it("asks for the days since the launch, in Singapore", () => {
    expect(metricsWindow("2026-10-20T17:00:00.000Z", NOW)).toEqual({ startDate: "2026-10-21", endDate: "2026-10-27" });
  });
  it("says Meta's status in plain words", () => {
    expect(statusWord({ effectiveStatus: "PAUSED", recordStatus: null })).toBe("Paused");
    expect(statusWord({ effectiveStatus: "CAMPAIGN_PAUSED", recordStatus: null })).toBe("Paused");
    expect(statusWord({ effectiveStatus: "ACTIVE", recordStatus: null })).toBe("Running");
    expect(statusWord({ effectiveStatus: "IN_PROCESS", recordStatus: null })).toBe("In review");
    expect(statusWord({ effectiveStatus: "DISAPPROVED", recordStatus: null })).toBe("Not approved");
    expect(statusWord({ effectiveStatus: null, recordStatus: "failed" })).toBe("Failed");
    expect(statusWord(null)).toBe("Not on Meta yet");
  });
});
