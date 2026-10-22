import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with OpenAI and Jev faked: which counters move, which come back, and what each mode answers.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  /** every counter refuses, as when the day's uses are spent */
  limit: false,
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.limit ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const OPENAI = "https://api.openai.com/v1/chat/completions";
const JEV = "https://api.typesafe.ai/v1/systemone";
// "leo" is on NORTH_STAR_USERS; "u1", everyone else, is not
const env: Record<string, string> = { OPENAI_API_KEY: "k", NORTH_STAR_USERS: "leo" };
const sent: Record<string, unknown[]> = {};
/** OpenAI's answer for the next calls; a function so a test can fail it or throw. */
let openai: () => Response | Promise<Response> = () => reply({});
let jevReply: (questions: Record<string, unknown>, state: Record<string, unknown>) => Record<string, unknown> = () => ({});
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    (sent[url] ??= []).push(body);
    if (url === OPENAI) return await openai();
    if (url === JEV) return Response.json({ answers: jevReply(body.questions, body.state) });
    throw new Error(`unexpected fetch ${url}`);
  });
  await import("./index.ts");
}, 30_000);
beforeEach(() => {
  db.spent.length = 0;
  db.refunded.length = 0;
  db.limit = false;
  for (const k of Object.keys(sent)) delete sent[k];
  openai = () => reply({});
  jevReply = () => ({});
  env.OPENAI_API_KEY = "k";
  delete env.TYPESAFE_API_KEY;
});

const call = async (body: unknown, uid = "u1") => {
  const r = await db.handler!(new Request("http://x/idea-dump", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

const PROFILE = {
  positioning: { oneLiner: "I help young families in Singapore plan for the big costs.", audienceDetail: "Parents in their 30s", topics: ["Hospital cover", "CPF"], edge: "Ex-engineer" },
  platforms: ["linkedin", "instagram"],
  voice: "Short sentences. I say what I think.",
};
const NOTES = "- why young adults skip hospital plans\n- CPF top ups before December";
const BRIEF = {
  note: 1,
  idea: "Why young adults skip hospital plans",
  angle: "They think they are too young to fall sick.",
  hooks: ["Too young to need a hospital plan?", "My first ward bill was a shock.", "Your parents' plan stops covering you soon."],
  talkingPoints: ["What a ward stay costs", "What MediShield Life covers", "Questions to ask"],
  cta: "What made you get yours?",
  ctaType: "open-question",
  format: "text-post",
  platform: "linkedin",
  funnelStage: "attraction",
  stageReason: "It meets them where they are.",
};
const FORMULAS = [
  { id: "contrarian", name: "Contrarian take", template: "Most people say {x}. I disagree." },
  { id: "number-reveal", name: "Number reveal", template: "I did {x} {N} times." },
  { id: "mistake", name: "Mistake confession", template: "{Cost} is what {mistake} cost me." },
  { id: "before-after", name: "Before and after", template: "{Then}. Now {now}." },
  { id: "list", name: "The list", template: "{N} things I wish I knew." },
];
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Sentence ${i} about CPF top-ups and why clients wait too long.`).join(" ");
const LONG_REPLY = {
  extracts: { claims: ["Clients wait too long to top up CPF."], numbers: [], stories: [], lines: [] },
  posts: FORMULAS.map((_, i) => ({ formula: i + 1, post: `Post ${i + 1} about CPF top-ups.\n\nWhy waiting costs you.`, basedOn: "Clients wait too long to top up CPF." })),
};

describe("idea-dump today (pinned: live for everyone, no gate, no refund)", () => {
  it("develops notes into briefs on the idea-dump cap, for anyone signed in", async () => {
    openai = () => reply({ briefs: [BRIEF], skipped: [{ note: 2, reason: "Too thin." }] });
    const r = await call({ ...PROFILE, notes: NOTES });
    expect(r.status).toBe(200);
    expect(r.body.briefs).toHaveLength(1);
    expect(r.body.skipped).toEqual([{ note: 2, idea: "CPF top ups before December", reason: "Too thin." }]);
    expect(r.body.usage).toEqual({ used: 1, limit: 30 });
    expect(db.spent).toEqual(["idea-dump"]);
    expect(db.refunded).toEqual([]);
    await expect(JSON.stringify(sent[OPENAI], null, 2)).toMatchFileSnapshot("./fixtures/default-request.json");
  });

  it("answers 502 ai_failed and keeps the use when OpenAI fails or never answers", async () => {
    for (const fail of [() => new Response("down", { status: 500 }), () => Promise.reject(new TypeError("connection refused")), () => reply("not json")]) {
      openai = fail;
      db.spent.length = 0;
      const r = await call({ ...PROFILE, notes: NOTES });
      expect(r).toEqual({ status: 502, body: { error: "Couldn't develop your ideas right now. Try again in a minute.", code: "ai_failed" } });
      expect(db.spent).toEqual(["idea-dump"]);
    }
    expect(db.refunded).toEqual([]);
  });

  it("answers 422 no_ideas when the model develops nothing", async () => {
    openai = () => reply({ briefs: [], skipped: [{ note: 1, reason: "Too thin." }] });
    const r = await call({ notes: NOTES });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("no_ideas");
    expect(db.spent).toEqual(["idea-dump"]);
    expect(db.refunded).toEqual([]);
  });

  it("refuses before counting: no sign-in, no notes, thin notes, no key", async () => {
    expect((await call({ notes: NOTES }, "")).status).toBe(401);
    expect(await call({})).toEqual({ status: 400, body: { error: "Paste or dictate at least one idea.", code: "no_notes" } });
    expect((await call({ notes: "hi" })).body.code).toBe("no_ideas");
    delete env.OPENAI_API_KEY;
    expect(await call({ notes: NOTES })).toEqual({ status: 503, body: { error: "Idea Dump isn't switched on yet.", code: "not_configured" } });
    expect(db.spent).toEqual([]);
    expect(sent[OPENAI]).toBeUndefined();
  });

  it("answers the daily limit with 429 and calls nothing", async () => {
    db.limit = true;
    const r = await call({ notes: NOTES });
    expect(r).toEqual({ status: 429, body: { code: "daily_limit", error: "You've used all 30 for today. It resets at 8am Singapore time." } });
    expect(sent[OPENAI]).toBeUndefined();
  });

  it("writes a long piece into 5 posts on the repurpose-long cap", async () => {
    openai = () => reply(LONG_REPLY);
    const r = await call({ ...PROFILE, mode: "long", text: LONG_TEXT, formulas: FORMULAS });
    expect(r.status).toBe(200);
    expect(r.body.posts.map((p: { formulaId: string }) => p.formulaId)).toEqual(FORMULAS.map((f) => f.id));
    expect(r.body).toMatchObject({ truncated: false, usage: { used: 1, limit: 20 } });
    expect(db.spent).toEqual(["repurpose-long"]);
    expect(db.refunded).toEqual([]);
    await expect(JSON.stringify(sent[OPENAI], null, 2)).toMatchFileSnapshot("./fixtures/long-request.json");
  });

  it("answers a failed long run with 502 ai_failed and keeps the use", async () => {
    for (const fail of [() => new Response("down", { status: 500 }), () => reply({ extracts: LONG_REPLY.extracts, posts: [] })]) {
      openai = fail;
      db.spent.length = 0;
      const r = await call({ mode: "long", text: LONG_TEXT, formulas: FORMULAS });
      expect(r).toEqual({ status: 502, body: { error: "Couldn't write posts from this piece right now. Try again in a minute.", code: "ai_failed" } });
      expect(db.spent).toEqual(["repurpose-long"]);
    }
    expect(db.refunded).toEqual([]);
  });

  it("refuses a short long piece and missing formulas before counting", async () => {
    expect((await call({ mode: "long", text: "A short note about CPF.", formulas: FORMULAS })).body.code).toBe("too_short");
    expect((await call({ mode: "long", text: LONG_TEXT })).body.code).toBe("bad_formulas");
    delete env.OPENAI_API_KEY;
    expect(await call({ mode: "long", text: LONG_TEXT, formulas: FORMULAS })).toEqual({ status: 503, body: { error: "This isn't switched on yet.", code: "not_configured" } });
    expect(db.spent).toEqual([]);
  });
});
