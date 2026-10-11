import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler itself: who gets in, whose Zernio profile "me" is, and which daily cap an action spends.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const UID_B = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MINE = "0123456789abcdef01234561";
const THEIRS = "0123456789abcdef01234569";

const db = vi.hoisted(() => {
  // every adviser's first brand is "me": the other adviser's row comes first
  const rows = [
    { owner_id: "0f8fad5b-d9cb-469f-a165-70867728950e", profile_id: "me", zernio_profile_id: "0123456789abcdef01234569" },
    { owner_id: "6d80f027-3395-480c-86a1-8827d3d6cce3", profile_id: "me", zernio_profile_id: "0123456789abcdef01234561" },
  ];
  const spent: string[] = [];
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (spent.push(String(a.p_feature)), { data: 1, error: null }),
    from: () => ({
      select: () => {
        const where: [string, unknown][] = [];
        const q = {
          data: rows,
          error: null,
          eq: (c: string, v: unknown) => (where.push([c, v]), q),
          maybeSingle: async () => ({ data: rows.find((r) => where.every(([c, v]) => (r as Record<string, unknown>)[c] === v)) ?? null, error: null }),
        };
        return q;
      },
      upsert: async () => ({ error: null }),
    }),
  };
  return { admin, spent, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const zernio: string[] = [];
// built once at load: the first Response in a worker is slow
const answer = (body: unknown) => new Response(JSON.stringify(body));
answer({});

beforeAll(async () => {
  const env: Record<string, string> = { ZERNIO_API_KEY: "sk_test", SOCIAL_CONNECT_USERS: UID };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL) => {
    const url = new URL(String(u));
    zernio.push(url.pathname + url.search);
    return answer(url.pathname.endsWith("/accounts") ? { accounts: [] } : { profile: {} });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  zernio.length = 0;
  db.spent.length = 0;
});

const call = (uid: string, body: unknown) =>
  db.handler!(new Request("http://x/social", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));

describe("the social function", () => {
  it("keeps an adviser who isn't switched on away from Zernio and their daily uses", async () => {
    expect((await call(UID_B, { action: "status", profileId: "me" })).status).toBe(404);
    const probe = await call(UID_B, { action: "status" });
    expect(probe.status).toBe(200);
    expect(await probe.json()).toEqual({ enabled: false });
    expect(zernio).toEqual([]);
    expect(db.spent).toEqual([]);
  });

  it("reads the caller's own Zernio profile for their \"me\", never another adviser's", async () => {
    expect((await call(UID, { action: "status", profileId: "me" })).status).toBe(200);
    expect(zernio).toContain(`/api/v1/accounts?profileId=${MINE}&includeOverLimit=true`);
    expect(zernio.some((c) => c.includes(THEIRS))).toBe(false);
  });

  it("counts a sign-in link against the connect cap and a status against the read cap", async () => {
    await call(UID, { action: "connect", profileId: "me", platform: "instagram" });
    await call(UID, { action: "status", profileId: "me" });
    expect(db.spent).toEqual(["social-connect", "social-read"]);
  });
});
