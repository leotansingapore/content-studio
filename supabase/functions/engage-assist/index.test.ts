import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The live handler with the database, Jev and OpenAI faked: which daily cap each Engage draft is counted on, and
// that a refused cap pays for nothing.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  // null is what cs_consume_ai_usage answers once the cap is reached
  answer: 1 as number | null,
  admin: {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.answer, error: null }),
  },
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const paid: string[] = [];

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    paid.push(String(u).includes("openai") ? "openai" : "jev");
    return new Response("{}", { status: 500 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.spent.length = 0;
  db.answer = 1;
  paid.length = 0;
});

const draft = (body: unknown) =>
  db.handler!(new Request("http://x/engage-assist", { method: "POST", headers: { Authorization: "Bearer u1" }, body: JSON.stringify(body) }));

const REQUESTS = {
  replies: { mode: "replies", comments: [{ name: "Wei Ling", text: "How do I start investing with $500 a month?" }] },
  dms: { mode: "dms", messages: [{ name: "Raj", text: "Hi, can we talk about my hospital plan?" }] },
  thread: { mode: "thread", lines: [{ text: "Thanks for the guide", me: false }, { text: "Glad it helped!", me: true }, { text: "Can we meet next week?", me: false }] },
  comments: { mode: "comments", posts: [{ name: "Jason", text: "Most people retire with less than they planned." }] },
  connect: { mode: "connect", name: "Grace Koh", reason: "We both spoke at the SME finance meetup" },
};

describe("Engage drafts", () => {
  it("count each kind on its own cap, with a conversation on the DM cap", async () => {
    for (const body of Object.values(REQUESTS)) await draft(body);
    expect(db.spent).toEqual(["engage-replies", "engage-dms", "engage-dms", "engage-comments", "engage-connect"]);
  });

  it("ask neither Jev nor OpenAI once the cap is reached", async () => {
    db.answer = null;
    for (const body of Object.values(REQUESTS)) {
      const res = await draft(body);
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ code: "daily_limit" });
    }
    expect(paid).toEqual([]);
  });
});
