import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The worker's door with the database faked: the secret, who a claim may serve, what a claim hands over, and that only
// the claiming worker's answer lands.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  rpcs: [] as Record<string, unknown>[],
  handler: null as null | ((r: Request) => Promise<Response>),
  admin: {} as Record<string, unknown>,
}));
db.admin = {
  rpc: async (_fn: string, a: Record<string, unknown>) => {
    db.rpcs.push(a);
    const owners = a.p_owners as string[];
    const row = db.rows.find((r) => r.status === "queued" && owners.includes(String(r.owner_id)));
    if (row) Object.assign(row, { status: "claimed", worker: a.p_worker });
    return { data: row ? [row] : [], error: null };
  },
  from: () => {
    const f: ((r: Row) => boolean)[] = [];
    let values: Row = {};
    const q = {
      update: (v: Row) => ((values = v), q),
      eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), q),
      select: async () => {
        const hit = db.rows.filter((r) => f.every((x) => x(r)));
        hit.forEach((r) => Object.assign(r, values));
        return { data: hit, error: null };
      },
    };
    return q;
  },
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "00000000-0000-0000-0000-00000000a001";
const OTHER = "00000000-0000-0000-0000-00000000b002";
const SECRET = "s".repeat(40);
let env: Record<string, string> = {};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  env = { SCRIPT_WORKER_SECRET: SECRET, NORTH_STAR_USERS: `*,${LEO}`, SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k" };
  db.rpcs.length = 0;
  db.rows = [
    { id: "10000000-0000-0000-0000-000000000001", owner_id: OTHER, kind: "hooks", status: "queued", request: { topic: "theirs", context: {} } },
    { id: "10000000-0000-0000-0000-000000000002", owner_id: LEO, kind: "rescript", status: "queued", request: { source: { author: "x", transcript: "words" }, context: { me: { name: "Leo" } } } },
  ];
});

const call = async (body: unknown, secret: string | null = SECRET) => {
  const r = await db.handler!(new Request("http://x/script-worker", { method: "POST", headers: secret === null ? {} : { "x-script-worker-secret": secret }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("script-worker", () => {
  it("refuses anything without the secret, and everything while the secret isn't set", async () => {
    expect((await call({ op: "claim", worker: "mac" }, null)).status).toBe(403);
    expect((await call({ op: "claim", worker: "mac" }, "wrong")).status).toBe(403);
    env.SCRIPT_WORKER_SECRET = "";
    expect((await call({ op: "claim", worker: "mac" }, "")).status).toBe(403);
    expect(db.rpcs).toEqual([]);
  });

  it("claims only for NORTH_STAR_USERS' real uids, never a wildcard, and hands over the job's inputs", async () => {
    const r = await call({ op: "claim", worker: "leo-mbp" });
    expect(db.rpcs[0]).toEqual({ p_worker: "leo-mbp", p_owners: [LEO], p_pickup_seconds: 45 });
    expect(r.body).toEqual({ job: { id: "10000000-0000-0000-0000-000000000002", kind: "rescript", request: { source: { author: "x", transcript: "words" }, context: { me: { name: "Leo" } } } } });
    expect((await call({ op: "claim", worker: "leo-mbp" })).body).toEqual({ job: null });
    env.NORTH_STAR_USERS = "*";
    expect((await call({ op: "claim", worker: "leo-mbp" })).body).toEqual({ job: null });
    expect(db.rpcs).toHaveLength(2);
    expect(db.rows[0].status).toBe("queued");
  });

  it("keeps an answer only from the worker holding the claim, and only while it is claimed", async () => {
    await call({ op: "claim", worker: "leo-mbp" });
    const id = "10000000-0000-0000-0000-000000000002";
    expect((await call({ op: "done", id, worker: "someone-else", text: "{}" })).body).toEqual({ ok: false });
    expect((await call({ op: "done", id, worker: "leo-mbp", text: '{"hooks": []}', model: "claude-opus-5-5", ms: 12345.6 })).body).toEqual({ ok: true });
    expect(db.rows[1]).toMatchObject({ status: "done", result: { text: '{"hooks": []}', model: "claude-opus-5-5", ms: 12346 } });
    // done once: a second report changes nothing
    expect((await call({ op: "failed", id, worker: "leo-mbp", error: "late" })).body).toEqual({ ok: false });
    expect(db.rows[1].status).toBe("done");
  });

  it("files an answer too long to keep whole as a failure, never a cut one", async () => {
    await call({ op: "claim", worker: "leo-mbp" });
    expect((await call({ op: "done", id: "10000000-0000-0000-0000-000000000002", worker: "leo-mbp", text: "x".repeat(15_001) })).body).toEqual({ ok: true });
    expect(db.rows[1]).toMatchObject({ status: "failed", error: "Claude's answer was too long to keep. Try again." });
  });

  it("mends a lone half of an emoji in a report, which jsonb would refuse", async () => {
    await call({ op: "claim", worker: "leo-mbp" });
    expect((await call({ op: "failed", id: "10000000-0000-0000-0000-000000000002", worker: "leo-mbp", error: "Claude Code didn't answer (exit 1: ok \ud83d then more). Try again." })).body).toEqual({ ok: true });
    expect(db.rows[1].error).toBe("Claude Code didn't answer (exit 1: ok \ufffd then more). Try again.");
  });

  it("files a failure as a plain sentence, and refuses a bad id, an empty answer or no worker name", async () => {
    await call({ op: "claim", worker: "leo-mbp" });
    const id = "10000000-0000-0000-0000-000000000002";
    expect((await call({ op: "done", id, worker: "leo-mbp", text: "  " })).status).toBe(400);
    expect((await call({ op: "done", id: "nope", worker: "leo-mbp", text: "x" })).status).toBe(400);
    expect((await call({ op: "claim" })).status).toBe(400);
    expect((await call({ op: "explode", worker: "leo-mbp" })).status).toBe(400);
    expect((await call({ op: "failed", id, worker: "leo-mbp" })).body).toEqual({ ok: true });
    expect(db.rows[1]).toMatchObject({ status: "failed", error: "Claude Code on your Mac didn't finish this. Try again." });
  });
});
