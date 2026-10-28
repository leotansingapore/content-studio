import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: pg_cron's shared secret first, then the Zernio key, before anything is read or disconnected.
// The sweep itself is tested in logic.test.ts.
const h = vi.hoisted(() => ({
  clients: 0,
  handler: null as null | ((r: Request) => Promise<Response>),
  rows: [] as { owner_id: string; profile_id: string; zernio_profile_id: string }[],
  team: [] as Record<string, unknown>[],
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => {
    h.clients++;
    // cs_social_profiles in pages: the rows, then an empty page
    const q = (after: string | null) => ({ order: () => q(after), limit: () => q(after), gt: (_c: string, v: string) => q(v), then: (ok: (r: unknown) => void) => ok({ data: after ? [] : h.rows, error: null }) });
    return { from: () => ({ select: () => q(null) }) };
  },
}));

const SECRET = "sweep-secret-for-tests-only";
const env: Record<string, string | undefined> = {};
const zernio: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => (zernio.push(String(u)), new Response(new URL(String(u)).pathname.endsWith("/accounts") ? JSON.stringify({ accounts: h.team }) : "{}")));
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

describe("the daily recount's caps", () => {
  it("holds a customer to 3 and Leo (NORTH_STAR_USERS) to ZERNIO_MAX_PER_USER, from the function's own secrets", async () => {
    const LEO = "40f07a18-0000-4000-8000-000000000001";
    const CUSTOMER = "6d80f027-3395-480c-86a1-8827d3d6cce3";
    h.rows = [
      { owner_id: LEO, profile_id: "me", zernio_profile_id: "0123456789abcdef0123456c" },
      { owner_id: CUSTOMER, profile_id: "me", zernio_profile_id: "0123456789abcdef01234561" },
    ];
    h.team = [
      ...Array.from({ length: 5 }, (_, i) => ({ _id: `6500000000000000000000b${i}`, platform: "instagram", profileId: "0123456789abcdef0123456c" })),
      ...Array.from({ length: 4 }, (_, i) => ({ _id: `6500000000000000000000a${i}`, platform: "tiktok", profileId: "0123456789abcdef01234561" })),
    ];
    Object.assign(env, { NORTH_STAR_USERS: LEO, ZERNIO_MAX_PER_USER: "10", ZERNIO_MAX_ACCOUNTS: "10" });
    const res = await call({ job: "recount", dryRun: true });
    expect(await res.json()).toMatchObject({ wouldDisconnect: [{ id: "6500000000000000000000a3" }] });
    // with NORTH_STAR_USERS unset nobody is told apart: everyone keeps ZERNIO_MAX_PER_USER, so Leo's never go
    env.NORTH_STAR_USERS = undefined;
    expect(await (await call({ job: "recount", dryRun: true })).json()).toMatchObject({ wouldDisconnect: [] });
  });
});
