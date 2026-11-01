import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowedAccount, TrackedPost } from "@/lib/following";
import type { SimilarState } from "@/lib/similarAccounts";
import { cleanPlays, type Family, type PostLabel } from "../../supabase/functions/social-plays/logic.ts";
import FIXTURE from "../../supabase/functions/social-plays/fixtures/apps-like-yours.json";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const n = await import("./socialNorthStar");
const { EdgeError } = await import("@/lib/edgeFn");

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;

const U = "u1";
const NOW = Date.parse("2026-11-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
/** The fixture: 20 real Apps like yours posts (3 apps on Instagram, 2 creators on TikTok) in the store's shape. */
const SIM = { accounts: FIXTURE.accounts, posts: FIXTURE.posts, dismissed: [], month: null, foundAt: iso(1), searches: [] } as unknown as SimilarState;
const MEDIA = FIXTURE.media as Record<string, Record<string, { cover?: string; seconds?: number }>>;
const post = (id: string, daysAgo: number, o: Partial<TrackedPost> = {}): TrackedPost =>
  ({ id, url: `https://www.tiktok.com/@a/video/${id}`, format: "video", caption: `Post ${id}`, postedAt: iso(daysAgo), views: 1000, likes: 10, comments: 1, ...o });
const label = (family: Family): PostLabel => ({ family, hook: "numbered_tips" });

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", () => true);
  callFn.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("social north star: what a build sends", () => {
  it("sends each account's best posts from the fixture, best first, with this device's covers and the labels it has", () => {
    const refs = n.topRefs(SIM, MEDIA, { "instagram:DdTFZP7iKoS": label("tips-carousel") }, NOW);
    expect(refs.length).toBeGreaterThan(5);
    expect(refs.every((r) => r.ratio >= 1 && r.cover?.startsWith("https://"))).toBe(true);
    const byAccount = new Map<string, number>();
    for (const r of refs) byAccount.set(r.handle, (byAccount.get(r.handle) ?? 0) + 1);
    expect(Math.max(...byAccount.values())).toBeLessThanOrEqual(8);
    expect(refs.find((r) => r.key === "instagram:DdTFZP7iKoS")?.label).toEqual(label("tips-carousel"));
    // the fixture's two TikTok creators are not references; the same accounts added by hand are
    expect(refs.some((r) => r.kind === "creator")).toBe(false);
    const added = { ...SIM, accounts: SIM.accounts.map((e) => (e.kind === "creator" ? { ...e, via: "added" } : e)) };
    expect(n.topRefs(added, MEDIA, {}, NOW).find((r) => r.platform === "tiktok")).toMatchObject({ kind: "creator", seconds: expect.any(Number), name: expect.any(String) });
    expect(n.readCount(added) - n.readCount(SIM)).toBe(2);
    // what goes over the wire is what the function takes, with captions on one line
    const wire = refs.map(({ name: _n, post: _p, ...p }) => p);
    const clean = cleanPlays({ posts: wire, own: [] });
    expect(typeof clean === "string" ? clean : clean.posts).toEqual(wire.map((p) => ({ ...p, caption: p.caption.replace(/\s+/g, " ").trim() })));
  });

  it("sends the brand's own posts of the last 30 days only", () => {
    const ns = { ...n.loadSocialNs(U), own: [{ platform: "instagram" as const, handle: "brand", checkedAt: iso(1), posts: [post("A1", 3, { format: "carousel" }), post("A2", 31)] }] };
    expect(n.ownPosts(ns, { "instagram:brand": { A1: { cover: "https://x.cdninstagram.com/a.jpg", slides: 6 } } }, NOW)).toEqual([
      { key: "instagram:A1", platform: "instagram", handle: "brand", kind: null, format: "carousel", caption: "Post A1", ratio: 0, cover: "https://x.cdninstagram.com/a.jpg", slides: 6 },
    ]);
  });
});

describe("social north star: plays and progress", () => {
  const refs = [
    { key: "tiktok:1", platform: "tiktok" as const, handle: "aa", kind: null, format: "carousel" as const, caption: "", ratio: 6, slides: 7, name: "AA", post: post("1", 3) },
    { key: "tiktok:2", platform: "tiktok" as const, handle: "aa", kind: null, format: "carousel" as const, caption: "", ratio: 5, slides: 9, name: "AA", post: post("2", 4) },
    { key: "tiktok:3", platform: "tiktok" as const, handle: "bb", kind: null, format: "carousel" as const, caption: "", ratio: 2, slides: 5, name: "BB", post: post("3", 5), cover: "https://p16.tiktokcdn.com/3.jpeg" },
  ];
  const labels = { "tiktok:1": label("faceless-slideshow"), "tiktok:2": { family: "faceless-slideshow" as const, hook: "story" as const }, "tiktok:3": label("faceless-slideshow") };

  it("builds a play with how often its accounts post it, a month's target from that, and the best example from each account first", () => {
    // aa's posts span 2 weeks (2 a fortnight: 1 a week), bb's 1 week (1 a week): a median of 1 a week, 4 a month
    const [p] = n.buildPlays(refs, labels, {}, { "tiktok:aa": 2, "tiktok:bb": 1 });
    expect(p).toMatchObject({ id: "faceless-slideshow", accounts: 2, posts: 3, median: 5, perWeek: 1, target: 4, hook: "numbered_tips", slides: 7, seconds: null, recipe: null });
    expect(p.examples.map((e) => e.key)).toEqual(["tiktok:1", "tiktok:3", "tiktok:2"]);
    expect(p.examples[1]).toMatchObject({ handle: "bb", name: "BB", ratio: 2, cover: "https://p16.tiktokcdn.com/3.jpeg", post: { id: "3" } });
  });

  it("keeps the last build's recipe for the same play when this one wrote none", () => {
    const recipe = { hook: "h", body: "b", caption: "c", cta: "d" };
    const [first] = n.buildPlays(refs, labels, { "faceless-slideshow": recipe }, {});
    expect(first.recipe).toEqual(recipe);
    expect(n.buildPlays(refs, labels, {}, {}, [first])[0].recipe).toEqual(recipe);
  });

  it("counts the brand's own posts of the last 30 days per play, each play up to its target, and names the next one", () => {
    const ns = {
      ...n.loadSocialNs(U),
      labels: { "instagram:A": label("meme"), "instagram:B": label("meme"), "instagram:C": label("meme"), "instagram:D": label("screen-demo"), "instagram:OLD": label("screen-demo") },
      own: [{ platform: "instagram" as const, handle: "brand", checkedAt: iso(1), posts: ["A", "B", "C", "D"].map((id) => post(id, 2)).concat(post("OLD", 40)) }],
    };
    const counts = n.ownCounts(ns, NOW);
    expect(counts).toEqual({ meme: 3, "screen-demo": 1 });
    const play = (id: Family, target: number) => ({ id, target }) as never;
    const plays = [play("meme", 2), play("screen-demo", 1), play("tips-carousel", 4)];
    expect(n.progressOf(plays, counts)).toEqual({ done: 3, target: 7 });
    expect(n.nextUp(plays, counts)).toMatchObject({ id: "tips-carousel" });
    expect(n.nextUp(plays.slice(0, 2), counts)).toBeNull();
    expect([0, 0.1, 0.4, 1, 1.6].map(n.targetOf)).toEqual([1, 1, 2, 4, 6]);
  });

  it("hands Home the open brand's next play: short of its target once counted, the best one when not, and nothing with no plan", () => {
    expect(n.homePlay(U)).toBeNull();
    const plays = [{ id: "meme", target: 2, examples: [] }, { id: "screen-demo", target: 3, examples: [] }];
    const ns = (o: object = {}) => storage.setItem(n.socialNsKey(U), JSON.stringify({ ...n.loadSocialNs(U), plays, ...o }));
    ns();
    // no account of the brand's own is counted: the best play, with no count
    expect(n.homePlay(U)).toEqual({ id: "meme", name: "Meme or reaction", target: 2 });
    storage.setItem("content-studio-socialaccounts-u1", JSON.stringify({ instagram: { handle: "@brand", connectedAt: iso(9) } }));
    const own = (ids: string[]) => ({ labels: Object.fromEntries(ids.map((id) => [`instagram:${id}`, label("meme")])), own: [{ platform: "instagram", handle: "brand", checkedAt: iso(1), posts: ids.map((id) => post(id, 2)) }] });
    ns(own(["A"]));
    expect(n.homePlay(U)).toEqual({ id: "meme", name: "Meme or reaction", done: 1, target: 2 });
    ns(own(["A", "B"]));
    expect(n.homePlay(U)).toMatchObject({ id: "screen-demo", done: 0, target: 3 });
    // another brand open on this device has its own plan, none here
    storage.setItem("content-studio-profiles-u1", JSON.stringify([{ id: "me", name: "One" }, { id: "p2", name: "Two" }]));
    storage.setItem("cs-active-profile-u1", "p2");
    expect(n.homePlay(U)).toBeNull();
  });

  it("reads how many weeks each account's posts span, a week at least", () => {
    const sim = { ...SIM, posts: { "tiktok:aa": { posts: [post("1", 1), post("2", 22)] } as FollowedAccount, "tiktok:bb": { posts: [post("3", 1)] } as FollowedAccount } };
    expect(n.weeksOf(sim)).toEqual({ "tiktok:aa": 3, "tiktok:bb": 1 });
  });
});

describe("social north star: when to build", () => {
  const base = () => n.loadSocialNs(U);
  const ready = { read: 12, ownUnlabelled: 0, busy: false };
  it("waits for 2 read references and for the reads and finds to end, then builds the first time", () => {
    expect(n.buildDue(base(), { ...ready, read: 1 }, NOW)).toBe(false);
    expect(n.buildDue(base(), { ...ready, busy: true }, NOW)).toBe(false);
    expect(n.buildDue(base(), ready, NOW)).toBe(true);
  });

  it("rebuilds a week on, when a different number of references was read, when its own posts wait for labels, or a play has no recipe; never within the hour of a try", () => {
    const built = { ...base(), builtAt: iso(2), triedAt: iso(2), basis: 12, plays: [{ recipe: { hook: "h" } } as never] };
    expect(n.buildDue(built, ready, NOW)).toBe(false);
    expect(n.buildDue({ ...built, builtAt: iso(7) }, ready, NOW)).toBe(true);
    expect(n.buildDue(built, { ...ready, read: 13 }, NOW)).toBe(true);
    expect(n.buildDue(built, { ...ready, read: 11 }, NOW)).toBe(true);
    expect(n.buildDue(built, { ...ready, ownUnlabelled: 2 }, NOW)).toBe(true);
    expect(n.buildDue({ ...built, plays: [{ recipe: null } as never] }, ready, NOW)).toBe(true);
    expect(n.buildDue({ ...built, builtAt: iso(7), triedAt: new Date(NOW - 30 * 60_000).toISOString() }, ready, NOW)).toBe(false);
  });

  it("starts the brand's first Apps like yours find by the same rule as /swipe, when uses are left", () => {
    const none = { ...SIM, accounts: [], posts: {}, foundAt: null };
    expect(n.findFirst(none, true)).toBe(true);
    expect(n.findFirst(none, false)).toBe(false);
    expect(n.findFirst(SIM, true)).toBe(false);
  });
});

describe("social north star: the build", () => {
  const seed = () => {
    storage.setItem("content-studio-similar-u1", JSON.stringify(SIM));
    storage.setItem("cs-similar-media-u1", JSON.stringify(MEDIA));
  };

  it("sends the references and its own posts, keeps the labels of what it sent and the plays, and says the server's note", async () => {
    seed();
    let body: { posts: { key: string; label?: PostLabel }[]; own: unknown[] } = { posts: [], own: [] };
    callFn.mockImplementation(async (name: string, b: typeof body) => {
      expect(name).toBe("social-plays");
      body = b;
      // two families across the apps and the creators
      return { labels: Object.fromEntries(b.posts.map((p, k) => [p.key, label(k % 2 ? "tips-carousel" : "faceless-slideshow")]).concat([["instagram:elsewhere", label("meme")]])), recipes: {}, note: "Couldn't write the recipes right now. They come with the next build." };
    });
    await n.runBuild(U);
    const ns = n.loadSocialNs(U);
    expect(body.posts.length).toBeGreaterThan(5);
    expect(body.posts.every((p) => !("name" in p) && !("post" in p))).toBe(true);
    expect(Object.keys(ns.labels).sort()).toEqual(body.posts.map((p) => p.key).sort());
    expect(ns.plays.length).toBeGreaterThan(0);
    // the 3 apps; the 2 creators are not references
    expect(ns).toMatchObject({ builtAt: new Date(NOW).toISOString(), triedAt: new Date(NOW).toISOString(), basis: 3 });
    expect(n.lastNote()).toEqual({ text: "Couldn't write the recipes right now. They come with the next build.", error: false });
    // the next build sends the labels back, so Jev isn't asked again
    await n.runBuild(U);
    expect(body.posts.every((p) => p.label)).toBe(true);
  });

  it("keeps the last plays and says why when the build fails, and marks the try so it waits an hour", async () => {
    seed();
    storage.setItem("content-studio-social-ns-u1", JSON.stringify({ ...n.loadSocialNs(U), plays: [{ id: "meme", examples: [] }], builtAt: iso(8) }));
    callFn.mockRejectedValue(new EdgeError("Couldn't sort the posts right now. Try again in a few minutes.", 502));
    await n.runBuild(U);
    expect(n.loadSocialNs(U)).toMatchObject({ plays: [{ id: "meme" }], builtAt: iso(8), triedAt: new Date(NOW).toISOString() });
    expect(n.lastNote()).toEqual({ text: "Couldn't sort the posts right now. Try again in a few minutes.", error: true });
  });
});

describe("social north star: the brand's own accounts", () => {
  const own = (posts: TrackedPost[], checkedAt = new Date(NOW).toISOString()) => ({ platform: "instagram", handle: "brand", name: "B", url: "u", followers: 1, postsCount: 9, posts, checkedAt });
  beforeEach(() => storage.setItem("content-studio-socialaccounts-u1", JSON.stringify({ instagram: { handle: "@brand", connectedAt: iso(9) } })));

  it("reads 30 the first time and 10 a week later, keeps the last 30 days on the synced key and the covers on this device", async () => {
    callFn.mockResolvedValueOnce(own([post("A1", 2, { cover: "https://x.cdninstagram.com/a.jpg", slides: 5 }), post("A2", 40)]));
    await n.readOwn(U);
    expect(callFn.mock.calls[0][1]).toEqual({ mode: "posts", platform: "instagram", handle: "brand", scope: "similar", limit: 30 });
    expect(n.loadSocialNs(U).own).toEqual([{ platform: "instagram", handle: "brand", checkedAt: new Date(NOW).toISOString(), posts: [post("A1", 2)] }]);
    expect(JSON.parse(storage.getItem("cs-similar-media-u1")!)).toEqual({ "instagram:brand": { A1: { cover: "https://x.cdninstagram.com/a.jpg", slides: 5 } } });
    await n.readOwn(U);
    expect(callFn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 7 * DAY);
    callFn.mockResolvedValueOnce(own([post("A3", -6)], new Date(NOW + 7 * DAY).toISOString()));
    await n.readOwn(U);
    expect(callFn.mock.calls[1][1]).toMatchObject({ limit: 10 });
    expect(n.loadSocialNs(U).own[0].posts.map((p) => p.id)).toEqual(["A3", "A1"]);
  });

  it("waits a week on a private or missing account, and tries the next visit on anything else", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("Couldn't read your account right now. Try again in a few minutes.", 502));
    await n.readOwn(U);
    expect(n.loadSocialNs(U).own).toEqual([]);
    callFn.mockRejectedValueOnce(new EdgeError("@brand is private, so we can't read its posts.", 422, "private"));
    await n.readOwn(U);
    expect(n.loadSocialNs(U).own[0]).toMatchObject({ handle: "brand", error: "@brand is private, so we can't read its posts.", posts: [] });
    await n.readOwn(U);
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(n.lastNote()?.error).toBe(true);
  });
});

describe("social north star: the synced key", () => {
  it("keeps one small key per brand: 12 plays of 3 examples, 210 labels and 60 own posts measure under 100 KB", () => {
    const cover = `https://scontent-waw2-1.cdninstagram.com/v/t51.82787-15/${"9".repeat(60)}_n.jpg?stp=dst-jpg_e35_tt6&${"x".repeat(420)}`;
    const recipe = { hook: "h".repeat(140), body: "b".repeat(220), caption: "c".repeat(140), cta: "d".repeat(100) };
    const ex = (k: number) => ({ key: `instagram:Dd${k}abcdefghi`, platform: "instagram" as const, handle: "a_fairly_long_handle_name", name: "A fairly long account display name here", ratio: 12.3, cover,
      post: post(`Dd${k}abcdefghi`, k, { caption: "x".repeat(150), url: `https://www.instagram.com/p/Dd${k}abcdefghi/` }) });
    const plays = Array.from({ length: 12 }, (_, k) => ({ id: "tips-carousel" as Family, accounts: 9, posts: 14, median: 4.2, perWeek: 1.3, target: 5, hook: "numbered_tips" as const,
      seconds: 34, slides: 8, examples: [ex(k), ex(k + 20), ex(k + 40)], recipe }));
    const labels = Object.fromEntries(Array.from({ length: 210 }, (_, k) => [`tiktok:74${String(k).padStart(17, "0")}`, { family: "faceless-slideshow" as Family, hook: "relatable_pov" as const }]));
    const own = (["instagram", "tiktok"] as const).map((platform) => ({ platform, handle: "brand_handle", checkedAt: iso(1),
      posts: Array.from({ length: 30 }, (_, k) => post(`74${String(k).padStart(17, "0")}`, k, { caption: "y".repeat(150) })) }));
    n.saveSocialNs(U, { builtAt: iso(1), triedAt: iso(1), basis: 40, labels, plays, own });
    const bytes = storage.getItem("content-studio-social-ns-u1")!.length;
    console.log(`content-studio-social-ns-<brand>, 12 plays, 210 labels, 60 own posts: ${Math.round(bytes / 1024)} KB`);
    expect(bytes).toBeLessThan(100 * 1024);
    expect([...storage.s.keys()]).toEqual(["content-studio-social-ns-u1"]);
    expect(n.loadSocialNs(U).plays).toHaveLength(12);
  });

  it("reads junk as empty and drops labels and plays off the lists", () => {
    storage.setItem("content-studio-social-ns-u1", "[nope");
    expect(n.loadSocialNs(U)).toEqual({ builtAt: null, triedAt: null, basis: 0, labels: {}, plays: [], own: [] });
    storage.setItem("content-studio-social-ns-u1", JSON.stringify({ labels: { a: { family: "podcast" }, b: { family: "meme", hook: "nope" } }, plays: [{ id: "podcast", examples: [] }] }));
    expect(n.loadSocialNs(U)).toMatchObject({ labels: { b: { family: "meme", hook: null } }, plays: [] });
  });
});

describe("social north star: example covers", () => {
  it("draws the cover saved with the plan, else this device's latest read of that post, else none", () => {
    const post = { id: "7660904485027319053" } as TrackedPost;
    const e = { key: `tiktok:${post.id}`, platform: "tiktok" as const, handle: "glimmo.official", name: "Glimmo", post, ratio: 231 };
    const media = { "tiktok:glimmo.official": { [post.id]: { cover: "https://p16-sign-sg.tiktokcdn.com/read.jpeg" } } };
    expect(n.exampleCover({ ...e, cover: "https://p16-sign-sg.tiktokcdn.com/saved.jpeg" }, media)).toBe("https://p16-sign-sg.tiktokcdn.com/saved.jpeg");
    expect(n.exampleCover(e, media)).toBe("https://p16-sign-sg.tiktokcdn.com/read.jpeg");
    expect(n.exampleCover({ ...e, handle: "someone.else" }, media)).toBeUndefined();
    expect(n.exampleCover(e, {})).toBeUndefined();
  });
});
