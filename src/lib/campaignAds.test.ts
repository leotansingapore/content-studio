import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
// AdLauncher is never called from a campaign: these stand in for every call it could make, and must stay untouched
const adl = vi.hoisted(() => ({ call: vi.fn(), image: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/adlauncher", async (orig) => ({ ...(await orig<typeof import("./adlauncher")>()), adlCall: adl.call, adlImage: adl.image, adlStatus: adl.status }));

import { campaignArgs, type AdForm } from "./adlauncher";
import {
  AD_BUSY, AD_MADE, AD_REDRAW_DRAFT, AD_SWAP_MADE, adCounts, adViews, countsLine, editAdLink, groupTitle, handOff, layoutMix, makeAd, nextToSend, notTaken, prefillSheet, redrawAd, sendBlock, sendPlan,
  sendProgress, sheetKey, sheetPrefill, skipAd, swapAdLayout,
} from "./campaignAds";
import { adLayouts, getCampaign, planAds, saveCampaigns, type Campaign, type CampaignAd } from "./campaigns";
import { EdgeError } from "./edgeFn";
import { blankImage, imageWrite, loadImages, saveImage, type SavedImage } from "./images";
import type { MakeResponse } from "./remix";
import { parseMakeRequest } from "../../supabase/functions/remix/logic";

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
    expect(layoutMix(views)).toBe("2 Quote card, 1 Us vs them, 1 A friend recommends you, 1 Lo-fi note, 1 AI chat answer, 1 Forum thread, 1 Concern and answer, 1 Story reply");
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

  it("a static format is written by the same make /image sends for it, with the product photo and the flyer's price in the design", async () => {
    storage.setItem(`content-studio-products-${U}`, JSON.stringify({ items: [{ id: "pd-brew1", name: "Brew", what: "", forWho: "", price: "$6 a bottle", pictures: ["cimg-photo1"], sources: [""] }] }));
    const layouts = ["us-vs-them", "tear-off-flyer", "text-chat", "phone-share"] as const;
    store(campaign({ ads: planAds(ANGLES, []).map((a, i) => (layouts[i] ? { ...a, layout: layouts[i] } : a)) }));
    for (const [i, layout] of layouts.entries()) {
      make.mockResolvedValueOnce(reply({ layout: layout as never, words: { headline: "H", one: "hello", message: "look at this" } as never }));
      expect((await makeAd(U, "c1", i + 1)).ok).toBe(true);
      const body = make.mock.calls[i][0];
      expect(body).toMatchObject({ mode: "make", as: "image", layout });
      // the server takes this body as it is
      expect(parseMakeRequest(body).ok).toBe(true);
      expect(view(i + 1).design?.layout).toBe(layout);
    }
    // best with a photo, and needs one: the product photo; a chat shows none
    expect(view(1).design?.pictureKey).toBe("cimg-photo1");
    expect(view(4).design?.pictureKey).toBe("cimg-photo1");
    expect(view(3).design?.pictureKey).toBeUndefined();
    expect(view(2).design?.words.price).toBe("$6 a bottle");
    expect(view(1).design?.words.price).toBeUndefined();
    expect(sendBlock(view(4))).toBeNull();
    // the photo gone from the design: the sheet stays shut until one is added in Edit
    expect(sendBlock({ ...view(4), design: { ...view(4).design!, pictureKey: undefined } })).toBe("Add a picture first.");
  });

  it("names the business as Post choices says: always by default, never when set to Never, a coin flip on Sometimes", async () => {
    store(campaign());
    storage.setItem(`content-studio-carousel-brand-${U}`, JSON.stringify({ color: "#123456", name: "Hilltop", handle: "" }));
    const choose = (mention: string) => storage.setItem(`content-studio-post-choices-${U}`, JSON.stringify({ mention }));
    const named = async (n: number) => {
      make.mockResolvedValueOnce(reply({ layout: "headline", words: { headline: "H" } }));
      await makeAd(U, "c1", n);
      return make.mock.calls.at(-1)?.[0].brand.mention;
    };
    expect(await named(1)).toBe(true);
    choose("never");
    expect(await named(2)).toBe(false);
    choose("sometimes");
    const flip = vi.spyOn(Math, "random");
    flip.mockReturnValue(0.9);
    expect(await named(3)).toBe(false);
    flip.mockReturnValue(0.1);
    expect(await named(4)).toBe(true);
    flip.mockRestore();
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
    expect(r).toMatchObject({ ok: true, toast: "Ad 1 is now: Quote card." });
    expect(ad(1).layout).toBe("quote");
    // the same list the plan chose from, the registry's name on each, and round again after the last
    const list = adLayouts({});
    const seen = ["quote"];
    for (let i = 0; i < list.length - 1; i++) {
      const s = swapAdLayout(U, "c1", 1);
      expect(s.ok).toBe(true);
      seen.push(ad(1).layout);
    }
    expect(seen).toEqual([...list.slice(1), "headline"]);
    expect(seen).not.toContain("phone-share");
    expect(swapAdLayout(U, "c1", 1)).toMatchObject({ toast: "Ad 1 is now: Quote card." });
    expect(swapAdLayout(U, "c1", 1)).toMatchObject({ toast: "Ad 1 is now: Text message chat." });
    if (r.ok) r.undo();
    expect(ad(1).layout).toBe("headline");
    // with a product photo the formats that need one join the cycle
    storage.setItem(`content-studio-products-${U}`, JSON.stringify({ items: [{ id: "pd-brew1", name: "Brew", what: "", forWho: "", pictures: ["cimg-photo1"], sources: [""] }] }));
    store(campaign({ ads: planAds(ANGLES, []).map((a) => (a.n === 1 ? { ...a, layout: "email-screenshot" as const } : a)) }));
    expect(swapAdLayout(U, "c1", 1).ok).toBe(true);
    expect(ad(1).layout).toBe("phone-share");
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
    expect(link).toBe(`/image?layout=text-chat&image=${id}`);
    expect(loadImages(U).find((d) => d.id === id)).toMatchObject({ layout: "text-chat", words: { topic: "Plan early: Care costs land on the family." } });
    expect(view(3).state).toBe("draft");
    expect(make).not.toHaveBeenCalled();
  });
});

describe("Redraw", () => {
  it("writes a made ad again in the layout it has now, Undo puts the words before back, and a draft is made first", async () => {
    store(campaign());
    make.mockResolvedValueOnce(reply());
    await makeAd(U, "c1", 2);
    const before = view(2).design!;
    expect(await redrawAd(U, "c1", 1)).toEqual({ ok: false, error: AD_REDRAW_DRAFT });
    make.mockResolvedValueOnce(reply({ words: { quote: "Planned care costs less." }, caption: "Second go." }));
    const r = await redrawAd(U, "c1", 2);
    expect(r).toMatchObject({ ok: true, toast: "Ad 2 is redrawn." });
    expect(make.mock.calls[1][0]).toMatchObject({ mode: "make", as: "image", layout: "quote", topic: "See the work" });
    expect(view(2)).toMatchObject({ state: "made", design: { id: before.id, words: { quote: "Planned care costs less.", caption: "Second go." } } });
    if (r.ok) r.undo();
    expect(view(2).design?.words).toEqual(before.words);
    // a redraw that fails leaves the made ad as it was, with the reason
    make.mockRejectedValueOnce(new EdgeError("Couldn't write it.", 502));
    expect(await redrawAd(U, "c1", 2)).toMatchObject({ ok: false });
    expect(view(2)).toMatchObject({ state: "made", design: { words: before.words } });
    expect(adl.call).not.toHaveBeenCalled();
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

  it("leaves a made ad that was then skipped out of the send, so its share of the budget goes to the rest", () => {
    for (const n of [1, 2, 3]) saveImage(U, made(`img-made${n}x`));
    store(campaign({ ads: planAds(ANGLES, []).map((a) => (a.n <= 3 ? { ...a, designId: `img-made${a.n}x`, ...(a.n === 3 ? { skipped: true } : {}) } : a)) }));
    const plan = sendPlan(getCampaign(U, "c1")!, adViews(getCampaign(U, "c1")!, loadImages(U), null), []);
    expect(plan.ads.map((v) => v.ad.n)).toEqual([1, 2]);
    expect(plan.perAd).toBe(25);
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

  it("walks the made ads in order: the next one not yet in AdLauncher, past one that needs an edit, to done", () => {
    const views = withMade([1, 2, 4]);
    const c = getCampaign(U, "c1")!;
    const plan = (sent: string[]) => sendPlan(c, views, sent.map((designId) => ({ designId })));
    expect(nextToSend(plan([]))?.ad.n).toBe(1);
    expect(sendProgress(plan([]))).toEqual({ sent: 0, of: 3, blocked: 0, done: false });
    // after Ad 1 is made paused, on to Ad 2; one sent out of order is passed over, and the walk wraps to what is left
    expect(nextToSend(plan(["img-made1x"]), 1)?.ad.n).toBe(2);
    expect(nextToSend(plan(["img-made1x", "img-made2x"]), 2)?.ad.n).toBe(4);
    expect(nextToSend(plan(["img-made2x", "img-made4x"]), 4)?.ad.n).toBe(1);
    expect(sendProgress(plan(["img-made2x", "img-made4x"]))).toEqual({ sent: 2, of: 3, blocked: 0, done: false });
    expect(nextToSend(plan(["img-made1x", "img-made2x", "img-made4x"]), 4)).toBeNull();
    expect(sendProgress(plan(["img-made1x", "img-made2x", "img-made4x"]))).toEqual({ sent: 3, of: 3, blocked: 0, done: true });
    expect(sendProgress(sendPlan(c, [], []))).toEqual({ sent: 0, of: 0, blocked: 0, done: false });
    // a stat card with no number can't open the sheet: the walk goes round it and counts it
    const stat = withMade([3], "stat");
    const held = sendPlan(getCampaign(U, "c1")!, stat, []);
    expect(nextToSend(held)).toBeNull();
    expect(sendProgress(held)).toEqual({ sent: 0, of: 1, blocked: 1, done: false });
  });

  it("fills the sheet in place for the walk, keeping what was typed, and never calls AdLauncher", () => {
    const views = withMade([1, 2]);
    const c = getCampaign(U, "c1")!;
    const plan = sendPlan(c, views, []);
    session.setItem(sheetKey("img-made2x"), JSON.stringify({ primaryText: "Typed before", approval: "AP-1", dailyBudget: "3" }));
    prefillSheet(c, plan.ads[1], plan);
    expect(JSON.parse(session.getItem(sheetKey("img-made2x"))!)).toEqual({ primaryText: "Typed before", approval: "AP-1", goal: "website", url: "https://example.com/", dailyBudget: "25", days: "28" });
    expect(session.getItem(sheetKey("img-made1x"))).toBeNull();
    expect(adl.call).not.toHaveBeenCalled();
    expect(adl.image).not.toHaveBeenCalled();
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
