import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DIALS, EMPTY_CONTEXT, sanitizeContext } from "./logic.ts";

// The handler on an in-memory cs_ai_jobs and cs_reel_sources: the gate, what each action files, the caps, and what a
// poll answers for each state. It never calls a model, so fetch must never be called.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: { cs_ai_jobs: [] as Row[], cs_reel_sources: [] as Row[], cs_ai_usage: [] as Row[] } as Record<string, Row[]>,
  spent: [] as string[],
  limit: false,
  insertFails: false,
  // runs just before an update applies: a worker acting between the poll's read and its write
  beforeUpdate: null as null | (() => void),
  handler: null as null | ((r: Request) => Promise<Response>),
  admin: {} as Record<string, unknown>,
}));

// A thenable query over one table: eq / in / gt / lt filters, then select, insert, update or delete.
function query(table: string) {
  const rows = () => db.tables[table];
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" | "insert" | "update" | "delete"; values?: Row; head?: boolean } = { kind: "select" };
  const run = () => {
    if (op.kind === "insert" && db.insertFails) return { data: [], error: { message: "check violated" } };
    if (op.kind === "update" && db.beforeUpdate) (db.beforeUpdate(), (db.beforeUpdate = null));
    if (op.kind === "insert") {
      const row = { id: crypto.randomUUID(), status: "queued", created_at: new Date().toISOString(), claimed_at: null, result: null, error: null, ...op.values };
      rows().push(row);
      return { data: [row], error: null };
    }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op.kind === "update") hit.forEach((r) => Object.assign(r, op.values));
    if (op.kind === "delete") db.tables[table] = rows().filter((r) => !hit.includes(r));
    return { data: hit, count: hit.length, error: null };
  };
  const q = {
    // .select() after an insert, update or delete returns its rows; on its own it reads
    select: (_c?: string, o?: { head?: boolean }) => ((op = op.kind === "select" ? { kind: "select", head: o?.head } : op), q),
    insert: (values: Row) => ((op = { kind: "insert", values }), q),
    update: (values: Row) => ((op = { kind: "update", values }), q),
    delete: () => ((op = { kind: "delete" }), q),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    match: (m: Row) => (Object.entries(m).forEach(([k, v]) => filters.push((r) => r[k] === v)), q),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
    gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), q),
    lt: (k: string, v: string) => (filters.push((r) => String(r[k]) < v), q),
    contains: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    single: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.limit ? null : 1, error: null }),
  from: (t: string) => query(t),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "00000000-0000-0000-0000-00000000a001";
// a made-up reel in clone-reel's cache
const TRANSCRIPT = "I quit my agency job in March. Here's what I'd do differently. First, save six months of rent.";
const REEL_URL = "https://www.instagram.com/reel/DMadeUp0001/";
const SOURCE = {
  platform: "instagram", author: "made.up.creator", views: 5120, likes: 64, comments: 9, shares: null, postedAt: "2026-08-23T14:02:11.000Z", caption: "", transcript: TRANSCRIPT,
};
// a job carries inputs only: Claude Code's request is built on Leo's Mac
const noPromptText = (request: unknown) => expect(Object.keys(request as object).filter((k) => ["system", "prompt", "message", "model", "effort"].includes(k))).toEqual([]);
const fetched: string[] = [];
let env: Record<string, string> = {};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: unknown) => (fetched.push(String(u)), new Response("no", { status: 500 })));
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  env = { NORTH_STAR_USERS: `someone,${LEO}`, SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k" };
  db.tables.cs_ai_jobs = [];
  db.tables.cs_reel_sources = [{
    platform: "instagram", post_id: "DMadeUp0001", url: REEL_URL, author: "made.up.creator", caption: "", transcript: TRANSCRIPT, is_video: true,
    posted_at: "2026-08-23T14:02:11.000Z", duration_sec: 12, metrics: { views: 5120, likes: 64, comments: 9, shares: null, saves: null }, metrics_fetched_at: null, aliases: [],
  }];
  db.spent.length = 0;
  db.limit = false;
  db.insertFails = false;
  db.beforeUpdate = null;
  db.tables.cs_ai_usage = [{ user_id: LEO, feature: "script-desk", day: new Date().toISOString().slice(0, 10), count: 1 }];
  fetched.length = 0;
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/script-desk", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const jobs = () => db.tables.cs_ai_jobs;
const done = (id: string, text: string) => Object.assign(jobs().find((j) => j.id === id)!, { status: "done", result: { text, model: "claude-opus-5-5", ms: 9000 }, done_at: new Date().toISOString() });

describe("script-desk", () => {
  it("answers 401 without a sign-in and 403 off NORTH_STAR_USERS, before reading, counting or filing anything", async () => {
    expect((await call({ action: "hooks", topic: "x" }, "")).status).toBe(401);
    expect(await call({ action: "hooks", topic: "x" }, "00000000-0000-0000-0000-00000000b002")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect(await call({ action: "job", id: crypto.randomUUID() }, "00000000-0000-0000-0000-00000000b002")).toMatchObject({ status: 403 });
    // "*" opens nothing: these jobs run on Leo's own plan, and his worker serves listed ids only
    env.NORTH_STAR_USERS = "*";
    expect((await call({ action: "hooks", topic: "x" })).status).toBe(403);
    expect([db.spent, jobs(), fetched]).toEqual([[], [], []]);
  });

  it("refuses a request too big for a row before counting it, and gives the use back when the insert fails", async () => {
    db.tables.cs_reel_sources[0].transcript = "word ".repeat(14_000);
    expect(await call({ action: "rescript", url: REEL_URL })).toMatchObject({ status: 413, body: { code: "too_big" } });
    expect(db.spent).toEqual([]);
    db.insertFails = true;
    expect((await call({ action: "hooks", topic: "x" })).status).toBe(500);
    expect(db.spent).toEqual(["script-desk"]);
    expect(db.tables.cs_ai_usage[0].count).toBe(0);
  });

  it("answers the real state when the worker claims a job just as the poll gives up on it", async () => {
    const { body } = await call({ action: "hooks", topic: "x" });
    const j = jobs()[0];
    j.created_at = new Date(Date.now() - 60_000).toISOString();
    db.beforeUpdate = () => Object.assign(j, { status: "claimed", worker: "mac", claimed_at: new Date().toISOString() });
    expect((await call({ action: "job", id: body.job })).body).toEqual({ status: "claimed" });
    expect(j.status).toBe("claimed");
  });

  it("files Generate as a job with its inputs only, counts one use, and calls no model", async () => {
    const r = await call({ action: "write", entry: "dials", dials: {}, brand: "bizbrand", context: {} });
    expect(r).toEqual({ status: 200, body: { job: expect.any(String), kind: "write", status: "queued" } });
    expect(jobs()).toHaveLength(1);
    const [j] = jobs();
    expect(j).toMatchObject({ owner_id: LEO, profile_id: "bizbrand", kind: "write" });
    expect(j.request).toEqual({ entry: "dials", dials: DEFAULT_DIALS, length: 60, context: EMPTY_CONTEXT });
    noPromptText(j.request);
    await call({ action: "write", entry: "hook", hook: "  Fewer reels,\nbetter reels. ", about: "posting less", band: [30, 45], context: { niche: "bakeries" } });
    expect(jobs()[1].request).toEqual({ entry: "hook", hook: "Fewer reels, better reels.", about: "posting less", band: [30, 45], context: sanitizeContext({ niche: "bakeries" }) });
    expect(db.spent).toEqual(["script-desk", "script-desk"]);
    expect(fetched).toEqual([]);
  });

  it("reads a reel from clone-reel's cache for a breakdown and a re-script, and refuses one never cloned", async () => {
    await call({ action: "breakdown", url: REEL_URL, context: {} });
    // the cache has no outlier ratio
    expect(jobs()[0]).toMatchObject({ kind: "breakdown", request: { source: SOURCE, context: EMPTY_CONTEXT } });
    await call({ action: "rescript", url: REEL_URL, context: { product: { name: "TESTPRODUCT" } } });
    expect(jobs()[1]).toMatchObject({ kind: "rescript", request: { source: SOURCE, context: sanitizeContext({ product: { name: "TESTPRODUCT" } }) } });
    await call({ action: "write", entry: "same-structure", url: REEL_URL, topic: "pricing", breakdown: { hook: { line: "I quit." }, extra: "dropped" } });
    expect(jobs()[2].request).toMatchObject({ entry: "same-structure", source: SOURCE, topic: "pricing", band: [60, 75], breakdown: { hook: { line: "I quit.", type: "" }, idea: "" } });
    jobs().forEach((j) => noPromptText(j.request));
    expect(await call({ action: "breakdown", url: "https://www.instagram.com/reel/Cnevercloned/" })).toEqual({ status: 404, body: { code: "not_cloned", error: "Read this reel on Clone a reel first, then try again." } });
    db.tables.cs_reel_sources[0].transcript = null;
    expect((await call({ action: "rescript", url: REEL_URL })).body.code).toBe("no_words");
    expect(db.spent).toEqual(["script-desk", "script-desk", "script-desk"]);
  });

  it("refuses a missing topic or hook, an unknown action and an unknown entry without counting", async () => {
    for (const b of [{ action: "hooks" }, { action: "write", entry: "hook" }, { action: "write", entry: "topic" }, { action: "write", entry: "poem" }, { action: "nope" }]) {
      expect((await call(b)).status, JSON.stringify(b)).toBe(400);
    }
    expect([db.spent, jobs()]).toEqual([[], []]);
  });

  it("keeps at most four open jobs, stops at the daily cap, and sweeps the owner's week-old rows", async () => {
    jobs().push({ id: crypto.randomUUID(), owner_id: LEO, kind: "hooks", status: "done", created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() });
    for (let i = 0; i < 4; i++) expect((await call({ action: "hooks", topic: `t${i}` })).status).toBe(200);
    expect(jobs()).toHaveLength(4);
    expect(await call({ action: "hooks", topic: "t5" })).toEqual({ status: 429, body: { code: "too_many", error: "Four are already running. Wait for one to finish, then try again." } });
    jobs().forEach((j) => (j.status = "done"));
    db.limit = true;
    expect((await call({ action: "hooks", topic: "t6" })).body.code).toBe("daily_limit");
  });

  it("polls a job through queued, claimed and done, and gives each answer back in its JSON shape", async () => {
    const { body } = await call({ action: "hooks", topic: "cafe owners who dread tax season" });
    expect((await call({ action: "job", id: body.job })).body).toEqual({ status: "queued" });
    Object.assign(jobs()[0], { status: "claimed", worker: "mac", claimed_at: new Date().toISOString() });
    expect((await call({ action: "job", id: body.job })).body).toEqual({ status: "claimed" });
    const hooks = Array.from({ length: 12 }, (_, i) => ({ hook: `Hook number ${i}`, pattern: "contrast pair" }));
    done(body.job, `Here they are:\n\`\`\`json\n${JSON.stringify({ hooks })}\n\`\`\``);
    // the answer only, never the request
    expect((await call({ action: "job", id: body.job })).body).toEqual({ status: "done", result: { hooks } });
  });

  it("fails a job nobody picked up, or that never finished, once, with words to act on", async () => {
    const { body } = await call({ action: "hooks", topic: "x" });
    jobs()[0].created_at = new Date(Date.now() - 60_000).toISOString();
    expect((await call({ action: "job", id: body.job })).body).toEqual({ status: "failed", error: "Your Mac didn't pick this up. Check the script worker is running on it, then try again." });
    expect(jobs()[0]).toMatchObject({ status: "failed", done_at: expect.any(String) });
    const second = (await call({ action: "hooks", topic: "y" })).body.job;
    Object.assign(jobs().find((j) => j.id === second)!, { status: "claimed", worker: "mac", claimed_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    expect((await call({ action: "job", id: second })).body.error).toBe("Claude Code on your Mac didn't finish this. Try again.");
    const third = (await call({ action: "hooks", topic: "z" })).body.job;
    done(third, "I can't help with that.");
    expect((await call({ action: "job", id: third })).body).toEqual({ status: "failed", error: "Claude's answer couldn't be read. Try again." });
  });

  it("never shows one owner's job to another", async () => {
    const { body } = await call({ action: "hooks", topic: "x" });
    env.NORTH_STAR_USERS = `${LEO},00000000-0000-0000-0000-00000000c003`;
    expect(await call({ action: "job", id: body.job }, "00000000-0000-0000-0000-00000000c003")).toMatchObject({ status: 404, body: { code: "gone" } });
    expect(await call({ action: "claims", job: body.job }, "00000000-0000-0000-0000-00000000c003")).toMatchObject({ status: 404 });
  });

  it("files research reads with inputs only, counted apart from writing on their own cap", async () => {
    expect(await call({ action: "ig_reels", handle: "@Made.Up_Creator", known: ["DMadeUp0001", "no good"], context: { niche: "x" } })).toMatchObject({ status: 200, body: { kind: "ig_reels" } });
    expect(jobs()[0].request).toEqual({ handle: "made.up_creator", known: ["DMadeUp0001"], embeds: 12 });
    await call({ action: "ig_reel", url: "https://www.instagram.com/reel/DMadeUp0001/?igsh=1" });
    expect(jobs()[1].request).toEqual({ code: "DMadeUp0001" });
    expect(db.spent).toEqual(["research", "research"]);
    // two reads open, as many as the Mac has read slots: a third waits, a script doesn't
    expect(await call({ action: "discover", topic: "money" })).toMatchObject({ status: 429, body: { code: "too_many" } });
    expect((await call({ action: "hooks", topic: "x" })).status).toBe(200);
    expect(db.spent).toEqual(["research", "research", "script-desk"]);
    jobs().filter((j) => j.kind !== "hooks").forEach((j) => (j.status = "done"));
    await call({ action: "discover", topic: "  money tips for nurses " });
    expect(jobs().at(-1)!.request).toEqual({ mode: "search", topic: "money tips for nurses", max: 6 });
    jobs().forEach((j) => noPromptText(j.request));
  });

  it("gives a read's use back to research, not to writing, when nothing was filed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.tables.cs_ai_usage.push({ user_id: LEO, feature: "research", day: today, count: 3 });
    db.insertFails = true;
    expect((await call({ action: "ig_reels", handle: "made.up_creator" })).status).toBe(500);
    expect(db.spent).toEqual(["research"]);
    expect(db.tables.cs_ai_usage.map((r) => [r.feature, r.count])).toEqual([["script-desk", 1], ["research", 2]]);
  });

  it("counts a search still running at 7 minutes against the two reads, and no writing job left open past its time", async () => {
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    for (let i = 0; i < 2; i++) jobs().push({ id: crypto.randomUUID(), owner_id: LEO, kind: "discover", status: "claimed", created_at: ago(7), claimed_at: ago(7) });
    expect(await call({ action: "ig_reels", handle: "made.up_creator" })).toMatchObject({ status: 429, body: { code: "too_many" } });
    // four scripts claimed 6 minutes ago and never answered: past the 4 minutes a script gets, so they stop nothing
    for (let i = 0; i < 4; i++) jobs().push({ id: crypto.randomUUID(), owner_id: LEO, kind: "hooks", status: "claimed", created_at: ago(6), claimed_at: ago(6) });
    expect((await call({ action: "hooks", topic: "x" })).status).toBe(200);
    expect(db.spent).toEqual(["script-desk"]);
  });

  it("suggests creators from the niche and main audience only, and refuses a bad handle, link or topic without counting", async () => {
    const context = { niche: "money for nurses", avatar: { name: "Nurses", who: "Shift workers" }, me: { name: "Priya" }, sample: "my words" };
    await call({ action: "discover", mode: "suggest", context });
    expect(jobs()[0].request).toEqual({ mode: "suggest", max: 8, context: { ...sanitizeContext(context), sample: "", me: null, product: null } });
    for (const b of [{ action: "ig_reels", handle: "not a handle!" }, { action: "ig_reel", url: "https://example.com/x" }, { action: "discover" }, { action: "discover", mode: "suggest", context: {} }]) {
      expect((await call(b)).status, JSON.stringify(b)).toBeGreaterThanOrEqual(400);
    }
    expect(db.spent).toEqual(["research"]);
  });

  it("gives a read's answer back, a pause too, and gives a search its longer time before calling it stalled", async () => {
    const a = (await call({ action: "ig_reels", handle: "made.up_creator" })).body.job;
    done(a, JSON.stringify({ profile: { handle: "made.up_creator", name: "M", followers: 9, avatar: "", bio: "" }, reels: [{ code: "DMadeUp0001", views: 5 }] }));
    expect((await call({ action: "job", id: a })).body).toMatchObject({ status: "done", result: { profile: { handle: "made.up_creator" }, reels: [{ code: "DMadeUp0001", views: 5 }] } });
    const b = (await call({ action: "ig_reel", url: "DMadeUp0002" })).body.job;
    done(b, JSON.stringify({ paused: { until: "2026-11-04T18:40:00.000Z", why: "login" } }));
    expect((await call({ action: "job", id: b })).body).toEqual({ status: "done", result: { reel: null, paused: { until: "2026-11-04T18:40:00.000Z", why: "login" } } });
    const c = (await call({ action: "discover", topic: "t" })).body.job;
    Object.assign(jobs().find((j) => j.id === c)!, { status: "claimed", worker: "mac", claimed_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    expect((await call({ action: "job", id: c })).body).toEqual({ status: "claimed" });
  });

  it("runs the claim check on a finished re-script, then swaps each unsupported sentence for its placeholder", async () => {
    const product = { product: { name: "TESTPRODUCT", cta: "Comment TEST for the link" } };
    const re = (await call({ action: "rescript", url: REEL_URL, context: product })).body.job;
    expect(await call({ action: "claims", job: re })).toMatchObject({ status: 409, body: { code: "not_ready" } });
    // a re-script that changed nothing has nothing to check, and files no job
    done(re, JSON.stringify({ script: TRANSCRIPT, changes: [], fill: [] }));
    expect(await call({ action: "claims", job: re })).toEqual({ status: 200, body: { status: "done", result: { unsupported: [], script: TRANSCRIPT } } });
    expect(jobs()).toHaveLength(1);
    // one that changed a sentence files a check with the original words, the answer and the re-script's own facts
    const adapted = "I quit my agency job in March. TESTPRODUCT made me $10,000 last month. First, save six months of rent.";
    done(re, JSON.stringify({ script: adapted, changes: [], fill: [] }));
    const check = (await call({ action: "claims", job: re })).body.job;
    const filed = jobs().find((j) => j.id === check)!;
    expect(filed).toMatchObject({ kind: "claims", request: { original: TRANSCRIPT, adapted, context: sanitizeContext(product) } });
    noPromptText(filed.request);
    done(check, JSON.stringify({ unsupported: [{ sentence: "TESTPRODUCT made me $10,000 last month.", claim: "$10,000 last month", fixed: "TESTPRODUCT made me [how much] last month." }] }));
    const r = await call({ action: "job", id: check });
    expect(r.body.result.script).toBe("I quit my agency job in March. TESTPRODUCT made me [how much] last month. First, save six months of rent.");
    expect(db.spent).toEqual(["script-desk", "script-desk"]);
  });
});
