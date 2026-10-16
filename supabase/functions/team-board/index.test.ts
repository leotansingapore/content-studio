import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler: who gets in, what the board is told, and that claiming comes before the membership gate.
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const MEI = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DEMO = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NEW = "11111111-2222-4333-8444-555555555555";

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const MEI_ID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
  const tables: Record<string, Row[]> = { cs_board_members: [], cs_board_invites: [] };
  const spent: string[] = [];
  // a tiny stand-in for the supabase-js query builder over one table
  function query(table: string, op: "select" | "update" | "insert", values?: Row) {
    const rows = tables[table];
    const where: ((r: Row) => boolean)[] = [];
    let cols: string[] | null = null;
    const pick = (r: Row) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : r);
    const raw = (): { data: Row[] | null; error: { code: string; message: string } | null } => {
      if (op === "insert") {
        const row = { id: crypto.randomUUID(), uses: 0, revoked_at: null, modules: ["reels"], created_at: new Date().toISOString(), ...values };
        rows.push(row);
        return { data: [row], error: null };
      }
      const hit = rows.filter((r) => where.every((w) => w(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, values));
      return { data: hit, error: null };
    };
    const run = () => {
      const x = raw();
      return x.data ? { ...x, data: x.data.map(pick) } : x;
    };
    const q = {
      eq: (c: string, v: unknown) => (where.push((r) => r[c] === v), q),
      is: (c: string, v: unknown) => (where.push((r) => (r[c] ?? null) === v), q),
      order: () => q,
      select: (c?: string) => ((cols = c ? c.split(",").map((x) => x.trim()) : null), q),
      single: async () => { const x = run(); return { data: x.data?.[0] ?? null, error: x.error }; },
      maybeSingle: async () => { const x = run(); return { data: x.data?.[0] ?? null, error: x.error }; },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return q;
  }
  // cs_board_claim (023) as the database runs it
  function claim(a: Record<string, unknown>) {
    const inv = tables.cs_board_invites.find((i) => i.token_hash === a.p_hash && !i.revoked_at && Date.parse(String(i.expires_at)) > Date.now()
      && (i.max_uses === null || (i.uses as number) < (i.max_uses as number)));
    if (!inv) return { data: null, error: { code: "P0001", message: "invite_gone" } };
    if (inv.owner_id === a.p_member) return { data: null, error: { code: "P0001", message: "owner_self" } };
    if (tables.cs_board_members.some((m) => m.owner_id === inv.owner_id && m.member_id === a.p_member && m.revoked_at && String(m.revoked_at) >= String(inv.created_at))) {
      return { data: null, error: { code: "P0001", message: "removed" } };
    }
    if (tables.cs_board_members.some((m) => m.member_id === a.p_member && !m.revoked_at)) return { data: null, error: { code: "23505", message: "cs_board_members_live_member" } };
    const now = new Date().toISOString();
    const m = { id: crypto.randomUUID(), owner_id: inv.owner_id, label: a.p_label, member_id: a.p_member, role: inv.role, brands: inv.brands, modules: inv.modules, claimed_at: now, revoked_at: null, created_at: now, invite_id: inv.id };
    tables.cs_board_members.push(m);
    inv.uses = (inv.uses as number) + 1;
    return { data: m, error: null };
  }
  const admin = {
    auth: {
      getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt, email: `${jwt.slice(0, 4)}@example.test`, user_metadata: jwt === MEI_ID ? { full_name: "Mei Tan" } : {} } : null } }),
      admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id.slice(0, 4)}@example.test` } } }) },
    },
    rpc: async (fn: string, a: Record<string, unknown>) => (fn === "cs_board_claim" ? claim(a) : (spent.push(String(a.p_feature)), { data: 1, error: null })),
    from: (t: string) => ({ select: (c?: string) => query(t, "select").select(c), update: (v: Row) => query(t, "update", v), insert: (v: Row) => query(t, "insert", v) }),
  };
  return { admin, tables, spent, handler: null as null | ((r: Request) => Promise<Response>) };
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
  db.tables.cs_board_members.length = 0;
  db.tables.cs_board_invites.length = 0;
  db.spent.length = 0;
  sent.length = 0;
  boardStatus = 200;
  Object.assign(env, { TEAM_OWNER_IDS: LEO, TEAM_CLAIM_DENY_IDS: DEMO, BOARD_KEY: "bk", MB_STUDIO_URL: "https://board.test" });
});

const call = async (uid: string, body: unknown) => {
  const r = await db.handler!(new Request("http://x/team-board", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const link = async (role = "commenter", brands = ["activitytracker"]) => {
  const r = await call(LEO, { action: "team.invite", role, brands });
  return { id: r.body.link.id as string, token: (r.body.url as string).split("#")[1] };
};

describe("team-board", () => {
  it("tells a stranger they aren't a member and keeps them off the board", async () => {
    expect(await call(MEI, { action: "me" })).toEqual({ status: 200, body: { owner: false, member: false } });
    expect((await call(MEI, { action: "board" })).status).toBe(403);
    expect(sent).toEqual([]);
    expect((await call("", { action: "me" })).status).toBe(401);
  });

  it("lets several people in through one shared link, each under their own account's name", async () => {
    const { token } = await link();
    expect(db.tables.cs_board_invites[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.tables.cs_board_invites)).not.toContain(token);
    expect((await call(MEI, { action: "claim", token })).status).toBe(200);
    expect((await call(NEW, { action: "claim", token })).status).toBe(200);
    expect(await call(MEI, { action: "me" })).toMatchObject({ body: { member: true, role: "commenter", brands: ["activitytracker"], label: "Mei Tan" } });
    expect(await call(NEW, { action: "me" })).toMatchObject({ body: { member: true, label: "1111" } });
  });

  it("makes an approver link work for one person", async () => {
    const { token } = await link("approver");
    expect((await call(MEI, { action: "claim", token })).status).toBe(200);
    expect(await call(NEW, { action: "claim", token })).toEqual({ status: 410, body: { error: "This invite link has expired or was turned off. Ask Leo for a new one." } });
  });

  it("never lets Leo or a shared login join", async () => {
    const { token } = await link("approver");
    expect((await call(DEMO, { action: "claim", token })).status).toBe(403);
    expect((await call(LEO, { action: "claim", token })).status).toBe(403);
    expect(db.tables.cs_board_members).toHaveLength(0);
    expect(db.tables.cs_board_invites[0].uses).toBe(0);
  });

  it("refuses a second live membership in plain words", async () => {
    await call(MEI, { action: "claim", token: (await link()).token });
    const r = await call(MEI, { action: "claim", token: (await link("approver")).token });
    expect(r).toEqual({ status: 409, body: { error: "You're already on Leo's team. Ask Leo to add the brand instead." } });
  });

  it("stops a link Leo turns off", async () => {
    const { id, token } = await link();
    expect((await call(LEO, { action: "team.linkOff", id })).status).toBe(200);
    expect((await call(MEI, { action: "claim", token })).status).toBe(410);
  });

  it("sends the board the key and the member's own role and brands, never what the browser claims", async () => {
    await call(MEI, { action: "claim", token: (await link()).token });
    await call(MEI, { action: "card", id: "x~carousel", patch: { stage: "approved" }, role: "owner" });
    expect(sent[0]).toMatchObject({ url: "https://board.test/api/card?id=x~carousel", method: "POST", key: "bk", body: { stage: "approved" } });
    expect(sent[0].actor).toEqual({ id: MEI, label: "Mei Tan", role: "commenter", brands: ["activitytracker"] });
  });

  it("passes the board's refusal through as it is", async () => {
    await call(MEI, { action: "claim", token: (await link()).token });
    boardStatus = 403;
    expect(await call(MEI, { action: "card", id: "x", patch: { stage: "approved" } }))
      .toEqual({ status: 403, body: { error: "Only an approver can approve, schedule, archive or restore posts." } });
  });

  it("counts a member's notes against their daily cap, not Leo's", async () => {
    await call(MEI, { action: "claim", token: (await link()).token });
    await call(MEI, { action: "comment", id: "x", text: "hi" });
    await call(LEO, { action: "comment", id: "x", text: "hi" });
    expect(db.spent).toEqual(["team-comment"]);
    expect(sent.map((s) => s.actor!.role)).toEqual(["commenter", "owner"]);
  });

  it("stops a removed member at once, keeps the old link shut to them, and lets a newer link back in", async () => {
    const old = await link();
    await call(MEI, { action: "claim", token: old.token });
    const id = (await call(LEO, { action: "team.list" })).body.members[0].id;
    expect((await call(LEO, { action: "team.revoke", id })).status).toBe(200);
    expect((await call(MEI, { action: "board" })).status).toBe(403);
    expect(await call(MEI, { action: "me" })).toEqual({ status: 200, body: { owner: false, member: false } });
    expect(await call(MEI, { action: "claim", token: old.token })).toEqual({ status: 403, body: { error: "Leo removed you from this board. Ask him for a new link." } });
    await new Promise((r) => setTimeout(r, 5));
    await call(MEI, { action: "claim", token: (await link("editor")).token });
    await call(MEI, { action: "board" });
    expect(sent[0].actor).toMatchObject({ role: "editor" });
  });

  it("keeps team management to Leo, and never shows a token or its hash", async () => {
    const { id, token } = await link();
    await call(MEI, { action: "claim", token });
    for (const body of [{ action: "team.list" }, { action: "team.invite", role: "approver", brands: ["leo"] }, { action: "team.linkOff", id }]) {
      expect((await call(MEI, body)).status).toBe(403);
    }
    const list = await call(LEO, { action: "team.list" });
    expect(list.body.members[0]).toMatchObject({ status: "joined", label: "Mei Tan", email: expect.stringContaining("@") });
    expect(list.body.links[0]).toMatchObject({ status: "active", uses: 1, role: "commenter" });
    expect(JSON.stringify(list.body)).not.toMatch(/token|[0-9a-f]{64}/);
  });

  it("hides a board failure behind a plain message", async () => {
    boardStatus = 500;
    expect(await call(LEO, { action: "board" })).toEqual({ status: 502, body: { error: "The board didn't answer. Try again." } });
    boardStatus = 401;                                                                  // our key, not the person's access
    expect((await call(LEO, { action: "board" })).status).toBe(502);
  });
});
