import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
// AdLauncher is never called from a campaign: these stand in for every call it could make, and must stay untouched
const adl = vi.hoisted(() => ({ call: vi.fn(), image: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/adlauncher", async (orig) => ({ ...(await orig<typeof import("./adlauncher")>()), adlCall: adl.call, adlImage: adl.image, adlStatus: adl.status }));

import { campaignArgs, type AdForm } from "./adlauncher";
import {
  AD_BUSY, AD_MADE, AD_SWAP_MADE, adCounts, adViews, countsLine, editAdLink, groupTitle, handOff, layoutMix, makeAd, notTaken, sendBlock, sendPlan, sheetKey,
  sheetPrefill, skipAd, swapAdLayout,
} from "./campaignAds";
import { getCampaign, planAds, saveCampaigns, type Campaign, type CampaignAd } from "./campaigns";
import { EdgeError } from "./edgeFn";
import { blankImage, imageWrite, loadImages, saveImage, type SavedImage } from "./images";
import type { MakeResponse } from "./remix";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
let session: MemStorage;
const U = "u1";

beforeEach(() => {
  storage = new MemStorage();
  session = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: session, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true });
  vi.stubGlobal("dispatchEvent", () => true);
  make.mockReset();
  Object.values(adl).forEach((f) => f.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const ANGLES = [
  { id: "a1", title: "Plan early", line: "Care costs land on the family." },
  { id: "a2", title: "See the work", line: "" },
];
const BUDGET = { daily: 50, url: "https://example.com/", countries: ["SG", "MY"], ages: [25, 54] as [number, number] };
const campaign = (o: Partial<Campaign> = {}): Campaign => ({
  id: "c1", name: "Young families | November", createdAt: "2026-11-11T00:00:00.000Z", audience: "au-1", audienceName: "Young families", angles: ANGLES,
  platforms: [], formats: [], weeks: 4, perWeek: 3, startDay: "2026-11-16", pictures: "stock", target: { posts: 0, winners: 1 }, posts: [],
  runs: "ads", budget: BUDGET, ads: planAds(ANGLES, []), ...o,
});
const store = (c: Campaign) => expect(saveCampaigns(U, [c])).toBeNull();
const ad = (n: number) => getCampaign(U, "c1")?.ads?.find((a) => a.n === n) as CampaignAd;
const made = (id: string, o: Partial<SavedImage> = {}): SavedImage => ({ ...blankImage({ layout: "headline" }), id, words: { headline: "Start before it costs more" }, ...o });
const reply = (o: Partial<Extract<MakeResponse["result"], { as: "image" }>> = {}): MakeResponse => ({
  as: "image",
  result: { as: "image", layout: "quote", layoutBy: "default", words: { quote: "Care is cheaper planned." }, caption: "Plan early.", ...o },
  flags: { copied: [], claim: false, invented: false, mas: false },
  usage: { used: 1, limit: 30 },
});
const view = (n: number) => adViews(getCampaign(U, "c1")!, loadImages(U), imageWrite()).find((v) => v.ad.n === n)!;

describe("the ads group", () => {
  it("reads each ad's state from its design and the write in this tab, and counts made and drafts over the ads not skipped", () => {
    const ads = planAds(ANGLES, []).map((a) => ({ ...a }));
    ads[0].designId = "img-made1x";
    ads[1].designId = "img-blank1";
    ads[2].skipped = true;
    ads[3].designId = "img-gone11";
    saveImage(U, made("img-made1x", { layout: "quote", words: { quote: "Q" } }));
    saveImage(U, made("img-blank1", { words: { topic: "Plan early" } }));
    const views = adViews({ ads }, loadImages(U), { id: 9, designId: "img-blank1", state: "writing" });
    expect(views.slice(0, 4).map((v) => v.state)).toEqual(["made", "making", "skipped", "draft"]);
    // a made ad shows its design's layout (Edit may change it); a draft its own
    expect(views.slice(0, 2).map((v) => v.layout)).toEqual(["quote", "quote"]);
    expect(views[3].gone).toBe(true);
    const k = adCounts(views);
    expect(k).toEqual({ live: 9, made: 1, drafts: 8 });
    expect(groupTitle(k.live)).toBe("9 ads launch together");
    expect(countsLine(k)).toBe("1 made, 8 drafts");
    expect(countsLine({ made: 9, drafts: 1 })).toBe("9 made, 1 draft");
    expect(layoutMix(views)).toBe("4 Quote card, 3 Headline ad, 2 Stat card");
    expect(adCounts(adViews({}, [], null))).toEqual({ live: 0, made: 0, drafts: 0 });
  });
});

describe("Make, Swap layout, Skip and Edit", () => {
  it("Make writes the ad into a new design with /image's own make, on the seam's layout and the ad's angle; Undo makes it a draft again", async () => {
    store(campaign());
    make.mockResolvedValue(reply());
    const r = await makeAd(U, "c1", 2);
    expect(r).toMatchObject({ ok: true, toast: "Ad 2 is made." });
    expect(make).toHaveBeenCalledTimes(1);
    expect(make.mock.calls[0][0]).toMatchObject({ mode: "make", as: "image", layout: "quote", topic: "See the work" });
    const v = view(2);
    expect(v.state).toBe("made");
    expect(v.design).toMatchObject({ layout: "quote", size: "4x5", words: { quote: "Care is cheaper planned.", topic: "See the work", caption: "Plan early." } });
    expect(await makeAd(U, "c1", 2)).toEqual({ ok: false, error: AD_MADE });
    if (r.ok) r.undo();
    expect(view(2).state).toBe("draft");
    expect(ad(2).designId).toBeUndefined();
    // the design stays in Your images: the make was spent
    expect(loadImages(U).some((d) => d.id === v.design?.id)).toBe(true);
  });

  it("remixes the competitor ad the ad was planned on: its source goes to the writer, the angle in the note", async () => {
    storage.setItem(`content-studio-competitor-ads-${U}`, JSON.stringify({
      finch: { checkedAt: "2026-11-01T00:00:00Z", pageId: "1", pageName: "Finch", seen: [], fresh: [], ads: [
        { id: "777", format: "image", headline: "Your team, in one view", body: "See who did what.", cta: null, link: null, image: null, video: null, start: "2026-10-01", end: null, active: true, platforms: [], versions: 1 },
      ] },
    }));
    store(campaign({ ads: planAds(ANGLES, [{ key: "ad:777", label: "Finch, 41 days running" }]) }));
    make.mockResolvedValue(reply({ layout: "headline", words: { headline: "One view of the week" } }));
    await makeAd(U, "c1", 1);
    const body = make.mock.calls[0][0];
    expect(body).toMatchObject({ layout: "headline", source: { key: "ad:777", author: "Finch" }, note: "Push this angle: Plan early. Care costs land on the family." });
    expect("topic" in body).toBe(false);
    expect(view(1).design?.source).toEqual({ key: "ad:777", label: "Finch, 41 days running" });
  });

  it("one static ad at a time; a failed Make keeps its line and the next Make reuses the same design", async () => {
    store(campaign());
    let finish: (v: MakeResponse) => void = () => {};
    make.mockReturnValueOnce(new Promise((res) => (finish = res)));
    const first = makeAd(U, "c1", 1);
    expect(view(1).state).toBe("making");
    expect(await makeAd(U, "c1", 3)).toEqual({ ok: false, error: AD_BUSY });
    expect(await swapAdLayout(U, "c1", 1)).toMatchObject({ ok: false });
    finish(reply({ layout: "headline", words: { headline: "H" } }));
    expect((await first).ok).toBe(true);

    make.mockRejectedValueOnce(new EdgeError("You've used today's remixes.", 429, "daily_limit"));
    const failed = await makeAd(U, "c1", 3);
    expect(failed).toEqual({ ok: false, error: "You've used today's remixes.", capped: true });
    expect(ad(3).error).toBe("You've used today's remixes.");
    const design = ad(3).designId;
    expect(view(3).state).toBe("draft");
    make.mockResolvedValueOnce(reply({ layout: "stat", words: { statLabel: "of families plan care late" } }));
    expect((await makeAd(U, "c1", 3)).ok).toBe(true);
    expect(ad(3)).toMatchObject({ designId: design });
    expect(ad(3).error).toBeUndefined();
  });

  it("Swap layout takes the next layout on a draft, Undo puts it back, and a made ad changes its layout in Edit", () => {
    store(campaign());
    const r = swapAdLayout(U, "c1", 1);
    expect(r).toMatchObject({ ok: true, toast: "Ad 1 is a quote card now." });
    expect(ad(1).layout).toBe("quote");
    expect(swapAdLayout(U, "c1", 1).ok).toBe(true);
    expect(ad(1).layout).toBe("stat");
    expect(swapAdLayout(U, "c1", 1).ok).toBe(true);
    expect(ad(1).layout).toBe("headline");
    if (r.ok) r.undo();
    expect(ad(1).layout).toBe("headline");
    saveImage(U, made("img-made1x"));
    store(campaign({ ads: planAds(ANGLES, []).map((a) => (a.n === 1 ? { ...a, designId: "img-made1x" } : a)) }));
    expect(swapAdLayout(U, "c1", 1)).toEqual({ ok: false, error: AD_SWAP_MADE });
  });

  it("Skip takes an ad out of the counts and Undo brings it back", () => {
    store(campaign());
    const r = skipAd(U, "c1", 4);
    expect(r).toMatchObject({ ok: true, toast: "Ad 4 skipped." });
    expect(adCounts(adViews(getCampaign(U, "c1")!, [], null)).live).toBe(9);
    if (r.ok) r.undo();
    expect(ad(4).skipped).toBeUndefined();
    expect(skipAd(U, "c1", 4).ok).toBe(true);
    expect(skipAd(U, "c1", 4)).toMatchObject({ ok: true, toast: "Ad 4 is back." });
    expect(skipAd(U, "c1", 99)).toMatchObject({ ok: false });
  });

  it("Edit opens a made ad's design on /image, and gives a draft its design first without writing anything", () => {
    saveImage(U, made("img-made1x", { layout: "quote", size: "1x1", words: { quote: "Q" } }));
    store(campaign({ ads: planAds(ANGLES, []).map((a) => (a.n === 1 ? { ...a, designId: "img-made1x" } : a)) }));
    expect(editAdLink(U, "c1", 1)).toBe("/image?layout=quote&size=1x1&image=img-made1x");
    const link = editAdLink(U, "c1", 3);
    const id = ad(3).designId;
    expect(link).toBe(`/image?layout=stat&image=${id}`);
    expect(loadImages(U).find((d) => d.id === id)).toMatchObject({ layout: "stat", words: { topic: "Plan early: Care costs land on the family." } });
    expect(view(3).state).toBe("draft");
    expect(make).not.toHaveBeenCalled();
  });
});

describe("Send the ads to AdLauncher", () => {
  const withMade = (ns: number[], layout: SavedImage["layout"] = "headline") => {
    for (const n of ns) saveImage(U, made(`img-made${n}x`, layout === "stat" ? { layout, words: { statLabel: "of families" } } : {}));
    store(campaign({ ads: planAds(ANGLES, []).map((a) => (ns.includes(a.n) ? { ...a, designId: `img-made${a.n}x` } : a)) }));
    return adViews(getCampaign(U, "c1")!, loadImages(U), null);
  };

  it("splits the daily budget across the made ads, to the cent below, over the campaign's days", () => {
    const views = withMade([1, 2, 4]);
    const plan = sendPlan(campaign(), views, [{ designId: "img-made2x" }, {}]);
    expect(plan.ads.map((v) => v.ad.n)).toEqual([1, 2, 4]);
    expect(plan.perAd).toBe(16.66);
    expect(plan.perAd * plan.ads.length).toBeLessThanOrEqual(BUDGET.daily);
    expect(plan.days).toBe(28);
    expect(plan.sent).toEqual(["img-made2x"]);
    expect(sendPlan(campaign({ weeks: 20 }), views, []).days).toBe(90);
    expect(sendPlan(campaign(), [], []).perAd).toBe(0);
  });

  it("hands each ad to Run as an ad, filled in, and never calls AdLauncher", () => {
    const views = withMade([1, 2]);
    const c = getCampaign(U, "c1")!;
    const plan = sendPlan(c, views, []);
    // what was typed in this ad's sheet before stays; the campaign's settings replace the rest
    session.setItem(sheetKey("img-made1x"), JSON.stringify({ headline: "My own headline", goal: "leads", dailyBudget: "", days: "7" }));
    const to = handOff(c, plan.ads[0], plan);
    expect(to).toBe("/image?image=img-made1x&ad=1");
    const sheet = JSON.parse(session.getItem(sheetKey("img-made1x"))!);
    expect(sheet).toEqual({ headline: "My own headline", goal: "website", url: "https://example.com/", dailyBudget: "25", days: "28" });
    expect(sheetPrefill(c, plan)).toEqual({ goal: "website", url: "https://example.com/", dailyBudget: "25", days: "28" });

    // the call the sheet's Check then builds from it: a dry run, paused by AdLauncher, to the landing page at the per-ad budget
    const form: AdForm = { pageId: "p1", adAccountId: "a1", privacyUrl: "", headline: "H", primaryText: "T", cta: "LEARN_MORE", approval: "", ...sheet };
    const now = Date.parse("2026-11-11T04:00:00Z");
    const args = campaignArgs(form, { name: "H | 11 Nov 2026", imageUrl: "https://x.example/a.jpg", now });
    expect(args).toMatchObject({ dryRun: true, objective: "OUTCOME_TRAFFIC", destinationType: "WEBSITE", destinationUrl: "https://example.com/", dailyBudget: 25, locations: [{ key: "SG", type: "country" }] });
    expect(Date.parse(String(args.endDate)) - Date.parse(String(args.startDate))).toBe(28 * 86_400_000);

    expect(adl.call).not.toHaveBeenCalled();
    expect(adl.image).not.toHaveBeenCalled();
    expect(adl.status).not.toHaveBeenCalled();
  });

  it("lists what the sheet can't take, and holds back a stat card until it has your number", () => {
    expect(notTaken(BUDGET)).toEqual([
      "Countries: Singapore, Malaysia. The ad starts in Singapore only.",
      "Ages: 25 to 54.",
      "Budget: US$ here, your ad account's own currency in AdLauncher.",
    ]);
    expect(notTaken({ ...BUDGET, countries: ["SG"] })[0]).toBe("Ages: 25 to 54.");
    const [stat] = withMade([3], "stat").filter((v) => v.state === "made");
    expect(sendBlock(stat)).toBe("Type your own number and where it's from.");
    expect(sendBlock(withMade([1]).find((v) => v.ad.n === 1)!)).toBeNull();
  });
});
