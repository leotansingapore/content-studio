import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

const fn = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], answers: [] as unknown[] }));
vi.mock("@/lib/edgeFn", async () => {
  class EdgeError extends Error {
    constructor(message: string, public status: number, public code = "") {
      super(message);
    }
  }
  return {
    EdgeError,
    // each call answers from `answers` in turn: a value, or an EdgeError to throw
    callFn: async (_name: string, body: Record<string, unknown>) => {
      fn.calls.push(body);
      const a = fn.answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  };
});

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const LOOKS = [
  "A Chinese Singaporean woman in her early 30s, a short neat bob, cream blouse",
  "A Malay Singaporean man in his late 40s, short neat hair, dark green polo shirt",
  "An Indian Singaporean woman in her 50s, long dark hair tied back, maroon blouse and small gold earrings",
];
const TOKENS = ["t1", "t2", "t3"];
const done = (n: number) => ({ state: "done", url: `https://cdn.example/r${n}.png` });
const COPY = `data:image/jpeg;base64,/9j/${"B".repeat(300)}`;
let storage: MemStorage;
let job: typeof import("./presentersJob");
let EdgeErr: new (m: string, s: number, c?: string) => Error;

async function fresh() {
  vi.resetModules();
  job = await import("./presentersJob");
  EdgeErr = (await import("@/lib/edgeFn")).EdgeError as never;
}

beforeEach(async () => {
  vi.useFakeTimers();
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} });
  fn.calls.length = 0;
  fn.answers.length = 0;
  await fresh();
});
afterEach(() => vi.useRealTimers());

const pending = () => JSON.parse(storage.getItem(`cs-presenters-making-${UID}`) ?? "null");

describe("making three presenters", () => {
  it("shows making at once, then the three pictures to pick from, with the paid tokens kept on this device meanwhile", async () => {
    fn.answers.push({ tokens: TOKENS, looks: LOOKS }, { jobs: [done(1), { state: "working" }, done(3)] }, { jobs: [done(1), done(2), done(3)] });
    const run = job.startMake(UID, { gender: "woman" }, "Glasses");
    expect(job.makeState()).toEqual({ state: "making", scope: UID });
    // a second press while making is ignored
    await job.startMake(UID, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(pending()).toEqual({ tokens: TOKENS, looks: LOOKS });
    await vi.advanceTimersByTimeAsync(8000);
    await run;
    expect(job.makeState()).toEqual({ state: "pick", scope: UID, looks: LOOKS, urls: [1, 2, 3].map((n) => `https://cdn.example/r${n}.png`) });
    expect(fn.calls).toEqual([
      { mode: "presenters", prefs: { gender: "woman" }, extra: "Glasses" },
      { mode: "status", tokens: TOKENS },
      { mode: "status", tokens: TOKENS },
    ]);
  });

  it("offers the pictures that came back when one failed, and fails with the line when none did", async () => {
    fn.answers.push({ tokens: TOKENS, looks: LOOKS }, { jobs: [{ state: "failed", error: "The safety filter blocked it." }, done(2), done(3)] });
    const run = job.startMake(UID, {});
    await vi.advanceTimersByTimeAsync(4000);
    await run;
    expect(job.makeState()).toMatchObject({ state: "pick", looks: LOOKS.slice(1), urls: ["https://cdn.example/r2.png", "https://cdn.example/r3.png"] });

    job.clearMake();
    expect(pending()).toBeNull();
    fn.answers.push({ tokens: TOKENS, looks: LOOKS }, { jobs: TOKENS.map(() => ({ state: "failed", error: "x" })) });
    const again = job.startMake(UID, {});
    await vi.advanceTimersByTimeAsync(4000);
    await again;
    expect(job.makeState()).toEqual({ state: "failed", scope: UID, error: "Couldn't make the presenters. Try again in a minute." });
    expect(pending()).toBeNull();
  });

  it("shows a refused look, a cap or a failed submit with the server's line, and stores nothing", async () => {
    fn.answers.push(new EdgeErr("Presenters can't look like a real person. Describe a look instead.", 422, "real_person"));
    await job.startMake(UID, {}, "Looks like a famous singer");
    expect(job.makeState()).toEqual({ state: "refused", scope: UID, error: "Presenters can't look like a real person. Describe a look instead." });
    fn.answers.push(new EdgeErr("You've used all 12 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await job.startMake(UID, {});
    expect(job.makeState()).toMatchObject({ state: "refused", error: "You've used all 12 for today. It resets at 8am Singapore time." });
    fn.answers.push(new EdgeErr("AI video credits have run out. Tell your studio admin.", 502, "failed"));
    await job.startMake(UID, {});
    expect(job.makeState()).toMatchObject({ state: "failed", error: "AI video credits have run out. Tell your studio admin." });
    fn.answers.push(new EdgeErr("Couldn't reach the server. Check your connection and try again.", 0));
    await job.startMake(UID, {});
    expect(job.makeState()).toMatchObject({ state: "failed", error: "Couldn't make the presenters. Try again in a minute." });
    expect(storage.s.size).toBe(0);
  });

  it("picks a paid make up again after a reload, at no cost", async () => {
    storage.setItem(`cs-presenters-making-${UID}`, JSON.stringify({ tokens: TOKENS, looks: LOOKS }));
    await fresh();
    job.resumeMake(UID);
    expect(job.makeState()).toEqual({ state: "making", scope: UID });
    fn.answers.push({ jobs: [done(1), done(2), done(3)] });
    await vi.advanceTimersByTimeAsync(4000);
    expect(job.makeState()).toMatchObject({ state: "pick", urls: [1, 2, 3].map((n) => `https://cdn.example/r${n}.png`) });
    expect(fn.calls).toEqual([{ mode: "status", tokens: TOKENS }]);
    // nothing waiting: nothing happens
    job.clearMake();
    job.resumeMake(UID);
    expect(job.makeState()).toEqual({ state: "idle" });
  });

  it("keeps the picked one with its link and copy, the brand's first becoming its default, and ends the make", async () => {
    fn.answers.push({ tokens: TOKENS, looks: LOOKS }, { jobs: [done(1), done(2), done(3)] });
    const run = job.startMake(UID, {});
    await vi.advanceTimersByTimeAsync(4000);
    await run;
    const copied: string[] = [];
    const r = await job.keepPick(UID, 1, "Hafiz", async (u) => (copied.push(u), COPY));
    expect(r).toMatchObject({ ok: true, presenter: { name: "Hafiz", look: LOOKS[1], url: "https://cdn.example/r2.png", photo: COPY, status: "on" } });
    expect(copied).toEqual(["https://cdn.example/r2.png"]);
    const { loadPresenters } = await import("./presenters");
    expect(loadPresenters(UID).who).toBe(r.ok && r.presenter.id);
    expect(job.makeState()).toEqual({ state: "idle" });
    expect(pending()).toBeNull();
  });

  it("keeps the pick when the copy fails or 4 presenters are already on, saying why", async () => {
    const { keepPresenter } = await import("./presenters");
    fn.answers.push({ tokens: TOKENS, looks: LOOKS }, { jobs: [done(1), done(2), done(3)] });
    const run = job.startMake(UID, {});
    await vi.advanceTimersByTimeAsync(4000);
    await run;
    expect(await job.keepPick(UID, 0, "Mei", async () => Promise.reject(new Error("gone")))).toEqual({ ok: false, error: "Couldn't save the picture. Try again." });
    for (let i = 0; i < 4; i++) keepPresenter(UID, { name: `P${i}`, look: LOOKS[0], url: "https://cdn.example/x.png", photo: COPY }, new Date(Date.UTC(2026, 9, 21, 9, 0, i)));
    expect(await job.keepPick(UID, 0, "Mei", async () => COPY)).toEqual({ ok: false, error: "You have 4 presenters. Remove one to make another." });
    expect(job.makeState()).toMatchObject({ state: "pick" });
    expect(pending()).toEqual({ tokens: TOKENS, looks: LOOKS });
  });
});
