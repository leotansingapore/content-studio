import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with Jev and the daily counter faked: who gets an action, and what spends a use.
const db = vi.hoisted(() => {
  const spent: string[] = [];
  let left = true;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    // the counter answers the uses so far, or null once the day's limit is reached
    rpc: async (_fn: string, a: Record<string, unknown>) => (spent.push(String(a.p_feature)), { data: left ? 1 : null, error: null }),
    // refundUsage: one row read, then the conditional update that gives the use back
    from: () => ({
      select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
      update: () => ({ match: (q: Record<string, unknown>) => ({ select: async () => (spent.push(`refund:${q.feature}`), { data: [{ count: 0 }], error: null }) }) }),
    }),
  };
  return { admin, spent, capReached: (v: boolean) => (left = !v), handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const asked: unknown[] = [];
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const choice = (c: string) => ({ type: "choice", choice: c, probabilities: { [c]: 0.9 } });
const moveAnswers = () => ({ act: choice("move"), post: choice("p1"), day: choice(tomorrow), time: choice("09:00") });
let jev: () => Record<string, unknown> = moveAnswers;
/** Jev's HTTP status: anything but 200 is Jev never answering. */
let jevStatus = 200;
const env: Record<string, string | undefined> = {};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => (k in env ? env[k] : "x") } });
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    asked.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ answers: jev() }), { status: jevStatus });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.spent.length = 0;
  db.capReached(false);
  asked.length = 0;
  jev = moveAnswers;
  jevStatus = 200;
  Object.assign(env, { TYPESAFE_API_KEY: "test-key", NORTH_STAR_USERS: "leo-uid" });
});

const call = async (body: unknown, uid = "u1") => {
  const r = await db.handler!(new Request("http://x/assistant-act", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const posts = [{ title: "Hospital plans in plain words", status: "draft", when: "", platform: "instagram" }];
// Every field agent mode reads (phase 6), each filled.
const AGENT_FIELDS = {
  agent: true,
  chip: "video",
  speaker: "business",
  source: { kind: "ad", format: "video", title: "Why teams stop logging calls" },
  pending: "A 15-second talking video about prospecting",
  open: { kind: "carousel", title: "Three CPF myths", slides: ["Myth one", "Myth two"], onScreen: 2 },
  learnings: ["Never use emoji (posts)", "Use an older man as my presenter (videos)"],
  lastChange: "Moved Three CPF myths to Friday",
  speakers: [{ id: "mine", look: "Your own face" }, { id: "pr-abc", look: "A Malay Singaporean man in his late 30s" }],
  audiences: [{ id: "a1", name: "Young parents" }],
  skills: [{ slash: "/polish", name: "Polish", instruction: "Tighten the hook" }],
  competitorAds: true,
};

describe("the assistant's actions", () => {
  it("moves a saved post to the day and time the message names, for one daily use", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today, posts });
    expect(r).toEqual({ status: 200, body: { pick: { act: "move", post: 0, day: tomorrow, time: "09:00" } } });
    expect(db.spent).toEqual(["assistant-act"]);
    expect(asked).toHaveLength(1);
  });

  it("spends no use and asks nothing when signed out, when there's nothing to read, or when the message isn't in English", async () => {
    expect((await call({ message: "Move it to Friday", today, posts }, "")).status).toBe(401);
    expect((await call({ message: "   ", today, posts })).status).toBe(400);
    expect(await call({ message: "\u628a\u6211\u7684\u5e16\u5b50\u6539\u5230\u660e\u5929\u65e9\u4e0a\u4e5d\u70b9\u53d1\u5e03", today, posts })).toEqual({ status: 200, body: { pick: null } });
    expect(db.spent).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("sends Jev today's questions for an account not on the list (pinned)", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today: "2026-10-11", posts });
    expect(r.status).toBe(200);
    await expect(JSON.stringify(asked[0], null, 2)).toMatchFileSnapshot("./fixtures/jev-request-everyone.json");
  });

  it("ignores every agent field from an account not on the list: today's Jev request (pinned) and today's counter", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today: "2026-10-11", posts, ...AGENT_FIELDS });
    expect(r).toEqual({ status: 200, body: { pick: { act: "move", post: 0, day: tomorrow, time: "09:00" } } });
    await expect(JSON.stringify(asked[0], null, 2)).toMatchFileSnapshot("./fixtures/jev-request-everyone.json");
    expect(db.spent).toEqual(["assistant-act"]);
  });

  it("stops at the daily limit without asking Jev", async () => {
    db.capReached(true);
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today, posts });
    expect(r.status).toBe(429);
    expect(asked).toEqual([]);
  });
});

describe("the remember act", () => {
  const msg = { message: "from now on never use emoji in my posts", today: "2026-10-11", posts };
  type Sent = { questions: Record<string, { criteria: Record<string, string> }> };
  it("is asked and answered for an account on NORTH_STAR_USERS, for one daily use", async () => {
    jev = () => ({ act: choice("remember"), scope: choice("posts") });
    const r = await call(msg, "leo-uid");
    expect(r).toEqual({ status: 200, body: { pick: { act: "remember", post: null, day: null, time: null, scope: "posts" } } });
    const q = (asked[0] as Sent).questions;
    expect(q.act.criteria.remember).toBeTruthy();
    expect(Object.keys(q.scope.criteria)).toEqual(["posts", "videos", "pictures", "all"]);
    expect(db.spent).toEqual(["assistant-act"]);
  });
  it("is never asked for anyone else, and a stray remember answer gives them no pick", async () => {
    jev = () => ({ act: choice("remember"), scope: choice("posts") });
    const r = await call(msg, "u1");
    expect(r).toEqual({ status: 200, body: { pick: null } });
    const q = (asked[0] as Sent).questions;
    expect(q.act.criteria.remember).toBeUndefined();
    expect(q.scope).toBeUndefined();
    expect(db.spent).toEqual(["assistant-act"]);
  });
});

describe("agent mode (Leo only)", () => {
  type Sent = { state: Record<string, string>; questions: Record<string, { criteria: Record<string, string> }> };
  const msg = { message: "make a 15 second talking video about MediShield Life", today: "2026-10-11", posts };
  const nothing = { act: null, format: null, length: null, who: null, audience: null, weeks: null, pace: null, slide: null, which: null, skill: null, post: null, day: null, time: null, scope: null };
  it("asks the agent's questions, answers the pick with every probability, and counts agent-act", async () => {
    jev = () => ({ act: choice("make"), format: choice("speaking"), length: choice("15"), weeks: { type: "choice", choice: "none", probabilities: { none: 0.7 } } });
    const r = await call({ ...msg, ...AGENT_FIELDS }, "leo-uid");
    expect(r.status).toBe(200);
    expect(r.body.pick).toEqual({ ...nothing, act: "make", format: "speaking", length: 15 });
    expect(r.body.p).toEqual({ ...nothing, act: 0.9, format: 0.9, length: 0.9, weeks: 0.7 });
    expect(db.spent).toEqual(["agent-act"]);
    const q = (asked[0] as Sent).questions;
    expect(Object.keys(q)).toEqual(["act", "post", "day", "time", "scope", "format", "length", "who", "audience", "weeks", "pace", "slide", "which", "skill"]);
    expect(q.act.criteria.refuse).toBe("Ask for something that must not be made: a post that copies another person's words exactly, or uses another real person's face or voice.");
    expect((asked[0] as Sent).state.pending).toBe(AGENT_FIELDS.pending);
  });
  it("keeps today's dock for the same account without agent: true", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today, posts, ...AGENT_FIELDS, agent: false }, "leo-uid");
    expect(r).toEqual({ status: 200, body: { pick: { act: "move", post: 0, day: tomorrow, time: "09:00" } } });
    expect(Object.keys((asked[0] as Sent).questions)).toEqual(["act", "post", "day", "time", "scope"]);
    expect(db.spent).toEqual(["assistant-act"]);
  });
  it("gives agent-act back when Jev never answers, and only in agent mode", async () => {
    jevStatus = 503;
    expect(await call({ ...msg, agent: true }, "leo-uid")).toEqual({ status: 200, body: { pick: null, p: nothing } });
    expect(db.spent).toEqual(["agent-act", "refund:agent-act"]);
    db.spent.length = 0;
    expect(await call(msg, "leo-uid")).toEqual({ status: 200, body: { pick: null } });
    expect(await call(msg, "u1")).toEqual({ status: 200, body: { pick: null } });
    expect(db.spent).toEqual(["assistant-act", "assistant-act"]);
  });
  it("keeps the use when Jev answered, even with nothing sure", async () => {
    jev = () => ({ act: choice("none") });
    expect(await call({ ...msg, agent: true }, "leo-uid")).toEqual({ status: 200, body: { pick: nothing, p: { ...nothing, act: 0.9 } } });
    expect(db.spent).toEqual(["agent-act"]);
  });
  it("spends nothing and asks nothing on a message mostly not in English, a bad body, no Jev key or the daily limit", async () => {
    expect(await call({ ...msg, message: "\u5e2e\u6211\u505a\u4e00\u4e2a\u5341\u4e94\u79d2\u7684\u89c6\u9891", agent: true }, "leo-uid")).toEqual({ status: 200, body: { pick: null, p: nothing } });
    expect(await call({ ...msg, agent: true, chip: "image" }, "leo-uid")).toEqual({ status: 400, body: { code: "bad_request", error: "Nothing to read." } });
    expect(await call({ ...msg, message: " ", agent: true }, "leo-uid")).toEqual({ status: 400, body: { code: "bad_request", error: "Nothing to read." } });
    // a bad agent field from anyone else is ignored, as every agent field is
    expect((await call({ ...msg, agent: true, chip: "image" }, "u1")).status).toBe(200);
    expect(db.spent).toEqual(["assistant-act"]);
    db.spent.length = 0;
    asked.length = 0;
    env.TYPESAFE_API_KEY = undefined;
    expect(await call({ ...msg, agent: true }, "leo-uid")).toEqual({ status: 503, body: { code: "not_configured", error: "The agent isn't set up yet." } });
    env.TYPESAFE_API_KEY = "test-key";
    db.capReached(true);
    const capped = await call({ ...msg, agent: true }, "leo-uid");
    expect([capped.status, capped.body.code]).toEqual([429, "daily_limit"]);
    expect(db.spent).toEqual(["agent-act"]);
    expect(asked).toEqual([]);
  });
});
