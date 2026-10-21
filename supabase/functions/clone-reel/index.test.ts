import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRow } from "./logic";

// The live handler with the database, the Apify reader and OpenAI faked: what a clone and a style read count.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const URL_ = "https://www.tiktok.com/@leila_tuck/video/7682935406396001567";

const db = vi.hoisted(() => ({
  spent: [] as string[],
  admin: {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.spent.length, error: null }),
  },
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// cs_reel_sources and the Apify read: `cached` is what the cache holds, a read always comes back with `row()`
const reader = vi.hoisted(() => ({ cached: null as unknown, reads: 0 }));
vi.mock("./source.ts", async (original) => ({
  ...(await original<typeof import("./source.ts")>()),
  findSource: async () => reader.cached,
  fetchSource: async () => (reader.reads++, { row: row(), videoUrl: null }),
}));

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
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", APIFY_API_KEY: "k" };
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
});
