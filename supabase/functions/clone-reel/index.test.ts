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

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", APIFY_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    openai.push(String(u));
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
  reader.cached = null;
  reader.reads = 0;
});

const clone = (extra: Record<string, unknown> = {}) =>
  db.handler!(new Request("http://x/clone-reel", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify({ url: URL_, ...extra }) }));

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
});
