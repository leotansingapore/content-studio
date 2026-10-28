import { beforeAll, describe, expect, it, vi } from "vitest";

// The handler writes ideas for the profession the app sent, and today's adviser prompt without one. OpenAI and the
// database are faked; nothing here reaches a network.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const AUDIT_ID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const posts = Array.from({ length: 6 }, (_, k) => ({ id: `p${k}`, url: "", format: "video", caption: `Post ${k}`, postedAt: null, views: 100, likes: 1, comments: 0, shares: null, saves: null, durationSec: 30, pinned: false, collab: false, interactions: 1, ratio: 1, young: false }));
const AUDIT = { id: AUDIT_ID, platform: "instagram", profile: null, posts, stats: { topIds: ["p0"], weakIds: [] } };

const hub = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), systems: [] as string[] }));
const chain = (answer: unknown): unknown => new Proxy(() => {}, { get: (_t, k) => (k === "then" ? (done: (v: unknown) => void) => done(answer) : () => chain(answer)), apply: () => chain(answer) });
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    from: (table: string) => chain(table === "cs_social_audits" ? { data: AUDIT, error: null } : { data: [], count: 0, error: null }),
  }),
}));

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (hub.handler = fn), env: { get: (k: string) => env[k] } });
  // OpenAI is down: the handler gives up after its attempts, having shown us each prompt
  vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => (hub.systems.push(JSON.parse(String(init?.body)).messages[0].content), new Response("down", { status: 503 })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
});

const ask = async (body: Record<string, unknown>) => {
  hub.systems.length = 0;
  await hub.handler!(new Request("http://x", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ auditId: AUDIT_ID, ...body }) }));
  expect(hub.systems.length).toBeGreaterThan(0);
  return hub.systems[0];
};

describe("suggest-post-ideas: the profession the ideas are written for", () => {
  it("writes for the profession the app sent, and for an adviser without one", async () => {
    expect(await ask({ profession: "Real estate agent" })).toContain("You are a short-form content strategist for a real estate agent.");
    expect(await ask({})).toContain("You are a short-form content strategist for a licensed financial consultant in Singapore.");
    expect(await ask({ profession: ["Coach"] })).toContain("for a licensed financial consultant in Singapore.");
  });
});
