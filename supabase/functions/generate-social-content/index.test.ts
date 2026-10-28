import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The live handler with the database and OpenAI faked: who may write, what a request counts, and when it is given back.
const ME = "6d80f027-3395-480c-86a1-8827d3d6cce3";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    // only a signed-in user's token names a user (here the token is the id); the anon key, or no token, names nobody
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt === "6d80f027-3395-480c-86a1-8827d3d6cce3" ? { id: jwt } : null } }) },
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
vi.mock("https://deno.land/x/xhr@0.1.0/mod.ts", () => ({}));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn) }));

// OpenAI: "down" answers 500, "ok" answers one line (as JSON for the side modes, as a stream when asked), "breaks"
// streams one token and then drops, "hangs" never answers until the call is aborted
const openai = { mode: "ok" as "ok" | "down" | "breaks" | "hangs", calls: 0, aborted: 0 };

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k" };
  vi.stubGlobal("Deno", { env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    if (!String(u).includes("openai")) throw new Error(`unexpected fetch ${u}`);
    openai.calls++;
    if (openai.mode === "down") return new Response("{}", { status: 500 });
    if (openai.mode === "hangs") {
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => {
          openai.aborted++;
          reject(new DOMException("aborted", "AbortError"));
        }),
      );
    }
    if (openai.mode === "breaks") {
      const token = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "A li" } }] })}\n\n`);
      return new Response(new ReadableStream({ start: (c) => { c.enqueue(token); setTimeout(() => c.error(new TypeError("connection lost")), 0); } }));
    }
    const content = '{"hashtags":["growth"],"prompt":"A desk by a window"}';
    if (JSON.parse(String(init?.body)).stream) {
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "A line." } }] })}\n\ndata: [DONE]\n\n`);
    }
    return Response.json({ model: "gpt-6-luna", choices: [{ message: { content } }] });
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.rows.clear();
  openai.mode = "ok";
  openai.calls = 0;
  openai.aborted = 0;
});

const BRIEF = { pillar: "topic", format: "text-post", platform: "linkedin", ideaSource: "A common mistake", ctaType: "open-question" };
const send = async (body: unknown, token = ME, accept = "application/json") => {
  const r = await db.handler!(
    new Request("http://x/generate-social-content", { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: accept }, body: JSON.stringify(body) }),
  );
  return { status: r.status, text: await r.text() };
};
const used = (uid = ME) => db.rows.get(`${uid}|write-post|${db.today()}`) ?? 0;

describe("generate-social-content: who may write and what it counts", () => {
  it("refuses a request with no signed-in user before any count or OpenAI call", async () => {
    expect(await send({ ...BRIEF, mode: "post" }, "anon-key")).toMatchObject({ status: 401 });
    expect(await send({ ...BRIEF, mode: "post" }, "")).toMatchObject({ status: 401 });
    expect(openai.calls).toBe(0);
  });

  it("counts one write-post use for each request, whatever the mode", async () => {
    expect((await send({ ...BRIEF, mode: "post" })).status).toBe(200);
    expect((await send({ ...BRIEF, mode: "hooks", n: 3 }, ME, "text/event-stream")).status).toBe(200);
    expect((await send({ mode: "hashtags", draft: "A post." })).status).toBe(200);
    expect((await send({ mode: "voice-summary", posts: ["A past post."] })).status).toBe(200);
    expect(used()).toBe(4);
  });

  it("is refused over the day's 200 without calling OpenAI", async () => {
    db.rows.set(`${ME}|write-post|${db.today()}`, 200);
    const r = await send({ ...BRIEF, mode: "post" });
    expect(r.status).toBe(429);
    expect(JSON.parse(r.text)).toMatchObject({ code: "daily_limit" });
    expect(openai.calls).toBe(0);
  });

  it("refuses an oversized request with a 400 before any count", async () => {
    const r = await send({ ...BRIEF, mode: "post", ideaContext: "x".repeat(100_001) });
    expect(r).toMatchObject({ status: 400 });
    expect(JSON.parse(r.text).error).toBe("That's too long to write from. Shorten it and try again.");
    expect([used(), openai.calls]).toEqual([0, 0]);
  });

  it("gives the use back when OpenAI fails, streamed or not", async () => {
    openai.mode = "down";
    expect((await send({ ...BRIEF, mode: "post" })).status).toBe(500);
    expect((await send({ mode: "image-prompt", draft: "A post." })).status).toBe(500);
    const streamed = await send({ ...BRIEF, mode: "post", n: 2 }, ME, "text/event-stream");
    expect(streamed.text).toContain('"type":"error"');
    expect(used()).toBe(0);
  });

  it("keeps the use when OpenAI fails after a token reached the client", async () => {
    openai.mode = "breaks";
    const r = await send({ ...BRIEF, mode: "post", n: 1 }, ME, "text/event-stream");
    expect(r.text).toContain('"type":"token"');
    expect(r.text).toContain('"type":"error"');
    expect(used()).toBe(1);
  });

  it("keeps the use when the person stops the stream before OpenAI answers", async () => {
    openai.mode = "hangs";
    const r = await db.handler!(
      new Request("http://x/generate-social-content", { method: "POST", headers: { Authorization: `Bearer ${ME}`, Accept: "text/event-stream" }, body: JSON.stringify({ ...BRIEF, mode: "post", n: 2 }) }),
    );
    const reader = r.body!.getReader();
    await reader.read(); // the start event
    await vi.waitFor(() => expect(openai.calls).toBe(2));
    await reader.cancel();
    await vi.waitFor(() => expect(openai.aborted).toBe(2));
    for (let i = 0; i < 5; i++) await new Promise((t) => setTimeout(t, 0));
    expect(used()).toBe(1);
  });

  it("refuses a body over 128,000 characters, or one that isn't an object, before any count", async () => {
    const big = await send({ ...BRIEF, mode: "post", junk: "x".repeat(128_000) });
    expect(big.status).toBe(400);
    expect(JSON.parse(big.text).error).toBe("That's too long to write from. Shorten it and try again.");
    for (const body of [null, 7, "post", []]) expect((await send(body)).status).toBe(400);
    expect([used(), openai.calls]).toEqual([0, 0]);
  });

  it("refuses an unknown pillar with a 400 before any count", async () => {
    expect((await send({ ...BRIEF, mode: "post", pillar: "nope" })).status).toBe(400);
    expect(used()).toBe(0);
  });

  it("keeps the use when a stream sends at least one variant", async () => {
    await send({ ...BRIEF, mode: "post", n: 2 }, ME, "text/event-stream");
    expect(used()).toBe(1);
  });
});
