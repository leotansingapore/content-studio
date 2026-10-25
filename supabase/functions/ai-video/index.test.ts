import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_COUNTER_USER } from "../_shared/usageCaps";
import { createHash } from "node:crypto";
import { PEOPLE_RULE, jobToken, tokenSecret } from "../ai-image/logic";
import { consentSecret, openSigned, signFor } from "../_shared/consent";
import { EXPLAINER_LOOKS, READ_FAILED, SCRIPT_SYSTEM, partsSpent, presenterBody } from "./logic";
import { fixedPrompt, templateById } from "./templates";

// The handler's money path for a video: the adviser's cap, the studio's, and the uses given back when nothing is made.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// on NORTH_STAR_USERS; UID is everyone else
const LEO = "leo-uid";
// Leo's other sign-in, also listed
const LEO_TWO = "leo-uid-two";

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
// `whisper` answers Whisper in turn: the words heard, a status for a failure, or "drop" for no connection; each form is kept.
// `answers` (when set) is Jev's whole reply instead. `status` answers a Higgsfield status read by job id (done by default),
// and `pages` a page read by its link (a status number for a failure); `dns` resolves a host (public by default).
// `ids` (when set) are the request ids submits answer in turn, for a status read (which opens only uuid tokens).
// `cancels` answers a cancel by request id (202 by default; 400 once Higgsfield has started making it).
const hf: {
  calls: string[]; submits: number[]; bodies: Record<string, unknown>[]; openai: { messages: { content: string }[] }[]; replies: (object | number)[]; jev: number | null; asked: unknown[];
  answers: Record<string, unknown> | null; status: Record<string, unknown>; pages: Record<string, { html: string; type?: string } | number>; dns: Record<string, string[]>;
  whisper: (string | number)[]; heard: FormData[]; ids: string[]; cancels: Record<string, number>;
} = { calls: [], submits: [], bodies: [], openai: [], replies: [], jev: null, asked: [], answers: null, status: {}, pages: {}, dns: {}, whisper: [], heard: [], ids: [], cancels: {} };
// built once at load: the first Response in a worker is slow
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
answer({});

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", HF_API_KEY: "k", HF_API_SECRET: "s", OPENAI_API_KEY: "k", NORTH_STAR_USERS: `${LEO},${LEO_TWO}`, TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => env[k] },
    resolveDns: async (host: string, t: string) => (t === "A" ? hf.dns[host] ?? ["93.184.216.34"] : []),
  });
  vi.stubGlobal("fetch", async (u: string | URL, init?: RequestInit) => {
    if (String(u).includes("typesafe")) {
      hf.asked.push(JSON.parse(String(init?.body)));
      if (hf.answers) return answer({ answers: hf.answers });
      return hf.jev === null ? answer({}, 503) : answer({ answers: { mas: { type: "noul", noul: hf.jev } } });
    }
    const page = hf.pages[String(u)];
    if (page !== undefined) {
      hf.calls.push(String(u));
      return typeof page === "number" ? new Response("no", { status: page }) : new Response(page.html, { headers: { "content-type": page.type ?? "text/html; charset=utf-8" } });
    }
    if (String(u).endsWith("/audio/transcriptions")) {
      hf.heard.push(init?.body as FormData);
      const w = hf.whisper.shift() ?? "";
      if (w === "drop") throw new TypeError("connection reset");
      return typeof w === "number" ? answer({ error: "down" }, w) : answer({ text: w });
    }
    if (String(u).endsWith("/status")) {
      hf.calls.push(String(u));
      const id = String(u).split("/").at(-2)!;
      return answer(hf.status[id] ?? { status: "completed", images: [{ url: `https://cdn.example/${id}.png` }] });
    }
    if (String(u).includes("openai")) {
      hf.openai.push(JSON.parse(String(init?.body)));
      const reply = hf.replies.shift();
      if (typeof reply === "number") return answer({ error: "down" }, reply);
      if (reply) return answer({ choices: [{ message: { content: JSON.stringify(reply) } }] });
      return answer({ choices: [{ message: { content: JSON.stringify({ prompt: "Vertical 9:16, 8 seconds, a phone propped on a kitchen counter in a bright HDB flat. ".repeat(2) }) } }] });
    }
    // a photo put on Higgsfield's storage: the signed upload link, then the PUT of its bytes
    if (String(u).endsWith("/files/generate-upload-url")) return answer({ upload_url: "https://upload.example/put", public_url: "https://cdn.example/frame.jpg" });
    if (String(u) === "https://upload.example/put") return new Response(null, { status: 200 });
    hf.calls.push(String(u));
    if (init?.body) hf.bodies.push(JSON.parse(String(init.body)));
    if (String(u).endsWith("/cancel")) return new Response(null, { status: hf.cancels[String(u).split("/").at(-2)!] ?? 202 });
    const status = hf.submits.shift() ?? 200;
    return status === 200 ? answer({ request_id: hf.ids.shift() ?? `r${hf.calls.length}` }) : answer({ detail: "no" }, status);
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
  hf.answers = null;
  hf.status = {};
  hf.pages = {};
  hf.dns = {};
  hf.whisper.length = 0;
  hf.heard.length = 0;
  hf.ids.length = 0;
  hf.cancels = {};
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
      { mode: "template", template: "crumple-hook", seconds: 4, quality: "720p", fields: {}, photos: [{ role: "person", jpeg: "/9j/4AAQSkZJRgABAQAAAQABAAD" }] },
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

  it("make the crumpled-notification hook for a listed account from its frame, with the tested prompt and no writer", async () => {
    const res = await send(LEO, { mode: "template", template: "crumple-hook", seconds: 4, quality: "720p", fields: {}, photos: [{ role: "person", jpeg: "/9j/4AAQSkZJRgABAQAAAQABAAD" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ credits: 29.6, tokens: [expect.any(String)], refund: expect.any(String) });
    expect(used(LEO, "ai-clip")).toBe(1);
    expect(hf.openai).toEqual([]);
    expect(hf.calls).toEqual(["https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video"]);
    expect(hf.bodies[0]).toEqual({ prompt: fixedPrompt(templateById("crumple-hook")!, "person"), duration: 4, resolution: "720p", generate_audio: true, image_url: "https://cdn.example/frame.jpg" });
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

describe("the narrated video (NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;
  const scenes = (n: number, words = 15) => Array.from({ length: n }, (_, i) => ({ say: `Scene ${i} ${"word ".repeat(words - 2).trim()}.`, picture: "A Malay Singaporean man in his 30s at a hawker centre", search: "hawker centre" }));
  const SCRIPT = "Most people pay for their hospital stay twice. First the plan pays the ward. Then the bill still has a co-pay. Ask me what yours covers.";
  const IDS = ["11111111-2222-4333-8444-555555555555", "66666666-7777-4888-9999-aaaaaaaaaaaa", "77777777-7777-4888-9999-bbbbbbbbbbbb"];
  const tokensOf = async (uid: string, ids = IDS) => Promise.all(ids.map(async (id) => jobToken(await tokenSecret("service-role-key"), uid, id)));

  it("refuses anyone not listed before any count or call: a source, a length, 7 pictures, a move or a read", async () => {
    for (const body of [
      { mode: "script", topic: "Why co-pays", seconds: 60 },
      { mode: "script", topic: "", source: { kind: "script", text: SCRIPT } },
      { mode: "explainer", pictures: Array(7).fill("A clinic waiting room in Toa Payoh") },
      { mode: "explainer", pictures: ["A clinic waiting room in Toa Payoh"] },
      { mode: "status", tokens: Array(7).fill("a.b") },
      { mode: "move", tokens: ["a.b"] },
      { mode: "move" },
      { mode: "read", url: "https://www.moneysense.gov.sg/articles/co-pay" },
      { mode: "read", url: "http://localhost/x" },
    ]) {
      const res = await send(UID, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect(db.rows.size).toBe(0);
    expect([hf.calls, hf.openai, hf.asked]).toEqual([[], [], []]);
  });

  it("writes anyone else's explainer exactly as today: today's rules, no search, no Jev", async () => {
    hf.replies.push({ scenes: scenes(4, 12).map(({ say, picture }) => ({ say, picture })) });
    const res = await send(UID, { mode: "script", topic: "Why hospital plans have a co-pay" });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(Object.keys(out)).toEqual(["scenes", "usage"]);
    expect(hf.openai[0].messages[0].content).toBe(SCRIPT_SYSTEM);
    expect(hf.asked).toEqual([]);
  });

  it("makes anyone else's pictures as photos, a typed look ignored", async () => {
    await send(UID, { mode: "explainer", pictures: ["A clinic waiting room in Toa Payoh", "An HDB flat living room at dusk", "A hawker centre at lunchtime"], look: "clay" });
    expect(hf.bodies.map((b) => b.prompt)).toEqual(["A clinic waiting room in Toa Payoh", "An HDB flat living room at dusk", "A hawker centre at lunchtime"].map((p) => `${p}\n\n${PEOPLE_RULE}`));
  });

  it("writes a listed account's 60 s script with a search per scene, Jev's look and its MAS answer, for one script use", async () => {
    hf.replies.push({ scenes: scenes(9, 16) });
    hf.answers = { look: { type: "choice", choice: "chalk", probabilities: { chalk: 0.55 } }, mas: { type: "noul", noul: 0.2 } };
    const res = await send(LEO, { mode: "script", topic: "Why hospital plans have a co-pay", seconds: 60 });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.scenes).toHaveLength(9);
    expect(out.scenes[0]).toMatchObject({ search: "hawker centre" });
    expect(out).toMatchObject({ look: { id: "chalk", p: 0.55 }, mas: false });
    expect(hf.openai[0].messages[0].content).toContain("140 to 170 words, about 60 seconds");
    expect(JSON.stringify(hf.asked[0])).toContain("60-second narrated explainer");
    expect(used(LEO, "ai-video-script")).toBe(1);
  });

  it("splits a pasted script keeping its words, retries once on a changed word, then keeps the use", async () => {
    const split = ["Most people pay for their hospital stay twice.", "First the plan pays the ward. Then the bill still has a co-pay.", "Ask me what yours covers."];
    const asScenes = (says: string[]) => ({ scenes: says.map((say) => ({ say, picture: "A clinic waiting room in Toa Payoh", search: "clinic" })) });
    hf.replies.push(asScenes([...split.slice(0, 2), "Message me."]), asScenes(split));
    const ok = await send(LEO, { mode: "script", topic: "", source: { kind: "script", text: SCRIPT } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).scenes.map((s: { say: string }) => s.say)).toEqual(split);
    expect(hf.openai).toHaveLength(2);
    expect(hf.openai[0].messages[1].content).toBe(`Script to split (keep every word): ${SCRIPT}`);

    hf.replies.push(asScenes(["Changed."]), asScenes(["Changed again."]));
    const bad = await send(LEO, { mode: "script", topic: "", source: { kind: "script", text: SCRIPT } });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ code: "unusable", error: "Couldn't split your script without changing it. Try again." });
    expect(used(LEO, "ai-video-script")).toBe(2);
  });

  it("gives the script use back only when OpenAI never answered, and says nothing of a look or MAS with no Jev", async () => {
    hf.replies.push(500);
    const down = await send(LEO, { mode: "script", topic: "Why co-pays" });
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: "failed" });
    expect(used(LEO, "ai-video-script")).toBe(0);
    hf.replies.push({ scenes: scenes(4) });
    const res = await send(LEO, { mode: "script", topic: "Why co-pays" });
    expect(await res.json()).toMatchObject({ look: null, mas: null });
  });

  it("makes a listed account's pictures in its look, up to 10, and 1 beside stock clips, for one video use", async () => {
    const res = await send(LEO, { mode: "explainer", pictures: Array(10).fill("A clinic waiting room in Toa Payoh"), look: "clay" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ credits: 0.9, tokens: expect.arrayContaining([expect.any(String)]) });
    expect(hf.bodies).toHaveLength(10);
    expect(String(hf.bodies[0].prompt)).toContain(EXPLAINER_LOOKS.clay.style);
    expect(String(hf.bodies[0].prompt)).not.toContain("Polished lifestyle photograph.");
    expect((await send(LEO, { mode: "explainer", pictures: ["A clinic waiting room in Toa Payoh"] })).status).toBe(200);
    expect([used(LEO, "ai-video"), used(GLOBAL_COUNTER_USER, "ai-video-global")]).toEqual([2, 2]);
    expect((await send(LEO, { mode: "status", tokens: Array(10).fill("a.b") })).status).toBe(200);
  });

  it("moves each finished picture once with DoP lite in the look's motion, taking no new use", async () => {
    const tokens = await tokensOf(LEO);
    const res = await send(LEO, { mode: "move", tokens, look: "paper" });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ credits: 6 });
    expect(out.tokens).toHaveLength(3);
    const moves = hf.calls.filter((u) => u.endsWith("/higgsfield-ai/dop/lite"));
    expect(moves).toHaveLength(3);
    expect(hf.bodies).toEqual(IDS.map((id) => ({ prompt: "Paper layers slide and bob slightly, stop-motion steps. No text, no cuts.", image_url: `https://cdn.example/${id}.png`, duration: 5 })));
    expect([used(LEO, "ai-video"), used(GLOBAL_COUNTER_USER, "ai-video-global")]).toEqual([0, 0]);
    expect(db.rows.get(`${LEO}|move:${IDS[0]}|${db.today()}`)).toBe(1);

    const again = await send(LEO, { mode: "move", tokens, look: "paper" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ code: "already_moving", error: "These scenes are already moving." });
    // a later call that starts on a fresh picture skips the ones already moving
    hf.calls.length = 0;
    const later = await send(LEO, { mode: "move", tokens: await tokensOf(LEO, ["88888888-7777-4888-9999-cccccccccccc", IDS[1]]) });
    expect((await later.json()).tokens).toEqual([expect.any(String), null]);
    expect(hf.calls.filter((u) => u.endsWith("/dop/lite"))).toHaveLength(1);
  });

  it("refuses a move before any claim when a picture isn't finished or isn't the caller's, and leaves a scene Higgsfield won't take still", async () => {
    hf.status[IDS[1]] = { status: "in_progress" };
    const early = await send(LEO, { mode: "move", tokens: await tokensOf(LEO) });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: "not_ready" });
    expect(hf.calls.some((u) => u.includes("dop"))).toBe(false);
    expect([...db.rows.keys()].some((k) => k.includes("move:"))).toBe(false);

    const theirs = await send(LEO, { mode: "move", tokens: await tokensOf(UID) });
    expect(theirs.status).toBe(400);

    delete hf.status[IDS[1]];
    hf.submits.push(200, 500, 200);
    const res = await send(LEO, { mode: "move", tokens: await tokensOf(LEO) });
    const out = await res.json();
    expect(out.tokens.map((t: string | null) => t === null)).toEqual([false, true, false]);
    expect(out.credits).toBe(4);
  });

  it("reads a public page's article for one page use, kept when the page answered and given back when it never did", async () => {
    const LINK = "https://www.moneysense.gov.sg/articles/co-pay";
    const article = `<html><head><title>Co-pays</title><meta property="og:site_name" content="MoneySense"></head><body><article>${"A co-pay is the part of the bill you pay. ".repeat(10)}</article></body></html>`;
    hf.pages[LINK] = { html: article };
    hf.answers = { point: { type: "noul", noul: 0.8 } };
    const ok = await send(LEO, { mode: "read", url: LINK });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ title: "Co-pays", site: "MoneySense", text: expect.stringMatching(/^A co-pay is the part/) });
    expect(JSON.stringify(hf.asked[0])).toContain("at least one clear point");
    expect(used(LEO, "page-read")).toBe(1);

    // no clear point, or a login wall with too few words: the page answered, so the use is kept
    hf.answers = { point: { type: "noul", noul: 0.3 } };
    const vague = await send(LEO, { mode: "read", url: LINK });
    expect([vague.status, (await vague.json()).code]).toEqual([422, "no_point"]);
    hf.pages[LINK] = { html: "<body><form>Sign in to continue</form></body>" };
    const login = await send(LEO, { mode: "read", url: LINK });
    expect(await login.json()).toEqual({ code: "unreadable", error: READ_FAILED });
    expect(used(LEO, "page-read")).toBe(3);

    // a refusal, or a host that resolves to a private address: never answered, so the use comes back
    hf.pages[LINK] = 403;
    const blocked = await send(LEO, { mode: "read", url: LINK });
    expect([blocked.status, (await blocked.json()).error]).toEqual([502, READ_FAILED]);
    hf.dns["intranet.example.sg"] = ["10.0.0.5"];
    hf.pages["https://intranet.example.sg/a"] = { html: article };
    expect((await send(LEO, { mode: "read", url: "https://intranet.example.sg/a" })).status).toBe(502);
    expect(hf.calls).not.toContain("https://intranet.example.sg/a");
    expect(used(LEO, "page-read")).toBe(3);

    // Jev with no answer passes the page
    hf.pages[LINK] = { html: article };
    hf.answers = null;
    expect((await send(LEO, { mode: "read", url: LINK })).status).toBe(200);
  });
});

describe("a saved face's consent check (people-my-face, NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const used = (uid: string) => db.rows.get(`${uid}|likeness-check|${db.today()}`) ?? 0;
  // 3 s of 16 kHz mono silence, as the device's extractWav writes it
  const WAV = (() => {
    const b = Buffer.alloc(44 + 96_000);
    b.write("RIFF", 0);
    b.writeUInt32LE(36 + 96_000, 4);
    b.write("WAVEfmt ", 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(16_000, 24);
    b.writeUInt32LE(32_000, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write("data", 36);
    b.writeUInt32LE(96_000, 40);
    return b.toString("base64");
  })();
  const PHOTO = `/9j/${Buffer.from("an AI-made face, not a real person").toString("base64")}`;
  const LINE = "I'm the person on camera. I agree that Content Studio can make videos of my face. My code is four, eight, two, one.";
  const ticketFor = async (uid: string, code: string, day = db.today()) => signFor(await consentSecret("service-role-key"), uid, `consent:face:${code}:${day}`);
  const consent = async (uid: string, o: Record<string, unknown> = {}) =>
    send(uid, { mode: "consent", kind: "face", wav: WAV, code: "4821", ticket: await ticketFor(uid, "4821"), photo: PHOTO, ...o });

  it("refuses anyone not listed before any count or call, even with a body that would be refused", async () => {
    for (const body of [{ mode: "consent-code", kind: "face" }, { mode: "consent-code" }, { mode: "consent", kind: "face", wav: WAV, code: "4821", ticket: await ticketFor(UID, "4821"), photo: PHOTO }, { mode: "consent" }]) {
      const res = await send(UID, body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect((await db.handler!(new Request("http://x/ai-video", { method: "POST", body: JSON.stringify({ mode: "consent-code", kind: "face" }) }))).status).toBe(401);
    expect(db.rows.size).toBe(0);
    expect([hf.heard, hf.calls, hf.openai]).toEqual([[], [], []]);
  });

  it("hands out a 4-digit code with a ticket signed for this uid and today, free", async () => {
    const res = await send(LEO, { mode: "consent-code", kind: "face" });
    expect(res.status).toBe(200);
    const { code, ticket } = await res.json();
    expect(code).toMatch(/^\d{4}$/);
    const secret = await consentSecret("service-role-key");
    expect(await openSigned(secret, LEO, ticket)).toBe(`consent:face:${code}:${db.today()}`);
    expect(await openSigned(secret, LEO_TWO, ticket)).toBeNull();
    expect(db.rows.size).toBe(0);
    expect(hf.heard).toEqual([]);
  });

  it("saves a face when Whisper hears the code: signs the photo's own sha256 for this uid, for one check", async () => {
    hf.whisper.push(LINE);
    const res = await consent(LEO);
    expect(res.status).toBe(200);
    const out = await res.json();
    const hash = createHash("sha256").update(Buffer.from(PHOTO, "base64")).digest("hex");
    expect(out).toMatchObject({ heard: LINE, photoHash: hash, at: new Date().toISOString(), token: expect.any(String) });
    expect(await openSigned(await consentSecret("service-role-key"), LEO, out.token)).toBe(`likeness:face:${hash}:${out.at}`);
    // a token for one of Leo's sign-ins never opens for the other
    expect(await openSigned(await consentSecret("service-role-key"), LEO_TWO, out.token)).toBeNull();
    expect(used(LEO)).toBe(1);
    // Whisper hears the sound alone, in English, with no prompt that could hold the code
    const form = hf.heard[0];
    expect([form.get("model"), form.get("language"), form.get("prompt")]).toEqual(["whisper-1", "en", null]);
    const file = form.get("file") as Blob;
    expect(Buffer.from(await file.arrayBuffer()).toString("base64")).toBe(WAV);
    expect([...form.keys()].sort()).toEqual(["file", "language", "model", "response_format"]);
    expect(hf.calls).toEqual([]);
  });

  it("refuses another uid's ticket, another day's, another code's or a job token before any count or call", async () => {
    const jobSigned = await jobToken(await tokenSecret("service-role-key"), LEO, "11111111-2222-4333-8444-555555555555");
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    for (const ticket of [await ticketFor(LEO_TWO, "4821"), await ticketFor(LEO, "4821", yesterday), await ticketFor(LEO, "4822"), jobSigned, await signFor(await tokenSecret("service-role-key"), LEO, `consent:face:4821:${db.today()}`)]) {
      hf.whisper.push(LINE);
      const res = await consent(LEO, { ticket });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ code: "bad_request", error: "That code has run out. Record again for a new one." });
    }
    expect(db.rows.size).toBe(0);
    expect(hf.heard).toEqual([]);
  });

  it("checks a listed account's body after the gate, before any count", async () => {
    const res = await consent(LEO, { photo: "iVBORw0KGgo" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "The photo didn't come through. Pick it again." });
    expect(db.rows.size).toBe(0);
    expect(hf.heard).toEqual([]);
  });

  it("keeps the use when the code wasn't heard, and says what was", async () => {
    hf.whisper.push("My code is 4 8 1 2.");
    const res = await consent(LEO);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "not_heard", error: "We didn't hear the code 4 8 2 1. Read the line again, a little louder.", heard: "My code is 4 8 1 2." });
    expect(used(LEO)).toBe(1);
  });

  it("gives the use back only when Whisper never answered", async () => {
    hf.whisper.push(500);
    const down = await consent(LEO);
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ code: "failed", error: "Couldn't check the recording. Try again in a minute." });
    hf.whisper.push("drop");
    expect((await consent(LEO)).status).toBe(502);
    expect(used(LEO)).toBe(0);
    expect(hf.heard).toHaveLength(2);
  });

  it("refuses the 6th check in a day with the reset time, before Whisper", async () => {
    for (let i = 0; i < 5; i++) {
      hf.whisper.push(LINE);
      expect((await consent(LEO)).status).toBe(200);
    }
    const res = await consent(LEO);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit", error: expect.stringContaining("8am Singapore time") });
    expect(hf.heard).toHaveLength(5);
    expect(used(LEO)).toBe(5);
  });
});

describe("today's one-off presenter, for everyone (pinned before people-presenters)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const LOOK = "A Malay Singaporean woman in her 30s, light grey hijab, cream blouse, warm smile";

  it("makes one Soul v2 picture from the typed look for one ai-image use, with no Jev question and nothing back on a failed submit", async () => {
    const res = await send(UID, { mode: "presenter", look: LOOK });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: expect.any(String) });
    expect(hf.calls).toEqual(["https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard"]);
    expect(hf.bodies).toEqual([{
      prompt:
        `${LOOK}\n\nA head-and-shoulders portrait of this one person facing the camera and looking into the lens, mouth closed, relaxed, about to speak to camera. Softly blurred office or home background, soft even light, sharp focus on the face, a vertical phone video frame. Set in Singapore; the person is Singaporean unless described otherwise. No text, no words, no logos, no watermarks, no other people.`,
      aspect_ratio: "9:16",
      resolution: "1080p",
      batch_size: 1,
    }]);
    expect([...db.rows.entries()]).toEqual([[`${UID}|ai-image|${db.today()}`, 1]]);
    expect(hf.asked).toEqual([]);

    hf.submits.push(500);
    const down = await send(UID, { mode: "presenter", look: LOOK });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "Couldn't start the video right now. Try again in a minute." });
    expect([...db.rows.entries()]).toEqual([[`${UID}|ai-image|${db.today()}`, 2]]);
  });
});

describe("saved presenters (people-presenters, NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;
  const make = { mode: "presenters", prefs: { gender: "woman", dress: "office" } };
  const SOUL = "https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard";
  const jevSays = (realPerson: number, minor: number) => (hf.answers = { realPerson: { type: "noul", noul: realPerson }, minor: { type: "noul", noul: minor } });

  it("refuses anyone not listed before any count or call, even with a body that would be refused", async () => {
    for (const body of [make, { ...make, extra: "Looks like a famous singer" }, { mode: "presenters", prefs: { gender: "child" } }]) {
      const res = await send(UID, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect((await db.handler!(new Request("http://x/ai-video", { method: "POST", body: JSON.stringify(make) }))).status).toBe(401);
    expect(db.rows.size).toBe(0);
    expect([hf.calls, hf.asked]).toEqual([[], []]);
  });

  it("checks a listed account's chips after the gate, before Jev or any count", async () => {
    const res = await send(LEO, { mode: "presenters", prefs: { age: "teen" }, extra: "Glasses" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "Pick the presenter's look from the chips." });
    expect(db.rows.size).toBe(0);
    expect([hf.calls, hf.asked]).toEqual([[], []]);
  });

  it("makes three different presenters as three Soul v2 pictures for 3 presenter uses and 1 of the studio's, no ai-image use and no Jev with nothing typed", async () => {
    const res = await send(LEO, make);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ tokens: [expect.any(String), expect.any(String), expect.any(String)], usage: { used: 3, limit: 12 } });
    expect(out.looks).toHaveLength(3);
    expect(new Set(out.looks).size).toBe(3);
    for (const l of out.looks) expect(l).toMatch(/Singaporean woman in her /);
    expect(hf.calls).toEqual([SOUL, SOUL, SOUL]);
    expect(hf.bodies).toEqual(out.looks.map((l: string) => presenterBody(l)));
    expect([used(LEO, "ai-presenter"), used(GLOBAL_COUNTER_USER, "ai-presenter-global"), used(LEO, "ai-image")]).toEqual([3, 1, 0]);
    expect(hf.asked).toEqual([]);
    // each token is the job signed for this caller, as status reads it; no refund ticket
    const signing = await tokenSecret("service-role-key");
    expect(out.tokens).toEqual(await Promise.all(["r1", "r2", "r3"].map((id) => jobToken(signing, LEO, id))));
    expect(out.refund).toBeUndefined();
  });

  it("refuses a look Jev reads as a real person or a minor before any count or Higgsfield call", async () => {
    jevSays(0.82, 0.01);
    const real = await send(LEO, { ...make, extra: "Looks like a famous Singapore singer" });
    expect(real.status).toBe(422);
    expect(await real.json()).toEqual({ code: "real_person", error: "Presenters can't look like a real person. Describe a look instead." });
    expect(hf.asked[0]).toMatchObject({ model: "jev-1.13.0", state: { look: "Looks like a famous Singapore singer" }, questions: { realPerson: { type: "noul" }, minor: { type: "noul" } } });

    jevSays(0.1, 0.5);
    const minor = await send(LEO, { ...make, extra: "Secondary school uniform" });
    expect(minor.status).toBe(422);
    expect(await minor.json()).toEqual({ code: "minor", error: "Presenters are adults." });
    expect(db.rows.size).toBe(0);
    expect(hf.calls).toEqual([]);

    jevSays(0.49, 0.49);
    expect((await send(LEO, { ...make, extra: "Glasses, short hair, warm smile" })).status).toBe(200);
    expect(used(LEO, "ai-presenter")).toBe(3);
  });

  it("goes ahead when Jev has no answer, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await send(LEO, { ...make, extra: "Glasses, short hair, warm smile" });
    expect(res.status).toBe(200);
    expect(hf.asked).toHaveLength(1);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain("jev: presenter look unread");
    expect((await res.json()).looks.every((l: string) => l.endsWith(". Glasses, short hair, warm smile"))).toBe(true);
    warn.mockRestore();
  });

  it("gives back the 3 uses and the studio's one, and cancels what was queued, when Higgsfield's submit fails", async () => {
    hf.submits.push(200, 500);
    const res = await send(LEO, make);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "Couldn't make the presenters. Try again in a minute." });
    expect(hf.calls).toEqual([SOUL, SOUL, "https://api.higgsfield.ai/requests/r1/cancel"]);
    expect([used(LEO, "ai-presenter"), used(GLOBAL_COUNTER_USER, "ai-presenter-global")]).toEqual([0, 0]);

    hf.submits.push(403);
    const out = await send(LEO, make);
    expect(await out.json()).toEqual({ code: "failed", error: "AI video credits have run out. Tell your studio admin." });
    expect([used(LEO, "ai-presenter"), used(GLOBAL_COUNTER_USER, "ai-presenter-global")]).toEqual([0, 0]);
  });

  it("takes 3 uses or none: at 10 of 12 the make is refused with the reset time and the 2 taken come back", async () => {
    db.rows.set(`${LEO}|ai-presenter|${db.today()}`, 10);
    const res = await send(LEO, make);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "daily_limit", error: "You've used all 12 for today. It resets at 8am Singapore time." });
    expect([used(LEO, "ai-presenter"), used(GLOBAL_COUNTER_USER, "ai-presenter-global")]).toEqual([10, 0]);
    expect(hf.calls).toEqual([]);

    db.rows.set(`${LEO}|ai-presenter|${db.today()}`, 9);
    expect((await send(LEO, make)).status).toBe(200);
    expect(used(LEO, "ai-presenter")).toBe(12);
  });

  it("refuses when the studio's presenters are used up for the day, giving the adviser's 3 back", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-presenter-global|${db.today()}`, 10);
    const res = await send(LEO_TWO, make);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "global_limit", error: "Today's presenters for the whole studio are made. Try again after 8am Singapore time." });
    expect(used(LEO_TWO, "ai-presenter")).toBe(0);
    expect(hf.calls).toEqual([]);
  });
});

// The script writers' prompts as they were before standing notes (brand-voice-memory), pinned on that code: never
// update the fixture with vitest -u.
describe("the script writers' prompts", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const SCRIPT = "Most people pay for their hospital stay twice. First the plan pays the ward. Then the bill still has a co-pay. Ask me what yours covers.";
  const TODAY = [
    [UID, { mode: "script", topic: "Why hospital plans have a co-pay" }],
    [LEO, { mode: "script", topic: "Why hospital plans have a co-pay", seconds: 30 }],
    [LEO, { mode: "script", topic: "", seconds: 60, source: { kind: "script", text: SCRIPT } }],
    [LEO, { mode: "talk-script", talk: "spokesperson", topic: "Why people pay for hospital twice", offer: { name: "Free policy review" } }],
    [LEO, { mode: "talk-script", talk: "news", topic: "", source: { text: SCRIPT } }],
  ] as const;
  const prompts = () => hf.openai.map((o) => o.messages);

  it("are today's, one request each", async () => {
    for (const [uid, body] of TODAY) {
      // a reply that never comes: one OpenAI request, and the use goes back
      hf.replies.push(500);
      await send(uid, body);
    }
    expect(hf.openai).toHaveLength(TODAY.length);
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./fixtures/script-prompts-today.json");
  });

  const NOTES = "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n- Keep doing or avoid: Use Asian presenters";
  const LINE = "The adviser's standing notes (follow them): ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise): - Keep doing or avoid: Use Asian presenters";

  it("are today's with empty notes, and anyone else's notes are ignored, never refused", async () => {
    const [first, ...rest] = TODAY;
    const sent = [[first[0], { ...first[1], notes: NOTES }], ...rest.map(([uid, body]) => [uid, { ...body, notes: "  " }])] as const;
    for (const [uid, body] of sent) {
      hf.replies.push(500);
      expect((await send(uid, body)).status, JSON.stringify(body)).toBe(502);
    }
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./fixtures/script-prompts-today.json");
    expect(db.rows.get(`${UID}|ai-video-script|${db.today()}`)).toBe(1);
  });

  it("print a listed account's notes after the topic, as one line clipped to 600", async () => {
    for (const [, body] of TODAY.slice(1)) {
      hf.replies.push(500);
      await send(LEO, { ...body, notes: NOTES });
    }
    const users = prompts().map((m) => m[1].content);
    expect(users[0]).toBe(`Topic: Why hospital plans have a co-pay\n\n${LINE}`);
    expect(users[1]).toBe(`${LINE}\n\nScript to split (keep every word): ${SCRIPT}`);
    expect(users[2]).toBe(`Topic: Why people pay for hospital twice\n\n${LINE}`);
    expect(users[3]).toBe(`${LINE}\n\nPost to write from (keep its structure, never its words): ${SCRIPT}`);
    // the system messages are today's
    const today = (await import("./fixtures/script-prompts-today.json")).default.slice(1);
    expect(prompts().map((m) => m[0].content)).toEqual(today.map((m: { content: string }[]) => m[0].content));

    hf.openai.length = 0;
    hf.replies.push(500);
    await send(LEO, { ...TODAY[3][1], notes: `${"note ".repeat(200)}end` });
    const line = prompts()[0][1].content.split("\n\n")[1];
    const notes = line.replace("The adviser's standing notes (follow them): ", "");
    expect(notes.length).toBeLessThanOrEqual(600);
    expect(notes.length).toBeGreaterThan(590);
    expect(notes.endsWith("note\u2026")).toBe(true);
  });
});

// A talking video's parts as status reads them (D2 of the phase 5 dogfood, 23 Oct: Higgsfield failed one of two Speak parts).
describe("a talking video's status checks", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(60)]).toString("base64");
  // the 23 Oct voiceover: two slices, 8.19 s and 6.3 s, over a kept presenter's picture
  const AVATAR = { mode: "avatar", photo: { url: "https://cdn.example/raj.png" }, slices: [{ wav: WAV, seconds: 8.19 }, { wav: WAV, seconds: 6.299 }] };
  const [P1, P2] = ["11111111-2222-4333-8444-555555555555", "66666666-7777-4888-9999-aaaaaaaaaaaa"];
  const cancels = () => hf.calls.filter((u) => u.endsWith("/cancel"));
  const start = async () => {
    hf.ids.push(P1, P2);
    const res = await send(UID, AVATAR);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { tokens: string[]; refund: string; credits: number };
    expect(out.credits).toBe(44);
    hf.calls.length = 0;
    return out;
  };

  it("leave every part alone while none has failed, and never cancel on a read with no refund ticket (presenters, moves)", async () => {
    const { tokens, refund } = await start();
    hf.status = { [P1]: { status: "in_progress" }, [P2]: { status: "queued" } };
    expect(await (await send(UID, { mode: "status", tokens, refund })).json()).toEqual({ jobs: [{ state: "working" }, { state: "working" }] });
    hf.status = { [P1]: { status: "failed", error: "Generation failed" }, [P2]: { status: "in_progress" } };
    expect(await (await send(UID, { mode: "status", tokens })).json()).toEqual({ jobs: [{ state: "failed", error: "It didn't come through. Try again." }, { state: "working" }] });
    expect(cancels()).toEqual([]);
    expect([mine(), studio()]).toEqual([1, 1]);
  });

  it("give both uses back, once, when Higgsfield fails a part", async () => {
    const { tokens, refund } = await start();
    hf.status = { [P1]: { status: "in_progress" }, [P2]: { status: "failed", error: "Generation failed" } };
    const res = await send(UID, { mode: "status", tokens, refund });
    expect((await res.json()).jobs[1]).toMatchObject({ state: "failed" });
    expect([mine(), studio()]).toEqual([0, 0]);
    // the next video takes them again; a second read of the failed one gives nothing more back
    await start();
    await send(UID, { mode: "status", tokens, refund });
    expect([mine(), studio()]).toEqual([1, 1]);
  });

  it("log Higgsfield's own answer on a failed part, with its links cut and no key, so the next failure can be read", async () => {
    const { tokens, refund } = await start();
    const errors = vi.mocked(console.error);
    errors.mockClear();
    hf.status = {
      [P1]: { status: "in_progress" },
      [P2]: { status: "failed", request_id: P2, error: "Generation failed", input: { image_url: "https://cdn.example/raj.png?X-Amz-Signature=abc" } },
    };
    await send(UID, { mode: "status", tokens, refund });
    const lines = errors.mock.calls.filter((c) => c[0] === "ai-video status failed");
    expect(lines).toEqual([["ai-video status failed", P2, `{"status":"failed","request_id":"${P2}","error":"Generation failed","input":{"image_url":"<link>"}}`]]);
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/Key k:s|X-Amz-Signature|cdn\.example/);
  });

  it("cancel the other parts when one fails, and say a part already started or made may still be charged", async () => {
    const DIDNT = "It didn't come through. Try again.";
    const logs = vi.mocked(console.log);
    // try 2 on 23 Oct: part 2 failed while part 1 was still being made, which Higgsfield no longer cancels
    const one = await start();
    logs.mockClear();
    hf.status = { [P1]: { status: "in_progress" }, [P2]: { status: "failed", error: "Generation failed" } };
    hf.cancels[P1] = 400;
    expect(await (await send(UID, { mode: "status", tokens: one.tokens, refund: one.refund })).json()).toEqual({ jobs: [{ state: "working" }, { state: "failed", error: `${DIDNT} ${partsSpent(1)}` }] });
    expect(cancels()).toEqual([`https://api.higgsfield.ai/requests/${P1}/cancel`]);
    expect(logs.mock.calls).toContainEqual(["ai-video cancel", P1, 400]);
    // the use rule as before: a failed part gives both back
    expect([mine(), studio()]).toEqual([0, 0]);

    // a part still queued is cancelled, and Higgsfield refunds a cancelled request: nothing to warn about
    const two = await start();
    delete hf.cancels[P1];
    hf.status = { [P1]: { status: "failed", error: "Generation failed" }, [P2]: { status: "queued" } };
    expect(await (await send(UID, { mode: "status", tokens: two.tokens, refund: two.refund })).json()).toEqual({ jobs: [{ state: "failed", error: DIDNT }, { state: "working" }] });
    expect(cancels()).toEqual([`https://api.higgsfield.ai/requests/${P2}/cancel`]);

    // a part already made is charged and can't be cancelled; one with no answer to its cancel may still be made
    const three = await start();
    db.rows.clear(); // two a day: the fourth video is a new day's
    hf.ids.push("77777777-7777-4888-9999-bbbbbbbbbbbb", "88888888-7777-4888-9999-cccccccccccc", "99999999-7777-4888-9999-dddddddddddd");
    const four = await (await send(UID, { ...AVATAR, slices: [...AVATAR.slices, ...AVATAR.slices.slice(0, 1)] })).json();
    hf.calls.length = 0;
    hf.status = { [P1]: { status: "completed", video: { url: "https://cdn.example/p1.mp4" } }, [P2]: { status: "failed" } };
    expect((await (await send(UID, { mode: "status", tokens: three.tokens, refund: three.refund })).json()).jobs[1]).toEqual({ state: "failed", error: `${DIDNT} ${partsSpent(1)}` });
    expect(cancels()).toEqual([]);
    hf.status = { "77777777-7777-4888-9999-bbbbbbbbbbbb": { status: "nsfw" }, "88888888-7777-4888-9999-cccccccccccc": { status: "in_progress" }, "99999999-7777-4888-9999-dddddddddddd": { status: "in_progress" } };
    hf.cancels["88888888-7777-4888-9999-cccccccccccc"] = 500;
    expect((await (await send(UID, { mode: "status", tokens: four.tokens, refund: four.refund })).json()).jobs[0]).toEqual({ state: "failed", error: `The safety filter blocked it. Try another photo or wording. ${partsSpent(1)}` });
    expect(cancels()).toHaveLength(2);
    expect(partsSpent(2)).toBe("2 other parts had already started, so their credits may already be spent.");
  });
});

// Pinned before same-edit's version runs: a Speak run counts the adviser's ai-video use and the studio's, listed or not.
describe("a talking video's uses today (pinned)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/ai-video", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;
  const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(60)]).toString("base64");
  const AVATAR = { mode: "avatar", photo: { url: "https://cdn.example/raj.png" }, slices: [{ wav: WAV, seconds: 7.5 }, { wav: WAV, seconds: 7.5 }] };

  it("count ai-video and ai-video-global once for anyone, a listed account included", async () => {
    for (const uid of [UID, LEO]) {
      const res = await send(uid, AVATAR);
      expect(res.status, uid).toBe(200);
      expect(await res.json()).toMatchObject({ credits: 44, tokens: [expect.any(String), expect.any(String)], refund: expect.any(String), usage: { used: 1, limit: 2 } });
      expect(used(uid, "ai-video"), uid).toBe(1);
    }
    expect(studio()).toBe(2);
  });

  it("ignore a version from an account off the list: today's counts, today's Speak bodies", async () => {
    const res = await send(UID, { ...AVATAR, version: { plan: "ep-mh3k2x1", of: "ev-mh3k2x9" } });
    expect(res.status).toBe(200);
    expect([used(UID, "ai-video"), used(UID, "edit-version"), studio()]).toEqual([1, 0, 1]);
    const bad = await send(UID, { ...AVATAR, version: "junk" });
    expect(bad.status).toBe(200);
    expect([used(UID, "ai-video"), used(UID, "edit-version"), studio()]).toEqual([2, 0, 2]);
  });
});
