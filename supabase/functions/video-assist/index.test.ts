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

describe("Captions: what Whisper is asked (pinned at c49a22ca; terms added for edit-captions)", () => {
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

describe("Captions: finance words and your own fixed words (edit-captions)", () => {
  const caption = (uid: string, q = "") =>
    db.handler!(new Request(`http://x/video-assist?mode=transcribe${q}`, { method: "POST", headers: { Authorization: `Bearer ${uid}`, "content-length": "2000" }, body: new Uint8Array(2000) }));
  const prompt = () => (bodies[0] as FormData).get("prompt") as string;
  const terms = `&terms=${encodeURIComponent("Leo Tan,ActivityTracker,PruShield")}`;
  beforeEach(() => {
    answer = () => Response.json({ text: "Hi there.", duration: 1, language: "english", words: [] });
  });

  it("adds them for a listed uid, in the same one use", async () => {
    await caption(LEO, `&lang=en${terms}`);
    expect(prompt()).toBe("Umm, so, uh, I mean, like, you know, hmm... Okay, uh, here's the thing. CPF, MediSave, MediShield Life, CareShield Life, Integrated Shield Plan, SRS, HDB, BTO, MAS, ILP, CPF LIFE, Leo Tan, ActivityTracker, PruShield.");
    expect(db.rows.get(`${LEO}|video-transcribe|${db.today()}`)).toBe(1);
  });
  it("adds the finance words for a listed uid that sends none of its own", async () => {
    await caption(LEO);
    expect(prompt()).toContain("CPF, MediSave, MediShield Life, CareShield Life");
  });
  it("ignores them for anyone else, who keeps today's prompt", async () => {
    await caption(UID, terms);
    expect(prompt()).toBe("Umm, so, uh, I mean, like, you know, hmm... Okay, uh, here's the thing.");
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

describe("Caption translation (pinned at b65fc14f, before posts are translated)", () => {
  const lines = ["Most people pay twice for a hospital stay.", "Check your co-pay."];
  const translate = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "translate", lang: "zh", lines, ...body }) }));
  const used = (uid: string) => db.rows.get(`${uid}|video-translate|${db.today()}`) ?? 0;
  const reply = (out: unknown) => () => Response.json({ model: "m", choices: [{ message: { content: JSON.stringify(out) } }] });
  const SYSTEM = [
    "Translate short video captions spoken by a Singapore financial adviser into Simplified Chinese as subtitles.",
    "Keep each line short and natural for on-screen subtitles, keep numbers and dollar amounts exact, keep CPF, MediShield, HDB and other Singapore terms as locals write them.",
    'Return JSON only: {"lines":[...]} with exactly one translation per input line, in the same order.',
  ].join("\n");
  const asked = (sentLines: string[]) =>
    JSON.stringify({
      model: "gpt-6-luna",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ lines: sentLines }) }],
      reasoning_effort: "low",
      max_completion_tokens: 8000,
    });

  for (const uid of [UID, LEO]) {
    it(`sends OpenAI today's request and answers today's lines for one use (${uid === LEO ? "a listed uid" : "anyone else"})`, async () => {
      answer = reply({ lines: ["大多数人住院要付两次钱。", "查一查你的自付额。"] });
      const res = await translate(uid);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(JSON.stringify({ lines: ["大多数人住院要付两次钱。", "查一查你的自付额。"] }));
      expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
      expect(sent[0]).toBe(asked(lines));
      expect(used(uid)).toBe(1);
    });
  }
  it("cuts each line to 300 characters on the way in and on the way out", async () => {
    answer = reply({ lines: ["x".repeat(400)] });
    const res = await translate(UID, { lines: ["a".repeat(400)] });
    expect(await res.json()).toEqual({ lines: ["x".repeat(300)] });
    expect(sent[0]).toBe(asked(["a".repeat(300)]));
  });
  it("refuses an unknown language before counting", async () => {
    const res = await translate(UID, { lang: "fr" });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(JSON.stringify({ error: "Pick Chinese, Malay or Tamil." }));
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("keeps the use when OpenAI fails", async () => {
    const res = await translate(UID);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe(JSON.stringify({ error: "Couldn't translate right now. Try again in a minute." }));
    expect(used(UID)).toBe(1);
  });
  it("keeps the use when the reply is short a line", async () => {
    answer = reply({ lines: ["只有一行。"] });
    const res = await translate(UID);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe(JSON.stringify({ error: "The translation came back incomplete. Try again." }));
    expect(used(UID)).toBe(1);
  });
});

describe("Post translation (edit-translate)", () => {
  const JEV = "https://api.typesafe.ai/v1/systemone";
  const lines = ["Most people pay twice for a hospital stay.", "", "Comment PLAN and I'll send the checklist."];
  const translate = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "translate", kind: "post", back: true, lang: "ms", lines, ...body }) }));
  const used = (uid = LEO) => db.rows.get(`${uid}|post-translate|${db.today()}`) ?? 0;
  const version = ["Ramai orang bayar dua kali untuk tinggal di hospital.", "", "Komen PLAN dan saya hantar senarai semak."];
  const meaning = ["Many people pay twice to stay in hospital.", "", "Comment PLAN and I will send the checklist."];
  const openai = (out: unknown) => Response.json({ model: "m", choices: [{ message: { content: JSON.stringify(out) } }] });
  const reply = (out: unknown) => () => openai(out);

  it("refuses anyone not on the list before counting anything or asking OpenAI", async () => {
    const res = await translate(UID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("refuses a post too long to translate in one go before counting", async () => {
    const res = await translate(LEO, { lines: ["a".repeat(1500), "b".repeat(1500), "c".repeat(1500), "d".repeat(501)] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "This post is too long to translate in one go." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("translates the post with its English meaning for one use", async () => {
    answer = reply({ lines: version, back: meaning });
    const res = await translate(LEO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: version, back: meaning, same: null });
    expect(used()).toBe(1);
    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    const asked = JSON.parse(sent[0]);
    expect(asked.max_completion_tokens).toBe(16_000);
    expect(asked.messages[0].content).toContain("into Malay.");
    expect(asked.messages[0].content).toContain("Add nothing: no new claims, promises, figures or product names.");
    expect(JSON.parse(asked.messages[1].content)).toEqual({ lines });
  });
  it("sends a long line whole, with the empty lines kept, and keeps the reply's long line whole", async () => {
    const long = ["Most people pay twice.", "", "x".repeat(1200)];
    answer = reply({ lines: ["Ramai bayar dua kali.", "", "y".repeat(1400)], back: ["Many pay twice.", "", "z".repeat(1300)] });
    const res = await translate(LEO, { lines: long });
    expect(JSON.parse(JSON.parse(sent[0]).messages[1].content)).toEqual({ lines: long });
    expect(await res.json()).toEqual({ lines: ["Ramai bayar dua kali.", "", "y".repeat(1400)], back: ["Many pay twice.", "", "z".repeat(1300)], same: null });
  });
  it("asks Jev whether the English meaning says the same as the English, and returns its answer in the same one use", async () => {
    answer = (u) => (u === JEV ? Response.json({ answers: { same: { type: "noul", noul: 0.82 } } }) : openai({ lines: version, back: meaning }));
    env.TYPESAFE_API_KEY = "k";
    try {
      const res = await translate(LEO);
      expect(await res.json()).toEqual({ lines: version, back: meaning, same: 0.82 });
    } finally {
      delete env.TYPESAFE_API_KEY;
    }
    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions", JEV]);
    // Jev reads English only: the post and the version's meaning, never the Malay
    expect(JSON.parse(sent[1]).state).toEqual({ source: lines.join("\n"), back: meaning.join("\n") });
    expect(used()).toBe(1);
  });
  it("gives the use back when OpenAI never answered", async () => {
    const res = await translate(LEO);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "Couldn't translate it right now. Try again in a minute." });
    expect(used()).toBe(0);
  });
  it("keeps the use when the reply came back incomplete", async () => {
    answer = reply({ lines: version, back: meaning.slice(0, 2) });
    const res = await translate(LEO);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "incomplete", error: "The translation came back incomplete. Try again." });
    expect(used()).toBe(1);
  });
  it("stops at the day's 30", async () => {
    db.rows.set(`${LEO}|post-translate|${db.today()}`, 30);
    const res = await translate(LEO);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit", error: "You've used all 30 for today. It resets at 8am Singapore time." });
    expect(calls).toEqual([]);
  });
  it("reads kind captions, or no kind, as today's caption request on the caption cap", async () => {
    answer = reply({ lines: ["a", "b", "c"] });
    const res = await translate(LEO, { kind: "captions" });
    expect(await res.json()).toEqual({ lines: ["a", "b", "c"] });
    expect(JSON.parse(sent[0]).max_completion_tokens).toBe(8000);
    expect(db.rows.get(`${LEO}|video-translate|${db.today()}`)).toBe(1);
    expect(used()).toBe(0);
  });
});

describe("Montage pick from a media set", () => {
  const JEV = "https://api.typesafe.ai/v1/systemone";
  const beats = [{ say: "Coins in a jar on a table", candidates: Array.from({ length: 14 }, (_, j) => ({ desc: `A jar of coins, photo ${j}` })) }];
  const pick = (uid: string, body: Record<string, unknown> = {}) =>
    db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "montage-pick", theme: "Saving", beats, ...body }) }));
  const asked = () => JSON.parse(sent[calls.indexOf(JEV)]) as { questions: Record<string, { instructions: { question: string }; criteria: Record<string, string> }> };
  const run = async (uid: string, body: Record<string, unknown>, pick_0: unknown = { type: "choice", choice: "c9", probabilities: { c9: 0.8 } }) => {
    answer = (u) => (u === JEV ? Response.json({ answers: { pick_0 } }) : new Response("{}", { status: 500 }));
    env.TYPESAFE_API_KEY = "k";
    try {
      return await pick(uid, body);
    } finally {
      delete env.TYPESAFE_API_KEY;
    }
  };

  it("offers a listed caller's set 12 candidates, asked about in words, for one use", async () => {
    const res = await run(LEO, { set: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ picks: [9], scores: [[...Array(9).fill(0), 0.8, 0, 0]] });
    const q = asked().questions.pick_0;
    expect(q.instructions.question).toBe("Which photo or clip, described in words, best shows `beat`?");
    expect(Object.keys(q.criteria)).toHaveLength(13);
    expect(db.rows.get(`${LEO}|montage-pick|${db.today()}`)).toBe(1);
  });
  it("reads anyone else's set as today's request: 6 candidates and today's question", async () => {
    const res = await run(UID, { set: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ picks: [null] });
    const q = asked().questions.pick_0;
    expect(q.instructions.question).toBe("Which stock clip, described by its page name, best shows `beat`?");
    expect(Object.keys(q.criteria)).toHaveLength(7);
    expect(db.rows.get(`${UID}|montage-pick|${db.today()}`)).toBe(1);
  });
  it("answers anyone else, and a listed caller with no set, with the picks alone, as today", async () => {
    // Jev rates every option; only the pick reaches these callers
    const all = { type: "choice", choice: "c2", probabilities: { c0: 0.1, c1: 0.05, c2: 0.7, c3: 0.05, c4: 0.05, c5: 0.03, none: 0.02 } };
    for (const [uid, body] of [[UID, { set: true }], [UID, {}], [LEO, {}], [LEO, { noun: "photo" }]] as const) {
      const res = await run(uid, body, all);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ picks: [2] });
    }
  });
});

describe("every mode before the launch film's (pinned at 6cdc59d2, before film-directions, film and film-edit)", () => {
  // each mode's own first answer to an empty request, so a new mode can't take over an old one's requests
  const ask = async (uid: string, body: Record<string, unknown> | null, query = "") => {
    const res = await db.handler!(
      new Request(`http://x/video-assist${query}`, { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: body ? JSON.stringify(body) : new Uint8Array(10) }),
    );
    return [res.status, await res.json()];
  };
  const MODES = ["translate", "clips", "cutaways", "motion", "broll", "montage", "montage-pick", "hooks", "captions", "thread", "own-words", "keywords", "coldopen", "publish"];

  it("answers each one as today, for a listed uid and anyone else, before counting or calling a provider", async () => {
    const got: Record<string, unknown> = {};
    for (const uid of [LEO, UID]) {
      const who = uid === LEO ? "listed" : "other";
      got[`${who} transcribe`] = await ask(uid, null, "?mode=transcribe");
      got[`${who} watch`] = await ask(uid, null, "?mode=watch");
      got[`${who} translate post`] = await ask(uid, { mode: "translate", kind: "post" });
      got[`${who} vibe`] = await ask(uid, {});
      for (const mode of MODES) got[`${who} ${mode}`] = await ask(uid, { mode });
    }
    expect(got).toEqual(PINNED_MODES);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

// recorded from this code at 6cdc59d2: each mode's own refusal of an empty request
const PINNED_MODES = {
  "listed transcribe": [411, { error: "Send the sound file with its length." }],
  "listed watch": [411, { error: "Send the video with its length." }],
  "listed translate post": [400, { code: "bad_request", error: "Pick Chinese, Malay or Tamil." }],
  "listed vibe": [400, { error: "Say what to change, or add a reference video." }],
  "listed translate": [400, { error: "Pick Chinese, Malay or Tamil." }],
  "listed clips": [400, { error: "Clips need a video of at least 45 seconds." }],
  "listed cutaways": [400, { error: "The video is too short for callouts." }],
  "listed motion": [400, { error: "The video is too short for key lines." }],
  "listed broll": [400, { error: "The video is too short for B-roll." }],
  "listed montage": [400, { error: "Type a theme for the montage." }],
  "listed montage-pick": [400, { error: "Nothing to pick from." }],
  "listed hooks": [400, { error: "The video is too short for a hook." }],
  "listed captions": [400, { error: "Caption the video first." }],
  "listed thread": [400, { code: "bad_request", error: "Write a bit more before making it a thread." }],
  "listed own-words": [400, { code: "bad_request", error: "Say what it is about first." }],
  "listed keywords": [400, { code: "bad_request", error: "Caption the video first." }],
  "listed coldopen": [400, { error: "Caption the video first." }],
  "listed publish": [400, { error: "The video is too short for a title." }],
  "other transcribe": [411, { error: "Send the sound file with its length." }],
  "other watch": [411, { error: "Send the video with its length." }],
  "other translate post": [403, { code: "not_enabled", error: "This isn't switched on for your account yet." }],
  "other vibe": [400, { error: "Say what to change, or add a reference video." }],
  "other translate": [400, { error: "Pick Chinese, Malay or Tamil." }],
  "other clips": [400, { error: "Clips need a video of at least 45 seconds." }],
  "other cutaways": [400, { error: "The video is too short for callouts." }],
  "other motion": [400, { error: "The video is too short for key lines." }],
  "other broll": [400, { error: "The video is too short for B-roll." }],
  "other montage": [400, { error: "Type a theme for the montage." }],
  "other montage-pick": [400, { error: "Nothing to pick from." }],
  "other hooks": [400, { error: "The video is too short for a hook." }],
  "other captions": [400, { error: "Caption the video first." }],
  "other thread": [403, { code: "not_enabled", error: "This isn't switched on for your account yet." }],
  "other own-words": [403, { code: "not_enabled", error: "This isn't switched on for your account yet." }],
  "other keywords": [403, { code: "not_enabled", error: "This isn't switched on for your account yet." }],
  "other coldopen": [400, { error: "Caption the video first." }],
  "other publish": [400, { error: "The video is too short for a title." }],
};
