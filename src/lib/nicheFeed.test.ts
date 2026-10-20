import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { LibraryAd } from "@/lib/adLibrary";
import type { FeedPost } from "@/lib/competitorPosts";
import type { Competitor } from "@/lib/competitors";
import type { FollowedAccount, TrackedPost } from "@/lib/following";

const callFn = vi.fn();
let facts = { name: "ActivityTracker", site: "activity-tracker.io", sells: "A sales activity tracker", serves: "Self-employed salespeople", topics: [] as string[] };
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
vi.mock("@/lib/competitors", async (orig) => ({ ...(await orig<typeof import("@/lib/competitors")>()), brandFacts: () => facts }));

const n = await import("./nicheFeed");
const { buildAdWriteUrl } = await import("@/lib/adsSwipe");
const { likeOf } = await import("@/lib/adLibrary");
const { remixUrl } = await import("@/lib/following");
const { buildRemixUrl, getAllTopPosts } = await import("@/lib/topPosts");
const { buildTrendRemixUrl, getTrends } = await import("@/lib/trends");
const { scoreAccount } = await import("../../supabase/functions/_shared/outlier.ts");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, val: string) {
    if (val.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, val);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
  facts = { ...facts, sells: "A sales activity tracker", serves: "Self-employed salespeople" };
});
afterEach(() => vi.unstubAllGlobals());

// counted from today, so the 48-hour line never rots
const NOW = Date.now();
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const post = (id: string, views: number | null, d = 5, caption = `Caption ${id}`): TrackedPost =>
  ({ id, url: `https://www.instagram.com/p/${id}/`, format: "image", caption, postedAt: ago(d), views, likes: 100, comments: 5 });
const account = (handle: string, posts: TrackedPost[]): FollowedAccount =>
  ({ platform: "instagram", handle, addedAt: ago(30), history: [], posts, seen: [], fresh: [], checkedAt: ago(1) });
const competitor: Competitor = { id: "pipedrive-ab12", name: "Pipedrive", site: "pipedrive.com", logo: null, why: "", fbPageId: null, handles: { instagram: "pipedrive" }, adsCountry: "SG", source: "typed", addedAt: ago(30) };
const ad = (id: string, scope: string, o: Partial<LibraryAd> = {}): LibraryAd => ({
  id, scope, advertiser: scope === "space" ? "Lead Co" : scope === "sg" ? "Singlife" : "Pipedrive", format: "image", headline: `Headline ${id}`, body: `Body ${id}`,
  cta: null, link: null, image: null, video: null, start: ago(40), end: null, active: true, days: 40, proven: true, platforms: ["facebook"], hook: null, emotion: null,
  audience: null, industry: null, libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`, ...o,
});

const TOP = getAllTopPosts().slice(0, 2);
const TRENDS = getTrends().slice(0, 1);
const pipedrive = account("pipedrive", Array.from({ length: 8 }, (_, k) => post(`P${k}`, 1000 + k * 500)));
const scores = scoreAccount(pipedrive.posts, NOW);
const COMP: FeedPost[] = pipedrive.posts.map((p) => ({ key: `instagram:${p.id}`, competitor, account: pipedrive, post: p, outlier: scores[p.id], fresh: false }));
const followed = account("mrbrown", [post("M1", null), post("P0", 1000)]);
const ADS = [ad("111", "pipedrive-ab12"), ad("222", "space", { fit: 0.8 }), ad("333", "sg", { industry: "Insurance" })];
const STORES = { topPosts: TOP, trends: TRENDS, following: [followed], competitorPosts: COMP, ads: ADS };

describe("buildFeed: seven sources in one list", () => {
  const feed = n.buildFeed(STORES, NOW);
  const byId = (id: string) => feed.find((i) => i.id === id)!;

  it("gives each item a unique id prefixed by its source, and its chip", () => {
    expect(new Set(feed.map((i) => i.id)).size).toBe(feed.length);
    expect(new Set(feed.map((i) => i.id.split(":")[0]))).toEqual(new Set(["cp", "fo", "tp", "tr", "ca", "sa", "sg"]));
    expect(feed.map((i) => n.CHIPS[i.from])).toContain("Singapore pick");
    for (const i of feed) expect(i.id.startsWith(`${i.from}:`)).toBe(true);
  });

  it("links each card to its own remix", () => {
    const t = TOP[0];
    expect(byId(`tp:${t.advisorId}-${t.shortCode}`).remixUrl).toBe(buildRemixUrl(t, { name: t.advisorName, handle: t.handle }));
    expect(byId(`tr:${TRENDS[0].id}`).remixUrl).toBe(buildTrendRemixUrl(TRENDS[0]));
    expect(byId("fo:instagram:M1").remixUrl).toBe(remixUrl(followed, followed.posts[0]));
    expect(byId("cp:instagram:P3")).toMatchObject({ remixUrl: remixUrl(pipedrive, pipedrive.posts[3]), who: "Pipedrive", account: "@pipedrive" });
    expect(byId("sg:333").remixUrl).toBe(buildAdWriteUrl(likeOf(ADS[2])));
    expect(byId("ca:111").source.key).toBe("ad:111");
    expect(byId("sa:222").kind).toBe("ad");
  });

  it("shows a competitor's post that is also followed once, as the competitor's, with its outlier score", () => {
    expect(feed.filter((i) => i.id.endsWith(":P0"))).toHaveLength(1);
    expect(byId("cp:instagram:P7").outlier?.ratio).toBeGreaterThan(1);
    expect(byId(`tp:${TOP[0].advisorId}-${TOP[0].shortCode}`).outlier).toBeNull();
  });
});

describe("arrange: matched first, then the rest, 4 posts to an ad", () => {
  const feed = n.buildFeed(STORES, NOW);

  it("puts items at 0.6 or more first, each group by outlier score", () => {
    const { matched, other } = n.arrange(feed, { "cp:instagram:P1": 0.9, "cp:instagram:P7": 0.6, "sa:222": 0.95, "tp:x": 0.9, "fo:instagram:M1": 0.59 });
    expect(matched.map((i) => i.id)).toEqual(["cp:instagram:P7", "cp:instagram:P1", "sa:222"]);
    expect(other.some((i) => i.id === "fo:instagram:M1")).toBe(true);
    expect(matched.length + other.length).toBe(feed.length);
  });

  it("interleaves 4 organic posts to each ad under All, and filters by kind", () => {
    const { other } = n.arrange(feed, {});
    expect(other.slice(0, 10).map((i) => i.kind)).toEqual(["organic", "organic", "organic", "organic", "ad", "organic", "organic", "organic", "organic", "ad"]);
    expect(n.arrange(feed, {}, { kind: "ads" }).other.map((i) => i.id)).toEqual(["ca:111", "sa:222", "sg:333"]);
    expect(n.arrange(feed, {}, { kind: "organic" }).other.every((i) => i.kind === "organic")).toBe(true);
    expect(n.interleave([], ADS.map((a) => ({ id: a.id }) as never)).length).toBe(3);
  });

  it("puts running ads first, then the longest running", () => {
    const ads = n.buildFeed({ ...STORES, ads: [ad("1", "sg", { active: false, days: 300 }), ad("2", "sg", { days: 10 }), ad("3", "sg", { days: 90 })] }, NOW);
    expect(n.arrange(ads, {}, { kind: "ads" }).other.map((i) => i.id)).toEqual(["sg:3", "sg:2", "sg:1"]);
  });

  it("leaves hidden items out, and searches caption, handle and advertiser", () => {
    const all = (o: Parameters<typeof n.arrange>[2]) => { const v = n.arrange(feed, {}, o); return [...v.matched, ...v.other].map((i) => i.id); };
    expect(all({ hidden: ["cp:instagram:P1"] })).not.toContain("cp:instagram:P1");
    expect(all({ q: "caption m1" })).toEqual(["fo:instagram:M1"]);
    expect(all({ q: "@mrbrown" })).toEqual(["fo:instagram:M1"]);
    expect(all({ q: "lead co" })).toEqual(["sa:222"]);
    expect(all({ q: "nothing like this" })).toEqual([]);
  });
});

describe("Today's 5", () => {
  const items = [
    ...Array.from({ length: 4 }, (_, k) => ({ id: `cp:instagram:A${k}`, kind: "organic", account: "@a" })),
    ...Array.from({ length: 3 }, (_, k) => ({ id: `sg:${k}`, kind: "ad", account: `Brand ${k}` })),
    { id: "tp:b-1", kind: "organic", account: "@b" },
    { id: "tp:c-1", kind: "organic", account: "@c" },
  ] as never as Parameters<typeof n.pickToday>[0];
  const fresh = { picks: { day: "", ids: [] }, picked: {}, hidden: [] };

  it("takes at most 2 ads and 2 from one account", () => {
    expect(n.pickToday(items, fresh, "2026-10-20")).toEqual(["cp:instagram:A0", "cp:instagram:A1", "sg:0", "sg:1", "tp:b-1"]);
  });

  it("keeps the day's picks all day", () => {
    expect(n.pickToday(items, { ...fresh, picks: { day: "2026-10-20", ids: ["x", "y"] } }, "2026-10-20")).toEqual(["x", "y"]);
  });

  it("skips what was picked in the 7 days before and what is hidden", () => {
    const picked = { "cp:instagram:A0": "2026-10-14", "cp:instagram:A1": "2026-10-13", "sg:0": "2026-10-19" };
    expect(n.pickToday(items, { ...fresh, picked, hidden: ["tp:b-1"] }, "2026-10-20")).toEqual(["cp:instagram:A1", "cp:instagram:A2", "sg:1", "sg:2", "tp:c-1"]);
  });

  it("makes the picks once a Singapore day and marks them picked", () => {
    const feed = n.buildFeed(STORES, NOW);
    n.saveNiche("u1", { ...n.EMPTY_NICHE, scores: { "cp:instagram:P7": 0.9, "sg:333": 0.8 } });
    n.settlePicks("u1", feed, NOW);
    const s = n.loadNiche("u1");
    expect(s.picks.ids).toEqual(["cp:instagram:P7", "sg:333"]);
    expect(s.picked["sg:333"]).toBe(s.picks.day);
    n.saveNiche("u1", { ...s, scores: { ...s.scores, "cp:instagram:P6": 0.9 } });
    n.settlePicks("u1", feed, NOW);
    expect(n.loadNiche("u1").picks.ids).toEqual(["cp:instagram:P7", "sg:333"]);
  });
});

describe("the niche store", () => {
  it("reads bad JSON as empty and trims to its caps", () => {
    storage.setItem(n.nicheKey("u1"), "{nope");
    expect(n.loadNiche("u1")).toEqual(n.EMPTY_NICHE);
    const scores = Object.fromEntries(Array.from({ length: 2100 }, (_, k) => [`tp:${k}`, 0.5]));
    const s = n.saveNiche("u1", { ...n.EMPTY_NICHE, scores, hidden: Array.from({ length: 600 }, (_, k) => `h${k}`) });
    expect(Object.keys(s.scores)).toHaveLength(2000);
    expect(s.scores["tp:2099"]).toBe(0.5);
    expect(s.hidden).toHaveLength(500);
    expect(s.hidden.at(-1)).toBe("h599");
    expect(changed).toHaveBeenCalledWith("content-studio-niche-changed");
  });

  it("keeps fewer scores when storage is full rather than failing", () => {
    const scores = Object.fromEntries(Array.from({ length: 2000 }, (_, k) => [`tp:${k}`, 0.5]));
    storage.full = 20_000;
    expect(Object.keys(n.saveNiche("u1", { ...n.EMPTY_NICHE, scores }).scores)).toHaveLength(500);
    expect(n.loadNiche("u1").scores["tp:1999"]).toBe(0.5);
  });

  it("hides and unhides per brand", () => {
    n.hideItem("u1", "tp:a");
    n.hideItem("u1", "tp:b");
    expect(n.loadNiche("u1").hidden).toEqual(["tp:a", "tp:b"]);
    n.unhideItem("u1", "tp:a");
    expect(n.loadNiche("u1").hidden).toEqual(["tp:b"]);
    storage.setItem("cs-active-profile-u1", "brand2");
    storage.setItem("content-studio-profiles-u1", JSON.stringify([{ id: "me", name: "Me" }, { id: "brand2", name: "Brand 2" }]));
    expect(n.nicheKey("u1")).not.toBe("content-studio-niche-u1");
  });

  it("clears the scores when what the brand sells or serves changes", () => {
    const sig = n.brandSig(facts);
    n.saveNiche("u1", { ...n.EMPTY_NICHE, brandSig: sig, scores: { "tp:a": 0.9 }, hidden: ["tp:b"] });
    expect(n.nicheFor("u1", sig).scores).toEqual({ "tp:a": 0.9 });
    const next = n.brandSig({ ...facts, sells: "Life insurance" });
    expect(next).not.toBe(sig);
    expect(n.nicheFor("u1", next)).toMatchObject({ brandSig: next, scores: {}, hidden: ["tp:b"] });
    expect(n.loadNiche("u1").scores).toEqual({});
  });
});

describe("the match job", () => {
  const feed = n.buildFeed(STORES, NOW);

  it("sends only unscored items, 80 at most, once, and keeps the scores it gets back", async () => {
    // drop ads running 300 days sort before the competitor's and the space's
    const many = n.buildFeed({ ...STORES, topPosts: getAllTopPosts(), ads: [...Array.from({ length: 5 }, (_, k) => ad(`90${k}`, "sg", { days: 300 })), ...ADS] }, NOW);
    n.saveNiche("u2", { ...n.EMPTY_NICHE, brandSig: n.brandSig(facts), scores: { "cp:instagram:P7": 0.9 } });
    callFn.mockImplementation(async (_fn: string, body: { items: { id: string }[] }) => ({ scores: { [body.items[0].id]: 0.8, [body.items[1].id]: 0.1 } }));
    await n.runMatch("u2", many, NOW);
    expect(callFn).toHaveBeenCalledTimes(1);
    const [fn, body] = callFn.mock.calls[0];
    expect(fn).toBe("competitors");
    expect(body).toMatchObject({ mode: "match", brand: { name: "ActivityTracker", sells: facts.sells, serves: facts.serves } });
    expect(body.items).toHaveLength(80);
    expect(body.items.some((i: { id: string }) => i.id === "cp:instagram:P7")).toBe(false);
    // the brand's own sources go first, whatever the shared drops' order
    const own = many.filter((i) => /^(cp|fo|ca|sa):/.test(i.id) && i.id !== "cp:instagram:P7").map((i) => i.id);
    expect(body.items.slice(0, own.length).map((i: { id: string }) => i.id).sort()).toEqual(own.sort());
    expect(body.items.every((i: { text: string }) => i.text.length <= 400)).toBe(true);
    expect(Object.keys(n.loadNiche("u2").scores)).toHaveLength(3);
    expect(n.matchOff("u2")).toBe(false);
    // the next run asks the next 80, never the ones already asked
    await n.runMatch("u2", many, NOW);
    expect(callFn.mock.calls[1][1].items.some((i: { id: string }) => body.items.some((j: { id: string }) => j.id === i.id))).toBe(false);
  });

  it("turns matching off for the session when Jev answers nothing or the call is refused, keeping cached scores", async () => {
    n.saveNiche("u3", { ...n.EMPTY_NICHE, brandSig: n.brandSig(facts), scores: { "sg:333": 0.9 } });
    callFn.mockResolvedValue({ scores: {} });
    await n.runMatch("u3", feed, NOW);
    expect(n.matchOff("u3")).toBe(true);
    expect(n.loadNiche("u3").scores).toEqual({ "sg:333": 0.9 });
    await n.runMatch("u3", feed, NOW);
    expect(callFn).toHaveBeenCalledTimes(1);
    callFn.mockRejectedValue(new EdgeError("Used up for today.", 429, "daily_limit"));
    await n.runMatch("u4", feed, NOW);
    expect(n.matchOff("u4")).toBe(true);
  });

  it("sends nothing without brand facts", async () => {
    facts = { ...facts, sells: "", serves: "" };
    await n.runMatch("u5", feed, NOW);
    expect(callFn).not.toHaveBeenCalled();
  });
});
