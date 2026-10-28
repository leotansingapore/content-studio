import { describe, expect, it } from "vitest";
import { ZernioError, type ZAccount, type Zernio, type ZernioRequest } from "../_shared/zernio";
import { doneCounts, offList, orphanProfiles, parseSweep, readAllRows, runSweep, secretMatches, sweepZernio, type Env, type MappingRow } from "./logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const GONE = "0f8fad5b-d9cb-469f-a165-70867728950e"; // a deleted user
const LIVE = "0123456789abcdef01234561"; // UID's "me", mapped
const LIVE2 = "0123456789abcdef01234562"; // UID's p2: a row names the brand, not this id (M4 mismatch)
const ORPHAN = "0123456789abcdef0123456a"; // GONE's "me", no row
const A1 = "65000000000000000000a001";
const A2 = "65000000000000000000a002";
const O1 = "65000000000000000000c001";
const O2 = "65000000000000000000c002";
const P_SCHED = "66000000000000000000d001";
const P_FAILED = "66000000000000000000d002";
const P_PUBLISHED = "66000000000000000000d003";
const P_OTHER = "66000000000000000000d004";
const AUTO = "67000000000000000000e001";

const acct = (id: string, profileId: string, extra: Partial<ZAccount> = {}): ZAccount => ({ _id: id, platform: "instagram", profileId, username: id.slice(-4), ...extra });
const ROWS: MappingRow[] = [
  { owner_id: UID, profile_id: "me", zernio_profile_id: LIVE },
  { owner_id: UID, profile_id: "p2", zernio_profile_id: "0123456789abcdef0123456f" },
];
const TEAM = [acct(A1, LIVE), acct(A2, LIVE2), acct(O1, ORPHAN), acct(O2, ORPHAN, { platform: "tiktok" })];
const PROFILES = [
  { _id: "0123456789abcdef01234500", name: "Default" },
  { _id: LIVE, name: `cs_${UID}_me` },
  { _id: LIVE2, name: `cs_${UID}_p2` },
  { _id: ORPHAN, name: `cs_${GONE}_me` },
  { _id: "0123456789abcdef0123450b", name: "cs_not-a-uuid_me" },
];

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
  return { z, calls, keys: () => calls.map((c) => c.key), writes: () => calls.map((c) => c.key).filter((k) => !k.startsWith("GET")) };
}

/** The team as Zernio holds it: accounts by profile, posts by status (a published one slipped into "scheduled"), one auto-DM. */
function team(extra: Record<string, unknown> = {}) {
  return fake({
    "GET /profiles": { profiles: PROFILES },
    "GET /accounts": (req?: ZernioRequest) => ({ accounts: req?.query?.profileId ? TEAM.filter((a) => a.profileId === req.query!.profileId) : TEAM }),
    "GET /posts": (req?: ZernioRequest) => {
      const all = [
        { _id: P_SCHED, status: "scheduled", platforms: [{ accountId: O1 }] },
        // Zernio ignoring the filter must not get a published post deleted
        { _id: P_PUBLISHED, status: "published", platforms: [{ accountId: O1 }] },
        // a live adviser's post on the same list is never the orphan's
        { _id: P_OTHER, status: "scheduled", platforms: [{ accountId: A1 }] },
        { _id: P_FAILED, status: "failed", platforms: [{ accountId: { _id: O2 } }] },
      ];
      const s = req?.query?.status;
      return { posts: s === "scheduled" ? all.filter((p) => p.status !== "failed") : all.filter((p) => p.status === s), pagination: { pages: 1 } };
    },
    "GET /comment-automations": { automations: [{ id: AUTO, accountId: O2 }, { id: "67000000000000000000e002", accountId: A1 }] },
    [`DELETE /posts/${P_SCHED}`]: {},
    [`DELETE /posts/${P_FAILED}`]: {},
    [`DELETE /posts/${P_PUBLISHED}`]: {},
    [`DELETE /comment-automations/${AUTO}`]: {},
    [`DELETE /accounts/${O1}`]: {},
    [`DELETE /accounts/${O2}`]: {},
    [`DELETE /profiles/${ORPHAN}`]: {},
    ...extra,
  });
}

const env = (extra: Partial<Env> = {}): Env => ({ loadRows: async () => ROWS, ownerGone: async (u) => u === GONE, teamCap: 100, allowlist: UID, ...extra });

describe("the request", () => {
  it("takes a job and a boolean dryRun; a dryRun of another type is refused, never read as a real run", () => {
    expect(parseSweep({ job: "recount" })).toEqual({ job: "recount", dryRun: false });
    expect(parseSweep({ job: "orphans", dryRun: true })).toEqual({ job: "orphans", dryRun: true });
    for (const bad of [null, {}, { job: "delete" }, { job: "orphans", dryRun: "true" }, { job: "recount", dryRun: 1 }]) expect(parseSweep(bad)).toBeNull();
  });

  it("matches the secret only exactly", async () => {
    const s = "f3a9c1d2e4b5a6978877665544332211";
    expect(await secretMatches(s, s)).toBe(true);
    for (const wrong of ["", s.slice(0, -1), `${s}x`, s.toUpperCase(), "f3a9"]) expect(await secretMatches(wrong, s)).toBe(false);
  });
});

describe("the sweep's Zernio", () => {
  it("never deletes a profile, even on a real run (M3)", async () => {
    const f = team();
    const done: string[] = [];
    const z = sweepZernio(f.z, false, done);
    for (const path of [`/profiles/${ORPHAN}`, "/profiles"]) await expect(z("DELETE", path)).rejects.toThrow(/refused/);
    await z("DELETE", `/accounts/${O1}`);
    expect(f.writes()).toEqual([`DELETE /accounts/${O1}`]);
    expect(done).toEqual([`DELETE /accounts/${O1}`]);
  });

  it("only reads on a dry run", async () => {
    const f = team();
    const done: string[] = [];
    const z = sweepZernio(f.z, true, done);
    await expect(z("DELETE", `/accounts/${O1}`)).rejects.toThrow(/refused/);
    await expect(z("PUT", `/profiles/${LIVE}`, { body: {} })).rejects.toThrow(/refused/);
    await z("GET", "/profiles");
    expect(f.writes()).toEqual([]);
    expect(done).toEqual([]);
  });
});

describe("the mapping rows", () => {
  it("pages until a page comes back empty, so a row cap never hides a live brand", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ owner_id: UID, profile_id: `p${i}`, zernio_profile_id: `0123456789abcdef0123450${i}` }));
    const asked: (string | null)[] = [];
    // a server that caps every read at 2 rows
    const rows = await readAllRows(async (after) => (asked.push(after), all.filter((r) => after === null || r.zernio_profile_id > after).slice(0, 2)));
    expect(rows).toEqual(all);
    expect(asked).toEqual([null, all[1].zernio_profile_id, all[3].zernio_profile_id, all[4].zernio_profile_id]);
  });

  it("fails closed on a page that does not move forward", async () => {
    let n = 0;
    await expect(readAllRows(async () => (++n > 5 ? Promise.reject(new Error("looped")) : [ROWS[0]]))).rejects.toThrow(/out of order/);
  });
});

describe("orphans (M6)", () => {
  it("takes only cs_<uuid>_<brand> profiles that no row names, by id or by owner and brand", () => {
    expect(orphanProfiles(PROFILES, ROWS)).toEqual([{ id: ORPHAN, owner: GONE }]);
    expect(orphanProfiles([...PROFILES, { _id: "BAD", name: `cs_${GONE}_p1` }, null, { name: `cs_${GONE}_p2` }], ROWS)).toEqual([{ id: ORPHAN, owner: GONE }]);
    expect(orphanProfiles(PROFILES, [...ROWS, { owner_id: GONE, profile_id: "me", zernio_profile_id: ORPHAN }])).toEqual([]);
    // a mapped Zernio id is never an orphan, whatever its name says
    expect(orphanProfiles([{ _id: ROWS[1].zernio_profile_id, name: `cs_${GONE}_p5` }], ROWS)).toEqual([]);
  });

  it("deletes the orphan's pending posts and auto-DMs, then disconnects its accounts, and touches nothing else", async () => {
    const f = team();
    const done: string[] = [];
    const out = await runSweep(sweepZernio(f.z, false, done), { job: "orphans", dryRun: false }, env());
    expect(f.writes()).toEqual([`DELETE /posts/${P_SCHED}`, `DELETE /posts/${P_FAILED}`, `DELETE /comment-automations/${AUTO}`, `DELETE /accounts/${O1}`, `DELETE /accounts/${O2}`]);
    expect(out).toMatchObject({ orphans: 1, found: [{ profileId: ORPHAN, accounts: [O1, O2], posts: [P_SCHED, P_FAILED], automations: [AUTO] }], failed: [], failedWrites: 0 });
    expect(doneCounts(done)).toEqual({ accountsDisconnected: 2, postsDeleted: 2, automationsDeleted: 1, notesWritten: 0 });
    // a profile with a row is never read for posts, auto-DMs or accounts, let alone changed
    expect(f.calls.filter((c) => c.req?.query?.profileId && c.req.query.profileId !== ORPHAN)).toEqual([]);
    // only pending statuses are asked for, and a published post is never deleted
    expect(f.calls.filter((c) => c.key === "GET /posts").map((c) => c.req?.query?.status)).toEqual(["draft", "scheduled", "failed", "partial", "cancelled"]);
    expect(f.keys()).not.toContain(`DELETE /posts/${P_PUBLISHED}`);
    expect(f.keys().filter((k) => k.startsWith("DELETE /profiles"))).toEqual([]);
  });

  it("changes nothing on a dry run and says what it would do", async () => {
    const f = team();
    const done: string[] = [];
    const out = await runSweep(f.z, { job: "orphans", dryRun: true }, env());
    expect(f.writes()).toEqual([]);
    expect(out).toMatchObject({ found: [{ profileId: ORPHAN, accounts: [O1, O2], posts: [P_SCHED, P_FAILED], automations: [AUTO] }] });
    expect(done).toEqual([]);
  });

  it("reads Zernio's profiles before the rows, so a brand mapped meanwhile is never taken for an orphan", async () => {
    const order: string[] = [];
    const f = team({ "GET /profiles": () => (order.push("profiles"), { profiles: PROFILES }) });
    await runSweep(f.z, { job: "orphans", dryRun: true }, env({ loadRows: async () => (order.push("rows"), ROWS) }));
    expect(order).toEqual(["profiles", "rows"]);
  });

  it("leaves an orphan it can't read alone and still clears the rest", async () => {
    const OTHER = "0123456789abcdef0123456b";
    const f = team({
      "GET /profiles": { profiles: [{ _id: OTHER, name: `cs_${GONE}_p9` }, ...PROFILES] },
      "GET /accounts": (req?: ZernioRequest) => {
        // a mismatched account list for OTHER fails closed (M2)
        if (req?.query?.profileId === OTHER) return { accounts: [acct(A1, LIVE)] };
        return { accounts: req?.query?.profileId ? TEAM.filter((a) => a.profileId === req.query!.profileId) : TEAM };
      },
      [`DELETE /accounts/${O1}`]: new ZernioError(500, "", "boom"),
      [`DELETE /accounts/${O2}`]: new ZernioError(404, "", "gone"),
    });
    const out = await runSweep(sweepZernio(f.z, false, []), { job: "orphans", dryRun: false }, env());
    expect(out).toMatchObject({ orphans: 2, failed: [OTHER], failedWrites: 1, found: [{ profileId: ORPHAN }] });
    expect(f.keys()).not.toContain(`DELETE /accounts/${A1}`);
  });

  it("lists, and never changes, mapped advisers off the allowlist who still have accounts", async () => {
    expect(offList(ROWS, TEAM, "someone-else")).toEqual([{ ownerId: UID, profileId: "me", zernioProfileId: LIVE, accounts: 1 }]);
    expect(offList(ROWS, TEAM, ` ${UID} ,`)).toEqual([]);
    expect(offList(ROWS, TEAM, "*")).toEqual([]);
    expect(offList(ROWS, [acct(A1, LIVE, { enabled: false })], "")).toEqual([]);
    const f = team();
    const out = await runSweep(f.z, { job: "orphans", dryRun: true }, env({ allowlist: "" }));
    expect(out).toMatchObject({ offList: [{ ownerId: UID, zernioProfileId: LIVE }] });
  });
});

describe("recount (M5)", () => {
  const NEWEST = "65000000000000000000ff01";
  const recountTeam = () => {
    let description: unknown = null;
    const f = fake({
      "GET /accounts": { accounts: [acct(A1, LIVE), acct(A2, LIVE), acct(NEWEST, LIVE, { username: "bee" })] },
      [`DELETE /accounts/${NEWEST}`]: {},
      [`GET /profiles/${LIVE}`]: () => ({ profile: { _id: LIVE, description } }),
      [`PUT /profiles/${LIVE}`]: (req: ZernioRequest) => ((description = (req.body as { description: string }).description), {}),
    });
    return { f, description: () => description };
  };

  it("disconnects the newest account over the team cap and notes it on the owner's profile, as status does", async () => {
    const { f, description } = recountTeam();
    const done: string[] = [];
    const out = await runSweep(sweepZernio(f.z, false, done), { job: "recount", dryRun: false }, env({ teamCap: 2 }));
    expect(out).toEqual({ accountsLeft: 2 });
    expect(done).toEqual([`DELETE /accounts/${NEWEST}`, `PUT /profiles/${LIVE}`]);
    expect(String(description())).toMatch(/^cs-removed:.*"username":"bee"/);
  });

  it("changes nothing on a dry run and names what it would disconnect", async () => {
    const { f } = recountTeam();
    const out = await runSweep(f.z, { job: "recount", dryRun: true }, env({ teamCap: 2 }));
    expect(out).toEqual({ wouldDisconnect: [{ id: NEWEST, platform: "instagram", profileId: LIVE }] });
    expect(f.writes()).toEqual([]);
  });
});

describe("recount with a customer's cap", () => {
  it("names only a customer's newest past 3 on a dry run, never one of Leo's", async () => {
    const LEO = "0f8fad5b-d9cb-469f-a165-70867728950f";
    const LEO_P = "0123456789abcdef0123456c";
    const rows: MappingRow[] = [...ROWS, { owner_id: LEO, profile_id: "me", zernio_profile_id: LEO_P }];
    const leos = Array.from({ length: 5 }, (_, i) => acct(`6500000000000000000000b${i}`, LEO_P));
    const mine = Array.from({ length: 4 }, (_, i) => acct(`6500000000000000000000a${i}`, i % 2 ? "0123456789abcdef0123456f" : LIVE));
    const f = fake({ "GET /accounts": { accounts: [...leos, ...mine] } });
    const capOf = (owner: string) => (owner === LEO ? 10 : 3);
    const out = await runSweep(f.z, { job: "recount", dryRun: true }, env({ teamCap: 10, loadRows: async () => rows, capOf }));
    expect(out).toEqual({ wouldDisconnect: [{ id: "6500000000000000000000a3", platform: "instagram", profileId: "0123456789abcdef0123456f" }] });
    expect(f.writes()).toEqual([]);
  });
});

describe("review021: a live owner is never cleared", () => {
  it("leaves a profile with no row alone while auth still has its owner (an empty or short rows read, a racing first connect)", async () => {
    const f = team();
    const out = await runSweep(sweepZernio(f.z, false, []), { job: "orphans", dryRun: false }, env({ loadRows: async () => [], ownerGone: async () => false }));
    expect(out).toMatchObject({ orphans: 3, ownerLive: [LIVE, LIVE2, ORPHAN], found: [] });
    expect(f.writes()).toEqual([]);
  });
});
