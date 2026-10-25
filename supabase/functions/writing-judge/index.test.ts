import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IDEA_MIN, IDEA_QUESTIONS, INTERVIEW_KIND, INTERVIEW_QUESTIONS } from "./logic.ts";

// The handler's gate and money path for "Reads well as a thread" (Leo only), and that the other checks stay open.
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const OTHER = "6d80f027-3395-480c-86a1-8827d3d6cce3";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
    from: () => ({
      select: () => ({ match: async (q: Record<string, unknown>) => ({ data: rows.has(key(q)) ? [{ count: rows.get(key(q)) }] : [], error: null }) }),
      update: (v: { count: number }) => ({
        match: (q: Record<string, unknown>) => ({
          select: async () => {
            const hit = rows.get(key(q)) === q.count;
            if (hit) rows.set(key(q), v.count);
            return { data: hit ? [v] : [], error: null };
          },
        }),
      }),
    }),
  };
  return { admin, rows, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const calls: string[] = [];
const sent: unknown[] = [];
let jev: (body: { questions: Record<string, { type: string; criteria?: unknown }> }) => Response = () => new Response("down", { status: 503 });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", TYPESAFE_API_KEY: "k", NORTH_STAR_USERS: LEO };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    calls.push(String(u));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push(body);
    return jev(body);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.rows.clear();
  calls.length = 0;
  sent.length = 0;
  jev = () => new Response("down", { status: 503 });
});

const post = "Three things to check on your hospital plan before you renew. First the ward class. Then the co-pay. Then the rider.";
const ask = (uid: string, body: Record<string, unknown>) =>
  db.handler!(new Request("http://x/writing-judge", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
const used = (uid: string) => db.rows.get(`${uid}|writing-judge|${db.today()}`) ?? 0;

describe("Reads well as a thread", () => {
  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, { mode: "thread", post });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("answers Jev's yes for one writing-judge use", async () => {
    jev = () => Response.json({ answers: { thread: { type: "noul", noul: 0.81 } } });
    const res = await ask(LEO, { mode: "thread", post });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ yes: 0.81 });
    expect(used(LEO)).toBe(1);
    expect(calls).toHaveLength(1);
  });
  it("answers yes null when Jev answers without a number, and keeps the use", async () => {
    jev = () => Response.json({ answers: {} });
    const res = await ask(LEO, { mode: "thread", post });
    expect(await res.json()).toEqual({ yes: null });
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back when Jev never answered", async () => {
    const res = await ask(LEO, { mode: "thread", post });
    expect(res.status).toBe(503);
    expect(used(LEO)).toBe(0);
  });
});

describe("the Recommended carousel design", () => {
  const slides = [{ title: "3 things to check on your hospital plan", body: "" }, { title: "Ward class", body: "Pick the ward you would actually stay in." }, { title: "Found this useful?", body: "Save it." }];

  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, { mode: "design", slides });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("answers Jev's pick for one writing-judge use", async () => {
    jev = () => Response.json({ answers: { design: { type: "choice", choice: "checklist", probabilities: { checklist: 0.71, numbered: 0.2 } } } });
    const res = await ask(LEO, { mode: "design", slides });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pick: "checklist", p: 0.71 });
    expect(used(LEO)).toBe(1);
    expect(calls).toHaveLength(1);
  });
  it("answers no pick when Jev is unsure, and keeps the use", async () => {
    jev = () => Response.json({ answers: { design: { type: "choice", choice: "clean", probabilities: { clean: 0.3, quote: 0.28 } } } });
    expect(await (await ask(LEO, { mode: "design", slides })).json()).toEqual({ pick: null, p: 0.3 });
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back when Jev never answered", async () => {
    const res = await ask(LEO, { mode: "design", slides });
    expect(res.status).toBe(503);
    expect(used(LEO)).toBe(0);
  });
  it("refuses a bad request before counting anything", async () => {
    const res = await ask(LEO, { mode: "design", slides: [slides[0]] });
    expect(res.status).toBe(400);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("the learning conflict check", () => {
  const body = { mode: "conflict", note: "use lots of emoji", notes: ["end with a question", "never use emoji in my posts"] };

  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("names the note it replaces for one writing-judge use, one question per kept note", async () => {
    jev = () => Response.json({ answers: { conflict_0: { type: "noul", noul: 0.05 }, conflict_1: { type: "noul", noul: 0.93 } } });
    const res = await ask(LEO, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replaces: 1 });
    expect(used(LEO)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(Object.keys((sent[0] as { questions: object }).questions)).toEqual(["conflict_0", "conflict_1"]);
  });
  it("answers replaces null below the cut, and keeps the use", async () => {
    jev = () => Response.json({ answers: { conflict_0: { type: "noul", noul: 0.1 }, conflict_1: { type: "noul", noul: 0.69 } } });
    expect(await (await ask(LEO, body)).json()).toEqual({ replaces: null });
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back when Jev never answered", async () => {
    const res = await ask(LEO, body);
    expect(res.status).toBe(503);
    expect(used(LEO)).toBe(0);
  });
  it("refuses a bad request or a note not in English before counting anything", async () => {
    expect((await ask(LEO, { ...body, notes: [] })).status).toBe(400);
    const res = await ask(LEO, { ...body, note: "\u4ee5\u540e\u6211\u7684\u5e16\u5b50\u591a\u7528\u8868\u60c5\u7b26\u53f7" });
    expect(res.status).toBe(422);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("stops at the daily limit without asking Jev", async () => {
    db.rows.set(`${LEO}|writing-judge|${db.today()}`, 60);
    const res = await ask(LEO, body);
    expect(res.status).toBe(429);
    expect(calls).toEqual([]);
  });
});

describe("the goal kind (plan-goal)", () => {
  const body = { mode: "goal", text: "more people booking a 15-minute review with me" };
  const kind = (choice: string, p: number) => () => Response.json({ answers: { kind: { type: "choice", choice, probabilities: { [choice]: p } } } });

  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("answers Jev's kind for one writing-judge use, one choice question, and logs the kind and p but never the goal", async () => {
    jev = kind("clients", 0.82);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const res = await ask(LEO, body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ kind: "clients", p: 0.82 });
      expect(used(LEO)).toBe(1);
      expect(calls).toHaveLength(1);
      const q = sent[0] as { model: string; state: unknown; questions: Record<string, { type: string }> };
      expect(q.model).toBe("jev-1.13.0");
      expect(q.state).toEqual({ goal: body.text, country: "Singapore", who: "a financial adviser or a small business that posts on social media" });
      expect(Object.keys(q.questions)).toEqual(["kind"]);
      expect(log.mock.calls).toEqual([["writing-judge goal", JSON.stringify({ kind: "clients", p: 0.82 })]]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("booking");
    } finally {
      log.mockRestore();
    }
  });
  it("answers kind null below 0.6 and keeps the use, logging Jev's top kind", async () => {
    jev = kind("trust", 0.59);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await (await ask(LEO, body)).json()).toEqual({ kind: null, p: 0.59 });
      expect(log.mock.calls).toEqual([["writing-judge goal", JSON.stringify({ kind: "trust", p: 0.59 })]]);
    } finally {
      log.mockRestore();
    }
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back with 502 failed when Jev never answered", async () => {
    const res = await ask(LEO, body);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "The check is unavailable for a moment. Try again shortly." });
    expect(used(LEO)).toBe(0);
  });
  it("refuses a goal too short or too long, or not in English, before counting anything", async () => {
    expect(await (await ask(LEO, { mode: "goal", text: "abc" })).json()).toEqual({ error: "Write a few more words." });
    expect((await ask(LEO, { mode: "goal", text: "x".repeat(121) })).status).toBe(400);
    const res = await ask(LEO, { mode: "goal", text: "更多客户来找我" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "not_english" });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("stops at the daily limit without asking Jev", async () => {
    db.rows.set(`${LEO}|writing-judge|${db.today()}`, 60);
    expect((await ask(LEO, body)).status).toBe(429);
    expect(calls).toEqual([]);
  });
});

describe("an interview answer's read (wave 2 live check, calls/009 to 013)", () => {
  // the five answers as sent, and the thin read each got from the everyday question
  const LIVE: [string, string, boolean][] = [
    ["What did a client or a friend ask you about money this week?", "A friend who just had his second kid asked if he should keep all his savings in the bank or start investing. He has about eight months of expenses in a savings account and feels guilty every time he checks it, but he is scared of locking money away for years.", false],
    ["What is one thing people get wrong about Not taking action?", "They wait for the perfect time.", true],
    ["Tell me about a client situation that stayed with you. Leave out names and anything that could identify them.", "An accountant I worked with kept putting off his plan for three years because tax season was always busy. When his father fell sick, he realised he did not know what cover he had. We sat down for one evening, wrote a one-page plan, and he told me the relief was the biggest change.", false],
    ["What would you tell Auditor / Accountant, aged 30-48, Middle to upper-middle income who are just starting to plan?", "Start with your cash buffer and your insurance gaps before you think about returns. Write down what each pot of money is for and when you need it. Then review it once a quarter, not every day.", true],
    ["What is an opinion about your work that other advisers might disagree with?", "Most busy fathers do not need more information. They need fewer decisions. A one-page plan with a decision log beats a forty-page report that nobody reads again.", true],
  ];
  const instructions = (k = 0) => (sent[k] as { questions: { specific: { instructions: string } } }).questions.specific.instructions;

  it("asks whether a post can be built on the answer, not whether it tells a story", async () => {
    for (const [topic, notes] of LIVE) {
      sent.length = 0;
      jev = () => Response.json({ answers: { specific: { type: "noul", noul: 0.7 } } });
      const res = await ask(LEO, { mode: "idea", topic, notes, kind: INTERVIEW_KIND });
      expect(await res.json()).toEqual({ thin: false });
      expect(sent[0]).toMatchObject({ state: { post_kind: INTERVIEW_KIND, topic, notes }, questions: INTERVIEW_QUESTIONS });
    }
    expect(instructions()).toContain("a fact, a number, an opinion with a reason, an example, or a story");
    // 3 of the 5 (a 6-word truism, 37 words of advice, a 27-word opinion) read thin on the everyday question
    expect(LIVE.map(([, , thin]) => thin)).toEqual([false, true, false, true, true]);
  });

  it("keeps the everyday question for every other kind, and the 0.5 cut for both", async () => {
    jev = () => Response.json({ answers: { specific: { type: "noul", noul: IDEA_MIN - 0.01 } } });
    const [topic, notes] = LIVE[3];
    expect(await (await ask(OTHER, { mode: "idea", topic, notes, kind: "story" })).json()).toEqual({ thin: true });
    expect(sent[0]).toMatchObject({ questions: IDEA_QUESTIONS });
    sent.length = 0;
    expect(await (await ask(OTHER, { mode: "idea", topic, notes, kind: "" })).json()).toEqual({ thin: true });
    expect(sent[0]).toMatchObject({ questions: IDEA_QUESTIONS });
    sent.length = 0;
    expect(await (await ask(OTHER, { mode: "idea", topic, notes, kind: INTERVIEW_KIND })).json()).toEqual({ thin: true });
    expect(instructions()).toBe(INTERVIEW_QUESTIONS.specific.instructions);
  });
});

describe("the checks everyone has", () => {
  it("stay open to an account not on the list", async () => {
    jev = () => Response.json({ answers: { sequence: { type: "noul", noul: 0.2 } } });
    const res = await ask(OTHER, { mode: "carousel", idea: "Insurance is not an investment" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ textPostBetter: true });
    expect(used(OTHER)).toBe(1);
  });
});

describe("the post modes (north star phase 7, Leo only)", () => {
  const draft = "I sat with a client last Tuesday who had three hospital plans and no idea which one paid first. We spent an hour on it, and here is what we found.";
  const malay = "Ramai orang fikir insurans itu mahal. Sebenarnya yang mahal ialah bila anda jatuh sakit dan tiada perlindungan. Minggu lepas seorang klien saya bayar $11,400 untuk wad hospital kerana plan dia sudah luput.";
  const bodies: Record<string, Record<string, unknown>> = {
    "same-post": { mode: "same-post", pairs: [{ key: "p1|d1", draft, live: draft, platform: "linkedin" }, { key: "p1|d2", draft: `${draft} Again.`, live: draft, platform: "linkedin" }] },
    grade: { mode: "grade", text: draft, platform: "linkedin", format: "text-post", posted: "2026-10-20T01:00:00.000Z", words: 31, ratio: 2.4, direction: "above", best: [{ firstLine: "Three plans, one claim.", format: "carousel", posted: "2026-10-01T01:00:00.000Z" }] },
    tags: { mode: "tags", posts: [{ id: "d1", text: draft, needHook: true }, { id: "d2", text: draft, needHook: false }] },
    "try-next": { mode: "try-next", audience: "young parents in Singapore", topics: ["hospital plans", "CPF"], best: ["Three plans, one claim."], untried: ["list", "myth-bust", "receipt"] },
    evergreen: { mode: "evergreen", text: draft },
  };
  // the cap each mode counts, and its daily limit (contracts: usageCaps.ts "North star phase 7")
  const caps: Record<string, [string, number]> = {
    "same-post": ["post-match", 20],
    grade: ["post-grade", 30],
    tags: ["post-angles", 10],
    "try-next": ["post-angles", 10],
    evergreen: ["winner-check", 5],
  };
  const answers: Record<string, () => Response> = {
    "same-post": () => Response.json({ answers: { same_0: { type: "noul", noul: 0.86 }, same_1: { type: "noul", noul: 0.31 } } }),
    grade: () => Response.json({ answers: { reason: { type: "choice", choice: "hook", probabilities: { hook: 0.55 } } } }),
    tags: () => Response.json({ answers: { "angle:d1": { type: "choice", choice: "storytelling", probabilities: { storytelling: 0.8 } }, "hook:d1": { type: "choice", choice: "none", probabilities: { none: 0.7 } }, "angle:d2": { type: "choice", choice: "educational", probabilities: { educational: 0.3 } } } }),
    "try-next": () => Response.json({ answers: { try_list: { type: "noul", noul: 0.72 }, "try_myth-bust": { type: "noul", noul: 0.91 }, try_receipt: { type: "noul", noul: 0.4 } } }),
    evergreen: () => Response.json({ answers: { evergreen: { type: "noul", noul: 0.2 } } }),
  };
  const replies: Record<string, unknown> = {
    "same-post": { links: ["p1|d1"], p: { "p1|d1": 0.86, "p1|d2": 0.31 } },
    grade: { reason: "hook", p: 0.55 },
    tags: { tags: { d1: { angle: "Storytelling", hook: "none" }, d2: { angle: "unclear" } } },
    "try-next": { hooks: ["myth-bust", "list"] },
    evergreen: { evergreen: false },
  };
  const count = (uid: string, cap: string) => db.rows.get(`${uid}|${cap}|${db.today()}`) ?? 0;

  for (const mode of Object.keys(bodies)) {
    const [cap, limit] = caps[mode];
    describe(mode, () => {
      it("is refused off the list before counting anything or asking Jev", async () => {
        const res = await ask(OTHER, bodies[mode]);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
        expect(db.rows.size).toBe(0);
        expect(calls).toEqual([]);
      });
      it(`answers for one ${cap} use and none of writing-judge's, logging p values and never the words`, async () => {
        jev = answers[mode];
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          const res = await ask(LEO, bodies[mode]);
          expect(res.status).toBe(200);
          expect(await res.json()).toEqual(replies[mode]);
          expect(log.mock.calls).toHaveLength(1);
          expect(log.mock.calls[0][0]).toBe(`writing-judge ${mode}`);
          expect(JSON.stringify(log.mock.calls)).not.toMatch(/client|hospital|parents|plans/);
        } finally {
          log.mockRestore();
        }
        expect(count(LEO, cap)).toBe(1);
        expect(used(LEO)).toBe(0);
        expect(calls).toHaveLength(1);
        expect((sent[0] as { model: string }).model).toBe("jev-1.13.0");
      });
      it("gives the use back with 502 failed when Jev never answered", async () => {
        const res = await ask(LEO, bodies[mode]);
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ code: "failed", error: "The check is unavailable for a moment. Try again shortly." });
        expect(count(LEO, cap)).toBe(0);
      });
      it(`stops at ${limit} a day without asking Jev`, async () => {
        db.rows.set(`${LEO}|${cap}|${db.today()}`, limit);
        const res = await ask(LEO, bodies[mode]);
        expect(res.status).toBe(429);
        expect(await res.json()).toMatchObject({ code: "daily_limit" });
        expect(calls).toEqual([]);
      });
    });
  }

  it("tags a batch of 20 holding one Malay post with no 422: the Malay one 'unclear', never asked", async () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, text: i === 7 ? malay : draft, needHook: true }));
    jev = (body) => Response.json({
      answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, id.startsWith("angle:")
        ? { type: "choice", choice: "educational", probabilities: { educational: 0.7 } }
        : { type: "choice", choice: "list", probabilities: { list: 0.6 } }])),
    });
    const res = await ask(LEO, { mode: "tags", posts });
    expect(res.status).toBe(200);
    const { tags } = await res.json();
    expect(tags.d7).toEqual({ angle: "unclear", hook: "unclear" });
    expect(tags.d0).toEqual({ angle: "Educational", hook: "list" });
    expect(Object.keys(tags)).toHaveLength(20);
    const q = Object.keys((sent[0] as { questions: object }).questions);
    expect(q).toHaveLength(38);
    expect(q.some((id) => id.endsWith(":d7"))).toBe(false);
    expect(count(LEO, "post-angles")).toBe(1);
  });

  it("answers a batch with nothing in English without asking Jev or counting", async () => {
    const res = await ask(LEO, { mode: "tags", posts: [{ id: "d1", text: malay, needHook: false }] });
    expect(await res.json()).toEqual({ tags: { d1: { angle: "unclear" } } });
    const pairs = await ask(LEO, { mode: "same-post", pairs: [{ key: "k", draft: malay, live: malay, platform: "tiktok" }] });
    expect(await pairs.json()).toEqual({ links: [], p: { k: null } });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("refuses a grade or an evergreen check of a Malay post with 422 before counting anything", async () => {
    for (const mode of ["grade", "evergreen"]) {
      const res = await ask(LEO, { ...bodies[mode], text: malay });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: "not_english" });
    }
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("refuses a bad body with bad_request before counting anything, 21 posts to tag included", async () => {
    const posts = Array.from({ length: 21 }, (_, i) => ({ id: `d${i}`, text: draft, needHook: false }));
    const res = await ask(LEO, { mode: "tags", posts });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "Send 1 to 20 posts, each with an id and its text." });
    expect((await ask(LEO, { mode: "grade", text: draft, platform: "linkedin", ratio: 2 })).status).toBe(400);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

// Every check as it is today, pinned before the conflict mode joined (phase 4 memory-core): the Jev request each
// one sends and the answer it gives back. Never update this file with vitest -u.
describe("today's checks, pinned", () => {
  // a fixed answer for any question: yes 0.7, the first option at 0.8, the middle level
  const answerAll = (body: { questions: Record<string, { type: string; criteria?: unknown }> }) =>
    Response.json({
      answers: Object.fromEntries(
        Object.entries(body.questions).map(([id, q]) => {
          if (q.type === "noul") return [id, { type: "noul", noul: 0.7 }];
          if (q.type === "choice") {
            const first = Object.keys(q.criteria as Record<string, unknown>)[0];
            return [id, { type: "choice", choice: first, probabilities: { [first]: 0.8 } }];
          }
          return [id, { type: "score", score: 2 }];
        }),
      ),
    });
  const draft = "I sat with a client last Tuesday who had three hospital plans and no idea which one paid first. We spent an hour on it. Here is what we found.";
  const cases: [string, string, Record<string, unknown>][] = [
    ["human", OTHER, { mode: "human", text: draft, samples: ["My own post about CPF top-ups and why I do mine in January every year, with the numbers."] }],
    ["hooks", OTHER, { mode: "hooks", hooks: ["Your hospital plan has a gap", "Three plans, one claim"], audience: "young parents", topic: "hospital plans", platform: "instagram" }],
    ["idea", OTHER, { mode: "idea", topic: "hospital plans", notes: "a client with three plans", kind: "story" }],
    ["carousel", OTHER, { mode: "carousel", idea: "Insurance is not an investment" }],
    ["facts", OTHER, { mode: "facts", text: "CPF LIFE starts at 65. I think everyone should plan early." }],
    ["profile", OTHER, { mode: "profile", platform: "instagram", name: "Leo Tan", bio: "Adviser in Singapore. DM me.", pinned: ["My story"], top: ["Three CPF myths"], link: null }],
    ["thread", LEO, { mode: "thread", post }],
    ["design", LEO, { mode: "design", slides: [{ title: "3 things to check on your hospital plan", body: "" }, { title: "Ward class", body: "Pick the ward you would actually stay in." }] }],
    ["not english", OTHER, { mode: "human", text: "\u6211\u7684\u5ba2\u6237\u4e0a\u5468\u4e8c\u6765\u627e\u6211\uff0c\u4ed6\u6709\u4e09\u4efd\u4f4f\u9662\u4fdd\u9669\uff0c\u4e0d\u77e5\u9053\u54ea\u4e00\u4efd\u5148\u8d54\u3002\u6211\u4eec\u82b1\u4e86\u4e00\u4e2a\u5c0f\u65f6\u3002\u6211\u7684\u5ba2\u6237\u4e0a\u5468\u4e8c\u6765\u627e\u6211\uff0c\u4ed6\u6709\u4e09\u4efd\u4f4f\u9662\u4fdd\u9669\uff0c\u4e0d\u77e5\u9053\u54ea\u4e00\u4efd\u5148\u8d54\u3002\u6211\u4eec\u82b1\u4e86\u4e00\u4e2a\u5c0f\u65f6\u3002" }],
    ["unknown mode", OTHER, { mode: "translate", text: draft }],
    ["too short", OTHER, { mode: "human", text: "Too short." }],
  ];
  it("sends Jev the same questions and answers the same way", async () => {
    const seen: Record<string, unknown> = {};
    for (const [name, uid, body] of cases) {
      db.rows.clear();
      sent.length = 0;
      jev = answerAll;
      const res = await ask(uid, body);
      seen[name] = { status: res.status, answer: await res.json(), jev: sent.slice() };
    }
    await expect(JSON.stringify(seen, null, 2)).toMatchFileSnapshot("./fixtures/today.json");
  });
});
