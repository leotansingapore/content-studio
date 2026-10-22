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

const PLAN_CONTEXT = {
  positioning: { oneLiner: "I help young families in Singapore plan for the big costs.", audienceDetail: "Parents in their 30s", topics: ["CPF"], edge: "" },
  goal: "Get more enquiries from parents",
  platforms: ["instagram"],
  speaker: "person",
};
const ANGLES = { mode: "angles", audience: "Parents in their 30s with a first child", avoid: ["Hospital bills shock"], context: PLAN_CONTEXT };
const ANGLES_REPLY = {
  angles: Array.from({ length: 8 }, (_, i) => ({ title: `Angle number ${i}`, line: `Why angle ${i} matters to new parents.` })),
};
const NOT_ENABLED = { status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } };

describe("idea-dump angles (phase 5, Leo only)", () => {
  it("is 403 not_enabled before any count for a caller not on NORTH_STAR_USERS, even with a bad body", async () => {
    expect(await call(ANGLES)).toEqual(NOT_ENABLED);
    expect(await call({ mode: "angles" })).toEqual(NOT_ENABLED);
    expect(db.spent).toEqual([]);
    expect(sent[OPENAI]).toBeUndefined();
  });

  it("refuses a bad body with 400 and a missing key with 503, before any count", async () => {
    expect(await call({ mode: "angles", context: PLAN_CONTEXT }, "leo")).toEqual({ status: 400, body: { code: "bad_request", error: "Say who the campaign is for first." } });
    delete env.OPENAI_API_KEY;
    expect((await call(ANGLES, "leo")).body.code).toBe("not_configured");
    expect(db.spent).toEqual([]);
  });

  it("keeps the 5 Jev rates highest of those that fit and are safe, on the campaign-angles cap", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply(ANGLES_REPLY);
    // fits rises with the angle's number; angle 7 is unsafe, angle 0 does not fit
    jevReply = (_q, state) => {
      const i = Number(String(state.angle).match(/number (\d)/)?.[1]);
      return { fits: { type: "noul", noul: i === 0 ? 0.3 : 0.5 + i / 20 }, unsafe: { type: "noul", noul: i === 7 ? 0.8 : 0.1 } };
    };
    const r = await call(ANGLES, "leo");
    expect(r.status).toBe(200);
    expect(r.body.scored).toBe(true);
    expect(r.body.angles.map((a: { title: string }) => a.title)).toEqual(["Angle number 6", "Angle number 5", "Angle number 4", "Angle number 3", "Angle number 2"]);
    expect(r.body.angles[0]).toEqual({ title: "Angle number 6", line: "Why angle 6 matters to new parents.", fit: 0.8 });
    expect(db.spent).toEqual(["campaign-angles"]);
    expect(db.refunded).toEqual([]);
    expect(sent[JEV]).toHaveLength(8);
    expect(Object.keys((sent[JEV][0] as { questions: object }).questions)).toEqual(["fits", "unsafe"]);
    const prompt = (sent[OPENAI][0] as { messages: { content: string }[] }).messages.map((m) => m.content).join("\n");
    expect(prompt).toContain("- Hospital bills shock");
  });

  it("sends Title Case titles back in sentence case, keeping names the brand's words use mid-sentence (live check, calls/010)", async () => {
    // calls/010's request as sent, with one product line that names Lark mid-sentence
    const live = {
      mode: "angles",
      audience: "Sales team managers: People coordinating a sales team who want a shared WhatsApp inbox, team activity records and a view of progress toward targets.",
      avoid: [],
      context: {
        positioning: {
          oneLiner: "We help sales reps manage clients, chats, follow-ups and targets in one app so they can keep their work moving.",
          audienceDetail: "Sales-oriented self-employed professionals and coaches",
          topics: ["Sales follow-ups", "WhatsApp workflows", "Client management", "Activity tracking", "Sales goals"],
          edge: "It brings CRM, a shared WhatsApp inbox, tasks and goals together in one phone app, with activity logged in one tap.",
        },
        goal: "Get more sales team managers to book a demo",
        platforms: ["linkedin", "instagram"],
        speaker: "business",
        product: "ActivityTracker: CRM, a shared WhatsApp inbox, tasks and goals in one phone app, and it works beside Lark. SGD 34 a person a month.",
      },
    };
    openai = () => reply({
      angles: [
        { title: "Shared Chat Visibility", line: "We bring team WhatsApp conversations into one shared inbox, so you can see where client chats stand." },
        { title: "Clear Follow-Up Ownership", line: "See who owns each next step, so client follow-ups are easier to coordinate across your team." },
        { title: "Chats Beside Lark Too", line: "Keep the team's tools where they are." },
      ],
    });
    const r = await call(live, "leo");
    expect(r.status).toBe(200);
    expect(r.body.angles.map((a: { title: string }) => a.title)).toEqual(["Shared chat visibility", "Clear follow-up ownership", "Chats beside Lark too"]);
  });

  it("drops a suggested title that is already saved, before asking Jev", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply({ angles: [{ title: "HOSPITAL bills shock", line: "Saved already." }, ...ANGLES_REPLY.angles.slice(0, 2)] });
    jevReply = () => ({ fits: { type: "noul", noul: 0.9 }, unsafe: { type: "noul", noul: 0 } });
    const r = await call(ANGLES, "leo");
    expect(r.body.angles.map((a: { title: string }) => a.title)).toEqual(["Angle number 0", "Angle number 1"]);
    expect(sent[JEV]).toHaveLength(2);
  });

  it("falls back to the first 5 clean candidates, unscored, with no Jev key", async () => {
    openai = () => reply(ANGLES_REPLY);
    const r = await call(ANGLES, "leo");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ scored: false });
    expect(r.body.angles.map((a: { fit: null }) => a.fit)).toEqual([null, null, null, null, null]);
    expect(sent[JEV]).toBeUndefined();
  });

  it("gives the use back when OpenAI never answered (non-2xx, timeout, no connection): 502", async () => {
    const timeout = () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    for (const fail of [() => new Response("down", { status: 500 }), timeout, () => Promise.reject(new TypeError("connection refused"))]) {
      openai = fail;
      db.spent.length = 0;
      db.refunded.length = 0;
      expect(await call(ANGLES, "leo")).toEqual({ status: 502, body: { code: "failed", error: "Couldn't suggest angles right now. Try again in a minute." } });
      expect(db.spent).toEqual(["campaign-angles"]);
      expect(db.refunded).toEqual(["campaign-angles"]);
    }
  });

  it("keeps the use when OpenAI answered with nothing usable: 422 no_angles", async () => {
    const refusal = () => Response.json({ choices: [{ message: { content: null, refusal: "I can't help with that." } }] });
    for (const bad of [() => reply("not json"), () => reply({ angles: [{ title: "One", line: "" }] }), refusal]) {
      openai = bad;
      const r = await call(ANGLES, "leo");
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("no_angles");
    }
    expect(db.refunded).toEqual([]);
  });

  it("answers the daily limit with 429 and calls nothing", async () => {
    db.limit = true;
    expect((await call(ANGLES, "leo")).body.code).toBe("daily_limit");
    expect(sent[OPENAI]).toBeUndefined();
  });
});

const askOf = (n: number, format: string) => ({ n, angle: { title: "Follow-ups that stick", line: "Most deals die in the follow-up." }, format, stage: "trust", ctaType: "save-share", platforms: ["instagram"] });
const CAMPAIGN = { mode: "campaign", posts: [askOf(1, "text-post"), askOf(2, "wall")], context: { ...PLAN_CONTEXT, audience: "Parents in their 30s" }, avoid: ["Your follow-up is the real pitch"] };
const SWAP = { ...CAMPAIGN, swap: true, posts: [askOf(2, "wall")] };
const body100 = Array.from({ length: 100 }, () => "word").join(" ") + ".";
const CAMPAIGN_REPLY = {
  posts: [
    { n: 1, hook: "Most reps lose the deal after the first call", body: body100, script: "", brief: "", cta: "Save this for your next follow-up." },
    { n: 2, hook: "Stop sending just checking in", body: "", script: "", brief: "One bold line on why checking in fails.", cta: "Comment FOLLOW." },
  ],
};

describe("idea-dump campaign (phase 5, Leo only)", () => {
  it("is 403 not_enabled before any count for a caller not on NORTH_STAR_USERS", async () => {
    expect(await call(CAMPAIGN)).toEqual(NOT_ENABLED);
    expect(await call(SWAP)).toEqual(NOT_ENABLED);
    expect(db.spent).toEqual([]);
    expect(sent[OPENAI]).toBeUndefined();
  });

  it("refuses a swap of two posts, and a bad body, with 400 before any count", async () => {
    expect(await call({ ...SWAP, posts: CAMPAIGN.posts }, "leo")).toEqual({ status: 400, body: { code: "bad_request", error: "A swap writes exactly one post again." } });
    expect((await call({ ...CAMPAIGN, posts: [] }, "leo")).body.code).toBe("bad_request");
    expect(db.spent).toEqual([]);
  });

  it("writes the posts asked for on campaign-draft", async () => {
    openai = () => reply(CAMPAIGN_REPLY);
    const r = await call(CAMPAIGN, "leo");
    expect(r.status).toBe(200);
    expect(r.body.posts).toEqual([
      { n: 1, hook: "Most reps lose the deal after the first call", body: body100, cta: "Save this for your next follow-up.", ctaType: "save-share", mas: null },
      { n: 2, hook: "Stop sending just checking in", brief: "One bold line on why checking in fails.", cta: "Comment FOLLOW.", ctaType: "save-share", mas: null },
    ]);
    expect(db.spent).toEqual(["campaign-draft"]);
    expect(db.refunded).toEqual([]);
    const req = sent[OPENAI][0] as { max_completion_tokens: number; response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    expect(req.response_format.json_schema.name).toBe("campaign_posts");
    expect(req.messages[1].content).toContain("- Your follow-up is the real pitch");
  });

  it("writes one post again on campaign-swap", async () => {
    openai = () => reply({ posts: [CAMPAIGN_REPLY.posts[1]] });
    const r = await call(SWAP, "leo");
    expect(r.status).toBe(200);
    expect(r.body.posts.map((p: { n: number }) => p.n)).toEqual([2]);
    expect(db.spent).toEqual(["campaign-swap"]);
  });

  it("gives the use back to the cap it came from when OpenAI never answered: 502", async () => {
    const timeout = () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    for (const [body, cap] of [[CAMPAIGN, "campaign-draft"], [SWAP, "campaign-swap"]] as const) {
      for (const fail of [() => new Response("down", { status: 503 }), timeout]) {
        openai = fail;
        db.spent.length = 0;
        db.refunded.length = 0;
        const r = await call(body, "leo");
        expect(r.status).toBe(502);
        expect(r.body.code).toBe("failed");
        expect(db.spent).toEqual([cap]);
        expect(db.refunded).toEqual([cap]);
      }
    }
  });

  it("keeps the use when OpenAI answered and no post survives: 422 unusable", async () => {
    const refusal = () => Response.json({ choices: [{ message: { content: null, refusal: "No." } }] });
    for (const bad of [() => reply("not json"), () => reply({ posts: [{ ...CAMPAIGN_REPLY.posts[0], n: 9 }] }), refusal]) {
      openai = bad;
      const r = await call(CAMPAIGN, "leo");
      expect(r).toEqual({ status: 422, body: { code: "unusable", error: "The words that came back couldn't be used. Try again." } });
    }
    expect(db.refunded).toEqual([]);
  });

  it("logs each dropped post's number and the rule it broke, never its words (live check: only 'asked 4 written 2')", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      openai = () => reply({ posts: [CAMPAIGN_REPLY.posts[0], { ...CAMPAIGN_REPLY.posts[1], brief: "" }] });
      expect((await call(CAMPAIGN, "leo")).body.posts.map((p: { n: number }) => p.n)).toEqual([1]);
      openai = () => reply({ posts: [{ ...CAMPAIGN_REPLY.posts[0], body: "Too short to post." }] });
      expect((await call(CAMPAIGN, "leo")).body.code).toBe("unusable");
      const lines = log.mock.calls.map((c) => c.join(" ")).filter((l) => l.startsWith("idea-dump campaign"));
      expect(lines[0]).toBe('idea-dump campaign leo campaign-draft asked 2 written 1 dropped [[2,"no brief"]] mas [[1,null]]');
      expect(lines[1]).toBe('idea-dump campaign leo campaign-draft asked 2 written 0 dropped [[1,"body 4 words, needs 80 to 220"],[2,"not written"]]');
      expect(lines).toHaveLength(2);
      expect(log.mock.calls.flat().join("\n")).not.toMatch(/Too short|checking in|Most reps/);
    } finally {
      log.mockRestore();
    }
  });

  it("refuses a swap whose hook shares 4 words in a row with a used one: 422 unusable, use kept (live check, calls/013)", async () => {
    const formula = { name: "Contrarian", template: "Most [audience] think [belief]. Here is why that is wrong." };
    const swap = { ...CAMPAIGN, swap: true, posts: [{ ...askOf(1, "text-post"), formula }], avoid: ["Most sales managers think visibility means reading every chat. Here is why that is wrong."] };
    openai = () => reply({ posts: [{ ...CAMPAIGN_REPLY.posts[0], hook: "Most sales teams think visibility means checking every chat. Here is why that is wrong." }] });
    expect(await call(swap, "leo")).toEqual({ status: 422, body: { code: "unusable", error: "The words that came back couldn't be used. Try again." } });
    expect(db.spent).toEqual(["campaign-swap"]);
    expect(db.refunded).toEqual([]);
    openai = () => reply({ posts: [{ ...CAMPAIGN_REPLY.posts[0], hook: "Most sales teams think more chats mean more sales. Here is why that is wrong." }] });
    expect((await call(swap, "leo")).status).toBe(200);
  });

  it("answers the daily limit with 429 and calls nothing", async () => {
    db.limit = true;
    // the limit's number is the contracts task's (usageCaps.test.ts)
    expect((await call(SWAP, "leo")).body.code).toBe("daily_limit");
    expect(sent[OPENAI]).toBeUndefined();
  });
});

describe("idea-dump campaign MAS (phase 5)", () => {
  it("asks Jev once per call about a person's posts and returns masWarn per post", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply(CAMPAIGN_REPLY);
    jevReply = () => ({ mas_1: { type: "noul", noul: 0.8 }, mas_2: { type: "noul", noul: 0.1 } });
    const r = await call(CAMPAIGN, "leo");
    expect(r.body.posts.map((p: { mas: boolean | null }) => p.mas)).toEqual([true, false]);
    expect(sent[JEV]).toHaveLength(1);
    expect(Object.keys((sent[JEV][0] as { questions: object }).questions)).toEqual(["mas_1", "mas_2"]);
  });

  it("gives null when Jev has no answer, and never asks about a business's posts", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply(CAMPAIGN_REPLY);
    jevReply = () => ({});
    expect((await call(CAMPAIGN, "leo")).body.posts.map((p: { mas: null }) => p.mas)).toEqual([null, null]);
    for (const k of Object.keys(sent)) delete sent[k];
    jevReply = () => ({ mas_1: { type: "noul", noul: 0.9 } });
    const r = await call({ ...CAMPAIGN, context: { ...PLAN_CONTEXT, speaker: "business", audience: "Sales reps" } }, "leo");
    expect(r.body.posts.map((p: { mas: null }) => p.mas)).toEqual([null, null]);
    expect(sent[JEV]).toBeUndefined();
    const prompt = (sent[OPENAI][0] as { messages: { content: string }[] }).messages.map((m) => m.content).join("\n");
    expect(prompt).toContain("- Write as the business:");
    expect(prompt).not.toMatch(/adviser/i);
  });
});

import LIVE_014_LONG from "./fixtures/live-p5w2-014-long.json";

describe("idea-dump long source and speaker (phase 5, listed callers only)", () => {
  const LONG = { ...PROFILE, mode: "long", text: LONG_TEXT, formulas: FORMULAS };
  const systemSent = () => (sent[OPENAI][0] as { messages: { content: string }[] }).messages[0].content;

  it("writes an interview in the first person for a listed caller, on repurpose-long with no refund", async () => {
    openai = () => reply(LONG_REPLY);
    const r = await call({ ...LONG, source: "interview" }, "leo");
    expect(r.status).toBe(200);
    expect(systemSent()).toContain("Turn the answers into a week of posts in the consultant's first person.");
    expect(db.spent).toEqual(["repurpose-long"]);
    expect(db.refunded).toEqual([]);
  });

  it("writes a listed business's voice note as the business", async () => {
    openai = () => reply(LONG_REPLY);
    await call({ ...LONG, source: "voice", speaker: "business" }, "leo");
    expect(systemSent()).toContain("Someone at the business recorded a voice note");
    expect(systemSent()).toContain("- Write as the business:");
  });

  it("drops a listed caller's posts that kept a formula blank, logging only numbers and rules (wave 2 live check, calls/014)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      openai = () => reply(LIVE_014_LONG.reply);
      const r = await call(LIVE_014_LONG.body, "leo");
      expect(r.status).toBe(200);
      expect(r.body.posts.map((p: { formulaId: string }) => p.formulaId)).toEqual(["callout"]);
      expect(systemSent()).toContain("- Every blank in a hook formula, in {braces} or [brackets], is replaced with real words from the piece.");
      const line = log.mock.calls.find((c) => c[0] === "idea-dump long")!;
      expect(line).toEqual(["idea-dump long", "leo", "chars", LIVE_014_LONG.body.text.length, "posts", 1, "dropped", '[[1,"a blank left in"],[2,"a blank left in"],[3,"a blank left in"],[4,"a blank left in"]]']);
      // every post kept a blank: 502 with the use kept, as any long run that writes nothing
      openai = () => reply({ ...LIVE_014_LONG.reply, posts: LIVE_014_LONG.reply.posts.slice(0, 4) });
      db.spent.length = 0;
      expect((await call(LIVE_014_LONG.body, "leo")).body.code).toBe("ai_failed");
      expect(db.spent).toEqual(["repurpose-long"]);
      expect(db.refunded).toEqual([]);
      // a caller not on the list gets today's answer, blanks and all
      openai = () => reply(LIVE_014_LONG.reply);
      expect((await call(LIVE_014_LONG.body)).body.posts).toHaveLength(5);
    } finally {
      log.mockRestore();
    }
  });

  it("ignores source and speaker for a caller not on NORTH_STAR_USERS: today's request byte for byte", async () => {
    openai = () => reply(LONG_REPLY);
    const r = await call({ ...LONG, source: "interview", speaker: "business", context: { speaker: "business" } });
    expect(r.status).toBe(200);
    await expect(JSON.stringify(sent[OPENAI], null, 2)).toMatchFileSnapshot("./fixtures/long-request.json");
  });
});

const IDEAS = {
  mode: "ideas",
  count: 3,
  context: { ...PLAN_CONTEXT, labels: ["Money basics"] },
  posted: ["Nobody tells new parents this about hospital bills"],
  steer: "CPF top-ups",
};
const IDEAS_REPLY = {
  ideas: Array.from({ length: 5 }, (_, i) => ({
    title: `Idea number ${i} for parents`,
    angle: `What idea ${i} means for a first child.`,
    why: `Parents meet idea ${i} early.`,
    format: "text-post",
    stage: "attraction",
    label: i === 0 ? "Money basics" : "",
    seedKey: "",
  })),
};

describe("idea-dump ideas (phase 5, Leo only)", () => {
  it("is 403 not_enabled before any count for a caller not on NORTH_STAR_USERS, even with a bad body", async () => {
    expect(await call(IDEAS)).toEqual(NOT_ENABLED);
    expect(await call({ mode: "ideas" })).toEqual(NOT_ENABLED);
    expect(db.spent).toEqual([]);
    expect(sent[OPENAI]).toBeUndefined();
  });

  it("refuses no positioning with 400 and a missing key with 503, before any count", async () => {
    expect(await call({ mode: "ideas", context: { goal: "More enquiries" } }, "leo")).toEqual({ status: 400, body: { code: "bad_request", error: "Say who you serve first, so ideas are about them." } });
    delete env.OPENAI_API_KEY;
    expect(await call(IDEAS, "leo")).toEqual({ status: 503, body: { code: "not_configured", error: "This isn't switched on yet." } });
    expect(db.spent).toEqual([]);
  });

  it("keeps the ideas Jev says fit and are safe, best first, on the ideas-daily cap", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply(IDEAS_REPLY);
    // fits rises with the idea's number; idea 4 is not safe, idea 0 does not fit
    jevReply = (_q, state) => {
      const i = Number(String(state.idea).match(/number (\d)/)?.[1]);
      return { fits: { type: "noul", noul: i === 0 ? 0.4 : 0.6 + i / 20 }, safe: { type: "noul", noul: i === 4 ? 0.2 : 0.9 } };
    };
    const r = await call(IDEAS, "leo");
    expect(r.status).toBe(200);
    expect(r.body.scored).toBe(true);
    expect(r.body.ideas.map((i: { title: string }) => i.title)).toEqual(["Idea number 3 for parents", "Idea number 2 for parents", "Idea number 1 for parents"]);
    expect(r.body.ideas[0]).toEqual({ title: "Idea number 3 for parents", angle: "What idea 3 means for a first child.", why: "Parents meet idea 3 early.", format: "text-post", stage: "attraction", fit: 0.75 });
    expect(db.spent).toEqual(["ideas-daily"]);
    expect(db.refunded).toEqual([]);
    expect(sent[JEV]).toHaveLength(5);
    expect(Object.keys((sent[JEV][0] as { questions: object }).questions)).toEqual(["fits", "safe"]);
    const req = sent[OPENAI][0] as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    expect(req.response_format.json_schema.name).toBe("post_ideas");
    expect(req.messages[0].content).toContain("Write exactly 5 candidates");
    expect(req.messages[1].content).toContain("- Nobody tells new parents this about hospital bills");
    expect(req.messages[1].content).toContain("Make the ideas about: CPF top-ups");
  });

  it("returns the first clean candidates unscored with no Jev key", async () => {
    openai = () => reply(IDEAS_REPLY);
    const r = await call(IDEAS, "leo");
    expect(r.status).toBe(200);
    expect(r.body.scored).toBe(false);
    expect(r.body.ideas.map((i: { title: string; fit: null }) => [i.title, i.fit])).toEqual([0, 1, 2].map((i) => [`Idea number ${i} for parents`, null]));
    expect(r.body.ideas[0].label).toBe("Money basics");
    expect(sent[JEV]).toBeUndefined();
  });

  it("gives the use back when OpenAI never answered (non-2xx, timeout, no connection): 502", async () => {
    const timeout = () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    for (const fail of [() => new Response("down", { status: 500 }), timeout, () => Promise.reject(new TypeError("connection refused"))]) {
      openai = fail;
      db.spent.length = 0;
      db.refunded.length = 0;
      expect(await call(IDEAS, "leo")).toEqual({ status: 502, body: { code: "failed", error: "Couldn't write today's ideas. Try again in a minute." } });
      expect(db.spent).toEqual(["ideas-daily"]);
      expect(db.refunded).toEqual(["ideas-daily"]);
    }
  });

  it("keeps the use when OpenAI answered with nothing usable: 422 unusable", async () => {
    const refusal = () => Response.json({ choices: [{ message: { content: null, refusal: "No." } }] });
    for (const bad of [() => reply("not json"), () => reply({ ideas: [{ ...IDEAS_REPLY.ideas[0], format: "story" }] }), refusal]) {
      openai = bad;
      expect(await call(IDEAS, "leo")).toEqual({ status: 422, body: { code: "unusable", error: "The ideas that came back couldn't be used. Try again." } });
    }
    expect(db.refunded).toEqual([]);
  });

  it("keeps the use when Jev keeps none: 422 none_safe", async () => {
    env.TYPESAFE_API_KEY = "t";
    openai = () => reply(IDEAS_REPLY);
    jevReply = () => ({ fits: { type: "noul", noul: 0.9 }, safe: { type: "noul", noul: 0.1 } });
    expect(await call(IDEAS, "leo")).toEqual({ status: 422, body: { code: "none_safe", error: "None of today's ideas were safe to post as written. Try Refine with a narrower topic." } });
    expect(db.spent).toEqual(["ideas-daily"]);
    expect(db.refunded).toEqual([]);
  });

  it("answers the daily limit with 429 and calls nothing", async () => {
    db.limit = true;
    expect((await call(IDEAS, "leo")).body.code).toBe("daily_limit");
    expect(sent[OPENAI]).toBeUndefined();
  });
});
