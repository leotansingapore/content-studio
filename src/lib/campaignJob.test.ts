import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignPost } from "./campaigns";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

// each call answers from `answers` in turn: a value, an EdgeError to throw, or a promise (a call still in flight)
const fn = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], answers: [] as unknown[] }));
vi.mock("@/lib/edgeFn", async () => {
  class EdgeError extends Error {
    constructor(message: string, public status: number, public code = "") {
      super(message);
    }
  }
  return {
    EdgeError,
    callFn: async (_name: string, body: Record<string, unknown>) => {
      fn.calls.push(body);
      const a = await fn.answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  };
});

const UID = "u1";
const ANGLES = ["a1", "a2", "a3", "a4", "a5"].map((id) => ({ id, title: `Angle ${id}`, line: `Why ${id} matters` }));
const post = (n: number, o: Partial<CampaignPost> = {}): CampaignPost => ({
  n, day: `2026-11-${String(n).padStart(2, "0")}`, angleId: ANGLES[(n - 1) % 5].id, format: "text-post", stage: "attraction", pillar: "topic",
  ctaType: "open-question", formulaId: "contrarian", state: "waiting", ...o,
});
const campaign = (o: Partial<Campaign> = {}, count = 12): Campaign => ({
  id: "c1", name: "Young families | November", createdAt: "2026-10-22T08:00:00.000Z", audience: "au-1", audienceName: "Young families",
  angles: ANGLES, platforms: ["linkedin", "instagram"], formats: ["text-post"], weeks: 4, perWeek: 3, startDay: "2026-11-02",
  pictures: "stock", goal: "Get more enquiries", target: { posts: count, winners: 1 }, posts: Array.from({ length: count }, (_, i) => post(i + 1)), ...o,
});
/** idea-dump's 200 for the asked posts (or the numbers given). */
const wrote = (ns: number[], o: (n: number) => Record<string, unknown> = () => ({})) => ({
  posts: ns.map((n) => ({ n, hook: `Hook number ${n} opens here`, body: `Body of post ${n}.`, cta: "What would you add?", ctaType: "open-question", mas: false, ...o(n) })),
});
const askedNs = (i: number) => (fn.calls[i].posts as { n: number }[]).map((p) => p.n);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

let local: MemStorage;
let job: typeof import("./campaignJob");
let store: typeof import("./campaigns");
let EdgeErr: new (m: string, status: number, code?: string) => Error;

beforeEach(async () => {
  local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  fn.calls.length = 0;
  fn.answers.length = 0;
  vi.resetModules();
  job = await import("./campaignJob");
  store = await import("./campaigns");
  EdgeErr = (await import("@/lib/edgeFn")).EdgeError as never;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T10:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const seed = (c = campaign()) => expect(store.saveCampaigns(UID, [c])).toBeNull();
const posts = () => store.getCampaign(UID, "c1")?.posts ?? [];
const states = () => posts().map((p) => p.state);
/** Starts the job and waits for it to stop. */
async function draft() {
  job.startDrafting(UID, "c1");
  await vi.waitFor(() => expect(fn.answers).toHaveLength(0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("startDrafting", () => {
  it("writes the posts in order, 7 a call, each batch saved as it lands", async () => {
    seed();
    fn.answers.push(wrote(range(1, 7)), wrote(range(8, 12)));
    await draft();
    expect(fn.calls).toHaveLength(2);
    expect(askedNs(0)).toEqual(range(1, 7));
    expect(askedNs(1)).toEqual(range(8, 12));
    expect(states()).toEqual(Array(12).fill("ready"));
    expect(posts()[0]).toMatchObject({ hook: "Hook number 1 opens here", body: "Body of post 1.", cta: "What would you add?", mas: false });
    expect(job.draftingOf("c1")).toBeNull();
  });

  it("sends each post's ask, the campaign's audience, goal and platforms, and the hooks already written as avoid", async () => {
    seed();
    local.setItem(`content-studio-audiences-${UID}`, JSON.stringify([{ id: "au-1", name: "Young families", who: "Parents in their 30s", cares: ["school fees"], main: true, createdAt: "2026-10-01T00:00:00.000Z", source: "you" }]));
    fn.answers.push(wrote(range(1, 7)), wrote(range(8, 12)));
    await draft();
    const first = fn.calls[0];
    expect(first.mode).toBe("campaign");
    expect((first.posts as unknown[])[0]).toEqual({
      n: 1, angle: { title: "Angle a1", line: "Why a1 matters" }, format: "text-post", stage: "attraction",
      formula: { name: "Contrarian take", template: expect.stringContaining("Most people say") }, ctaType: "open-question", platforms: ["linkedin", "instagram"],
    });
    expect(first.context).toMatchObject({ goal: "Get more enquiries", platforms: ["linkedin", "instagram"], speaker: "person" });
    expect((first.context as { audience: string }).audience).toMatch(/^WRITE FOR THIS AUDIENCE: Young families\. Parents in their 30s\./);
    expect(first.avoid).toEqual([]);
    expect(fn.calls[1].avoid).toEqual(range(1, 7).map((n) => `Hook number ${n} opens here`));
  });

  it("introduces the audience's words as talk about money for an adviser's brand only (wave 2 live check, calls/007)", async () => {
    const row = { id: "au-1", name: "Sales representatives", who: "Sales reps who track calls and deals", cares: [], says: "I want to see who I need to call.", main: true, createdAt: "2026-10-01T00:00:00.000Z", source: "website" };
    local.setItem(`content-studio-audiences-${UID}`, JSON.stringify([row]));
    const c = campaign();
    const line = () => (job.campaignRequest(UID, c, c.posts.slice(0, 1)).context as { audience: string }).audience;
    expect(line()).toContain(" How they talk about money: I want to see who I need to call.");
    const { addProfile, setActiveProfile } = await import("./profiles");
    const p = addProfile(UID, "ActivityTracker");
    setActiveProfile(UID, p.id);
    local.setItem(`content-studio-audiences-${UID}~${p.id}`, JSON.stringify([row]));
    expect(line()).toContain(" How they talk about it: I want to see who I need to call.");
  });

  it("names the audience by its name when the saved one is gone, and sends no goal when the campaign copied none", async () => {
    seed(campaign({ goal: undefined }, 3));
    fn.answers.push(wrote([1, 2, 3]));
    await draft();
    expect(fn.calls[0].context).toMatchObject({ audience: "Young families", goal: "" });
  });

  it("a business brand's request carries speaker business", async () => {
    const { addProfile, setActiveProfile } = await import("./profiles");
    setActiveProfile(UID, addProfile(UID, "ActivityTracker").id);
    seed(campaign({}, 2));
    fn.answers.push(wrote([1, 2]));
    await draft();
    expect(fn.calls[0].context).toMatchObject({ speaker: "business" });
  });

  it("a failed batch marks only its posts failed, and the next batch is still written", async () => {
    seed();
    fn.answers.push(new EdgeErr("Couldn't write these posts right now. Try again in a minute.", 502, "failed"), wrote(range(8, 12)));
    await draft();
    expect(states()).toEqual([...Array(7).fill("failed"), ...Array(5).fill("ready")]);
    expect(posts()[0].error).toBe(job.FAILED_POST);
  });

  it("an unusable reply (422) fails its batch too, with no second call for it", async () => {
    seed(campaign({}, 3));
    fn.answers.push(new EdgeErr("The words that came back couldn't be used. Try again.", 422, "unusable"));
    await draft();
    expect(fn.calls).toHaveLength(1);
    expect(states()).toEqual(["failed", "failed", "failed"]);
  });

  it("a post a 200 left out is written again once, then marked failed", async () => {
    seed(campaign({}, 3));
    fn.answers.push(wrote([1, 3]), wrote([]));
    await draft();
    expect(askedNs(1)).toEqual([2]);
    expect(states()).toEqual(["ready", "failed", "ready"]);
    expect(fn.calls).toHaveLength(2);
  });

  it("a 429 parks the batch as waiting until the next 8am Singapore time and writes nothing more", async () => {
    seed();
    fn.answers.push(wrote(range(1, 7)), new EdgeErr("You've used today's limit.", 429, "daily_limit"));
    await draft();
    expect(states()).toEqual([...Array(7).fill("ready"), ...Array(5).fill("waiting")]);
    expect(store.getCampaign(UID, "c1")?.waitUntil).toBe("2026-10-23T00:00:00.000Z");
    expect(job.draftingOf("c1")).toEqual({ done: 7, of: 12, paused: job.PAUSED_LINE });
    // a visit before 8am writes nothing
    job.startDrafting(UID, "c1");
    await new Promise((r) => setTimeout(r, 0));
    expect(fn.calls).toHaveLength(2);
    // after 8am it goes on and clears the wait
    vi.setSystemTime(new Date("2026-10-23T00:00:01.000Z"));
    fn.answers.push(wrote(range(8, 12)));
    await draft();
    expect(states()).toEqual(Array(12).fill("ready"));
    expect(store.getCampaign(UID, "c1")?.waitUntil).toBeUndefined();
  });

  it("a lost connection leaves the batch waiting with a line, never failed", async () => {
    seed(campaign({}, 3));
    fn.answers.push(new EdgeErr("Couldn't reach the server. Check your connection and try again.", 0));
    await draft();
    expect(states()).toEqual(["waiting", "waiting", "waiting"]);
    expect(job.draftingOf("c1")?.paused).toBe("Couldn't reach the server. Check your connection and try again.");
  });

  it("a second startDrafting while one runs is a no-op", async () => {
    seed(campaign({}, 3));
    let answer!: (v: unknown) => void;
    fn.answers.push(new Promise((r) => (answer = r)));
    job.startDrafting(UID, "c1");
    job.startDrafting(UID, "c1");
    await new Promise((r) => setTimeout(r, 0));
    expect(fn.calls).toHaveLength(1);
    expect(states()).toEqual(["drafting", "drafting", "drafting"]);
    expect(job.draftingOf("c1")).toEqual({ done: 0, of: 3 });
    answer(wrote([1, 2, 3]));
    await vi.waitFor(() => expect(states()).toEqual(["ready", "ready", "ready"]));
  });

  it("resumes the drafting posts a closed tab left, before the waiting ones", async () => {
    seed(campaign({ posts: [post(1, { state: "ready", hook: "Old hook" }), post(2, { state: "drafting" }), post(3)] }));
    fn.answers.push(wrote([2, 3]));
    await draft();
    expect(askedNs(0)).toEqual([2, 3]);
    expect(fn.calls[0].avoid).toEqual(["Old hook"]);
    expect(states()).toEqual(["ready", "ready", "ready"]);
  });

  it("stores each batch's ask id before its call, and a batch a reload left mid-call goes again alone under that id (live-p5dog D4)", async () => {
    // posts 1 to 3 went out under c1-1-mh0 when the page reloaded; 4 to 12 never went
    seed(campaign({ posts: [...range(1, 3).map((n) => post(n, { state: "drafting", ask: "c1-1-mh0" })), ...range(4, 12).map((n) => post(n))] }));
    let answer!: (v: unknown) => void;
    fn.answers.push(wrote([1, 2, 3]), new Promise((r) => (answer = r)));
    job.startDrafting(UID, "c1");
    await vi.waitFor(() => expect(fn.calls).toHaveLength(2));
    expect([askedNs(0), fn.calls[0].ask]).toEqual([[1, 2, 3], "c1-1-mh0"]);
    // the next batch has its own id, already on its posts while the call is out, so a reload now would send it again
    expect(askedNs(1)).toEqual(range(4, 10));
    expect(fn.calls[1].ask).toMatch(/^c1-4-[a-z0-9]+$/);
    expect(posts().filter((p) => p.ask).map((p) => [p.n, p.ask])).toEqual(range(4, 10).map((n) => [n, fn.calls[1].ask]));
    answer(wrote(range(4, 10)));
    fn.answers.push(wrote(range(11, 12)));
    await vi.waitFor(() => expect(states()).toEqual(Array(12).fill("ready")));
    expect(fn.calls[2].ask).toMatch(/^c1-11-/);
    expect(posts().some((p) => p.ask)).toBe(false);
  });

  it("a delete mid-run drops the batch that lands after it, and no next batch is asked", async () => {
    seed();
    let answer!: (v: unknown) => void;
    fn.answers.push(new Promise((r) => (answer = r)));
    job.startDrafting(UID, "c1");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.deleteCampaign(UID, "c1")).not.toBeNull();
    answer(wrote(range(1, 7)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fn.calls).toHaveLength(1);
    expect(store.loadCampaigns(UID)).toEqual([]);
    expect(job.draftingOf("c1")).toBeNull();
  });

  it("an unknown campaign asks for nothing and leaves no job", async () => {
    job.startDrafting(UID, "nope");
    await new Promise((r) => setTimeout(r, 0));
    expect(fn.calls).toHaveLength(0);
    expect(job.draftingOf("nope")).toBeNull();
  });

  it("keeps the brand kit's rules: no emoji or hashtags with both off, and a post using an avoid-word is never stored", async () => {
    const { DEFAULT_BRAND, saveBrand } = await import("./carousel");
    saveBrand(UID, { ...DEFAULT_BRAND, emojiPolicy: "none", hashtagPolicy: "none", avoidWords: "guaranteed" });
    seed(campaign({}, 2));
    fn.answers.push(
      wrote([1, 2], (n) => (n === 1 ? { hook: "Your plan, checked \u{1F680}", body: "Read this first. #money #plan" } : { body: "Returns are guaranteed here." })),
      wrote([2], () => ({ body: "Returns are guaranteed again." })),
    );
    await draft();
    expect(fn.calls[0].context).toMatchObject({ rules: expect.stringContaining("Never use these words or phrases: guaranteed") });
    expect(posts()[0]).toMatchObject({ hook: "Your plan, checked", state: "ready" });
    expect(posts()[0].body).not.toMatch(/#/);
    expect(posts()[1]).toMatchObject({ state: "failed", error: job.FAILED_POST });
    expect(JSON.stringify(posts())).not.toMatch(/guaranteed/i);
  });
});

describe("retryFailed", () => {
  it("puts the failed posts back and writes them", async () => {
    seed(campaign({ posts: [post(1, { state: "ready", hook: "Kept" }), post(2, { state: "failed", error: "This post could not be written." })] }));
    fn.answers.push(wrote([2]));
    expect(job.retryFailed(UID, "c1")).toBeNull();
    await vi.waitFor(() => expect(states()).toEqual(["ready", "ready"]));
    expect(askedNs(0)).toEqual([2]);
    expect(posts()[1].error).toBeUndefined();
  });

  it("does nothing for a campaign that is gone", () => {
    expect(job.retryFailed(UID, "nope")).toBeNull();
    expect(fn.calls).toHaveLength(0);
  });
});

describe("nextReset", () => {
  it("is the next 00:00 UTC, which is 8am in Singapore", () => {
    expect(job.nextReset(new Date("2026-10-22T23:59:00.000Z"))).toBe("2026-10-23T00:00:00.000Z");
    expect(job.nextReset(new Date("2026-10-22T00:00:00.000Z"))).toBe("2026-10-23T00:00:00.000Z");
  });
});
