import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { Competitor } from "@/lib/competitors";
import type { AdsAnswer, CompetitorAd, CompetitorAdsEntry } from "./competitorAds";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const a = await import("./competitorAds");
const { fromAd } = await import("./remixSource");
const { buildAdWriteUrl } = await import("./adsSwipe");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k.startsWith("content-studio-competitor-ads-") && v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

const U = "u1";
const comp = (id: string, extra: Partial<Competitor> = {}): Competitor => ({
  id, name: id.toUpperCase(), site: null, logo: null, why: "", fbPageId: "123456", handles: {}, adsCountry: "SG", source: "typed", addedAt: "2026-10-01T00:00:00Z", ...extra,
});
const ad = (id: string, extra: Partial<CompetitorAd> = {}): CompetitorAd => ({
  id, format: "image", headline: "Sell more", body: "Every day.", cta: "Learn more", link: null, image: null, video: null,
  start: "2026-09-01", end: null, active: true, platforms: ["facebook", "instagram"], versions: 1, ...extra,
});
const answer = (id: string, ads: CompetitorAd[], checkedAt = "2026-10-20T00:00:00Z", pageId = "123456"): AdsAnswer => ({ competitorId: id, pageId, pageName: "Page", ads, checkedAt });
const setList = (list: Competitor[]) => storage.setItem(`content-studio-competitors-${U}`, JSON.stringify({ list, dismissed: [] }));

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("the synced ads store", () => {
  it("lives under content-studio-competitor-ads- plus the brand, and reads bad JSON as empty", () => {
    setList([comp("a")]);
    expect(a.competitorAdsKey(U)).toBe("content-studio-competitor-ads-u1");
    a.saveCompetitorAds(U, { a: a.applyAdsCheck(undefined, answer("a", [ad("1")])) });
    expect(JSON.parse(storage.getItem("content-studio-competitor-ads-u1")!).a.ads[0].id).toBe("1");
    expect(changed).toHaveBeenCalledWith("content-studio-competitor-ads-changed");
    storage.setItem("content-studio-competitor-ads-u1", "{nope");
    expect(a.loadCompetitorAds(U)).toEqual({});
    storage.setItem("content-studio-competitor-ads-u1", JSON.stringify({ a: { ads: "x" }, b: null }));
    expect(a.loadCompetitorAds(U)).toEqual({});
  });

  it("drops a removed competitor's ads, and one with no Facebook page, on the next write", () => {
    setList([comp("a"), comp("b"), comp("c", { fbPageId: null, handles: { facebook: "cpage" } })]);
    const e = a.applyAdsCheck(undefined, answer("x", [ad("1")]));
    a.saveCompetitorAds(U, { a: e, b: e, c: e });
    setList([comp("a"), comp("c", { fbPageId: null, handles: {} })]);
    a.saveCompetitorAds(U, a.loadCompetitorAds(U));
    expect(Object.keys(a.loadCompetitorAds(U))).toEqual(["a"]);
  });

  it("keeps the newest 20 ads per competitor when storage is full", () => {
    setList([comp("a")]);
    const many = Array.from({ length: 30 }, (_, k) => ad(String(100 + k), { body: "x".repeat(200) }));
    storage.full = JSON.stringify({ a: a.applyAdsCheck(undefined, answer("a", many.slice(0, 22))) }).length;
    const saved = a.saveCompetitorAds(U, { a: a.applyAdsCheck(undefined, answer("a", many)) });
    expect(saved.a.ads).toHaveLength(20);
    expect(a.loadCompetitorAds(U).a.ads.map((x) => x.id)).toEqual(many.slice(0, 20).map((x) => x.id));
  });
});

describe("checks", () => {
  it("is due when never checked, after 7 days, or when the page changed", () => {
    const e = a.applyAdsCheck(undefined, answer("a", [ad("1")], "2026-10-13T00:00:00Z"));
    expect(a.adsDue(comp("a"), undefined)).toBe(true);
    expect(a.adsDue(comp("a"), e, Date.parse("2026-10-19T23:59:00Z"))).toBe(false);
    expect(a.adsDue(comp("a"), e, Date.parse("2026-10-20T00:00:00Z"))).toBe(true);
    expect(a.adsDue(comp("a", { fbPageId: "999999" }), e, Date.parse("2026-10-14T00:00:00Z"))).toBe(true);
    expect(a.adsDue(comp("a", { fbPageId: null }), e, Date.parse("2026-10-14T00:00:00Z"))).toBe(false);
    expect(a.adsDue(comp("a"), { ...e, checkedAt: "junk" })).toBe(true);
  });

  it("marks nothing new on the first check, then only unseen ids; seen keeps 300", () => {
    const first = a.applyAdsCheck(undefined, answer("a", [ad("1"), ad("2")]));
    expect(first.fresh).toEqual([]);
    expect(first.seen).toEqual(["1", "2"]);
    const second = a.applyAdsCheck(first, answer("a", [ad("2"), ad("3")], "2026-10-27T00:00:00Z"));
    expect(second.fresh).toEqual(["3"]);
    expect(second.ads.map((x) => x.id)).toEqual(["2", "3"]);
    const old = { ...first, seen: Array.from({ length: 300 }, (_, k) => `old${k}`) };
    const third = a.applyAdsCheck(old, answer("a", [ad("new1"), ad("new2")]));
    expect(third.seen).toHaveLength(300);
    expect(third.seen.slice(0, 2)).toEqual(["new1", "new2"]);
  });

  it("checks outside React, stores the ads and writes the page id back onto a handle-only competitor", async () => {
    setList([comp("a", { fbPageId: null, handles: { facebook: "apage" } })]);
    callFn.mockResolvedValueOnce(answer("a", [ad("1")], "2026-10-20T00:00:00Z", "777777"));
    const c = JSON.parse(storage.getItem(`content-studio-competitors-${U}`)!).list[0];
    const p = a.runAdsCheck(U, c);
    expect(a.isCheckingAds("a")).toBe(true);
    expect(await p).toBe(true);
    expect(callFn).toHaveBeenCalledWith("competitors", { mode: "ads", competitorId: "a", name: "A", fbPageId: null, facebook: "apage", country: "SG" }, a.ADS_FAILED);
    expect(a.loadCompetitorAds(U).a).toMatchObject({ pageId: "777777", fresh: [] });
    expect(JSON.parse(storage.getItem(`content-studio-competitors-${U}`)!).list[0].fbPageId).toBe("777777");
    expect(a.isCheckingAds("a")).toBe(false);
  });

  it("keeps last week's ads when a check fails, and says so", async () => {
    setList([comp("a")]);
    a.saveCompetitorAds(U, { a: a.applyAdsCheck(undefined, answer("a", [ad("1")], "2026-10-01T00:00:00Z")) });
    callFn.mockRejectedValueOnce(new EdgeError(a.ADS_FAILED, 502, "failed"));
    expect(await a.runAdsCheck(U, comp("a"))).toBe(true);
    expect(a.adsCheckFailure("a")?.message).toBe(a.ADS_FAILED);
    expect(a.loadCompetitorAds(U).a.ads.map((x) => x.id)).toEqual(["1"]);
  });

  it("checks each due competitor once, one at a time, never twice in 7 days, and stops at a spent cap", async () => {
    setList([comp("a"), comp("b"), comp("c", { fbPageId: null }), comp("d")]);
    let inFlight = 0;
    let most = 0;
    callFn.mockImplementation(async (_n: string, body: { competitorId: string }) => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (body.competitorId === "b") throw new EdgeError(a.ADS_FAILED, 502, "failed");
      return answer(body.competitorId, [ad(`${body.competitorId}1`)]);
    });
    await a.runDueAds(U);
    expect(callFn.mock.calls.map((c) => c[1].competitorId)).toEqual(["a", "b", "d"]); // c has no page
    expect(most).toBe(1);
    callFn.mockClear();
    await a.runDueAds(U); // b failed: not tried again on this device for 7 days
    expect(callFn).not.toHaveBeenCalled();
    await a.runDueAds(U, true); // Check now under All ignores that
    expect(callFn.mock.calls.map((c) => c[1].competitorId)).toEqual(["b"]);

    setList([comp("e"), comp("f")]);
    callFn.mockReset().mockRejectedValue(new EdgeError("You've used all 15 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await a.runDueAds(U);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(a.adsStopped()?.code).toBe("daily_limit");
    callFn.mockReset().mockResolvedValue(answer("e", []));
    await a.runDueAds(U); // nothing was spent, so the next visit tries e again
    expect(callFn.mock.calls.map((c) => c[1].competitorId)).toEqual(["e", "f"]);
    expect(a.adsStopped()).toBeNull();
  });

  it("shows the not switched on line for a 403", async () => {
    setList([comp("a")]);
    callFn.mockRejectedValueOnce(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    expect(await a.runAdsCheck(U, comp("a"))).toBe(false);
    expect(a.adsCheckFailure("a")?.message).toBe("Competitors is not switched on for this account.");
  });
});

describe("what the cards and pills say", () => {
  const NOW = Date.parse("2026-10-20T12:00:00Z");
  it("labels the run in days, months, years, or Ran for a stopped ad", () => {
    expect(a.runLabel({ start: "2026-09-29", end: null, active: true }, NOW)).toBe("21 days running");
    expect(a.runLabel({ start: "2026-10-20", end: null, active: true }, NOW)).toBe("1 day running");
    expect(a.runLabel({ start: "2026-08-21", end: null, active: true }, NOW)).toBe("2 months running");
    expect(a.runLabel({ start: "2025-10-20", end: null, active: true }, NOW)).toBe("1 year running");
    expect(a.runLabel({ start: "2023-01-01", end: null, active: true }, NOW)).toBe("3 years running");
    expect(a.runLabel({ start: "2026-01-01", end: "2026-03-31", active: false }, NOW)).toBe("Ran 90 days");
    expect(a.runLabel({ start: "2026-10-01", end: "2026-10-01", active: false }, NOW)).toBe("Ran 1 day");
    expect(a.runLabel({ start: null, end: null, active: true }, NOW)).toBeNull();
  });

  it("counts ads and running ads per competitor, most first, for the pills and the sub line", () => {
    const list = [comp("a"), comp("b"), comp("c"), comp("d", { fbPageId: null })];
    const e = (ads: CompetitorAd[]): CompetitorAdsEntry => a.applyAdsCheck(undefined, answer("x", ads));
    const tally = a.adsTally(list, { a: e([ad("1")]), b: e([ad("2"), ad("3", { active: false })]), c: e([]), d: e([ad("4")]), gone: e([ad("5")]) });
    expect(tally).toEqual([{ id: "b", name: "B", n: 2, running: 1 }, { id: "a", name: "A", n: 1, running: 1 }]);
    expect(a.runningLine(["B", "A"])).toBe("What B and A are running");
    expect(a.runningLine(["B", "A", "C", "D"])).toBe("What B, A and 2 more are running");
    expect(a.runningLine(["B"])).toBe("What B is running");
    expect(a.platformNames(["facebook", "instagram", "audience_network"])).toBe("Facebook, Instagram, Audience Network");
    expect(a.platformNames(["facebook", "whatsapp"])).toBe("Facebook, WhatsApp");
  });

  it("remixes a competitor ad by its structure, with the Library link and no null in the brief", () => {
    const like = a.toAdLike(ad("42", { image: null, hookFamily: null }), "SleekFlow");
    expect(like).toMatchObject({ adId: "42", advertiser: "SleekFlow", image: "", libraryUrl: "https://www.facebook.com/ads/library/?id=42", industry: null, hookFamily: null });
    const s = fromAd(like, NOW);
    expect(s).toMatchObject({ key: "ad:42", kind: "ad", platform: "meta-ad", author: "SleekFlow", url: "https://www.facebook.com/ads/library/?id=42", numbers: { daysRunning: 49 } });
    expect(s.cover).toBeUndefined();
    expect(buildAdWriteUrl(like)).not.toMatch(/null|undefined/);
  });
});
