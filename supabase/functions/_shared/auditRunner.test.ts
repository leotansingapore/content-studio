import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditError, apifyItems, claimAudit, professionFromRows, runAudit, type AuditTarget } from "./auditRunner";

// The account audit's network half (Analytics' audit card) with Apify and the database faked. Nothing here reaches a network.
// Node builds its fetch classes the first time one is used: build them while this file loads.
void new Response("");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Apify answers each actor from `by` (actor id -> status and body); an unrouted call fails the test. */
function apify(by: Record<string, { status?: number; body: unknown }>) {
  const runs: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const actor = String(input).split("/acts/")[1]?.split("/")[0] ?? "";
    runs.push(actor);
    const a = by[actor];
    if (!a) throw new Error(`unexpected fetch ${String(input)}`);
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body), { status: a.status ?? 200 });
  }));
  return runs;
}

const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof AuditError ? e.message : `not an AuditError: ${String(e)}`;
  }
  return "no error";
};

describe("apifyItems: what the consultant reads when Apify fails", () => {
  const ACTOR = "apify~instagram-profile-scraper";

  it("says audits are paused when the scraping account is out of credit, by status or by Apify's words", async () => {
    const paused = "Account audits are paused while the scraping account is sorted out. Try again later.";
    apify({ [ACTOR]: { status: 402, body: "" } });
    expect(await reason(apifyItems(ACTOR, {}, "t"))).toBe(paused);
    apify({ [ACTOR]: { status: 403, body: '{"error":{"type":"platform-feature-disabled","message":"Monthly usage limit exceeded"}}' } });
    expect(await reason(apifyItems(ACTOR, {}, "t"))).toBe(paused);
  });

  it("says the platform took too long on a timeout, and couldn't read the account on any other failure", async () => {
    const slow = "The platform took too long to answer. Try again in a few minutes.";
    apify({ [ACTOR]: { status: 408, body: "run timed out" } });
    expect(await reason(apifyItems(ACTOR, {}, "t"))).toBe(slow);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("The signal has been aborted", "TimeoutError");
    }));
    expect(await reason(apifyItems(ACTOR, {}, "t"))).toBe(slow);
    apify({ [ACTOR]: { status: 500, body: "actor crashed" } });
    expect(await reason(apifyItems(ACTOR, {}, "t"))).toBe("Couldn't read the account right now. Try again in a few minutes.");
  });
});

/** The service-role client: records each update and insert, and fails the ones named in `failing`. `synced`: cs_user_data rows. */
function admin(failing: { update?: boolean } = {}, synced: { key: string; data: string }[] = []) {
  const updates: Record<string, unknown>[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let failed = false;
  const db = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ or: async (f: string) => (reads.push(`${table} ${f}`), { data: synced, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(v);
          // only the first write fails, so the failure itself can still be recorded
          if (failing.update && !failed) return (failed = true), { error: { message: "write failed" } };
          return { error: null };
        },
      }),
      insert: async (row: Record<string, unknown>) => (inserts.push({ table, row }), { error: null }),
    }),
  };
  return { db, updates, inserts, reads };
}

const AUDIT: AuditTarget = { id: "a1", user_id: "u1", platform: "instagram", handle: "acmewealth" };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const igPosts = (n: number) =>
  Array.from({ length: n }, (_, k) => ({ shortCode: `C${k}`, type: "Image", likesCount: 40 + k, commentsCount: 3, timestamp: daysAgo(k + 3), ownerUsername: "acmewealth" }));

describe("runAudit: what the audit card ends up showing", () => {
  it("marks the audit failed with the reason the consultant can fix, and writes no snapshot", async () => {
    apify({
      "apify~instagram-profile-scraper": { body: [{ username: "acmewealth", followersCount: 900, private: true }] },
      "apify~instagram-post-scraper": { body: [] },
    });
    const a = admin();
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t" });
    expect(a.updates).toEqual([{ status: "error", error: "@acmewealth is private, so its posts can't be read. Make the account public, then refresh." }]);
    expect(a.inserts).toEqual([]);

    apify({
      "apify~instagram-profile-scraper": { body: [{ username: "acmewealth", followersCount: 900 }] },
      "apify~instagram-post-scraper": { body: [] },
    });
    const b = admin();
    await runAudit({ admin: b.db, audit: AUDIT, apifyKey: "t" });
    expect(b.updates).toEqual([{ status: "error", error: "@acmewealth has no public posts we can read yet." }]);
  });

  it("writes a readable account as ready with its posts and stats, then a snapshot for the trend line", async () => {
    apify({
      "apify~instagram-profile-scraper": { body: [{ username: "acmewealth", fullName: "Acme Wealth", followersCount: 900 }] },
      "apify~instagram-post-scraper": { body: [...igPosts(4), igPosts(1)[0]] }, // a repeat of C0
    });
    const a = admin();
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t" });
    expect(a.updates).toHaveLength(1);
    const ready = a.updates[0] as { status: string; error: null; posts: { id: string }[]; profile: { followers: number }; advice: null; fetched_at: string };
    expect(ready).toMatchObject({ status: "ready", error: null, advice: null, profile: { followers: 900 } });
    expect(ready.posts.map((p) => p.id)).toEqual(["C0", "C1", "C2", "C3"]);
    expect(a.inserts).toEqual([
      { table: "cs_social_snapshots", row: expect.objectContaining({ audit_id: "a1", user_id: "u1", taken_at: ready.fetched_at, followers: 900, posts_analyzed: 4 }) },
    ]);
  });

  it("says something went wrong, in plain words, when the audit can't be saved", async () => {
    apify({
      "apify~instagram-profile-scraper": { body: [{ username: "acmewealth", followersCount: 900 }] },
      "apify~instagram-post-scraper": { body: igPosts(3) },
    });
    const a = admin({ update: true });
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t" });
    expect(a.updates.at(-1)).toEqual({ status: "error", error: "Something went wrong reading the account. Try again in a few minutes." });
    expect(a.inserts).toEqual([]);
  });
});

describe("claimAudit", () => {
  /** The row as it reads back after the claim's update. */
  const db = (row: Record<string, unknown> | null) => ({
    from: () => ({
      update: () => ({ eq: () => ({ or: async () => ({ error: null }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    }),
  });

  it("gives an audit to one refresh only: a row that reads back with another run's start time is not ours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    const mine = new Date().toISOString();
    try {
      const ours = { ...AUDIT, status: "refreshing", refresh_started_at: mine.replace("Z", "+00:00") };
      expect(await claimAudit(db(ours), "a1")).toEqual(ours);
      const theirs = { ...AUDIT, status: "refreshing", refresh_started_at: new Date(Date.now() - 30_000).toISOString() };
      expect(await claimAudit(db(theirs), "a1")).toBeNull();
      expect(await claimAudit(db(null), "a1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the advice is written for the brand that holds the account", () => {
  const U = AUDIT.user_id;
  const row = (key: string, v: unknown) => ({ key, data: JSON.stringify(v) });
  const kit = (scope: string, profession?: string) => row(`content-studio-carousel-brand-${scope}`, { color: "#000", ...(profession ? { profession } : {}) });
  const accounts = (scope: string, instagram: string) => row(`content-studio-socialaccounts-${scope}`, { instagram: { handle: instagram, connectedAt: "x" } });

  it("reads the profession of the brand whose saved account is the audited handle, else the first brand's", () => {
    const rows = [kit(U, "Coach"), kit(`${U}~pb2`, "Real estate agent"), accounts(U, "@someone.else"), accounts(`${U}~pb2`, "https://www.instagram.com/AcmeWealth/")];
    expect(professionFromRows(AUDIT, rows)).toBe("Real estate agent");
    expect(professionFromRows({ ...AUDIT, handle: "nobody" }, rows)).toBe("Coach");
    // another user's rows never count, and an unreadable kit is an adviser's
    expect(professionFromRows(AUDIT, [kit("u2", "Lawyer"), accounts("u2", "acmewealth")])).toBe("");
    expect(professionFromRows(AUDIT, [{ key: `content-studio-carousel-brand-${U}`, data: "{not json" }])).toBe("");
    expect(professionFromRows(AUDIT, [kit(U)])).toBe("");
  });

  /** Apify reads 6 posts, OpenAI's system prompts are kept. */
  function apifyAndOpenAi() {
    const systems: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.openai.com/")) {
        systems.push(JSON.parse(String(init?.body)).messages[0].content);
        return new Response("down", { status: 503 });
      }
      const actor = url.split("/acts/")[1]?.split("/")[0] ?? "";
      if (actor === "apify~instagram-profile-scraper") return new Response(JSON.stringify([{ username: "acmewealth", followersCount: 900 }]));
      if (actor === "apify~instagram-post-scraper") return new Response(JSON.stringify(igPosts(6)));
      throw new Error(`unexpected fetch ${url}`);
    }));
    return systems;
  }

  it("uses the profession the app sent without reading the brand kit, and reads it when none came (the weekly job)", async () => {
    const synced = [kit(U, "Real estate agent")];
    let systems = apifyAndOpenAi();
    let a = admin({}, synced);
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t", openaiKey: "k", profession: "Coach" });
    expect(systems[0]).toContain("You audit the Instagram account of a coach.");
    expect(a.reads).toEqual([]);

    systems = apifyAndOpenAi();
    a = admin({}, synced);
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t", openaiKey: "k", profession: "" });
    expect(systems[0]).toContain("You audit the Instagram account of a licensed financial consultant in Singapore.");
    expect(a.reads).toEqual([]);

    systems = apifyAndOpenAi();
    a = admin({}, synced);
    await runAudit({ admin: a.db, audit: AUDIT, apifyKey: "t", openaiKey: "k" });
    expect(systems[0]).toContain("You audit the Instagram account of a real estate agent.");
    expect(a.reads).toEqual([`cs_user_data key.like.content-studio-socialaccounts-${U}*,key.like.content-studio-carousel-brand-${U}*`]);
  });
});
