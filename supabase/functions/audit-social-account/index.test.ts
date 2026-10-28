import { beforeAll, describe, expect, it, vi } from "vitest";

// The handler hands the app's profession to the refresh, and leaves it out when the app sent none (the runner then reads
// the brand kit). Apify, OpenAI and the database are faked; nothing here reaches a network.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ROW = { id: "a1", user_id: UID, platform: "instagram", handle: "acmewealth", status: "pending", fetched_at: null, refresh_started_at: null, advice: null };

const hub = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), runs: [] as Record<string, unknown>[] }));
vi.mock("../_shared/auditRunner.ts", () => ({
  claimAudit: async () => ROW,
  runAudit: async (opts: Record<string, unknown>) => void hub.runs.push(opts),
}));
// every query chain awaits to the same answer: the audit row, and no runs today
const chain = (answer: unknown): unknown => new Proxy(() => {}, { get: (_t, k) => (k === "then" ? (done: (v: unknown) => void) => done(answer) : () => chain(answer)), apply: () => chain(answer) });
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    from: (table: string) => chain(table === "cs_social_audit_runs" ? { count: 0, data: null, error: null } : { data: ROW, error: null }),
  }),
}));

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", APIFY_API_KEY: "k", OPENAI_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (hub.handler = fn), env: { get: (k: string) => env[k] } });
  await import("./index.ts");
});

const open = async (body: Record<string, unknown>) => {
  hub.runs.length = 0;
  const res = await hub.handler!(new Request("http://x", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ platform: "instagram", handle: "acmewealth", ...body }) }));
  expect(res.status).toBe(200);
  expect(hub.runs).toHaveLength(1);
  return hub.runs[0];
};

describe("audit-social-account: the profession the refresh writes for", () => {
  it("passes the open brand's profession, an adviser's empty one, and none when the app sent none", async () => {
    expect((await open({ profession: "Coach" })).profession).toBe("Coach");
    expect((await open({ profession: "" })).profession).toBe("");
    expect("profession" in (await open({}))).toBe(false);
    expect("profession" in (await open({ profession: 7 }))).toBe(false);
  });
});
