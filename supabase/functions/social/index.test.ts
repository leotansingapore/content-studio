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
const env: Record<string, string> = {};
// a Zernio profile id -> the accounts in it
const accounts: Record<string, unknown[]> = {};
// built once at load: the first Response in a worker is slow
const answer = (body: unknown) => new Response(JSON.stringify(body));
answer({});

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL, init?: RequestInit) => {
    const url = new URL(String(u));
    const method = init?.method ?? "GET";
    zernio.push(`${method === "GET" ? "" : `${method} `}${url.pathname}${url.search}`);
    return answer(url.pathname.endsWith("/accounts") ? { accounts: accounts[url.searchParams.get("profileId") ?? ""] ?? [] } : { profile: {} });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  zernio.length = 0;
  db.spent.length = 0;
  Object.assign(env, { ZERNIO_API_KEY: "sk_test", SOCIAL_CONNECT_USERS: UID });
  for (const k of Object.keys(accounts)) delete accounts[k];
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

  it("counts real numbers against the read cap", async () => {
    await call(UID, { action: "metrics", profileId: "me" });
    await call(UID, { action: "followers", profileId: "me" });
    expect(db.spent).toEqual(["social-read", "social-read"]);
    expect(zernio.every((c) => c.includes(`profileId=${MINE}`))).toBe(true);
  });

  it("counts a post and its retry against the posting cap, each upload link and each auto-DM change against their own, and a cancel as a read", async () => {
    const ID = "0123456789abcdef0123456b";
    await call(UID, { action: "presign", profileId: "me", filename: "slide-1.png", contentType: "image/png", size: 100 });
    await call(UID, { action: "schedule", profileId: "me", accountIds: [ID], clientKey: UID, content: "Hi", mediaUrls: [], now: true });
    await call(UID, { action: "retry", profileId: "me", postId: ID });
    await call(UID, { action: "automation-update", profileId: "me", automationId: ID, active: false });
    await call(UID, { action: "automation-delete", profileId: "me", automationId: ID });
    await call(UID, { action: "cancel", profileId: "me", postId: ID });
    await call(UID, { action: "post", profileId: "me", postId: ID });
    expect(db.spent).toEqual(["social-presign", "social-schedule", "social-schedule", "social-automation-write", "social-automation-write", "social-read", "social-read"]);
  });

  it("spends none of the day's posts on one it refuses: a time that has passed or a file it can't take", async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const r = await call(UID, { action: "schedule", profileId: "me", accountIds: [MINE], clientKey: UID, content: "Hi", mediaUrls: [], scheduledFor: past });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "That time has passed. Pick a later time, or post now." });
    expect((await call(UID, { action: "presign", profileId: "me", filename: "a.gif", contentType: "image/gif", size: 100 })).status).toBe(400);
    expect(db.spent).toEqual([]);
    expect(zernio).toEqual([]);
  });
});

describe("removing a brand", () => {
  const ACC = "0123456789abcdef0123456a";

  it("disconnects its accounts for an adviser since switched off, who still gets nothing else", async () => {
    accounts[THEIRS] = [{ _id: ACC, profileId: THEIRS, platform: "instagram" }];
    const r = await call(UID_B, { action: "disconnect", profileId: "me", all: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ disconnected: 1 });
    expect(zernio).toContain(`DELETE /api/v1/accounts/${ACC}`);
    expect((await call(UID_B, { action: "disconnect", profileId: "me", accountId: ACC })).status).toBe(404);
    expect((await call(UID_B, { action: "status", profileId: "me" })).status).toBe(404);
  });

  it("is refused with no Zernio key while the brand has a Zernio profile, and goes ahead when it never connected", async () => {
    delete env.ZERNIO_API_KEY;
    const kept = await call(UID, { action: "disconnect", profileId: "me", all: true });
    expect(kept.status).toBe(503);
    expect(await kept.json()).toMatchObject({ error: "Social accounts aren't available right now." });
    const none = await call(UID, { action: "disconnect", profileId: "pnever", all: true });
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ disconnected: 0 });
    expect(zernio).toEqual([]);
  });
});
