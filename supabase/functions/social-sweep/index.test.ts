import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: pg_cron's shared secret first, then the Zernio key, before anything is read or disconnected.
// The sweep itself is tested in logic.test.ts.
const h = vi.hoisted(() => ({
  clients: 0,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => (h.clients++, {}) }));

const SECRET = "sweep-secret-for-tests-only";
const env: Record<string, string | undefined> = {};
const zernio: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => (zernio.push(String(u)), new Response("{}")));
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.clients = 0;
  zernio.length = 0;
  Object.assign(env, { SOCIAL_SWEEP_SECRET: SECRET, ZERNIO_API_KEY: "sk_test" });
});

const call = (body: unknown, secret: string | null = SECRET) =>
  h.handler!(new Request("http://x/social-sweep", { method: "POST", headers: secret === null ? {} : { "x-social-sweep-secret": secret }, body: JSON.stringify(body) }));

describe("the social sweep's gate", () => {
  it("turns away a call without the sweep secret, and every call when the secret isn't set", async () => {
    for (const secret of [null, "", "wrong", SECRET.slice(0, -1)]) expect((await call({ job: "orphans" }, secret)).status, String(secret)).toBe(403);
    for (const unset of [undefined, ""]) {
      env.SOCIAL_SWEEP_SECRET = unset;
      for (const secret of [null, ""]) expect((await call({ job: "orphans" }, secret)).status, `${unset} ${secret}`).toBe(403);
    }
    expect(h.clients).toBe(0);
    expect(zernio).toEqual([]);
  });

  it("does nothing without a Zernio key, and refuses a job it doesn't know", async () => {
    env.ZERNIO_API_KEY = undefined;
    const off = await call({ job: "recount" });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ enabled: false });
    env.ZERNIO_API_KEY = "sk_test";
    expect((await call({ job: "delete-everything" })).status).toBe(400);
    expect(h.clients).toBe(0);
    expect(zernio).toEqual([]);
  });
});
