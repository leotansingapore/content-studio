import { beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import { loadDrafts, saveDrafts, setDraftNumbers, type DraftEntry } from "./draftHistory";
import { getTrackedPosts } from "./analytics";
import type { LiveLink, MetricsPost, Numbers } from "./realNumbers";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const {
  extraLine, linkPost, loadRealNumbers, markNotMine, matchOutside, matchPulled, numbersJob, onNumbers, realNumbersOn, refreshIfStale,
  refreshNumbers, rememberRealNumbers, shouldRefresh, unlinkPost,
} = await import("./realNumbers");
const { loadPace } = await import("./pace");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ZP = "67000000000000000000d001";
const HOUR = 3_600_000;
const T0 = Date.parse("2026-10-11T01:00:00Z");

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

// Pulled posts copy the MetricsPost shape social/metrics.ts gives the app (from https://zernio.com/openapi.json).
let pulledPosts: MetricsPost[] = [];
let metrics: () => unknown = () => ({ accounts: [{ id: "65000000000000000000a001", platform: "instagram", username: "leo" }], posts: pulledPosts, pages: 1 });
let judge: (body: { pairs: { key: string }[] }) => unknown = () => ({ links: [] });

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage(), dispatchEvent: () => true };
  pulledPosts = [];
  metrics = () => ({ accounts: [{ id: "65000000000000000000a001", platform: "instagram", username: "leo" }], posts: pulledPosts, pages: 1 });
  judge = () => ({ links: [] });
  callFn.mockReset();
  callFn.mockImplementation(async (name: string, body: { action?: string; pairs?: { key: string }[] }) => {
    if (name === "social") return body.action === "metrics" ? metrics() : { accounts: [] };
    if (name === "writing-judge") return judge(body as { pairs: { key: string }[] });
    throw new Error(`unexpected ${name}`);
  });
});

const n = (x: Partial<Numbers>): Numbers => ({ impressions: 0, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, ...x });
const pulled = (id: string, zernioPostId: string | null, numbers: Numbers, extra: Partial<MetricsPost> = {}): MetricsPost =>
  ({ id, zernioPostId, platform: "instagram", accountId: "65000000000000000000a001", publishedAt: "2026-10-08T01:00:00Z", text: "Hi", url: null, numbers, ...extra });
const draft = (id: string, extra: Partial<DraftEntry & { live: LiveLink }>): DraftEntry =>
  ({ id, createdAt: "2026-10-01T00:00:00Z", hook: id, draft: "Body", pillar: "", pillarDetail: "", audience: "", format: "", platform: "instagram", ctaType: "", status: "posted", postedAt: "2026-10-08T09:00:00+08:00", ...extra });
// words w01..w20: overlap is the share of words two texts have in common
const words = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `w${String(from + i).padStart(2, "0")}`).join(" ");
const liveOf = (id: string) => (loadDrafts(UID).find((d) => d.id === id) as (DraftEntry & { live?: LiveLink }) | undefined)?.live;
const flush = () => new Promise((r) => setTimeout(r, 0));
const pulls = () => callFn.mock.calls.filter(([name, body]) => name === "social" && body.action === "metrics").length;
const judged = () => callFn.mock.calls.filter(([name]) => name === "writing-judge");

describe("matchPulled", () => {
  it("gives a post to the draft that sent its Zernio post, summed over its accounts, and lists the rest as outside the app", () => {
    const drafts = [draft("a", { zernio: { key: "k", postId: ZP } }), draft("b", { metrics: { impressions: 50 } })];
    const { byDraft, outside } = matchPulled(drafts, [
      pulled("e1", ZP, n({ reach: 900, likes: 40 })),
      pulled("e2", ZP, n({ reach: 100, likes: 2, saves: 3 })),
      pulled("e3", null, n({ views: 70 })),
      pulled("e4", "67000000000000000000d777", n({ likes: 1 })),
    ]);
    expect(byDraft).toEqual(new Map([["a", n({ reach: 1000, likes: 42, saves: 3 })]]));
    expect(outside.map((p) => p.id)).toEqual(["e3", "e4"]);
  });

  it("matches the Zernio post id first, then a hand-linked draft's live post id", () => {
    const live: LiveLink = { postId: "e3", platform: "instagram", url: null, by: "you" };
    const drafts = [draft("a", { zernio: { key: "k", postId: ZP } }), draft("b", { live })];
    const { byDraft, outside } = matchPulled(drafts, [pulled("e3", ZP, n({ likes: 5 })), pulled("e3", null, n({ likes: 7 })), pulled("e9", null, n({}))]);
    expect(byDraft).toEqual(new Map([["a", n({ likes: 5 })], ["b", n({ likes: 7 })]]));
    expect(outside.map((p) => p.id)).toEqual(["e9"]);
  });
});

describe("matchOutside: hand-posted drafts", () => {
  const live = (id: string, text: string, extra: Partial<MetricsPost> = {}) => pulled(id, null, n({ likes: 3 }), { text, ...extra });

  it("links a single candidate at 0.75 overlap at once, and sends one at 0.5 to Jev", () => {
    const drafts = [draft("sure", { draft: words(1, 15) }), draft("maybe", { draft: words(41, 50) })];
    const { sure, ask } = matchOutside(drafts, [live("p1", words(1, 20)), live("p2", words(41, 60))]);
    expect(sure.map((l) => [l.draftId, l.post.id])).toEqual([["sure", "p1"]]);
    expect(ask.map((p) => [p.draftId, p.post.id, p.draft, p.live])).toEqual([["maybe", "p2", words(41, 50), words(41, 60)]]);
  });

  it("leaves out drafts under 0.3", () => {
    expect(matchOutside([draft("a", { draft: words(1, 5) })], [live("p1", words(1, 20))])).toEqual({ sure: [], ask: [] });
  });

  it("compares the draft only up to the live text's length, so a long draft whose start matches links", () => {
    const long = `${words(1, 20)} ${Array.from({ length: 300 }, (_, i) => `extra${i}`).join(" ")}`;
    expect(long.length).toBeGreaterThan(1500);
    expect(matchOutside([draft("long", { draft: long })], [live("p1", words(1, 20))]).sure.map((l) => l.draftId)).toEqual(["long"]);
  });

  it("only looks at posted drafts on the same platform within 3 days of the post", () => {
    const drafts = [
      draft("far", { draft: words(1, 20), postedAt: "2026-10-12T09:00:00+08:00" }),
      draft("tiktok", { draft: words(1, 20), platform: "tiktok" }),
      draft("unposted", { draft: words(1, 20), status: "scheduled", postedAt: undefined, scheduledFor: "2026-10-08T09:00" }),
      draft("scheduledDay", { draft: words(1, 20), postedAt: undefined, scheduledFor: "2026-10-11T09:00" }),
    ];
    expect(matchOutside(drafts, [live("p1", words(1, 20))]).sure.map((l) => l.draftId)).toEqual(["scheduledDay"]);
  });

  it("sends two candidates over 0.7 to Jev rather than pick one", () => {
    const drafts = [draft("a", { draft: words(1, 18) }), draft("b", { draft: words(1, 16) })];
    const { sure, ask } = matchOutside(drafts, [live("p1", words(1, 20))]);
    expect(sure).toEqual([]);
    expect(ask.map((p) => p.draftId)).toEqual(["a", "b"]);
    expect(new Set(ask.map((p) => p.key)).size).toBe(2);
  });

  it("skips posts you said aren't yours, posts already linked and drafts already linked", () => {
    const drafts = [
      draft("zernio", { draft: words(1, 20), zernio: { key: "k", postId: ZP } }),
      draft("linked", { draft: words(1, 20), live: { postId: "p9", platform: "instagram", url: null, by: "jev" } }),
    ];
    expect(matchOutside(drafts, [live("p1", words(1, 20)), live("p9", words(1, 20))])).toEqual({ sure: [], ask: [] });
    expect(matchOutside([draft("a", { draft: words(1, 20) })], [live("p1", words(1, 20))], ["p1"])).toEqual({ sure: [], ask: [] });
  });
});

describe("the numbers job", () => {
  it("pulls on the first open, not again within 6 hours, and again after", async () => {
    let t = T0;
    refreshIfStale(UID, () => t);
    await flush();
    expect(pulls()).toBe(1);
    expect(loadRealNumbers(UID)).toMatchObject({ on: true, at: new Date(T0).toISOString() });
    t = T0 + 6 * HOUR - 1;
    refreshIfStale(UID, () => t);
    await flush();
    expect(pulls()).toBe(1);
    t = T0 + 6 * HOUR;
    refreshIfStale(UID, () => t);
    await flush();
    expect(pulls()).toBe(2);
  });

  it("runs once at a time per brand, and keeps going with no page listening", async () => {
    refreshIfStale(UID, () => T0);
    refreshIfStale(UID, () => T0);
    void refreshNumbers(UID, () => T0);
    expect(numbersJob(UID).running).toBe(true);
    await flush();
    expect(pulls()).toBe(1);
    expect(numbersJob(UID).running).toBe(false);
  });

  it("puts numbers on sent drafts, links a hand-posted draft at 0.75 with no Jev call, and one at 0.5 when Jev says so", async () => {
    saveDrafts(UID, [
      draft("sent", { zernio: { key: "k", postId: ZP } }),
      draft("sure", { draft: words(1, 15), hook: "Sure hook" }),
      draft("maybe", { draft: words(41, 50) }),
    ]);
    pulledPosts = [
      pulled("z1", ZP, n({ likes: 9 })),
      pulled("p1", null, n({ views: 120 }), { text: words(1, 20), url: "https://instagram.com/p/1" }),
      pulled("p2", null, n({ views: 80 }), { text: words(41, 60) }),
    ];
    judge = (body) => ({ links: [body.pairs[0].key] });
    const seen: boolean[] = [];
    const off = onNumbers(() => seen.push(numbersJob(UID).running));
    await refreshNumbers(UID, () => T0);
    off();
    const at = new Date(T0).toISOString();
    expect(loadDrafts(UID).find((d) => d.id === "sent")?.zernio?.numbers).toEqual({ ...n({ likes: 9 }), at });
    expect(liveOf("sure")).toEqual({ postId: "p1", platform: "instagram", url: "https://instagram.com/p/1", by: "auto", numbers: { ...n({ views: 120 }), at } });
    expect(liveOf("maybe")).toMatchObject({ postId: "p2", by: "jev", numbers: { views: 80 } });
    expect(judged()).toHaveLength(1);
    expect(judged()[0][1]).toEqual({ mode: "same-post", pairs: [{ key: expect.any(String), draft: words(41, 50), live: words(41, 60), platform: "instagram" }] });
    expect(numbersJob(UID)).toMatchObject({ running: false, error: null, none: false, outside: [], linked: [{ draftId: "sure", by: "auto" }, { draftId: "maybe", by: "jev" }] });
    expect(seen).toEqual([true, false]);
  });

  it("leaves a post outside when Jev links nothing, two drafts at once, or can't answer", async () => {
    saveDrafts(UID, [draft("a", { draft: words(1, 18) }), draft("b", { draft: words(1, 16) })]);
    pulledPosts = [pulled("p1", null, n({ views: 5 }), { text: words(1, 20) })];
    for (const answer of [() => ({ links: [] }), (b: { pairs: { key: string }[] }) => ({ links: b.pairs.map((p) => p.key) }), () => { throw new EdgeError("Used up for today.", 429, "daily_limit"); }]) {
      judge = answer;
      await refreshNumbers(UID, () => T0);
      expect([liveOf("a"), liveOf("b")]).toEqual([undefined, undefined]);
      expect(numbersJob(UID)).toMatchObject({ error: null, outside: [{ id: "p1" }] });
    }
  });

  it("records the pull into pace", async () => {
    pulledPosts = [pulled("p1", null, n({ views: 40 }))];
    await refreshNumbers(UID, () => T0);
    expect(loadPace(UID).last).toEqual({ at: new Date(T0).toISOString(), views: { p1: 40 } });
  });

  it("with no accounts connected says so and waits 6 hours", async () => {
    metrics = () => ({ accounts: [], posts: [], pages: 1 });
    await refreshNumbers(UID, () => T0);
    expect(numbersJob(UID)).toMatchObject({ none: true, error: null });
    expect(callFn.mock.calls.map(([name, body]) => `${name}:${body.action}`)).toEqual(["social:metrics"]);
    expect(shouldRefresh(loadRealNumbers(UID), T0 + HOUR)).toBe(false);
  });

  it("keeps the last numbers and the last pull time when a pull fails or hits the cap", async () => {
    saveDrafts(UID, [draft("sent", { zernio: { key: "k", postId: ZP, numbers: { ...n({ likes: 4 }), at: "2026-10-10T01:00:00Z" } } })]);
    for (const e of [new EdgeError("Couldn't read your numbers. Try again in a minute.", 502, "failed"), new EdgeError("You've used today's reads.", 429, "daily_limit")]) {
      metrics = () => { throw e; };
      await refreshNumbers(UID, () => T0);
      expect(numbersJob(UID).error).toEqual({ message: e.message, code: e.code, status: e.status });
      expect(loadDrafts(UID)[0].zernio?.numbers?.likes).toBe(4);
      expect(loadRealNumbers(UID).at).toBeNull();
    }
  });

  it("stops for 24 hours when analytics isn't on the Zernio plan", async () => {
    metrics = () => { throw new EdgeError("Analytics isn't on this Zernio plan.", 402, "no_analytics"); };
    await refreshNumbers(UID, () => T0);
    expect(numbersJob(UID).error?.message).toBe("Analytics isn't on this Zernio plan.");
    refreshIfStale(UID, () => T0 + 23 * HOUR);
    await refreshNumbers(UID, () => T0 + 23 * HOUR);
    expect(pulls()).toBe(1);
    refreshIfStale(UID, () => T0 + 24 * HOUR);
    await flush();
    expect(pulls()).toBe(2);
  });

  it("writes nothing when the brand changes while the pull is out", async () => {
    saveDrafts(UID, [draft("sent", { zernio: { key: "k", postId: ZP } })]);
    pulledPosts = [pulled("z1", ZP, n({ likes: 9 }))];
    metrics = () => {
      window.localStorage.setItem(`content-studio-profiles-${UID}`, JSON.stringify([{ id: "b2", name: "Other", createdAt: "" }]));
      window.localStorage.setItem(`cs-active-profile-${UID}`, "b2");
      return { accounts: [{ id: "65000000000000000000a001", platform: "instagram", username: "leo" }], posts: pulledPosts, pages: 1 };
    };
    await refreshNumbers(UID, () => T0);
    expect(loadDrafts(UID)).toEqual([]);
    expect(loadPace(UID).last).toBeNull();
    window.localStorage.setItem(`cs-active-profile-${UID}`, "me");
    expect(loadDrafts(UID)[0].zernio?.numbers).toBeUndefined();
    expect(loadPace(UID).last).toBeNull();
    expect(loadRealNumbers(UID).at).toBeNull();
  });
});

describe("linking by hand", () => {
  const post = pulled("p1", null, n({ views: 70, likes: 2 }), { url: "https://instagram.com/p/1" });

  it("links a post to one draft only, with its numbers", () => {
    saveDrafts(UID, [draft("a", { live: { postId: "p1", platform: "instagram", url: null, by: "auto" } }), draft("b", {})]);
    linkPost(UID, "b", post, "you", "2026-10-11T01:00:00.000Z");
    expect(liveOf("a")).toBeUndefined();
    expect(liveOf("b")).toEqual({ postId: "p1", platform: "instagram", url: "https://instagram.com/p/1", by: "you", numbers: { ...post.numbers, at: "2026-10-11T01:00:00.000Z" } });
  });

  it("unlinks, and the matcher never links that post again", () => {
    saveDrafts(UID, [draft("a", { draft: words(1, 20) })]);
    linkPost(UID, "a", { ...post, text: words(1, 20) }, "you");
    unlinkPost(UID, "a");
    expect(liveOf("a")).toBeUndefined();
    expect(loadRealNumbers(UID).notMine).toEqual(["p1"]);
    expect(matchOutside(loadDrafts(UID), [{ ...post, text: words(1, 20) }], loadRealNumbers(UID).notMine)).toEqual({ sure: [], ask: [] });
  });

  it("None of these keeps the newest 300 posts you said aren't yours, each once", () => {
    for (let i = 0; i < 305; i++) markNotMine(UID, `p${i}`);
    markNotMine(UID, "p304");
    const { notMine } = loadRealNumbers(UID);
    expect(notMine).toHaveLength(300);
    expect(notMine[0]).toBe("p304");
    expect(notMine).not.toContain("p0");
  });
});

describe("the real numbers state", () => {
  const key = `content-studio-realnumbers-${UID}`;

  it("still reads a stored 1 as on", () => {
    window.localStorage.setItem(key, "1");
    expect(realNumbersOn(UID)).toBe(true);
    expect(loadRealNumbers(UID)).toEqual({ on: true, at: null, notMine: [] });
  });

  it("is off when nothing or something unreadable is stored, and on once used", () => {
    expect(realNumbersOn(UID)).toBe(false);
    window.localStorage.setItem(key, "{nope");
    expect(loadRealNumbers(UID)).toEqual({ on: false, at: null, notMine: [] });
    rememberRealNumbers(UID);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({ on: true, at: null, notMine: [] });
  });

  it("refreshes after 6 hours, when forced, and never while paused", () => {
    const at = new Date(T0).toISOString();
    expect(shouldRefresh({ on: false, at: null, notMine: [] }, T0)).toBe(true);
    expect(shouldRefresh({ on: true, at, notMine: [] }, T0 + 6 * HOUR - 1)).toBe(false);
    expect(shouldRefresh({ on: true, at, notMine: [] }, T0 + 6 * HOUR)).toBe(true);
    expect(shouldRefresh({ on: true, at, notMine: [] }, T0 + HOUR, true)).toBe(true);
    const paused = { on: true, at, notMine: [], pausedUntil: new Date(T0 + 24 * HOUR).toISOString() };
    expect(shouldRefresh(paused, T0 + 7 * HOUR, true)).toBe(false);
    expect(shouldRefresh(paused, T0 + 24 * HOUR)).toBe(true);
  });
});

describe("real numbers on Analytics", () => {
  it("shows a posted-through-the-app draft's real numbers in place of typed ones, and never changes the typed ones", () => {
    saveDrafts(UID, [
      draft("a", { metrics: { impressions: 10, reactions: 1 }, zernio: { key: "k", postId: ZP } }),
      draft("b", { metrics: { impressions: 50, reactions: 5 } }),
    ]);
    setDraftNumbers(UID, new Map([["a", n({ reach: 900, views: 1500, likes: 40, comments: 6, shares: 3, saves: 11 })]]), "2026-10-11T01:00:00Z");
    const stored = loadDrafts(UID);
    expect(stored[0].metrics).toEqual({ impressions: 10, reactions: 1 });
    expect(stored[0].zernio?.numbers).toMatchObject({ reach: 900, at: "2026-10-11T01:00:00Z" });
    expect(stored[1]).not.toHaveProperty("zernio");
    const tracked = getTrackedPosts(UID);
    expect(tracked.map((p) => [p.id, p.impressions, p.engagementTotal])).toEqual([
      ["a", 900, 49],
      ["b", 50, 5],
    ]);
  });

  it("writes nothing when the numbers haven't changed", () => {
    saveDrafts(UID, [draft("a", { zernio: { key: "k", postId: ZP, numbers: { ...n({ likes: 4 }), at: "2026-10-10T01:00:00Z" } } })]);
    const stored = () => window.localStorage.getItem(`content-studio-drafts-${UID}`);
    const before = stored();
    setDraftNumbers(UID, new Map([["a", n({ likes: 4 })]]), "2026-10-11T01:00:00Z");
    expect(stored()).toBe(before);
  });

  it("names the numbers the typed columns don't have", () => {
    expect(extraLine(n({ views: 1500, reach: 900, saves: 0 }))).toBe("1,500 views, 900 reach");
    expect(extraLine(n({ views: 1, reach: 1, saves: 1 }))).toBe("1 view, 1 reach, 1 save");
    expect(extraLine(n({}))).toBe("");
  });
});
