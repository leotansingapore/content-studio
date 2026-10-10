import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotYours,
  ZernioError,
  callerAccounts,
  capCounts,
  checkAutomation,
  checkPost,
  disconnectAccount,
  ensureProfile,
  idempotencyKey,
  isZernioId,
  requireAccounts,
  scopedList,
  zernioClient,
  type ProfileRow,
  type ZAccount,
} from "./zernio";

// Node builds its fetch classes the first time one is used: build them while this file loads.
void new Response("");

afterEach(() => vi.restoreAllMocks());

const MINE = "0123456789abcdef01234561"; // the caller's Zernio profile
const THEIRS = "0123456789abcdef01234569"; // another adviser's
const A1 = "65000000000000000000a001";
const A2 = "65000000000000000000a002";
const VICTIM = "65000000000000000000b001"; // another adviser's account
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

type Route = { status?: number; body?: unknown } | ((url: URL, init: RequestInit) => { status?: number; body?: unknown });

/** A fake Zernio: "METHOD /path" -> answer. Records every call; an unrouted call fails the test. */
function fake(routes: Record<string, Route>) {
  const calls: { method: string; path: string; url: URL; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const path = url.pathname.replace(/^\/api\/v1/, "");
    calls.push({ method, path, url, init });
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`unexpected Zernio call ${method} ${path}`);
    const r = typeof route === "function" ? route(url, init) : route;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { z: zernioClient("sk_test", fetchFn as unknown as typeof fetch), calls, fetchFn };
}

const acct = (id: string, profileId: unknown = MINE, extra: Partial<ZAccount> = {}): ZAccount => ({ _id: id, platform: "instagram", profileId, ...extra });
const own = new Set([A1, A2]);

describe("the Zernio client", () => {
  it("sends the key, the JSON body and the idempotency key", async () => {
    const { z, calls } = fake({ "POST /profiles": { status: 201, body: { profile: { _id: MINE } } } });
    expect(await z("POST", "/profiles", { body: { name: "n" }, idempotencyKey: "k1" })).toEqual({ profile: { _id: MINE } });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk_test");
    expect(h["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "n" });
    expect(calls[0].url.origin + calls[0].url.pathname).toBe("https://zernio.com/api/v1/profiles");
  });

  it("surfaces a refusal as {status, code, message}, taking code from code or reason", async () => {
    const { z } = fake({
      "GET /accounts": { status: 401, body: { error: "Bad key", code: "invalid_credentials" } },
      "GET /connect/tiktok": { status: 402, body: { error: "Add a card", reason: "free_tier_exceeded" } },
      "GET /profiles": { status: 500 },
    });
    await expect(z("GET", "/accounts")).rejects.toMatchObject({ status: 401, code: "invalid_credentials", message: "Bad key" });
    await expect(z("GET", "/connect/tiktok")).rejects.toMatchObject({ status: 402, code: "free_tier_exceeded", message: "Add a card" });
    await expect(z("GET", "/profiles")).rejects.toMatchObject({ status: 500, code: "" });
  });

  it("gives up after its timeout with a 504", async () => {
    const slow = vi.fn(async () => {
      throw Object.assign(new Error("slow"), { name: "TimeoutError" });
    });
    const z = zernioClient("sk_test", slow as unknown as typeof fetch);
    await expect(z("GET", "/accounts")).rejects.toMatchObject({ status: 504, code: "timeout" });
    expect((slow.mock.calls[0] as unknown as [URL, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a path that could climb out, before any fetch", async () => {
    const { z, fetchFn } = fake({});
    await expect(z("DELETE", `/posts/../accounts/${VICTIM}`)).rejects.toBeInstanceOf(NotYours);
    await expect(z("GET", "/posts/%2e%2e")).rejects.toBeInstanceOf(NotYours);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("H1: ids are 24 lowercase hex, checked before anything else", () => {
  it("accepts only that shape", () => {
    expect(isZernioId(A1)).toBe(true);
    for (const bad of [A1.toUpperCase(), A1.slice(1), A1 + "0", `../accounts/${VICTIM}`, `${A1}\n`, "", null, 42, { _id: A1 }]) expect(isZernioId(bad), String(bad)).toBe(false);
  });

  it("refuses a path-shaped post, automation or account id without calling Zernio", async () => {
    const { z, fetchFn } = fake({});
    await expect(checkPost(z, own, `../accounts/${VICTIM}`)).rejects.toBeInstanceOf(NotYours);
    await expect(checkAutomation(z, own, "..")).rejects.toBeInstanceOf(NotYours);
    await expect(disconnectAccount(z, `${A1}/../${VICTIM}`)).rejects.toBeInstanceOf(NotYours);
    // shaped like a path segment, so only the id check stops it
    await expect(checkPost(z, own, A1.toUpperCase())).rejects.toBeInstanceOf(NotYours);
    await expect(disconnectAccount(z, "abc")).rejects.toBeInstanceOf(NotYours);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("M2: the caller's account set", () => {
  it("reads the mapped profile with over-limit accounts and accepts a populated profileId", async () => {
    const { z, calls } = fake({ "GET /accounts": { body: { accounts: [acct(A1), acct(A2, { _id: MINE, name: "x" })] } } });
    expect((await callerAccounts(z, MINE)).map((a) => a._id)).toEqual([A1, A2]);
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ profileId: MINE, includeOverLimit: "true" });
  });

  it("fails the whole set when any account sits in another profile", async () => {
    const { z } = fake({ "GET /accounts": { body: { accounts: [acct(A1), acct(VICTIM, THEIRS)] } } });
    await expect(callerAccounts(z, MINE)).rejects.toMatchObject({ code: "scope_mismatch" });
  });

  it("fails closed on a malformed id, a missing profileId or an unreadable list, and never calls without a profile", async () => {
    for (const accounts of [[acct("not-an-id")], [{ _id: A1, platform: "instagram" }], undefined, "nope"]) {
      const { z } = fake({ "GET /accounts": { body: { accounts } } });
      await expect(callerAccounts(z, MINE)).rejects.toBeInstanceOf(ZernioError);
    }
    const { z, fetchFn } = fake({});
    await expect(callerAccounts(z, "")).rejects.toBeInstanceOf(NotYours);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("lets through only requested ids that are all in the set, and never an empty request", () => {
    expect(requireAccounts(own, [A1, A2])).toEqual([A1, A2]);
    expect(() => requireAccounts(own, [A1, VICTIM])).toThrow(NotYours);
    expect(() => requireAccounts(own, [])).toThrow(NotYours);
    expect(() => requireAccounts(own, A1)).toThrow(NotYours);
    expect(() => requireAccounts(new Set(), [A1])).toThrow(NotYours);
  });
});

describe("H2: a post is the caller's only when every platform posts from their accounts", () => {
  const post = (platforms: unknown) => fake({ "GET /posts/65000000000000000000c001": { body: { post: { _id: "65000000000000000000c001", platforms } } } }).z;
  const PID = "65000000000000000000c001";

  it("accepts a post from the caller's accounts, as ids or populated objects", async () => {
    const p = await checkPost(post([{ accountId: A1 }, { accountId: { _id: A2 } }]), own, PID);
    expect(p._id).toBe(PID);
  });

  it("refuses a post with no platforms, missing platforms, or any platform from another account", async () => {
    for (const platforms of [[], undefined, [{ accountId: A1 }, { accountId: VICTIM }], [{ accountId: null }], [{}]]) {
      await expect(checkPost(post(platforms), own, PID), JSON.stringify(platforms)).rejects.toBeInstanceOf(NotYours);
    }
  });

  it("reads a post Zernio doesn't know as not yours", async () => {
    const { z } = fake({ [`GET /posts/${A1}`]: { status: 404, body: { error: "Post not found" } } });
    await expect(checkPost(z, own, A1)).rejects.toBeInstanceOf(NotYours);
  });
});

describe("M1: an automation is the caller's when its accountId is", () => {
  const AID = "65000000000000000000d001";
  it("checks the automation's own accountId", async () => {
    const ok = fake({ [`GET /comment-automations/${AID}`]: { body: { automation: { id: AID, accountId: A1 }, logs: [] } } }).z;
    expect((await checkAutomation(ok, own, AID)).automation.id).toBe(AID);
    const theirs = fake({ [`GET /comment-automations/${AID}`]: { body: { automation: { id: AID, accountId: VICTIM }, logs: [] } } }).z;
    await expect(checkAutomation(theirs, own, AID)).rejects.toBeInstanceOf(NotYours);
    const bare = fake({ [`GET /comment-automations/${AID}`]: { body: { automation: { id: AID } } } }).z;
    await expect(checkAutomation(bare, own, AID)).rejects.toBeInstanceOf(NotYours);
  });
});

describe("H3: list, health and analytics reads", () => {
  it("never calls without the mapped profile", async () => {
    const { z, fetchFn } = fake({});
    await expect(scopedList(z, "/accounts/health", "", own)).rejects.toBeInstanceOf(NotYours);
    await expect(scopedList(z, "/posts", "all", own)).rejects.toBeInstanceOf(NotYours);
    await expect(scopedList(z, "/accounts" as never, MINE, own)).rejects.toThrow("not a scoped list");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("always sends the mapped profileId, even when the query names another", async () => {
    const { z, calls } = fake({ "GET /comment-automations": { body: { automations: [] } } });
    await scopedList(z, "/comment-automations", MINE, own, { profileId: THEIRS });
    expect(calls[0].url.searchParams.getAll("profileId")).toEqual([MINE]);
  });

  it("keeps only the items whose accounts are all the caller's", async () => {
    const { z } = fake({
      "GET /accounts/health": { body: { accounts: [{ accountId: A1, status: "healthy" }, { accountId: VICTIM, status: "error" }, { status: "warning" }] } },
      "GET /posts": { body: { posts: [{ _id: "p1", platforms: [{ accountId: A1 }] }, { _id: "p2", platforms: [{ accountId: A1 }, { accountId: VICTIM }] }, { _id: "p3", platforms: [] }] } },
    });
    expect(await scopedList(z, "/accounts/health", MINE, own)).toEqual([{ accountId: A1, status: "healthy" }]);
    expect(((await scopedList(z, "/posts", MINE, own)) as { _id: string }[]).map((p) => p._id)).toEqual(["p1"]);
  });
});

describe("H4: idempotency keys", () => {
  const CLIENT = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("always carry the JWT user and the brand", () => {
    expect(idempotencyKey(UID, "me", CLIENT)).toBe(`cs:${UID}:me:${CLIENT}`);
    expect(idempotencyKey(UID, "pmg1x2", CLIENT.toUpperCase())).toBe(`cs:${UID}:pmg1x2:${CLIENT}`);
  });
  it("refuse a client part that isn't a UUID, and a missing user", () => {
    for (const bad of ["", "abc", `${CLIENT}:x`, undefined, `cs:${UID}:me:${CLIENT}`]) expect(() => idempotencyKey(UID, "me", bad)).toThrow(NotYours);
    expect(() => idempotencyKey("", "me", CLIENT)).toThrow();
    expect(() => idempotencyKey(UID, "ME!", CLIENT)).toThrow(NotYours);
  });
});

describe("M4: the first connect makes one Zernio profile per brand", () => {
  const rows = (initial: string | null, onInsert?: (id: string) => string) => {
    let stored = initial;
    const inserts: string[] = [];
    const row: ProfileRow = {
      get: async () => stored,
      insert: async (id) => {
        inserts.push(id);
        if (!stored) stored = onInsert ? onInsert(id) : id;
      },
    };
    return { row, inserts };
  };
  const NAME = `cs_${UID}_me`;

  it("uses the stored profile without calling Zernio", async () => {
    const { z, fetchFn } = fake({});
    expect(await ensureProfile(z, rows(MINE).row, UID, "me")).toBe(MINE);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("creates the profile named for the owner and brand, idempotent on that name, and stores it", async () => {
    const { z, calls } = fake({ "POST /profiles": { status: 201, body: { profile: { _id: MINE, name: NAME } } } });
    const r = rows(null);
    expect(await ensureProfile(z, r.row, UID, "me")).toBe(MINE);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: NAME });
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe(NAME);
    expect(r.inserts).toEqual([MINE]);
  });

  it("reuses the existing profile a 409 names", async () => {
    const { z } = fake({ "POST /profiles": { status: 409, body: { error: "exists", code: "profile_name_conflict", details: { existingProfileId: MINE } } } });
    expect(await ensureProfile(z, rows(null).row, UID, "me")).toBe(MINE);
  });

  it("finds the profile by its exact name when a create with the same key is still in flight", async () => {
    const { z, calls } = fake({
      "POST /profiles": { status: 409, body: { error: "in progress" } },
      "GET /profiles": { body: { profiles: [{ _id: THEIRS, name: `${NAME}x` }, { _id: MINE, name: NAME }] } },
    });
    expect(await ensureProfile(z, rows(null).row, UID, "me")).toBe(MINE);
    expect(calls[1].url.searchParams.get("name")).toBe(NAME);
  });

  it("hands out the stored id when a concurrent connect won the insert", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { z } = fake({ "POST /profiles": { status: 201, body: { profile: { _id: THEIRS } } } });
    expect(await ensureProfile(z, rows(null, () => MINE).row, UID, "me")).toBe(MINE);
  });

  it("refuses a malformed profile id Zernio hands back", async () => {
    const { z } = fake({ "POST /profiles": { status: 201, body: { profile: { _id: "../x" } } } });
    const r = rows(null);
    await expect(ensureProfile(z, r.row, UID, "me")).rejects.toBeInstanceOf(ZernioError);
    expect(r.inserts).toEqual([]);
  });
});

describe("M5: caps", () => {
  const team = [
    acct("65000000000000000000a001"),
    acct("65000000000000000000e001", THEIRS),
    acct("65000000000000000000f001", THEIRS, { enabled: false }), // a side-effect account, not billed
    acct("65000000000000000000f002"), // the caller's newest
  ];
  const mineSet = new Set([MINE]);

  it("counts billed accounts on the team and the adviser's across all their brands", () => {
    expect(capCounts(team, mineSet, 2)).toEqual({ team: 3, teamCap: 2, user: 2, userCap: 6 });
    expect(capCounts(team, new Set([MINE, THEIRS]), 2).user).toBe(3);
  });
});

describe("disconnecting", () => {
  it("treats Zernio's 404 for a repeat as done and passes other refusals on", async () => {
    const { z, calls } = fake({ [`DELETE /accounts/${A1}`]: { status: 404, body: { error: "gone" } }, [`DELETE /accounts/${A2}`]: { status: 500 } });
    await expect(disconnectAccount(z, A1)).resolves.toBe(false);
    await expect(disconnectAccount(z, A2)).rejects.toMatchObject({ status: 500 });
    expect(calls.map((c) => c.path)).toEqual([`/accounts/${A1}`, `/accounts/${A2}`]);
  });
});
