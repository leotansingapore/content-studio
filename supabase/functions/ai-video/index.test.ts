import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_COUNTER_USER } from "../_shared/usageCaps";

// The handler's money path for a video: the adviser's cap, the studio's, and the uses given back when nothing is made.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// on NORTH_STAR_USERS; UID is everyone else
const LEO = "leo-uid";

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

// Higgsfield: each picture submit answers from `submits` in turn; every call is kept, with each body sent to it.
// OpenAI (the template's prompt writer) answers a usable shot prompt and keeps what it was sent.
// `replies` (when set) answers OpenAI in turn instead: a body, or a status for a failure. Jev answers `jev` (null: no answer).
const hf: {
  calls: string[]; submits: number[]; bodies: Record<string, unknown>[]; openai: { messages: { content: string }[] }[]; replies: (object | number)[]; jev: number | null; asked: unknown[];
} = { calls: [], submits: [], bodies: [], openai: [], replies: [], jev: null, asked: [] };
// built once at load: the first Response in a worker is slow
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
answer({});

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", HF_API_KEY: "k", HF_API_SECRET: "s", OPENAI_API_KEY: "k", NORTH_STAR_USERS: LEO, TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    if (String(u).includes("typesafe")) {
      hf.asked.push(JSON.parse(String(init?.body)));
      return hf.jev === null ? answer({}, 503) : answer({ answers: { mas: { type: "noul", noul: hf.jev } } });
    }
    if (String(u).includes("openai")) {
      hf.openai.push(JSON.parse(String(init?.body)));
      const reply = hf.replies.shift();
      if (typeof reply === "number") return answer({ error: "down" }, reply);
      if (reply) return answer({ choices: [{ message: { content: JSON.stringify(reply) } }] });
      return answer({ choices: [{ message: { content: JSON.stringify({ prompt: "Vertical 9:16, 8 seconds, a phone propped on a kitchen counter in a bright HDB flat. ".repeat(2) }) } }] });
    }
    hf.calls.push(String(u));
    if (init?.body) hf.bodies.push(JSON.parse(String(init.body)));
    if (String(u).endsWith("/cancel")) return answer({});
    const status = hf.submits.shift() ?? 200;
    return status === 200 ? answer({ request_id: `r${hf.calls.length}` }) : answer({ detail: "no" }, status);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  hf.calls.length = 0;
  hf.submits.length = 0;
  hf.bodies.length = 0;
  hf.openai.length = 0;
  hf.replies.length = 0;
  hf.jev = null;
  hf.asked.length = 0;
});

const PICTURES = ["A clinic waiting room in Toa Payoh", "An HDB flat living room at dusk", "A hawker centre at lunchtime"];
const explainer = () =>
  db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify({ mode: "explainer", pictures: PICTURES }) }));
const mine = () => db.rows.get(`${UID}|ai-video|${db.today()}`);
const studio = () => db.rows.get(`${GLOBAL_COUNTER_USER}|ai-video-global|${db.today()}`);

describe("an explainer's uses", () => {
  it("are taken once each when the pictures go off", async () => {
    const res = await explainer();
    expect(res.status).toBe(200);
    expect([mine(), studio()]).toEqual([1, 1]);
    expect(hf.calls).toHaveLength(3);
  });

  it("give the adviser's use back, with no Higgsfield call, when the studio's are used up", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-video-global|${db.today()}`, 20);
    const res = await explainer();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect([mine(), studio()]).toEqual([0, 20]);
    expect(hf.calls).toEqual([]);
  });

  it("both come back, and the picture already queued is cancelled, when Higgsfield refuses one halfway", async () => {
    hf.submits.push(200, 500);
    const res = await explainer();
    expect(res.status).toBe(502);
    expect(hf.calls.filter((u) => u.endsWith("/cancel"))).toEqual(["https://api.higgsfield.ai/requests/r1/cancel"]);
    expect([mine(), studio()]).toEqual([0, 0]);
  });
});

describe("phase 3's templates and settings (NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const scene = { mode: "template", template: "scene-kitchen", seconds: 8, quality: "480p", fields: {} };
  const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;

  it("refuse a hidden or Leo-only template, or a presenter in a new setting, before any count or call", async () => {
    for (const body of [
      scene,
      { mode: "template", template: "spoken-hook", seconds: 4, quality: "480p", fields: { line: "Stop guessing why your pipeline is empty" } },
      { mode: "template", template: "street-interview", seconds: 8, quality: "480p", fields: { question: "How much of your pay do you save?" } },
      { mode: "presenter", look: "A Malay Singaporean woman in her 30s", setting: "car" },
    ]) {
      const res = await send(UID, body);
      expect(res.status, String(body.template ?? body.setting)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect(db.rows.size).toBe(0);
    expect([hf.calls, hf.openai]).toEqual([[], []]);
  });

  it("let today's templates and the office presenter through for everyone, as before", async () => {
    expect((await send(UID, { mode: "template", template: "food-asmr", seconds: 4, quality: "480p", fields: { product: "Laksa" } })).status).toBe(200);
    expect((await send(UID, { mode: "presenter", look: "A Malay Singaporean woman in her 30s", setting: "office" })).status).toBe(200);
    expect([used(UID, "ai-clip"), used(UID, "ai-image")]).toEqual([1, 1]);
    expect(hf.openai[0].messages[0].content).toContain("Spoken lines: few");
  });

  it("make a silent scene and a presenter in a parked car for a listed account", async () => {
    const res = await send(LEO, scene);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ credits: 26.3, tokens: [expect.any(String)] });
    expect(used(LEO, "ai-clip")).toBe(1);
    expect(hf.openai[0].messages[0].content).toContain("Nobody speaks. Ambient room or street sound only.");
    expect(hf.bodies.at(-1)).toMatchObject({ duration: 8, resolution: "480p", aspect_ratio: "9:16" });

    expect((await send(LEO, { mode: "presenter", look: "A Malay Singaporean woman in her 30s", setting: "car" })).status).toBe(200);
    expect(String(hf.bodies.at(-1)!.prompt)).toContain("Sitting in the driver's seat of a parked car in daylight");
    expect(used(LEO, "ai-image")).toBe(1);
  });
});

describe("the presenter formats' script and set (NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;
  const SAY = `Tonight's top story: ${"most people pay for their hospital stay twice and never notice it ".repeat(5).trim()}.`;
  const news = { mode: "talk-script", talk: "news", topic: "Why people pay for hospital twice" };

  it("refuse anyone not listed before any count or call, even with a body that would be refused", async () => {
    for (const body of [news, { mode: "set", talk: "news" }, { mode: "talk-script", talk: "plain" }, { mode: "set", talk: "spokesperson" }]) {
      const res = await send(UID, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect((await db.handler!(new Request("http://x/ai-video", { method: "POST", body: JSON.stringify(news) }))).status).toBe(401);
    expect(db.rows.size).toBe(0);
    expect([hf.calls, hf.openai, hf.asked]).toEqual([[], [], []]);
  });

  it("check a listed account's body after the gate, before any count", async () => {
    const res = await send(LEO, { mode: "talk-script", talk: "plain", topic: "Why follow-ups win deals" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "Pick a format first." });
    expect(db.rows.size).toBe(0);
  });

  it("write a news script with its headline for one script use, and ask Jev the MAS question", async () => {
    hf.replies.push({ say: SAY, headline: "Most people pay for hospital twice" });
    hf.jev = 0.62;
    const res = await send(LEO, { ...news, offer: { name: "Free policy review" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ say: SAY, headline: "Most people pay for hospital twice", mas: true });
    expect(used(LEO, "ai-video-script")).toBe(1);
    expect(hf.openai[0].messages[0].content).toContain("Tonight's top story");
    expect(JSON.stringify(hf.asked[0])).toContain("guaranteed or risk-free");
    expect(hf.calls).toEqual([]);
  });

  it("say nothing about MAS when Jev has no answer, so the page falls back to its own check", async () => {
    hf.replies.push({ say: SAY, headline: "" });
    const res = await send(LEO, { ...news, talk: "stage" });
    expect(await res.json()).toMatchObject({ say: SAY, mas: null });
    expect(hf.asked).toHaveLength(1);
  });

  it("give the use back only when OpenAI never answered", async () => {
    hf.replies.push(500);
    const down = await send(LEO, news);
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: "failed" });
    expect(used(LEO, "ai-video-script")).toBe(0);

    // two scripts that run short: the second try is the last, and the use is kept
    hf.replies.push({ say: "Too short.", headline: "x" }, { say: "Still short.", headline: "y" });
    const bad = await send(LEO, news);
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ code: "unusable" });
    expect(hf.openai).toHaveLength(3);
    expect(used(LEO, "ai-video-script")).toBe(1);
  });

  it("make the empty set as one Soul v2 picture for one picture use, given back when Higgsfield takes no job", async () => {
    const res = await send(LEO, { mode: "set", talk: "stage" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: expect.any(String) });
    expect(hf.calls).toEqual(["https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard"]);
    expect(hf.bodies[0]).toMatchObject({ aspect_ratio: "9:16", prompt: expect.stringContaining("An empty conference stage") });
    expect(String(hf.bodies[0].prompt)).toContain("No people");
    expect(used(LEO, "ai-image")).toBe(1);

    hf.submits.push(500);
    expect((await send(LEO, { mode: "set", talk: "news" })).status).toBe(502);
    expect(used(LEO, "ai-image")).toBe(1);
  });
});
