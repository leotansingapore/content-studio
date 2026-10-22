// Autopilot's run and presses (plan-autopilot), with callFn faked and the stores in memory. Every date is passed in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, String(v)); }
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
    // each call answers from `answers` in turn: a value, a function of the body, or an Error to throw
    callFn: async (_name: string, body: Record<string, unknown>) => {
      fn.calls.push(body);
      const a = fn.answers.shift();
      if (a instanceof Error) throw a;
      return typeof a === "function" ? a(body) : a;
    },
  };
});

const UID = "u1";
const WEEK = "2026-10-26";
// Fri 23 Oct 2026, 9am in Singapore: the write day
const FRI = new Date("2026-10-23T01:00:00Z");
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
const POS = {
  oneLiner: "I help young parents protect their income.",
  audience: "parent",
  audienceDetail: "parents of kids under 7",
  topics: ["CPF top-ups", "Critical illness"],
  edge: "Ex-nurse",
  platform: "linkedin",
  cadence: 3,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

let local: MemStorage;
let a: typeof import("./autopilot");
let job: typeof import("./autopilotJob");
let drafts: typeof import("./draftHistory");
let EdgeErr: new (m: string, status: number, code?: string) => Error;

/** idea-dump's answer: every asked post written, as its format asks. */
const writeAll = (body: { posts: { n: number; format: string }[] }) => ({
  posts: body.posts.map((p) => ({
    n: p.n,
    hook: `Hook ${p.n}`,
    ...(p.format === "short-video" ? { script: `HOOK: Hook ${p.n}\nBODY: b\nCTA: c` } : { body: `Body ${p.n}` }),
    cta: `Ask ${p.n}`,
    ctaType: "open-question",
    mas: false,
  })),
});

beforeEach(async () => {
  local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  fn.calls.length = 0;
  fn.answers.length = 0;
  vi.resetModules();
  a = await import("./autopilot");
  job = await import("./autopilotJob");
  drafts = await import("./draftHistory");
  EdgeErr = (await import("@/lib/edgeFn")).EdgeError as never;
  local.setItem(`content-studio-positioning-${UID}`, JSON.stringify(POS));
  a.saveSettings(UID, { ...a.DEFAULT_SETTINGS, on: true });
});
afterEach(() => vi.unstubAllGlobals());

const batch = () => a.loadAutopilot(UID).batches.find((b) => b.week === WEEK)!;
const states = () => batch().posts.map((p) => p.state);
const ap = (n: number) => drafts.loadDrafts(UID).find((d) => d.id === `ap_${WEEK}_${n}`);

describe("runAutopilot", () => {
  it("writes the week's posts in one call as unscheduled drafts waiting for an OK", async () => {
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, FRI);
    expect(fn.calls).toHaveLength(1);
    const body = fn.calls[0] as { mode: string; posts: { n: number; stage: string }[]; context: { audience: string; speaker: string } };
    expect(body.mode).toBe("campaign");
    expect(body.posts.map((p) => [p.n, p.stage])).toEqual([[1, "attraction"], [2, "trust"], [3, "conversion"]]);
    expect(body.context.audience).toContain("parents of kids under 7");
    expect(JSON.stringify(body)).not.toContain("—");
    expect(states()).toEqual(["review", "review", "review"]);
    for (const n of [1, 2, 3]) expect(ap(n)).toMatchObject({ status: "draft", hook: `Hook ${n}` });
    expect(drafts.loadDrafts(UID).some((d) => d.scheduledFor)).toBe(false);
    // post 1 on top of My posts
    expect(drafts.loadDrafts(UID)[0].id).toBe(`ap_${WEEK}_1`);
    expect(job.autopilotRun(UID)).toEqual({});
  });

  it("sends at most 7 posts a call", async () => {
    local.setItem(`content-studio-goals-${UID}`, JSON.stringify({ linkedin: 10 }));
    fn.answers.push(writeAll, writeAll);
    await job.runAutopilot(UID, FRI);
    expect(fn.calls.map((c) => (c.posts as unknown[]).length)).toEqual([7, 3]);
    expect(states().every((s) => s === "review")).toBe(true);
  });

  it("does nothing a second time in the same week, or while off", async () => {
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, FRI);
    await job.runAutopilot(UID, at(FRI, 60 * 24));
    expect(fn.calls).toHaveLength(1);
    a.saveSettings(UID, { ...a.DEFAULT_SETTINGS, on: false });
    await job.runAutopilot(UID, at(FRI, 7 * 24 * 60));
    expect(fn.calls).toHaveLength(1);
  });

  it("leaves a run another device started under 10 minutes ago, and runs once it is older", async () => {
    a.saveAutopilot(UID, { ...a.loadAutopilot(UID), batches: [{ week: WEEK, startedAt: at(FRI, -2).toISOString(), posts: a.layoutWeek(POS as never, {}, WEEK, 2) }] });
    await job.runAutopilot(UID, FRI);
    expect(fn.calls).toHaveLength(0);
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, at(FRI, 9));
    expect(fn.calls).toHaveLength(1);
  });

  it("marks the posts failed when OpenAI never answered (502) or answered badly (422), and Try again writes them", async () => {
    fn.answers.push(new EdgeErr("Couldn't write these posts right now.", 502, "failed"));
    await job.runAutopilot(UID, FRI);
    expect(states()).toEqual(["failed", "failed", "failed"]);
    expect(batch().startedAt).toBeUndefined();
    await job.runAutopilot(UID, at(FRI, 1));
    expect(fn.calls).toHaveLength(1);
    fn.answers.push(new EdgeErr("The words that came back couldn't be used.", 422, "unusable"));
    await job.tryAgain(UID, at(FRI, 2));
    expect(states()).toEqual(["failed", "failed", "failed"]);
    fn.answers.push(writeAll);
    await job.tryAgain(UID, at(FRI, 3));
    expect(fn.calls).toHaveLength(3);
    expect((fn.calls[2].posts as unknown[]).length).toBe(3);
    expect(states()).toEqual(["review", "review", "review"]);
  });

  it("marks a post failed when the reply leaves it out", async () => {
    fn.answers.push((body: { posts: { n: number; format: string }[] }) => ({ posts: writeAll(body).posts.slice(0, 2) }));
    await job.runAutopilot(UID, FRI);
    expect(states()).toEqual(["review", "review", "failed"]);
  });

  it("pauses until 8am Singapore time on the daily cap, posts left waiting", async () => {
    fn.answers.push(new EdgeErr("You've used all 20 for today.", 429, "daily_limit"));
    await job.runAutopilot(UID, FRI);
    expect(states()).toEqual(["waiting", "waiting", "waiting"]);
    expect(batch().waitUntil).toBe("2026-10-24T00:00:00.000Z");
    await job.runAutopilot(UID, at(FRI, 60));
    expect(fn.calls).toHaveLength(1);
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, new Date("2026-10-24T00:30:00Z"));
    expect(fn.calls).toHaveLength(2);
    expect(batch().waitUntil).toBeUndefined();
  });

  it("leaves the posts waiting, with no pause, on a 503 or a call that never went", async () => {
    fn.answers.push(new EdgeErr("Usage limits are unavailable.", 503, "usage_unavailable"));
    await job.runAutopilot(UID, FRI);
    expect(states()).toEqual(["waiting", "waiting", "waiting"]);
    expect(batch().waitUntil).toBeUndefined();
    expect(batch().startedAt).toBeUndefined();
    expect(job.autopilotRun(UID).error).toBe(job.ERROR_LINE);
    fn.answers.push(new Error("offline"));
    await job.runAutopilot(UID, at(FRI, 1));
    expect(fn.calls).toHaveLength(2);
    expect(states()).toEqual(["waiting", "waiting", "waiting"]);
    expect(batch().waitUntil).toBeUndefined();
    fn.answers.push(new EdgeErr("This isn't switched on for your account yet.", 403, "not_enabled"));
    await job.runAutopilot(UID, at(FRI, 2));
    expect(job.autopilotRun(UID).error).toBe("This isn't switched on for your account yet.");
  });

  it("writes nothing and says so when every day already holds a written post", async () => {
    const days = a.layoutWeek(POS as never, {}, WEEK, 2).map((p) => p.day);
    drafts.saveDrafts(UID, days.map((day, i) => ({ id: `w${i}`, createdAt: "2026-10-01T00:00:00.000Z", hook: "h", draft: "Mine", pillar: "topic", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "", status: "scheduled", scheduledFor: day })));
    await job.runAutopilot(UID, FRI);
    expect(fn.calls).toHaveLength(0);
    expect(job.autopilotRun(UID)).toEqual({ planned: 3 });
  });
});

// live-p5w3 D1 (calls/013, C-autopilot-store.json): ActivityTracker's week was asked as "Something outside work that shaped
// how you advise", "A challenge you went through and what changed" and "Sales follow-ups: an anonymised before-and-after
// (angle: tax relief cap implications)", and post 3 came back about tax relief caps
describe("a business brand's week (live-p5w3 calls/013)", () => {
  const LIVE_POS = {
    oneLiner: "We help sales reps manage clients, chats, follow-ups and targets in one app so they can keep their work moving.",
    audience: "working-adult",
    audienceDetail: "Sales-oriented self-employed professionals and coaches",
    topics: ["Sales follow-ups", "WhatsApp workflows", "Client management", "Activity tracking", "Sales goals"],
    edge: "It brings CRM, a shared WhatsApp inbox, tasks and goals together in one phone app, with activity logged in one tap.",
    platform: "linkedin",
    cadence: 3,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  // the live run: Thu 22 Oct 2026 with the write day set to Thursday
  const THU = new Date("2026-10-22T08:54:47.903Z");
  // calls/010's five angles for the brand's audience
  const LIVE_ANGLES = [
    ["Follow-up visibility", "You can keep upcoming follow-ups in one task list instead of searching through chats and notes."],
    ["Weekly target pace", "We show your tracked activity against your weekly goals, so you can check where you are in the week."],
    ["Task reminders", "Put follow-up tasks beside client conversations to keep the next step visible during a busy day."],
    ["Calls to make", "We bring your call list and client details together so you can see who needs a call."],
    ["Team deal visibility", "Bring deal updates into one view so you and your team can see what needs attention."],
  ].map(([title, line]) => ({ title, line, origin: "suggested" as const }));
  const business = async () => {
    const { addProfile, setActiveProfile } = await import("./profiles");
    const p = addProfile(UID, "ActivityTracker");
    setActiveProfile(UID, p.id);
    local.setItem(`content-studio-positioning-${UID}~${p.id}`, JSON.stringify(LIVE_POS));
    a.saveSettings(UID, { ...a.DEFAULT_SETTINGS, on: true, writeDay: 3 });
  };
  const asked = () => (fn.calls[0] as { posts: { angle: { title: string; line: string } }[] }).posts.map((p) => p.angle);

  it("asks from the brand's topics and a business's own subjects, never /plan's adviser slots or its finance angles", async () => {
    await business();
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, THU);
    expect(fn.calls).toHaveLength(1);
    const angles = asked();
    expect(angles).toHaveLength(3);
    expect(JSON.stringify(angles)).not.toMatch(/advis|tax|cpf|insur|polic|budget|\(angle:/i);
    expect(angles.some((x) => LIVE_POS.topics.includes(x.title))).toBe(true);
    const slots = a.loadAutopilot(UID).batches[0].posts.map((p) => p.slot);
    expect(slots.some((s) => s.pillar === "identity" || s.pillar === "interest")).toBe(true);
    expect(slots.every((s) => !s.seedId && !/advis|client came|policies|tax/i.test(s.hook))).toBe(true);
  });

  it("takes the angle on a topic slot from the audience's saved angles, the next ones each week", async () => {
    await business();
    const { confirmAngles } = await import("./angles");
    const { loadAudiences } = await import("./audiences");
    confirmAngles(UID, loadAudiences(UID)[0].id, LIVE_ANGLES, THU);
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, THU);
    const titles = LIVE_ANGLES.map((x) => x.title);
    const hinted = asked().map((x) => x.line.match(/\(angle: (.+)\)$/)?.[1]).filter(Boolean);
    expect(hinted.length).toBeGreaterThan(0);
    expect(hinted.every((t) => titles.includes(t!))).toBe(true);
    // with 5 angles and 3 posts a week, a week never starts on the same angle as the one before
    const opts = { formats: a.AUTO_FORMATS, speaker: "business" as const, angles: titles.map((title, i) => ({ id: `an-${i}`, title, line: "" })) };
    const first = (monday: string) => a.layoutWeek(LIVE_POS as never, opts, monday, 2)[0].slot.angleId;
    expect(first("2026-11-02")).not.toBe(first("2026-10-26"));
  });
});

describe("approve, undo and skip", () => {
  beforeEach(async () => {
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, FRI);
  });

  it("approve puts the post on the calendar at its slot time and takes that day's empty placeholder off; undo reverses both", () => {
    const p = batch().posts[0];
    const holder = { id: "plan_plan-1-0-0", createdAt: "2026-10-01T00:00:00.000Z", hook: "slot", draft: "", pillar: "topic", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "", status: "scheduled" as const, scheduledFor: p.day };
    drafts.upsertDraft(UID, holder);
    expect(job.approvePost(UID, WEEK, 1)).toBe(true);
    expect(ap(1)).toMatchObject({ status: "scheduled", scheduledFor: `${p.day}T${p.time}` });
    expect(drafts.loadDrafts(UID).some((d) => d.id === holder.id)).toBe(false);
    expect(states()[0]).toBe("approved");
    job.undoApprove(UID, WEEK, 1);
    expect(ap(1)?.status).toBe("draft");
    expect(ap(1)?.scheduledFor).toBeUndefined();
    expect(drafts.loadDrafts(UID).find((d) => d.id === holder.id)).toEqual(holder);
    expect(states()[0]).toBe("review");
  });

  it("approve all schedules every post waiting for an OK", () => {
    expect(job.approveAll(UID, WEEK)).toBe(3);
    expect([1, 2, 3].map((n) => ap(n)?.status)).toEqual(["scheduled", "scheduled", "scheduled"]);
    expect(states()).toEqual(["approved", "approved", "approved"]);
  });

  it("skip deletes the draft and keeps the post as skipped, so it is never written again; undo brings it back", async () => {
    const undo = job.skipPost(UID, WEEK, 2)!;
    expect(ap(2)).toBeUndefined();
    expect(states()[1]).toBe("skipped");
    await job.runAutopilot(UID, at(FRI, 30));
    expect(fn.calls).toHaveLength(1);
    undo();
    expect(ap(2)?.hook).toBe("Hook 2");
    expect(states()[1]).toBe("review");
  });
});

describe("the sweep", () => {
  beforeEach(async () => {
    fn.answers.push(writeAll);
    await job.runAutopilot(UID, FRI);
  });

  it("marks a post not approved by its date missed, and leaves its draft unscheduled", async () => {
    // Sun 25 Oct: Monday's post had to be approved by Sat 24
    await job.runAutopilot(UID, new Date("2026-10-25T01:00:00Z"));
    expect(states()).toEqual(["missed", "review", "review"]);
    expect(ap(1)?.status).toBe("draft");
    expect(ap(1)?.scheduledFor).toBeUndefined();
    expect(fn.calls).toHaveLength(1);
  });

  it("marks a post approved when its draft was scheduled elsewhere, and skipped once its draft is gone", async () => {
    drafts.setDraftStatus(UID, `ap_${WEEK}_2`, "scheduled", "2026-10-28T12:00");
    drafts.deleteDraft(UID, `ap_${WEEK}_3`);
    // a device whose drafts have not synced yet never marks it skipped
    await job.runAutopilot(UID, at(FRI, 5));
    expect(states()).toEqual(["review", "approved", "review"]);
    await job.runAutopilot(UID, at(FRI, 11));
    expect(states()).toEqual(["review", "approved", "skipped"]);
    expect(a.autopilotWaiting(UID, "2026-10-23")).toBe(1);
    expect(a.autopilotWaiting(UID, "2026-10-25")).toBe(0);
  });
});

describe("turn off", () => {
  it("turns it off with an Undo", () => {
    const undo = job.turnOff(UID);
    expect(a.loadAutopilot(UID).settings.on).toBe(false);
    undo();
    expect(a.loadAutopilot(UID).settings.on).toBe(true);
  });
});
