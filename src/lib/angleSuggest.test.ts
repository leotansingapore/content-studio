import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Angle } from "./angles";
import type { StepRow } from "./angleSuggest";

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

const UID = "u1";
const AUD = { id: "au-1", name: "Young parents", who: "Parents in their 30s with a first child", cares: [], says: "" };
let local: MemStorage;
let session: MemStorage;
let s: typeof import("./angleSuggest");
let angles: typeof import("./angles");
let EdgeErr: new (m: string, status: number, code?: string) => Error;

// the first import transforms over 200 modules, past the 10 s hook timeout on a loaded machine: done here, at collection,
// which has no timeout, so each test's fresh import only runs them again
await import("./angleSuggest");
await import("./angles");
async function fresh() {
  vi.resetModules();
  s = await import("./angleSuggest");
  angles = await import("./angles");
  EdgeErr = (await import("@/lib/edgeFn")).EdgeError as never;
}

beforeEach(async () => {
  local = new MemStorage();
  session = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  fn.calls.length = 0;
  fn.answers.length = 0;
  await fresh();
});
afterEach(() => vi.unstubAllGlobals());

const row = (title: string, o: Partial<StepRow> = {}): StepRow => ({ id: `r-${title}`, title, line: `${title} line`, origin: "suggested", used: false, picked: true, ...o });
const saved = (i: number, o: Partial<Angle> = {}): Angle => ({ id: `an-${i}`, title: `Saved ${i}`, line: "", origin: "suggested", createdAt: `2026-10-0${i}T08:00:00.000Z`, usedAt: "2026-10-09T08:00:00.000Z", ...o });
const five = ["Fees are not the whole story", "Your CPF is already working", "The hospital bill question", "One plan for two incomes", "Start before 30"].map((title) => ({ title, line: `${title}, said plainly.`, fit: 0.8 }));

describe("startSuggest", () => {
  it("sends every listed title as avoid: saved, suggested and your own", async () => {
    angles.confirmAngles(UID, AUD.id, [{ title: "Saved one", line: "", origin: "suggested" }]);
    s.saveWork(UID, AUD.id, [row("Picked before"), row("Mine", { origin: "mine" }), row("", { draft: { title: "half typ", line: "" } })]);
    fn.answers.push({ angles: [], scored: true });
    await s.startSuggest(UID, AUD);
    expect(fn.calls).toHaveLength(1);
    const body = fn.calls[0] as { mode: string; audience: string; avoid: string[]; context: { speaker: string; examples: string[] } };
    expect(body.mode).toBe("angles");
    expect(body.audience).toContain("Young parents");
    expect(body.avoid).toEqual(["Saved one", "Picked before", "Mine"]);
    expect(body.context.speaker).toBe("person");
  });

  it("introduces a business's audience words as talk about it, an adviser's as talk about money (wave 2 live check, calls/008)", async () => {
    // live-p5w2 calls/007's kept row: ActivityTracker's buyers, a business brand
    const REPS = {
      id: "au-mvj95qt8vx30",
      name: "Sales representatives",
      who: "Sales reps who track calls, deals, follow-ups and weekly goals, individually or with a team.",
      cares: ["Call tracking", "Deal pipeline", "Daily tasks", "Weekly goals", "Team leaderboard"],
      says: "I want to see who I need to call and whether I\u2019m on pace for my targets.",
    };
    const line = (n: number) => (fn.calls[n] as { audience: string }).audience;
    fn.answers.push({ angles: [], scored: true }, { angles: [], scored: true });
    await s.startSuggest(UID, REPS);
    expect(line(0)).toContain(" How they talk about money: I want to see who I need to call");
    const { addProfile, setActiveProfile } = await import("./profiles");
    setActiveProfile(UID, addProfile(UID, "ActivityTracker").id);
    await s.startSuggest(UID, REPS);
    expect(line(1)).toBe(
      "WRITE FOR THIS AUDIENCE: Sales representatives. Sales reps who track calls, deals, follow-ups and weekly goals, individually or with a team. They care about: Call tracking, Deal pipeline, Daily tasks, Weekly goals, Team leaderboard. How they talk about it: I want to see who I need to call and whether I\u2019m on pace for my targets.",
    );
  });

  it("puts a round at the top of the new rows, ticked, and shows suggesting at once", async () => {
    s.saveWork(UID, AUD.id, [row("Mine", { origin: "mine" })]);
    fn.answers.push({ angles: five, scored: true });
    const run = s.startSuggest(UID, AUD);
    expect(s.suggestJob()).toEqual({ state: "suggesting", key: s.jobKey(UID, AUD.id) });
    await run;
    expect(s.suggestJob()).toEqual({ state: "idle" });
    const rows = s.stepRows([], s.loadWork(UID, AUD.id));
    expect(rows.map((r) => r.title)).toEqual([...five.map((a) => a.title), "Mine"]);
    expect(rows.map((r) => r.tag)).toEqual(["suggested", "suggested", "suggested", "suggested", "suggested", "yours"]);
    expect(rows.every((r) => r.picked)).toBe(true);
  });

  it("a 429 keeps the rows and shows the cap line, with no Try again", async () => {
    const before = [row("Kept one"), row("Kept two", { picked: false })];
    s.saveWork(UID, AUD.id, before);
    fn.answers.push(new EdgeErr("You've hit today's limit.", 429, "daily_limit"));
    await s.startSuggest(UID, AUD);
    expect(s.suggestJob()).toEqual({ state: "failed", key: s.jobKey(UID, AUD.id), error: s.CAPPED_LINE, retry: false });
    expect(s.CAPPED_LINE).toBe("You've used all 10 angle suggestions for today. It resets at 8am Singapore time. Write your own below.");
    expect(s.loadWork(UID, AUD.id)).toEqual(before);
  });

  it("says why on the other refusals and offers Try again only for a failure", async () => {
    const run = async (e: Error) => {
      fn.answers.push(e);
      await s.startSuggest(UID, AUD);
      const j = s.suggestJob();
      return j.state === "failed" ? [j.error, j.retry] : j.state;
    };
    expect(await run(new EdgeErr("x", 503, "usage_unavailable"))).toEqual([s.UNAVAILABLE_LINE, false]);
    expect(await run(new EdgeErr("This isn't switched on for your account yet.", 403, "not_enabled"))).toEqual(["This isn't switched on for your account yet.", false]);
    expect(await run(new EdgeErr("Couldn't suggest angles right now. Try again in a minute.", 502, "failed"))).toEqual([s.FAILED_LINE, true]);
    expect(await run(new EdgeErr("Couldn't find angles that fit this time.", 422, "no_angles"))).toEqual([s.FAILED_LINE, true]);
    expect(await run(new EdgeErr("Couldn't reach the server.", 0))).toEqual([s.FAILED_LINE, true]);
  });

  it("a reload keeps the waiting results until Confirm", async () => {
    fn.answers.push({ angles: five, scored: true });
    await s.startSuggest(UID, AUD);
    await fresh(); // a reload: the module's memory is gone, sessionStorage is not
    expect(s.loadWork(UID, AUD.id)?.map((r) => r.title)).toEqual(five.map((a) => a.title));
    const { angles: kept } = s.confirmStep(UID, AUD.id, s.stepRows([], s.loadWork(UID, AUD.id)));
    expect(kept.map((a) => a.title)).toEqual(five.map((a) => a.title));
    expect(s.loadWork(UID, AUD.id)).toBeNull();
    await fresh();
    expect(s.loadWork(UID, AUD.id)).toBeNull();
  });

  it("runs one at a time", async () => {
    fn.answers.push({ angles: five, scored: true });
    const first = s.startSuggest(UID, AUD);
    await s.startSuggest(UID, AUD);
    await first;
    expect(fn.calls).toHaveLength(1);
  });
});

describe("the step's rows", () => {
  it("lists saved angles first as used before, unticked, then the new rows", () => {
    const rows = s.stepRows([saved(1), saved(2)], [row("New")]);
    expect(rows.map((r) => [r.title, r.tag, r.picked])).toEqual([["Saved 1", "used before", false], ["Saved 2", "used before", false], ["New", "suggested", true]]);
  });

  it("keeps the step's ticks and edits on a saved angle, and drops them once it is removed", () => {
    const work = [row("Saved 1 edited", { id: "an-1", used: true, picked: true })];
    expect(s.stepRows([saved(1)], work)[0]).toMatchObject({ title: "Saved 1 edited", picked: true, tag: "used before" });
    expect(s.stepRows([], work)).toEqual([]);
  });

  it("reopens a just-confirmed angle (Change) ticked, with its own tag", () => {
    const justKept = saved(3, { origin: "mine", createdAt: "2026-10-09T08:00:00.000Z" });
    const rows = s.stepRows([justKept, saved(1)], null, ["an-3", "an-1"]);
    expect(rows.map((r) => [r.tag, r.picked])).toEqual([["yours", true], ["used before", true]]);
  });

  it("ticks a round only while the picks stay at 8 or fewer, and leaves out a title already listed", () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`Have ${i}`));
    const got = [{ title: "have 0 ", line: "" }, ...five];
    const next = s.addSuggested(rows, got);
    expect(next).toHaveLength(11);
    expect(next.slice(0, 5).map((r) => [r.title, r.picked])).toEqual(five.map((a, i) => [a.title, i < 2]));
    expect(s.pickedRows(next)).toHaveLength(8);
  });

  it("asks for 3 to 8 picks", () => {
    expect([2, 3, 8, 9].map(s.pickLine)).toEqual(["Pick at least 3.", null, null, "Pick 8 or fewer."]);
    expect(s.pickedRows([row("A"), row("B", { picked: false }), row("", { picked: true })]).map((r) => r.title)).toEqual(["A"]);
  });

  it("Confirm keeps only the ticked angles, with their copies for the campaign", () => {
    angles.confirmAngles(UID, AUD.id, [{ title: "Saved one", line: "old", origin: "suggested" }], new Date("2026-10-01T08:00:00Z"));
    const id = angles.anglesFor(UID, AUD.id)[0].id;
    s.saveWork(UID, AUD.id, [row("Saved one", { id, used: true, line: "new words" }), row("Left out", { picked: false }), row("Mine", { origin: "mine" })]);
    const out = s.confirmStep(UID, AUD.id, s.stepRows(angles.anglesFor(UID, AUD.id), s.loadWork(UID, AUD.id)), new Date("2026-10-22T08:00:00Z"));
    expect(out.error).toBeNull();
    expect(out.angles).toEqual([{ id, title: "Saved one", line: "new words" }, { id: "r-Mine", title: "Mine", line: "Mine line" }]);
    expect(angles.anglesFor(UID, AUD.id).map((a) => a.title)).toEqual(["Mine", "Saved one"]);
  });

  it("knows when a saved campaign has words on an angle", () => {
    const post = (angleId: string, hook?: string) => ({ n: 1, day: "2026-10-26", angleId, format: "text-post", stage: "attraction", pillar: "topic", ctaType: "open-question", state: hook ? "ready" : "waiting", ...(hook ? { hook } : {}) });
    local.setItem("content-studio-campaigns-u1", JSON.stringify([{ id: "c1", angles: [], posts: [post("an-1", "A hook"), post("an-2")] }]));
    expect([s.usedInPosts(UID, "an-1"), s.usedInPosts(UID, "an-2")]).toEqual([true, false]);
  });
});

describe("the writer's context (planContextFor)", () => {
  it("sends every field the plan modes read, the speaker and the brand's name from the brand (live-p5dog day 2: no AI video named ActivityTracker)", async () => {
    const ctx = s.planContextFor(UID);
    expect(Object.keys(ctx).sort()).toEqual(["examples", "goal", "memory", "name", "platforms", "positioning", "product", "questions", "rules", "speaker", "voice"]);
    expect(ctx).toMatchObject({ speaker: "person", name: "" });
    const { addProfile, setActiveProfile } = await import("./profiles");
    setActiveProfile(UID, addProfile(UID, "ActivityTracker").id);
    expect(s.planContextFor(UID)).toMatchObject({ speaker: "business", name: "ActivityTracker" });
  });
});
