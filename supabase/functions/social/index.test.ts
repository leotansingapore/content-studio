import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_ACTIONS } from "./automations.ts";

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
// the JSON body of each Zernio call, in order
const sent: { call: string; body: Record<string, unknown> | undefined }[] = [];
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
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ call: `${method} ${url.pathname}`, body });
    if (url.pathname.endsWith("/accounts")) return answer({ accounts: accounts[url.searchParams.get("profileId") ?? ""] ?? [] });
    if (url.pathname.endsWith("/accounts/health")) return answer({ accounts: [] });
    // a created post, shaped as https://docs.zernio.com/posts/create-post.mdx answers it
    if (method === "POST" && url.pathname === "/api/v1/posts" && body?.dryRun === true) return answer({ dryRun: true, canPublish: true, tiktok: [] });
    if (method === "POST" && url.pathname === "/api/v1/posts" && Array.isArray(body?.platforms)) {
      return answer({ post: { _id: "67000000000000000000d001", status: "scheduled", platforms: body.platforms.map((p: { platform: string; accountId: string }) => ({ ...p, status: "pending" })) } });
    }
    return answer({ profile: {} });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  zernio.length = 0;
  sent.length = 0;
  db.spent.length = 0;
  Object.assign(env, { ZERNIO_API_KEY: "sk_test", SOCIAL_CONNECT_USERS: UID });
  delete env.NORTH_STAR_USERS;
  delete env.ZERNIO_MAX_PER_USER;
  delete env.ZERNIO_MAX_ACCOUNTS;
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

  it("refuses a thread from an adviser off NORTH_STAR_USERS before counting a use or calling Zernio", async () => {
    const ID = "0123456789abcdef0123456b";
    const res = await call(UID, { action: "schedule", profileId: "me", accountIds: [ID], clientKey: UID, content: "Hi", mediaUrls: [], now: true, thread: ["One.", "Two."] });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.spent).toEqual([]);
    expect(zernio).toEqual([]);
  });

  it("refuses a PDF upload link from an adviser off NORTH_STAR_USERS before counting a use or calling Zernio", async () => {
    const res = await call(UID, { action: "presign", profileId: "me", filename: "carousel.pdf", contentType: "application/pdf", size: 100 });
    expect(res.status).toBe(403);
    expect(db.spent).toEqual([]);
    expect(zernio).toEqual([]);
  });

  it("keeps Auto-DM to NORTH_STAR_USERS: a caller switched on for posting is refused every automation action before a use is counted or Zernio is called", async () => {
    const ID = "0123456789abcdef0123456b";
    const asks: Record<string, unknown>[] = [
      { action: "automations", profileId: "me" },
      { action: "account-posts", profileId: "me", accountId: ID },
      { action: "automation-create", profileId: "me", accountId: ID, automation: { keywords: ["guide"], dm: "Here it is." } },
      { action: "automation-create", profileId: "me", accountId: ID, automation: { trigger: "comment", everyComment: true, dm: "", reply: "Thanks!" } },
      { action: "automation-update", profileId: "me", automationId: ID, active: true },
      { action: "automation-delete", profileId: "me", automationId: ID },
      { action: "automation-logs", profileId: "me", automationId: ID },
    ];
    // every automation action is asked once
    expect([...new Set(asks.map((b) => b.action))].sort()).toEqual([...AUTOMATION_ACTIONS].sort());
    for (const body of asks) {
      const res = await call(UID, body);
      expect(res.status, String(body.action)).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect(db.spent).toEqual([]);
    expect(zernio).toEqual([]);
    // the same caller still posts
    const res = await call(UID, { action: "schedule", profileId: "me", accountIds: [ID], clientKey: UID, content: "Hi", mediaUrls: [], now: true });
    expect(res.status).not.toBe(403);
    expect(db.spent).toEqual(["social-schedule"]);
  });

  it("keeps Leo's own Auto-DM working (NORTH_STAR_USERS)", async () => {
    env.NORTH_STAR_USERS = `${UID_B}, ${UID}`;
    const res = await call(UID, { action: "automations", profileId: "me" });
    expect(res.status).toBe(200);
    expect(db.spent).toEqual(["social-read"]);
    expect(zernio).toContain(`/api/v1/accounts?profileId=${MINE}&includeOverLimit=true`);
  });

  it("holds a customer to 3 accounts and Leo (NORTH_STAR_USERS) to ZERNIO_MAX_PER_USER, and a customer's call never disconnects Leo's", async () => {
    Object.assign(env, { SOCIAL_CONNECT_USERS: `${UID},${UID_B}`, NORTH_STAR_USERS: UID_B, ZERNIO_MAX_PER_USER: "10", ZERNIO_MAX_ACCOUNTS: "10" });
    const leo = Array.from({ length: 5 }, (_, i) => ({ _id: `6500000000000000000000b${i}`, platform: "instagram", profileId: THEIRS }));
    const mine = Array.from({ length: 3 }, (_, i) => ({ _id: `6500000000000000000000a${i}`, platform: "tiktok", profileId: MINE }));
    Object.assign(accounts, { "": [...leo, ...mine], [MINE]: mine, [THEIRS]: leo });
    const refused = await call(UID, { action: "connect", profileId: "me", platform: "instagram" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ code: "account_cap", error: "You can have 3 accounts connected. Disconnect one to connect another.", team: 8, teamCap: 10, user: 3, userCap: 3 });
    const leoStatus = await call(UID_B, { action: "status", profileId: "me" });
    expect(await leoStatus.json()).toMatchObject({ team: 8, user: 5, userCap: 10 });
    expect(zernio.filter((c) => c.startsWith("DELETE"))).toEqual([]);
    // a customer's 4th (a link collected earlier) goes on the next call by anyone, newest first; Leo's stay
    accounts[""] = [...leo, ...mine, { _id: "6500000000000000000000a9", platform: "threads", profileId: MINE }];
    await call(UID_B, { action: "status", profileId: "me" });
    expect(zernio.filter((c) => c.startsWith("DELETE"))).toEqual(["DELETE /api/v1/accounts/6500000000000000000000a9"]);
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
    // Auto-DM is Leo's (NORTH_STAR_USERS)
    env.NORTH_STAR_USERS = UID;
    await call(UID, { action: "automation-update", profileId: "me", automationId: ID, active: false });
    await call(UID, { action: "automation-delete", profileId: "me", automationId: ID });
    await call(UID, { action: "cancel", profileId: "me", postId: ID });
    await call(UID, { action: "post", profileId: "me", postId: ID });
    expect(db.spent).toEqual(["social-presign", "social-schedule", "social-schedule", "social-automation-write", "social-automation-write", "social-read", "social-read"]);
  });

  it("pinned: every action today counts the cap it counted before phase 7a", async () => {
    const ID = "0123456789abcdef0123456b";
    const today: [Record<string, unknown>, string][] = [
      [{ action: "status", profileId: "me" }, "social-read"],
      [{ action: "connect", profileId: "me", platform: "instagram" }, "social-connect"],
      [{ action: "disconnect", profileId: "me", accountId: ID }, "social-read"],
      [{ action: "presign", profileId: "me", filename: "slide-1.png", contentType: "image/png", size: 100 }, "social-presign"],
      [{ action: "schedule", profileId: "me", accountIds: [ID], clientKey: UID, content: "Hi", mediaUrls: [], now: true }, "social-schedule"],
      [{ action: "post", profileId: "me", postId: ID }, "social-read"],
      [{ action: "cancel", profileId: "me", postId: ID }, "social-read"],
      [{ action: "retry", profileId: "me", postId: ID }, "social-schedule"],
      [{ action: "tiktok-creator-info", profileId: "me", accountId: ID }, "social-read"],
      [{ action: "automations", profileId: "me" }, "social-read"],
      [{ action: "automation-create", profileId: "me", accountId: ID, automation: { keywords: ["guide"], dm: "Here it is." } }, "social-automation-write"],
      [{ action: "automation-update", profileId: "me", automationId: ID, active: false }, "social-automation-write"],
      [{ action: "automation-delete", profileId: "me", automationId: ID }, "social-automation-write"],
      [{ action: "automation-logs", profileId: "me", automationId: ID }, "social-read"],
      [{ action: "account-posts", profileId: "me", accountId: ID }, "social-read"],
      [{ action: "metrics", profileId: "me" }, "social-read"],
      [{ action: "followers", profileId: "me" }, "social-read"],
      [{ action: "best-time", profileId: "me" }, "social-read"],
    ];
    for (const [body, cap] of today) {
      db.spent.length = 0;
      // Auto-DM is Leo's (NORTH_STAR_USERS); everything else is pinned for a caller off it
      if ((AUTOMATION_ACTIONS as readonly string[]).includes(String(body.action))) env.NORTH_STAR_USERS = UID;
      else delete env.NORTH_STAR_USERS;
      await call(UID, body);
      expect(db.spent, String(body.action)).toEqual([cap]);
    }
  });

  it("counts a move against the posting cap, for a SOCIAL_CONNECT_USERS caller off NORTH_STAR_USERS too", async () => {
    const ID = "0123456789abcdef0123456b";
    const at = new Date(Date.now() + 7 * 86400_000).toISOString();
    const res = await call(UID, { action: "move", profileId: "me", postId: ID, scheduledFor: at });
    expect(res.status).not.toBe(403);
    expect(db.spent).toEqual(["social-schedule"]);
    expect(zernio).toContain(`/api/v1/posts/${ID}`);
  });

  describe("phase 7a's new schedule fields", () => {
    const TT = "65000000000000000000a002";
    const IG = "65000000000000000000a001";
    const PNG = "https://media.zernio.com/temp/1_a_slide-01.png";
    const today = () => ({
      action: "schedule",
      profileId: "me",
      accountIds: [TT, IG],
      clientKey: UID,
      content: "Three things to check before you renew.",
      mediaUrls: [PNG],
      scheduledFor: new Date(Date.now() + 8 * 86400_000).toISOString(),
      tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true },
    });
    // every field 7a adds to a schedule, each in a shape a listed caller may send
    const withNew = () => {
      const b = today();
      return {
        ...b,
        tiktok: { ...b.tiktok, mode: "inbox" },
        instagram: { placement: "feed", collaborators: ["moneybees"], commentsOff: true },
        facebook: { placement: "story" },
        linkedin: { poll: { question: "Which do you check first?", options: ["Premiums", "Cover"], days: 3 } },
      };
    };
    const posted = () => sent.filter((s) => s.call === "POST /api/v1/posts").map((s) => s.body);

    it("sends today's body for a caller off NORTH_STAR_USERS, whatever new fields come with it", async () => {
      accounts[MINE] = [{ _id: TT, platform: "tiktok", profileId: MINE }, { _id: IG, platform: "instagram", profileId: MINE }];
      const plain = today();
      expect((await call(UID, plain)).status).toBe(200);
      expect((await call(UID, { ...withNew(), scheduledFor: plain.scheduledFor })).status).toBe(200);
      const [a, b] = posted();
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      // the same request from a listed caller reads them
      env.NORTH_STAR_USERS = UID;
      expect((await call(UID, { ...withNew(), scheduledFor: plain.scheduledFor })).status).toBe(200);
      expect(JSON.stringify(posted()[2])).not.toBe(JSON.stringify(a));
      expect(JSON.stringify(posted()[2])).toContain('"tiktokSettings":{"draft":true');
      expect(JSON.stringify(posted()[2])).toContain('"collaborators":["moneybees"],"commentsEnabled":false');
    });

    it("refuses a check off NORTH_STAR_USERS before a use or a Zernio call, so it can never post for real", async () => {
      const res = await call(UID, { ...today(), check: true });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
      expect(db.spent).toEqual([]);
      expect(zernio).toEqual([]);
    });

    it("counts a listed caller's check against the posting cap and sends TikTok as a dry run", async () => {
      env.NORTH_STAR_USERS = UID;
      accounts[MINE] = [{ _id: TT, platform: "tiktok", profileId: MINE }];
      const res = await call(UID, { ...today(), accountIds: [TT], check: true });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ check: { ok: true, problems: [] } });
      expect(db.spent).toEqual(["social-schedule"]);
      expect(posted()).toEqual([expect.objectContaining({ dryRun: true })]);
    });
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
