import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clipPasses } from "./passes";

// The handler's money path for Find clips: a long recording takes one use of "video-clips" per pass.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

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
// what each provider call was sent (the request body as text, and as it was)
const sent: string[] = [];
const bodies: unknown[] = [];
// what the stubbed providers answer; every call fails unless a test says otherwise
let answer: (url: string) => Response = () => new Response("{}", { status: 500 });
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
// the function's secrets; a test that wants Jev to answer sets TYPESAFE_API_KEY and takes it off again
const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k", NORTH_STAR_USERS: LEO };

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    calls.push(String(u));
    sent.push(String(init?.body ?? ""));
    bodies.push(init?.body);
    return answer(String(u));
  });
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
  bodies.length = 0;
  answer = () => new Response("{}", { status: 500 });
});

// an hour-long recording, captioned every 5 minutes
const HOUR = 3600;
const sentences = Array.from({ length: 12 }, (_, i) => ({ s: i * 300, e: i * 300 + 20, text: `Point number ${i + 1} about CPF top-ups.` }));
const findClips = () =>
  db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify({ mode: "clips", duration: HOUR, sentences }) }));

describe("Find clips on a long recording", () => {
  it("gives back the passes it counted when the cap runs out partway, and reads nothing", async () => {
    expect(clipPasses(HOUR)).toBe(2);
    db.rows.set(`${UID}|video-clips|${db.today()}`, 19);
    const res = await findClips();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(db.rows.get(`${UID}|video-clips|${db.today()}`)).toBe(19);
    expect(calls).toEqual([]);
  });
});

describe("Watch it like a viewer", () => {
  const watch = (q: string, headers: Record<string, string>) =>
    db.handler!(new Request(`http://x/video-assist?mode=watch${q}`, { method: "POST", headers: { Authorization: `Bearer ${UID}`, ...headers }, body: new Uint8Array(2000) }));

  it("refuses an export it can't watch before counting one of the day's watches or sending it to Gemini", async () => {
    const mp4 = { "content-type": "video/mp4", "content-length": "2000" };
    const refused = [
      await watch("&seconds=91", mp4),
      await watch("&seconds=40", { ...mp4, "content-length": "120000001" }),
      await watch("&seconds=40", { ...mp4, "content-type": "image/gif" }),
      await watch("", mp4),
    ];
    expect(refused.map((r) => r.status)).toEqual([400, 413, 400, 400]);
    expect(await refused[0].json()).toEqual({ error: "Watch it takes videos up to 90 seconds." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("Make it a thread", () => {
  const post = "Most people pay for their hospital stay twice. First through the premium, then through the co-pay. Here is how to check yours.";
  const write = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "thread", post, network: "threads", ...body }) }));
  const used = (uid = LEO) => db.rows.get(`${uid}|thread-copy|${db.today()}`) ?? 0;
  const reply = (posts: string[]) => () => Response.json({ model: "m", choices: [{ message: { content: JSON.stringify({ posts }) } }] });

  it("refuses anyone not on the list before counting anything or asking OpenAI", async () => {
    const res = await write(UID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("refuses a request it can't write before counting", async () => {
    const res = await write(LEO, { network: "linkedin" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad_request" });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("writes the thread for one use", async () => {
    answer = reply(["Most people pay twice for a hospital stay.", "First through the premium.", "Then through the co-pay. Check yours."]);
    const res = await write(LEO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: ["Most people pay twice for a hospital stay.", "First through the premium.", "Then through the co-pay. Check yours."] });
    expect(used()).toBe(1);
    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });
  it("gives the use back when OpenAI never answered", async () => {
    const res = await write(LEO);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "Couldn't write the thread right now. Try again in a minute." });
    expect(used()).toBe(0);
  });
  it("keeps the use when the reply can't be used", async () => {
    answer = reply(["Only one post."]);
    const res = await write(LEO);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "unusable" });
    expect(used()).toBe(1);
  });
  it("stops at the day's 30", async () => {
    db.rows.set(`${LEO}|thread-copy|${db.today()}`, 30);
    const res = await write(LEO);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(calls).toEqual([]);
  });
});

describe("Your own video or pictures: own-words", () => {
  const write = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "own-words", about: "why I check my clients' cover every year", count: 3, kind: "pictures", voice: false, ...body }) }));
  const used = (uid = LEO) => db.rows.get(`${uid}|own-words|${db.today()}`) ?? 0;
  const reply = (o: Record<string, unknown>) => () => Response.json({ model: "m", choices: [{ message: { content: JSON.stringify(o) } }] });
  const hooks = ["Your cover changed. Did you notice?", "One check a year saves the panic", "Most people never read this page"];

  it("refuses anyone not on the list before counting anything or asking OpenAI", async () => {
    const res = await write(UID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("refuses a request with no about before counting", async () => {
    const res = await write(LEO, { about: " " });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad_request" });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("writes the hook and a line per picture for one use, the first hook when Jev has no answer", async () => {
    answer = reply({ hooks, lines: ["Coffee with a client", "Her plan from 2019", "What changed since"] });
    const res = await write(LEO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hook: hooks[0], lines: ["Coffee with a client", "Her plan from 2019", "What changed since"] });
    expect(used()).toBe(1);
    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });
  it("adds the spoken lines with a voiceover", async () => {
    const say = ["We met for coffee.", "Her plan was six years old.", "So we went through it."];
    answer = reply({ hooks, lines: ["a", "b", "c"], say });
    const res = await write(LEO, { voice: true });
    expect(await res.json()).toMatchObject({ say });
  });
  it("gives the use back when OpenAI never answered", async () => {
    const res = await write(LEO);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "Couldn't write the words right now. Try again in a minute." });
    expect(used()).toBe(0);
  });
  it("keeps the use when the reply can't be used", async () => {
    answer = reply({ hooks: [], lines: ["a", "b", "c"] });
    const res = await write(LEO);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "unusable" });
    expect(used()).toBe(1);
  });
  it("stops at the day's 20", async () => {
    db.rows.set(`${LEO}|own-words|${db.today()}`, 20);
    const res = await write(LEO);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(calls).toEqual([]);
  });
});

describe("Long video into clips: the panel's length", () => {
  const sentences = Array.from({ length: 12 }, (_, i) => ({ s: i * 20, e: i * 20 + 18, text: `Point number ${i + 1} about hospital bills.` }));
  const find = (uid: string) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "clips", duration: 300, sentences, length: "short" }) }));
  const asked = () => JSON.parse(sent[0]).messages[0].content as string;

  it("asks for short clips for a listed uid", async () => {
    await find(LEO);
    expect(asked()).toContain("Each clip is 12 to 35 seconds");
  });
  it("ignores the length for anyone else, who gets today's clips", async () => {
    await find(UID);
    expect(asked()).toContain("Each clip is 25 to 75 seconds");
    expect(asked()).not.toContain("12 to 35");
  });
});

describe("Captions: what Whisper is asked (pinned at c49a22ca)", () => {
  const FILLERS = "Umm, so, uh, I mean, like, you know, hmm... Okay, uh, here's the thing.";
  const caption = (uid: string, q = "") =>
    db.handler!(new Request(`http://x/video-assist?mode=transcribe${q}`, { method: "POST", headers: { Authorization: `Bearer ${uid}`, "content-length": "2000" }, body: new Uint8Array(2000) }));
  const asked = () => bodies[0] as FormData;

  it("sends everyone else the filler sample as the whole prompt, for one use", async () => {
    answer = () => Response.json({ text: "Hi there.", duration: 1, language: "english", words: [] });
    const res = await caption(UID, "&lang=en");
    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://api.openai.com/v1/audio/transcriptions"]);
    expect(asked().get("prompt")).toBe(FILLERS);
    expect(asked().get("language")).toBe("en");
    expect(asked().get("model")).toBe("whisper-1");
    expect(db.rows.get(`${UID}|video-transcribe|${db.today()}`)).toBe(1);
  });
});

describe("Captions: key words (edit-captions)", () => {
  const lines = [
    { text: "Your premium jumps at 65.", words: ["premium", "jumps", "65"], s: 0 },
    { text: "Check the rider today.", words: ["Check", "rider", "today"], s: 3 },
  ];
  const pick = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "keywords", lines, emoji: true, ...body }) }));
  const used = (uid = LEO) => db.rows.get(`${uid}|caption-keywords|${db.today()}`) ?? 0;
  const JEV = "https://api.typesafe.ai/v1/systemone";
  const withJev = async (run: () => Promise<void>) => {
    env.TYPESAFE_API_KEY = "k";
    try {
      await run();
    } finally {
      delete env.TYPESAFE_API_KEY;
    }
  };

  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    await withJev(async () => {
      const res = await pick(UID);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("refuses more than 80 lines before counting", async () => {
    const res = await pick(LEO, { lines: Array.from({ length: 81 }, () => lines[0]) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad_request" });
    expect(db.rows.size).toBe(0);
  });
  it("lights the picked words for one use", async () => {
    answer = (u) => (u === JEV ? Response.json({ answers: { w0: { type: "choice", choice: "c2", probabilities: { c2: 0.7 } }, e0: { type: "choice", choice: "time", probabilities: { time: 0.8 } }, w1: { type: "choice", choice: "none", probabilities: { none: 0.6 } } } }) : new Response("{}", { status: 500 }));
    await withJev(async () => {
      const res = await pick(LEO);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ picks: [{ line: 0, word: "65", emoji: "\u23F0" }, { line: 1, word: null }] });
    });
    expect(used()).toBe(1);
    expect(calls).toEqual([JEV]);
  });
  it("gives the use back when Jev never answered", async () => {
    await withJev(async () => {
      const res = await pick(LEO);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ code: "failed", error: "Couldn't pick key words right now. Try again in a minute." });
    });
    expect(used()).toBe(0);
  });
  it("counts nothing and asks nothing when no line is in English", async () => {
    const res = await pick(LEO, { lines: [{ text: "保费在65岁时上涨", words: ["保费在65岁时上涨"], s: 0 }] });
    expect(await res.json()).toEqual({ picks: [{ line: 0, word: null }] });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("stops at the day's 30", async () => {
    db.rows.set(`${LEO}|caption-keywords|${db.today()}`, 30);
    const res = await pick(LEO);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit", error: "You've used all 30 for today. It resets at 8am Singapore time." });
    expect(calls).toEqual([]);
  });
});
