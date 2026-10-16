import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler: who gets in, what the board is told, and that claiming comes before the membership gate.
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const MEI = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DEMO = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NEW = "11111111-2222-4333-8444-555555555555";

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  const spent: string[] = [];
  // a tiny stand-in for the supabase-js query builder over one table
  function query(op: "select" | "update" | "insert", values?: Row) {
    const where: ((r: Row) => boolean)[] = [];
    let inserted: Row | null = null;
    let cols: string[] | null = null;
    const pick = (r: Row) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : r);
    const run = () => {
      const x = raw();
      return x.data ? { ...x, data: x.data.map(pick) } : x;
    };
    const raw = (): { data: Row[] | null; error: { code: string; message: string } | null } => {
      if (op === "insert") {
        if (rows.some((r) => r.invite_hash && r.invite_hash === values!.invite_hash)) return { data: null, error: { code: "23505", message: "dup" } };
        inserted = { id: crypto.randomUUID(), member_id: null, claimed_at: null, revoked_at: null, modules: ["reels"], created_at: new Date().toISOString(), ...values };
        rows.push(inserted);
        return { data: [inserted], error: null };
      }
      const hit = rows.filter((r) => where.every((w) => w(r)));
      if (op === "update") {
        if (values!.member_id && rows.some((r) => r.member_id === values!.member_id && !r.revoked_at && !hit.includes(r))) {
          return { data: null, error: { code: "23505", message: "cs_board_members_live_member" } };
        }
        hit.forEach((r) => Object.assign(r, values));
      }
      return { data: hit, error: null };
    };
    const q = {
      eq: (c: string, v: unknown) => (where.push((r) => r[c] === v), q),
      is: (c: string, v: unknown) => (where.push((r) => (r[c] ?? null) === v), q),
      gt: (c: string, v: string) => (where.push((r) => String(r[c]) > v), q),
      order: () => q,
      select: (c?: string) => ((cols = c ? c.split(",").map((x) => x.trim()) : null), q),
      single: async () => { const x = run(); return { data: x.data?.[0] ?? null, error: x.error }; },
      maybeSingle: async () => { const x = run(); return { data: x.data?.[0] ?? null, error: x.error }; },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return q;
  }
  const admin = {
    auth: {
      getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }),
      admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id.slice(0, 4)}@example.test` } } }) },
    },
    rpc: async (_fn: string, a: Record<string, unknown>) => (spent.push(String(a.p_feature)), { data: 1, error: null }),
    from: () => ({ select: (c?: string) => query("select").select(c), update: (v: Row) => query("update", v), insert: (v: Row) => query("insert", v) }),
  };
  return { admin, rows, spent, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const env: Record<string, string> = {};
const sent: { url: string; method: string; key: string | null; actor: Record<string, unknown> | null; body: unknown }[] = [];
let boardStatus = 200;

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
    const h = new Headers(init.headers);
    const a = h.get("x-board-actor");
    sent.push({ url: u, method: init.method ?? "GET", key: h.get("x-board-key"), actor: a ? JSON.parse(Buffer.from(a, "base64url").toString()) : null, body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(boardStatus === 200 ? { ok: true } : { error: "Only an approver can approve, schedule, archive or restore posts." }), { status: boardStatus });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.rows.length = 0;
  db.spent.length = 0;
  sent.length = 0;
  boardStatus = 200;
  Object.assign(env, { TEAM_OWNER_IDS: LEO, TEAM_CLAIM_DENY_IDS: DEMO, BOARD_KEY: "bk", MB_STUDIO_URL: "https://board.test" });
});

const call = async (uid: string, body: unknown) => {
  const r = await db.handler!(new Request("http://x/team-board", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const invite = async (role = "commenter", brands = ["activitytracker"]) => {
  const r = await call(LEO, { action: "team.invite", label: "Mei", role, brands });
  return { id: r.body.member.id as string, token: (r.body.link as string).split("#")[1] };
};

describe("team-board", () => {
  it("tells a stranger they aren't a member and keeps them off the board", async () => {
    expect(await call(MEI, { action: "me" })).toEqual({ status: 200, body: { owner: false, member: false } });
    expect((await call(MEI, { action: "board" })).status).toBe(403);
    expect(sent).toEqual([]);
    expect((await call("", { action: "me" })).status).toBe(401);
  });

  it("lets Leo invite, and the invited person join once with the link", async () => {
    const { token } = await invite();
    expect(db.rows[0].invite_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.rows[0].invite_hash).not.toContain(token);
    expect((await call(MEI, { action: "claim", token })).status).toBe(200);
    expect(await call(MEI, { action: "me" })).toMatchObject({ body: { member: true, role: "commenter", brands: ["activitytracker"] } });
    expect((await call(NEW, { action: "claim", token })).status).toBe(410);
  });

  it("never lets Leo or a shared login claim an invite", async () => {
    const { token } = await invite("approver");
    expect((await call(DEMO, { action: "claim", token })).status).toBe(403);
    expect((await call(LEO, { action: "claim", token })).status).toBe(403);
    expect(db.rows[0].member_id).toBeNull();
  });

  it("refuses a second live membership in plain words", async () => {
    await call(MEI, { action: "claim", token: (await invite()).token });
    const r = await call(MEI, { action: "claim", token: (await invite("approver")).token });
    expect(r).toEqual({ status: 409, body: { error: "You're already on Leo's team. Ask Leo to add the brand instead." } });
  });

  it("sends the board the key and the member's own role and brands, never what the browser claims", async () => {
    await call(MEI, { action: "claim", token: (await invite()).token });
    await call(MEI, { action: "card", id: "x~carousel", patch: { stage: "approved" }, role: "owner" });
    expect(sent[0]).toMatchObject({ url: "https://board.test/api/card?id=x~carousel", method: "POST", key: "bk", body: { stage: "approved" } });
    expect(sent[0].actor).toEqual({ id: MEI, label: "Mei", role: "commenter", brands: ["activitytracker"] });
  });

  it("passes the board's refusal through as it is", async () => {
    await call(MEI, { action: "claim", token: (await invite()).token });
    boardStatus = 403;
    expect(await call(MEI, { action: "card", id: "x", patch: { stage: "approved" } }))
      .toEqual({ status: 403, body: { error: "Only an approver can approve, schedule, archive or restore posts." } });
  });

  it("counts a member's notes against their daily cap, not Leo's", async () => {
    await call(MEI, { action: "claim", token: (await invite()).token });
    await call(MEI, { action: "comment", id: "x", text: "hi" });
    await call(LEO, { action: "comment", id: "x", text: "hi" });
    expect(db.spent).toEqual(["team-comment"]);
    expect(sent.map((s) => s.actor!.role)).toEqual(["commenter", "owner"]);
  });

  it("stops a revoked member on their next request", async () => {
    const { id, token } = await invite();
    await call(MEI, { action: "claim", token });
    expect((await call(LEO, { action: "team.revoke", id })).status).toBe(200);
    expect((await call(MEI, { action: "board" })).status).toBe(403);
    expect(await call(MEI, { action: "me" })).toEqual({ status: 200, body: { owner: false, member: false } });
  });

  it("lets a removed person back in on a new invite, with the new row's role", async () => {
    const first = await invite();
    await call(MEI, { action: "claim", token: first.token });
    await call(LEO, { action: "team.revoke", id: first.id });
    await call(MEI, { action: "claim", token: (await invite("editor")).token });
    await call(MEI, { action: "board" });
    expect(sent[0].actor).toMatchObject({ role: "editor" });
  });

  it("keeps team management to Leo", async () => {
    const { id, token } = await invite();
    await call(MEI, { action: "claim", token });
    for (const body of [{ action: "team.list" }, { action: "team.invite", label: "X", role: "approver", brands: ["leo"] }, { action: "team.revoke", id }]) {
      expect((await call(MEI, body)).status).toBe(403);
    }
    const list = await call(LEO, { action: "team.list" });
    expect(list.body.members).toHaveLength(1);
    expect(list.body.members[0]).toMatchObject({ status: "joined", email: expect.stringContaining("@") });
    expect(list.body.members[0]).not.toHaveProperty("invite_hash");
  });

  it("re-invites only an open invite", async () => {
    const { id, token } = await invite();
    const again = await call(LEO, { action: "team.reinvite", id });
    expect(again.status).toBe(200);
    expect((await call(MEI, { action: "claim", token })).status).toBe(410);              // the old link stops working
    expect((await call(MEI, { action: "claim", token: again.body.link.split("#")[1] })).status).toBe(200);
    expect((await call(LEO, { action: "team.reinvite", id })).status).toBe(409);       // already joined
  });

  it("hides a board failure behind a plain message", async () => {
    boardStatus = 500;
    expect(await call(LEO, { action: "board" })).toEqual({ status: 502, body: { error: "The board didn't answer. Try again." } });
    boardStatus = 401;                                                                  // our key, not the person's access
    expect((await call(LEO, { action: "board" })).status).toBe(502);
  });
});
