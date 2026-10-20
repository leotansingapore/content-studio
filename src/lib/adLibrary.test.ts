import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { Competitor } from "@/lib/competitors";
import type { CompetitorAd, CompetitorAdsState } from "@/lib/competitorAds";
import type { SwipeAd } from "@/lib/adsSwipe";
import type { LibraryAd, SpaceAd } from "./adLibrary";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const lib = await import("./adLibrary");
const { ADS, buildAdWriteUrl } = await import("./adsSwipe");
const { fromAd } = await import("./remixSource");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if ((k.startsWith("content-studio-space-ads-") || k.startsWith("content-studio-ad-labels-")) && v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

const U = "u1";
const NOW = Date.parse("2026-10-20T04:00:00Z");
const dayBefore = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
const comp = (id: string, name: string, extra: Partial<Competitor> = {}): Competitor => ({
  id, name, site: null, logo: null, why: "", fbPageId: "111111", handles: {}, adsCountry: "SG", source: "typed", addedAt: "2026-10-01T00:00:00Z", ...extra,
});
const ad = (id: string, extra: Partial<CompetitorAd> = {}): CompetitorAd => ({
  id, format: "image", headline: "Sell more", body: "Every day.", cta: "Learn more", link: null, image: null, video: null,
  start: dayBefore(10), end: null, active: true, platforms: ["facebook", "instagram"], versions: 1, ...extra,
});
const spaceAd = (id: string, extra: Partial<SpaceAd> = {}): SpaceAd => ({ ...ad(id), advertiser: "Lead Co", pageId: "999999", fit: 0.8, ...extra });
const drop = (id: string, extra: Partial<SwipeAd> = {}): SwipeAd => ({
  adId: id, advertiser: "Singlife", industry: "Insurance", format: "image", headline: "Cover", body: "Plan ahead.", cta: null, link: null,
  start: dayBefore(40), platforms: ["FACEBOOK", "INSTAGRAM"], image: `/ads/${id}.jpg`, libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`, hookFamily: "Problem", ...extra,
});
const entry = (ads: CompetitorAd[], fresh: string[] = [], pageId = "111111") => ({ checkedAt: "2026-10-19T00:00:00Z", pageId, pageName: "Page", ads, seen: [], fresh });

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("buildLibrary", () => {
  const list = [comp("sleek", "SleekFlow", { fbPageId: "362293550309745" }), comp("pipe", "Pipedrive", { fbPageId: "222222" })];
  const competitorAds: CompetitorAdsState = {
    sleek: entry([ad("1001"), ad("1002", { active: false, start: dayBefore(120), end: dayBefore(20) })], ["1002"], "362293550309745"),
    pipe: entry([ad("2001")], [], "222222"),
  };

  it("joins the three stores, keeping an ad found twice once, as the competitor's", () => {
    const space = { checkedAt: "x", keywords: ["crm"], ads: [spaceAd("1001", { advertiser: "Elsewhere" }), spaceAd("3001"), spaceAd("3002", { pageId: "222222" })] };
    const all = lib.buildLibrary({ list, competitorAds, space, drop: [drop("1001"), drop("4001")], labels: {} }, NOW);
    expect(all.map((a) => [a.id, a.scope])).toEqual([["1001", "sleek"], ["1002", "sleek"], ["2001", "pipe"], ["3001", "space"], ["4001", "sg"]]);
    expect(all[0].advertiser).toBe("SleekFlow");
    expect(all[1].fresh).toBe(true);
    // a space ad from a page that is now tracked stays out
    expect(all.some((a) => a.id === "3002")).toBe(false);
    expect(all.find((a) => a.id === "3001")).toMatchObject({ advertiser: "Lead Co", fit: 0.8 });
    expect(all.find((a) => a.id === "4001")).toMatchObject({ advertiser: "Singlife", active: true, end: null, industry: "Insurance", platforms: ["facebook", "instagram"], image: "/ads/4001.jpg" });
  });

  it("applies the labels, and the drop's own hook family wins over one", () => {
    const labels = { "2001": { hook: "proof", emotion: "trust", audience: "business-owners" }, "4001": { hook: "offer", emotion: "worry", audience: null } };
    const all = lib.buildLibrary({ list, competitorAds, space: lib.EMPTY_SPACE, drop: [drop("4001")], labels }, NOW);
    expect(all.find((a) => a.id === "2001")).toMatchObject({ hook: "proof", emotion: "trust", audience: "business-owners" });
    expect(all.find((a) => a.id === "4001")).toMatchObject({ hook: "problem", emotion: "worry", audience: null });
    expect(all.find((a) => a.id === "1001")).toMatchObject({ hook: null, emotion: null, audience: null });
  });

  it("leaves out a removed competitor's ads and one without a Facebook page", () => {
    const all = lib.buildLibrary({ list: [comp("pipe", "Pipedrive", { fbPageId: null })], competitorAds, space: lib.EMPTY_SPACE, drop: [], labels: {} }, NOW);
    expect(all).toEqual([]);
  });
});

describe("Proven ad", () => {
  it("is running for 30+ days, or ran 90+ in all, and nothing else", () => {
    const at = (days: number, active = true) => lib.dropLibraryAd(drop("1", { start: dayBefore(days) }), undefined, NOW).proven === true && active;
    expect(at(29)).toBe(false);
    expect(at(30)).toBe(true);
    const stopped = (days: number) => lib.competitorLibraryAd(ad("2", { active: false, start: dayBefore(days + 5), end: dayBefore(5) }), { id: "c", name: "C" }, undefined, false, NOW);
    expect(stopped(89)).toMatchObject({ days: 89, proven: false });
    expect(stopped(90)).toMatchObject({ days: 90, proven: true });
    expect(stopped(45).proven).toBe(false);
    expect(lib.isProven(true, null)).toBe(false);
  });
});

describe("filters, search, sorts and counts", () => {
  const L = (id: string, extra: Partial<LibraryAd>): LibraryAd => ({
    id, scope: "sg", advertiser: "A", format: "image", headline: null, body: "", cta: null, link: null, image: null, video: null, start: "2026-10-01", end: null,
    active: true, days: 19, proven: false, platforms: ["facebook"], hook: null, emotion: null, audience: null, industry: null, libraryUrl: "", ...extra,
  });
  const all = [
    L("1", { scope: "sleek", advertiser: "SleekFlow", format: "video", headline: "Sell more on WhatsApp", hook: "desire", emotion: "hope", audience: "business-owners", days: 40, proven: true, start: "2026-09-10", platforms: ["facebook", "instagram"] }),
    L("2", { scope: "sleek", advertiser: "SleekFlow", body: "Stop losing leads in WhatsApp", hook: "problem", emotion: "worry", days: 5, start: "2026-10-15", platforms: ["threads"] }),
    L("3", { scope: "space", advertiser: "Lead Co", format: "carousel", headline: "Leads", body: "Sales teams close more", active: false, days: 100, proven: true, start: "2026-05-01", end: "2026-08-09" }),
    L("4", { scope: "sg", advertiser: "DBS", industry: "Banking", body: "Half-priced holidays", hook: "offer", days: 61, proven: true, start: "2026-08-20" }),
    L("5", { scope: "sg", advertiser: "Singlife", industry: "Insurance", body: "Plan for WhatsApp scams", hook: "problem", days: 8, start: "2026-10-12" }),
  ];
  const f = (o: Partial<typeof lib.NO_FILTERS>) => ({ ...lib.NO_FILTERS, ...o });
  const ids = (o: Partial<typeof lib.NO_FILTERS>) => lib.filterLibrary(all, f(o)).map((a) => a.id);

  it("applies each filter alone, and together", () => {
    expect(ids({})).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids({ scope: "sleek" })).toEqual(["1", "2"]);
    expect(ids({ scope: "space" })).toEqual(["3"]);
    expect(ids({ hook: "problem" })).toEqual(["2", "5"]);
    expect(ids({ running: true })).toEqual(["1", "2", "4", "5"]);
    expect(ids({ run: "30" })).toEqual(["1", "3", "4"]);
    expect(ids({ run: "90" })).toEqual(["3"]);
    expect(ids({ format: "video" })).toEqual(["1"]);
    expect(ids({ platform: "threads" })).toEqual(["2"]);
    expect(ids({ emotion: "worry" })).toEqual(["2"]);
    expect(ids({ audience: "business-owners" })).toEqual(["1"]);
    expect(ids({ scope: "sg", industry: "banking" })).toEqual(["4"]);
    // industry only counts under Singapore picks
    expect(ids({ industry: "banking" })).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids({ running: true, hook: "problem", scope: "sg" })).toEqual(["5"]);
  });

  it("shows an unlabelled ad only under Any", () => {
    expect(ids({ emotion: "hope" })).toEqual(["1"]);
    expect(lib.filterLibrary([L("9", {})], f({ hook: "problem" }))).toEqual([]);
    expect(lib.filterLibrary([L("9", {})], f({ audience: "general" }))).toEqual([]);
  });

  it("needs every word, found in the words, the labels or the advertiser", () => {
    expect(ids({ q: "whatsapp" })).toEqual(["1", "2", "5"]);
    expect(ids({ q: "whatsapp worry" })).toEqual(["2"]);
    expect(ids({ q: "sleekflow" })).toEqual(["1", "2"]);
    expect(ids({ q: "banking" })).toEqual(["4"]);
    expect(lib.searchMatch(all[1], ["whatsapp", "worry", "sleekflow"])).toEqual([1, 1, 1]);
    expect(lib.searchMatch(all[1], ["nope"])).toBeNull();
  });

  it("sorts most relevant: proven, then running, then newest; with a search, words in the ad first", () => {
    const sorted = (sort: (typeof lib.SORTS)[number], q = "") => lib.sortLibrary(lib.filterLibrary(all, f({ q })), sort, q).map((a) => a.id);
    // 1 and 4 are proven and running (1 is newer), 3 proven but stopped, then the newest of the rest
    expect(sorted("relevant")).toEqual(["1", "4", "3", "2", "5"]);
    // "whatsapp" is in the words of 1, 2 and 5 once each: ties go to the longest running
    expect(sorted("relevant", "whatsapp")).toEqual(["1", "5", "2"]);
    // words in the ad beat a match in the labels
    const inWords = L("w", { body: "worry less", days: 1 });
    const inLabel = L("l", { emotion: "worry", days: 300 });
    expect(lib.sortLibrary([inLabel, inWords], "relevant", "worry").map((a) => a.id)).toEqual(["w", "l"]);
    expect(sorted("longest")).toEqual(["3", "4", "1", "5", "2"]);
    expect(sorted("newest")).toEqual(["2", "5", "1", "4", "3"]);
  });

  it("counts each scope with the other filters on, so the picked pill matches the cards", () => {
    const list = [{ id: "sleek", name: "SleekFlow" }, { id: "gone", name: "No ads" }];
    expect(lib.scopeCounts(all, f({}), list)).toEqual({ all: 5, competitors: [{ id: "sleek", name: "SleekFlow", n: 2 }], space: 1, sg: 2 });
    const running = f({ running: true, scope: "sleek" });
    const c = lib.scopeCounts(all, running, list);
    expect(c).toEqual({ all: 4, competitors: [{ id: "sleek", name: "SleekFlow", n: 2 }], space: 0, sg: 2 });
    expect(c.competitors[0].n).toBe(lib.filterLibrary(all, running).length);
    expect(lib.scopeCounts(all, f({ scope: "sg", industry: "banking" }), list).sg).toBe(1);
    expect(lib.countLine(lib.filterLibrary(all, running), true)).toBe("2 ads from 1 brand, running now");
    expect(lib.countLine(all, false)).toBe("5 ads from 4 brands");
    expect(lib.hooksPresent(all).map((h) => h.id)).toEqual(["problem", "desire", "offer"]);
  });

  it("writes the card's meta line", () => {
    expect(lib.metaLine(all[0])).toBe("Video | 40 days");
    expect(lib.metaLine(all[2])).toBe("Carousel | Ran 100 days");
    expect(lib.metaLine(L("x", { days: null }))).toBe("Image");
  });
});

describe("remixing a library ad", () => {
  it("keeps a drop ad's Write link and source exactly as the drop builds them", () => {
    for (const d of ADS.slice(0, 5)) {
      const a = lib.dropLibraryAd(d);
      expect(buildAdWriteUrl(lib.likeOf(a))).toBe(buildAdWriteUrl(d));
      expect(fromAd(lib.likeOf(a), NOW)).toEqual(fromAd(d, NOW));
    }
  });

  it("carries a labelled competitor ad's hook family into the brief", () => {
    const a = lib.competitorLibraryAd(ad("1"), { id: "c", name: "SleekFlow" }, { hook: "proof", emotion: null, audience: null });
    expect(new URLSearchParams(buildAdWriteUrl(lib.likeOf(a)).split("?")[1]).get("detail")).toBe("Proof hook, like SleekFlow's ad");
    expect(buildAdWriteUrl(lib.likeOf(a))).not.toMatch(/null|undefined/);
  });
});

describe("the stores", () => {
  it("keeps your space under content-studio-space-ads- plus the brand, and reads bad JSON as empty", () => {
    expect(lib.spaceAdsKey(U)).toBe("content-studio-space-ads-u1");
    lib.saveSpaceAds(U, { checkedAt: "2026-10-20T00:00:00Z", keywords: ["crm"], ads: [spaceAd("1")] });
    expect(lib.loadSpaceAds(U).ads[0].id).toBe("1");
    expect(changed).toHaveBeenCalledWith("content-studio-space-ads-changed");
    storage.setItem("content-studio-space-ads-u1", "{nope");
    expect(lib.loadSpaceAds(U)).toEqual(lib.EMPTY_SPACE);
    storage.setItem("content-studio-space-ads-u1", JSON.stringify({ ads: "x" }));
    expect(lib.loadSpaceAds(U)).toEqual(lib.EMPTY_SPACE);
  });

  it("keeps the best 30 space ads when storage is full", () => {
    const ads = Array.from({ length: 60 }, (_, k) => spaceAd(String(1000 + k)));
    storage.full = JSON.stringify({ checkedAt: "x", keywords: ["crm"], ads: ads.slice(0, 30) }).length;
    const saved = lib.saveSpaceAds(U, { checkedAt: "x", keywords: ["crm"], ads });
    expect(saved.ads).toHaveLength(30);
    expect(lib.loadSpaceAds(U).ads.map((a) => a.id)).toEqual(ads.slice(0, 30).map((a) => a.id));
  });

  it("keeps labels under the bare uid, the newest 2,000, a re-label moving to the end", () => {
    expect(lib.adLabelsKey(U)).toBe("content-studio-ad-labels-u1");
    const label = { hook: "proof", emotion: null, audience: null };
    const many = Object.fromEntries(Array.from({ length: 2100 }, (_, k) => [String(10_000_000_000 + k), label]));
    lib.saveAdLabels(U, many);
    const kept = Object.keys(lib.loadAdLabels(U));
    expect(kept).toHaveLength(2000);
    expect(kept[0]).toBe(String(10_000_000_100));
    lib.saveAdLabels(U, { [String(10_000_000_100)]: { ...label, hook: "offer" } });
    expect(Object.keys(lib.loadAdLabels(U)).at(-1)).toBe(String(10_000_000_100));
    expect(changed).toHaveBeenCalledWith("content-studio-ad-labels-changed");
    storage.full = 2000;
    expect(Object.keys(lib.saveAdLabels(U, { "10000009999": label }))).toEqual([]);
    storage.setItem("content-studio-ad-labels-u1", "[1]");
    expect(lib.loadAdLabels(U)).toEqual({});
  });

  it("prefills the space words from Your market, then Mentions, then the Plan, 3 at most", () => {
    expect(lib.spaceWordsFor(U)).toEqual([]);
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ topics: ["sales habits", "CRM"] }));
    expect(lib.spaceWordsFor(U)).toEqual(["sales habits", "CRM"]);
    storage.setItem("content-studio-mentions-u1", JSON.stringify(["crm", "pipeline"]));
    storage.setItem("content-studio-market-u1", JSON.stringify({ topics: ["cold calling"] }));
    expect(lib.spaceWordsFor(U)).toEqual(["cold calling", "crm", "pipeline"]);
    lib.setSpaceWords(U, ["  lead  gen ", "LEAD GEN", "x", "follow up", "a", "pipeline", "more"]);
    expect(lib.spaceWordsFor(U)).toEqual(["lead gen", "follow up", "pipeline"]);
  });

  it("is due with words and a check 7+ days old", () => {
    expect(lib.spaceDue({ checkedAt: "", keywords: [], ads: [] }, NOW)).toBe(false);
    expect(lib.spaceDue({ checkedAt: "", keywords: ["crm"], ads: [] }, NOW)).toBe(true);
    expect(lib.spaceDue({ checkedAt: new Date(NOW - 6 * 86_400_000).toISOString(), keywords: ["crm"], ads: [] }, NOW)).toBe(false);
    expect(lib.spaceDue({ checkedAt: new Date(NOW - 7 * 86_400_000).toISOString(), keywords: ["crm"], ads: [] }, NOW)).toBe(true);
  });
});

describe("the space check", () => {
  it("sends the brand, the words and every tracked page, and saves what comes back", async () => {
    storage.setItem("content-studio-competitors-u1", JSON.stringify({ list: [comp("a", "A", { fbPageId: "123456" }), comp("b", "B", { fbPageId: null, handles: { facebook: "bpage" } })], dismissed: [] }));
    storage.setItem("content-studio-competitor-ads-u1", JSON.stringify({ b: entry([], [], "654321") }));
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ audienceDetail: "Self-employed salespeople", oneLiner: "We help reps hit their numbers" }));
    lib.setSpaceWords(U, ["crm", "pipeline"]);
    callFn.mockResolvedValueOnce({ ads: [spaceAd("7")], failed: ["pipeline"], checkedAt: "2026-10-20T01:00:00Z" });
    expect(await lib.runSpaceCheck(U)).toBe(true);
    const [name, body] = callFn.mock.calls[0];
    expect(name).toBe("competitors");
    expect(body).toMatchObject({ mode: "space", keywords: ["crm", "pipeline"], brand: { serves: "Self-employed salespeople" } });
    expect(body.brand.sells).toContain("We help reps hit their numbers");
    expect(body.excludePageIds.sort()).toEqual(["123456", "654321"]);
    expect(lib.loadSpaceAds(U)).toMatchObject({ checkedAt: "2026-10-20T01:00:00Z", keywords: ["crm", "pipeline"], ads: [{ id: "7" }] });
    expect(lib.spaceMissed()).toEqual(["pipeline"]);
  });

  it("keeps last week's ads when the check fails, and says why", async () => {
    lib.saveSpaceAds(U, { checkedAt: "2026-10-01T00:00:00Z", keywords: ["crm"], ads: [spaceAd("1")] });
    callFn.mockRejectedValueOnce(new EdgeError(lib.SPACE_FAILED, 502, "failed"));
    expect(await lib.runSpaceCheck(U)).toBe(false);
    expect(lib.loadSpaceAds(U)).toMatchObject({ checkedAt: "2026-10-01T00:00:00Z", ads: [{ id: "1" }] });
    expect(lib.spaceFailure()?.message).toBe(lib.SPACE_FAILED);
    callFn.mockRejectedValueOnce(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    await lib.runSpaceCheck(U);
    expect(lib.spaceFailure()?.message).toBe("Competitors is not switched on for this account.");
  });

  it("checks on open at most once a week from this device, and again next visit when nothing was spent", async () => {
    lib.setSpaceWords(U, ["crm"]);
    callFn.mockRejectedValueOnce(new EdgeError("x", 502, "failed"));
    await lib.runDueSpace(U, NOW);
    await lib.runDueSpace(U, NOW + 3_600_000);
    expect(callFn).toHaveBeenCalledTimes(1);
    callFn.mockRejectedValueOnce(new EdgeError("Back at 8am", 429, "daily_limit"));
    await lib.runDueSpace(U, NOW + 8 * 86_400_000);
    callFn.mockResolvedValueOnce({ ads: [], failed: [], checkedAt: new Date(NOW + 8 * 86_400_000).toISOString() });
    await lib.runDueSpace(U, NOW + 8 * 86_400_000 + 60_000);
    expect(callFn).toHaveBeenCalledTimes(3);
    // checked now: not due again
    await lib.runDueSpace(U, NOW + 9 * 86_400_000);
    expect(callFn).toHaveBeenCalledTimes(3);
  });
});

describe("labelling", () => {
  const ads = Array.from({ length: 130 }, (_, k) => ({ id: String(5_000_000_000 + k), headline: "h", body: "b" }));

  it("asks for unlabelled ads only, 60 a call, and saves each answer", async () => {
    lib.saveAdLabels(U, { [ads[0].id]: { hook: "proof", emotion: null, audience: null } });
    callFn.mockImplementation(async (_n: string, body: { ads: { id: string }[] }) => ({
      labels: Object.fromEntries(body.ads.slice(1).map((a) => [a.id, { hook: "offer", emotion: "hope", audience: null }])),
    }));
    await lib.labelAds(U, ads);
    expect(callFn.mock.calls.map((c) => c[1].ads.length)).toEqual([60, 60, 9]);
    expect(callFn.mock.calls[0][1].ads[0]).toEqual({ id: ads[1].id, headline: "h", body: "b" });
    expect(Object.keys(lib.loadAdLabels(U))).toHaveLength(130 - 3);
    expect(lib.sortingAds()).toBe(0);
    // the 3 Jev left out are not asked again this visit
    callFn.mockClear();
    await lib.labelAds(U, ads);
    expect(callFn).not.toHaveBeenCalled();
  });

  it("stops at a refusal and leaves the rest for the next visit", async () => {
    const more = ads.map((a) => ({ ...a, id: `9${a.id}` }));
    callFn.mockRejectedValueOnce(new EdgeError("Back at 8am", 429, "daily_limit"));
    await lib.labelAds(U, more);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(lib.loadAdLabels(U)).toEqual({});
  });
});
