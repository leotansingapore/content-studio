import { describe, expect, it, vi } from "vitest";
import { NotYours, ZernioError, type ProfileRow, type ZAccount, type Zernio, type ZernioRequest } from "../_shared/zernio";
import { connect, disconnect, errorReply, isAllowed, parseRequest, redirectUrl, status, teamCapOf, type Caller } from "./logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const MINE = "0123456789abcdef01234561";
const THEIRS = "0123456789abcdef01234569";
const A1 = "65000000000000000000a001";
const A2 = "65000000000000000000a002";
const VICTIM = "65000000000000000000b001";

const acct = (id: string, profileId = MINE, extra: Partial<ZAccount> = {}): ZAccount => ({ _id: id, platform: "instagram", profileId, username: id.slice(-4), ...extra });

/** A fake Zernio: "METHOD /path" -> answer or a function of the request. An unrouted call fails the test. */
function fake(routes: Record<string, unknown>) {
  const calls: { key: string; req?: ZernioRequest }[] = [];
  const z: Zernio = async (method, path, req) => {
    const key = `${method} ${path}`;
    calls.push({ key, req });
    if (!(key in routes)) throw new Error(`unexpected Zernio call ${key}`);
    const r = routes[key];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(req) : r;
  };
  return { z, calls, keys: () => calls.map((c) => c.key) };
}

/** GET /accounts answers the team list, or the profile's own list when profileId is asked for. */
const accounts = (team: ZAccount[]) => (req?: ZernioRequest) => {
  const pid = req?.query?.profileId;
  return { accounts: pid ? team.filter((a) => a.profileId === pid) : team };
};

const caller = (extra: Partial<Caller> = {}): Caller => ({ uid: UID, profileId: "me", mapped: MINE, userProfiles: new Set([MINE]), teamCap: 2, ...extra });

describe("the request", () => {
  it("probes with a bare status and otherwise needs a brand profile id", () => {
    expect(parseRequest({ action: "status" })).toEqual({ ok: true, req: { action: "status", profileId: null } });
    expect(parseRequest({ action: "status", profileId: "pmg1x2" })).toEqual({ ok: true, req: { action: "status", profileId: "pmg1x2" } });
    expect(parseRequest({ action: "status", profileId: "ME!" })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "schedule", profileId: "me" })).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest(null)).toMatchObject({ ok: false, status: 400 });
  });

  it("connects only the allowed platforms, never X", () => {
    expect(parseRequest({ action: "connect", profileId: "me", platform: "threads" })).toEqual({
      ok: true,
      req: { action: "connect", profileId: "me", platform: "threads", reconnectAccountId: null },
    });
    for (const platform of ["twitter", "x", "whatsapp", "", undefined]) expect(parseRequest({ action: "connect", profileId: "me", platform })).toMatchObject({ ok: false, status: 400 });
  });

  it("answers a malformed account id with 404 before any other use (H1)", () => {
    expect(parseRequest({ action: "connect", profileId: "me", platform: "instagram", reconnectAccountId: `../accounts/${VICTIM}` })).toEqual({ ok: false, status: 404, error: "Not found." });
    expect(parseRequest({ action: "disconnect", profileId: "me", accountId: A1.toUpperCase() })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "disconnect", profileId: "me" })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "disconnect", profileId: "me", accountId: "", all: true })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "disconnect", profileId: "me", all: true })).toEqual({ ok: true, req: { action: "disconnect", profileId: "me", accountId: null } });
    expect(parseRequest({ action: "disconnect", profileId: "me", accountId: A1 })).toEqual({ ok: true, req: { action: "disconnect", profileId: "me", accountId: A1 } });
  });

  it("lets in only listed users, trimming entries and ignoring empties", () => {
    expect(isAllowed(` ${UID} , ,other`, UID)).toBe(true);
    expect(isAllowed("*", UID)).toBe(true);
    for (const list of [undefined, "", " , ", "other", `${UID}x`]) expect(isAllowed(list, UID), String(list)).toBe(false);
    expect(isAllowed("*", "")).toBe(false);
  });

  it("reads the team cap, 2 unless a whole number is set", () => {
    expect([undefined, "", " ", "abc", "-1", "1.5"].map(teamCapOf)).toEqual([2, 2, 2, 2, 2, 2]);
    expect([teamCapOf("0"), teamCapOf(" 10 ")]).toEqual([0, 10]);
  });

  it("sends Zernio back to a fixed app address", () => {
    expect(redirectUrl("tiktok")).toBe("https://consultant-content-studio.vercel.app/accounts?connected=tiktok");
  });
});

describe("status", () => {
  it("before the first connect reads only the team count", async () => {
    const f = fake({ "GET /accounts": accounts([acct(VICTIM, THEIRS)]) });
    const r = await status(f.z, caller({ mapped: null, userProfiles: new Set() }));
    expect(r.body).toEqual({ enabled: true, accounts: [], removed: [], team: 1, teamCap: 2, user: 0, userCap: 6 });
    expect(f.keys()).toEqual(["GET /accounts"]);
  });

  it("lists the brand's accounts with health, filtered to the caller's", async () => {
    const f = fake({
      "GET /accounts": accounts([acct(A1, MINE, { profileUrl: "https://instagram.com/a001", profilePicture: "javascript:alert(1)" }), acct(VICTIM, THEIRS)]),
      "GET /accounts/health": { accounts: [{ accountId: A1, status: "warning", needsReconnect: true, issues: ["Token expires soon", 3] }, { accountId: VICTIM, status: "error" }] },
    });
    const r = await status(f.z, caller());
    expect(r.body.accounts).toEqual([
      { id: A1, platform: "instagram", username: "a001", name: "a001", url: "https://instagram.com/a001", picture: null, health: "warning", needsReconnect: true, issues: ["Token expires soon"] },
    ]);
    expect(f.calls.find((c) => c.key === "GET /accounts/health")?.req?.query?.profileId).toBe(MINE);
  });

  it("disconnects the caller's newest account over the cap and says so", async () => {
    const NEWEST = "65000000000000000000f00f";
    const f = fake({
      "GET /accounts": accounts([acct(A1), acct(VICTIM, THEIRS), acct(NEWEST)]),
      [`DELETE /accounts/${NEWEST}`]: { message: "ok" },
      "GET /accounts/health": { accounts: [] },
    });
    const r = await status(f.z, caller());
    expect(f.keys()).toContain(`DELETE /accounts/${NEWEST}`);
    expect((r.body.removed as { id: string }[]).map((a) => a.id)).toEqual([NEWEST]);
    expect((r.body.accounts as { id: string }[]).map((a) => a.id)).toEqual([A1]);
    expect(r.body).toMatchObject({ team: 2, user: 1 });
  });

  it("never disconnects another adviser's account, even when it is the newest over the cap", async () => {
    const f = fake({ "GET /accounts": accounts([acct(A1), acct(A2), acct("65000000000000000000ff01", THEIRS)]), "GET /accounts/health": { accounts: [] } });
    const r = await status(f.z, caller());
    expect(f.keys().filter((k) => k.startsWith("DELETE"))).toEqual([]);
    expect(r.body.removed).toEqual([]);
  });
});

describe("connect", () => {
  const row = (stored: string | null = MINE): ProfileRow & { inserts: string[] } => {
    let s = stored;
    const inserts: string[] = [];
    return { inserts, get: async () => s, insert: async (id) => void (inserts.push(id), (s ??= id)) };
  };
  const link = { authUrl: "https://zernio.com/connect/abc" };

  it("hands out the sign-in link for the brand's profile and the fixed redirect", async () => {
    const f = fake({ "GET /accounts": accounts([acct(A1)]), "GET /connect/instagram": link });
    expect((await connect(f.z, caller(), row(), "instagram", null)).body).toEqual(link);
    expect(f.calls[1].req?.query).toEqual({ profileId: MINE, redirect_url: redirectUrl("instagram"), reconnectAccountId: undefined });
  });

  it("creates the brand's Zernio profile on its first connect", async () => {
    const r = row(null);
    const f = fake({ "GET /accounts": accounts([]), "POST /profiles": { profile: { _id: MINE } }, "GET /connect/tiktok": link });
    await connect(f.z, caller({ mapped: null, userProfiles: new Set() }), r, "tiktok", null);
    expect(r.inserts).toEqual([MINE]);
    expect(f.calls[2].req?.query?.profileId).toBe(MINE);
  });

  it("refuses at the team cap and at 6 for one adviser, before making a profile", async () => {
    const full = fake({ "GET /accounts": accounts([acct(A1), acct(VICTIM, THEIRS)]) });
    const r = await connect(full.z, caller({ mapped: null }), row(null), "instagram", null);
    expect(r).toMatchObject({ status: 409, body: { code: "account_cap", team: 2, teamCap: 2 } });
    expect(full.keys()).toEqual(["GET /accounts"]);
    const six = Array.from({ length: 6 }, (_, i) => acct(`6500000000000000000000a${i}`, THEIRS));
    const user = fake({ "GET /accounts": accounts(six) });
    const r2 = await connect(user.z, caller({ mapped: null, userProfiles: new Set([THEIRS]), teamCap: 100 }), row(null), "instagram", null);
    expect(r2).toMatchObject({ status: 409, body: { user: 6, userCap: 6 } });
    expect(user.keys()).toEqual(["GET /accounts"]);
  });

  it("reconnects only a checked account of that platform, and without the cap check", async () => {
    const team = [acct(A1), acct(A2, MINE, { platform: "facebook" }), acct(VICTIM, THEIRS)];
    const f = fake({ "GET /accounts": accounts(team), "GET /connect/instagram": link });
    await connect(f.z, caller(), row(), "instagram", A1);
    expect(f.calls[1].req?.query?.reconnectAccountId).toBe(A1);
    expect(f.calls[0].req?.query?.profileId).toBe(MINE);
    for (const [platform, id] of [["instagram", VICTIM], ["instagram", A2]] as const) {
      const g = fake({ "GET /accounts": accounts(team) });
      await expect(connect(g.z, caller(), row(), platform, id)).rejects.toBeInstanceOf(NotYours);
      expect(g.keys()).toEqual(["GET /accounts"]);
    }
    await expect(connect(fake({}).z, caller({ mapped: null }), row(null), "instagram", A1)).rejects.toBeInstanceOf(NotYours);
  });

  it("refuses a sign-in link that isn't https", async () => {
    const f = fake({ "GET /accounts": accounts([]), "GET /connect/instagram": { authUrl: "javascript:alert(1)" } });
    await expect(connect(f.z, caller(), row(), "instagram", null)).rejects.toBeInstanceOf(ZernioError);
  });
});

describe("disconnect", () => {
  it("disconnects a checked account and nothing else", async () => {
    const f = fake({ "GET /accounts": accounts([acct(A1), acct(VICTIM, THEIRS)]), [`DELETE /accounts/${A1}`]: {} });
    expect((await disconnect(f.z, caller(), A1)).body).toEqual({ disconnected: 1 });
    const g = fake({ "GET /accounts": accounts([acct(A1), acct(VICTIM, THEIRS)]) });
    await expect(disconnect(g.z, caller(), VICTIM)).rejects.toBeInstanceOf(NotYours);
    expect(g.keys()).toEqual(["GET /accounts"]);
  });

  it("disconnects every account in a brand being removed, and nothing when it never connected", async () => {
    const f = fake({ "GET /accounts": accounts([acct(A1), acct(A2), acct(VICTIM, THEIRS)]), [`DELETE /accounts/${A1}`]: {}, [`DELETE /accounts/${A2}`]: {} });
    expect((await disconnect(f.z, caller(), null)).body).toEqual({ disconnected: 2 });
    expect(f.keys().filter((k) => k.startsWith("DELETE"))).toEqual([`DELETE /accounts/${A1}`, `DELETE /accounts/${A2}`]);
    const none = fake({});
    expect((await disconnect(none.z, caller({ mapped: null }), null)).body).toEqual({ disconnected: 0 });
    await expect(disconnect(none.z, caller({ mapped: null }), A1)).rejects.toBeInstanceOf(NotYours);
    expect(none.calls).toEqual([]);
  });
});

describe("errors", () => {
  it("never shows Zernio's own words for a key problem", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorReply(new NotYours("x"))).toEqual({ status: 404, body: { error: "Not found." } });
    expect(errorReply(new ZernioError(402, "free_tier_exceeded", "Add a card"))).toMatchObject({ status: 402, body: { code: "free_tier_exceeded" } });
    expect(errorReply(new ZernioError(401, "invalid_credentials", "Bad key sk_live"))).toEqual({
      status: 503,
      body: { code: "unavailable", error: "Social accounts aren't available right now." },
    });
    expect(errorReply(new ZernioError(504, "timeout", "slow")).status).toBe(504);
    expect(errorReply(new ZernioError(400, "x", "y")).status).toBe(502);
    expect(errorReply(new Error("boom")).status).toBe(500);
  });
});
