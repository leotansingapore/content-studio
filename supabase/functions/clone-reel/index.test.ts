import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRow } from "./logic";

// The live handler with the database, the Apify reader and OpenAI faked: what a clone and a style read count.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// on NORTH_STAR_USERS; UID is everyone else
const LEO = "leo-uid";
const URL_ = "https://www.tiktok.com/@leila_tuck/video/7682935406396001567";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const spent: string[] = [];
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      spent.push(String(a.p_feature));
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
  return { admin, rows, spent, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// cs_reel_sources and the Apify read: `cached` is what the cache holds, a read comes back with `row()` unless `read`
// says otherwise, and `outcome` (when set) is what the 55 s budget sees instead of the read
const reader = vi.hoisted(() => ({ cached: null as unknown, reads: 0, read: null as null | (() => Promise<unknown>), outcome: null as unknown }));
vi.mock("./source.ts", async (original) => {
  const real = await original<typeof import("./source.ts")>();
  return {
    ...real,
    findSource: async () => reader.cached,
    fetchSource: async () => (reader.reads++, reader.read ? reader.read() : { row: row(), videoUrl: null }),
    withinBudget: (async (work: Promise<unknown>, ms: number) => (reader.outcome ? reader.outcome : real.withinBudget(work as never, ms))) as typeof real.withinBudget,
  };
});

const row = (): SourceRow => ({
  platform: "tiktok",
  post_id: "7682935406396001567",
  url: URL_,
  author: "leila_tuck",
  caption: "6 signs your CPF plan is off track",
  transcript: "Most people never check their CPF statement until it is too late.",
  is_video: true,
  posted_at: null,
  duration_sec: 30,
  metrics: null,
  metrics_fetched_at: new Date().toISOString(),
  aliases: [],
});

const openai: string[] = [];
// what each OpenAI request asked, as the user message
const asked: string[] = [];
// each OpenAI request's messages, system and user
const prompts: unknown[] = [];

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", APIFY_API_KEY: "k", NORTH_STAR_USERS: LEO };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    openai.push(String(u));
    asked.push(JSON.parse(String(init?.body ?? "{}")).messages?.[1]?.content ?? "");
    prompts.push(JSON.parse(String(init?.body ?? "{}")).messages);
    return new Response("{}", { status: 500 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.spent.length = 0;
  db.rows.clear();
  reader.read = null;
  reader.outcome = null;
  openai.length = 0;
  asked.length = 0;
  prompts.length = 0;
  reader.cached = null;
  reader.reads = 0;
});

const clone = (extra: Record<string, unknown> = {}, uid = UID) =>
  db.handler!(new Request("http://x/clone-reel", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ url: URL_, ...extra }) }));

describe("Clone a reel", () => {
  it("counts a reel read through Apify and then written up once, not once per paid call", async () => {
    await clone();
    expect(reader.reads).toBe(1);
    expect(openai.length).toBeGreaterThan(0);
    expect(db.spent).toEqual(["reel-clone"]);
  });

  it("reads a cached post's style for nothing: no count and no OpenAI call", async () => {
    reader.cached = row();
    const res = await clone({ style: true });
    expect(res.status).toBe(200);
    expect((await res.json()).source).toMatchObject({ postId: "7682935406396001567", caption: "6 signs your CPF plan is off track" });
    expect(db.spent).toEqual([]);
    expect(openai).toEqual([]);
    expect(reader.reads).toBe(0);
  });

  const used = (feature = "reel-clone") => db.rows.get(`${UID}|${feature}|${db.today()}`) ?? 0;

  it("gives the use back when the post can't be read or the write fails", async () => {
    reader.outcome = { kind: "failed", code: "not_found" };
    expect((await clone()).status).toBe(404);
    expect(used()).toBe(0);
    reader.outcome = null;
    expect((await clone()).status).toBe(502);
    expect(db.spent).toEqual(["reel-clone", "reel-clone"]);
    expect(used()).toBe(0);
  });

  it("counts a clone retried after the slow answer once, and gives it back when the slow read fails", async () => {
    let finish!: (v: unknown) => void;
    reader.read = () => new Promise((resolve) => (finish = resolve));
    reader.outcome = { kind: "timeout" };
    expect((await clone()).status).toBe(504);
    expect(used()).toBe(1);
    finish({ row: row(), videoUrl: null });
    reader.outcome = null;
    reader.cached = row();
    await clone();
    expect(db.spent.filter((f) => f === "reel-clone")).toEqual(["reel-clone"]);
    expect(used()).toBe(0);

    db.rows.clear();
    db.spent.length = 0;
    reader.cached = null;
    let fail!: (e: unknown) => void;
    reader.read = () => new Promise((_, reject) => (fail = reject));
    reader.outcome = { kind: "timeout" };
    expect((await clone()).status).toBe(504);
    fail(new Error("run ended"));
    await vi.waitFor(() => expect([used(), used(`wait:reel-clone:tiktok:7682935406396001567`)]).toEqual([0, 0]));
  });

  it("writes with the angle and saved positioning sent, and asks as before without them", async () => {
    await clone({ angle: "My own hospital plan story", positioning: { oneLiner: "I help young parents plan", edge: 42 } });
    expect(asked[0]).toContain('Their positioning, as they saved it:\n"""\nPositioning: I help young parents plan\n"""');
    expect(asked[0]).toContain('Their angle for this video, as they typed it:\n"""\nMy own hospital plan story\n"""');
    asked.length = 0;
    await clone();
    expect(asked[0]).toContain("The TikTok video by @leila_tuck:");
    expect(asked[0]).not.toMatch(/Their angle|Their positioning/);
  });
});

// The prompts as they were before standing notes joined the voice (brand-voice-memory), pinned on that code: never
// update the fixture with vitest -u.
describe("the consultant's voice in the prompt", () => {
  const VOICE = {
    summary: "Warm and plain. Short sentences, real clients, no jargon.",
    samples: ["I sat with a young couple last week who had three hospital plans between them and no idea which one paid first."],
    winners: [{ hook: "Most people pay for their hospital stay twice", result: "12,000 views, 340 engagements" }],
  };
  const CONCEPT = { title: "Pay once, not twice", keeps: "The list of signs", changes: "Hospital bills instead of CPF" };

  it("writes today's clone and concept prompts, with a voice and with none", async () => {
    await clone({ voice: VOICE });
    await clone();
    reader.cached = row();
    await clone({ voice: VOICE, concept: CONCEPT });
    expect(prompts).toHaveLength(3);
    await expect(JSON.stringify(prompts, null, 2)).toMatchFileSnapshot("./fixtures/prompts-today.json");
  });

  // on for everyone from 1 Nov 2026 (brand-voice-memory): UID is not on NORTH_STAR_USERS
  it("prints anyone's standing notes in their voice, clipped to 1,200, and keeps a voice of notes only", async () => {
    const NOTES = `ABOUT ME, FROM WHAT I HAVE TOLD YOU:\n- Keep doing or avoid: Never use emoji ${"x".repeat(1300)}`;
    await clone({ voice: { ...VOICE, notes: NOTES } });
    await clone({ voice: { summary: "", samples: [], notes: "Never use emoji" } });
    reader.cached = row();
    await clone({ voice: { ...VOICE, notes: "Never use emoji" }, concept: CONCEPT });
    const line = asked[0].split("\nSummary:")[0].split("The consultant's voice:\n")[1];
    expect(line.startsWith("Their standing notes (follow them): ABOUT ME, FROM WHAT I HAVE TOLD YOU:\n- Keep doing")).toBe(true);
    expect(line.length).toBe("Their standing notes (follow them): ".length + 1200);
    expect(asked[1].endsWith("The consultant's voice:\nTheir standing notes (follow them): Never use emoji")).toBe(true);
    expect(asked[1]).not.toContain("No voice profile yet");
    expect(asked[2]).toContain("The consultant's voice:\nTheir standing notes (follow them): Never use emoji\nSummary: Warm and plain");
    // without notes the prompt is today's, Leo's the same as anyone's
    await clone({ voice: VOICE });
    await clone({ voice: VOICE }, LEO);
    expect(prompts[3]).toEqual((await import("./fixtures/prompts-today.json")).default[0]);
    expect(prompts[4]).toEqual(prompts[3]);
    expect(db.spent).toEqual(["reel-clone", "reel-clone", "reel-concepts", "reel-clone", "reel-clone"]);
  });
});
