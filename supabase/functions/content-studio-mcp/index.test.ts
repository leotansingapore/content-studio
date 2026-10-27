import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler deployed without JWT: the connection link in the URL is the only credential. A link that isn't one,
// isn't there, was turned off or sits under another account answers the dead-link line and reaches nothing; a live
// one reads and writes only its own user's rows. What each tool answers is logic.test.ts's.
const A = "ff72c375-389e-4dd0-86c4-a166307b8751";
const B = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const SECRET = "a".repeat(40) + "b-_";
const OTHER_SECRET = "z".repeat(43);
const DEAD = "This connection link isn't active. Make a new one in Postmosis > Connect Claude.";

const h = vi.hoisted(() => {
  type Row = { user_id: string; key: string; data: string };
  const rows: Row[] = [];
  const state = { clients: 0, fail: null as null | string, rpc: [] as Record<string, unknown>[], handler: null as null | ((r: Request) => Promise<Response>) };
  // a tiny stand-in for supabase-js over cs_user_data: select with eq / in / like (a prefix and %), maybeSingle, insert
  function query(table: string) {
    if (table !== "cs_user_data") throw new Error(`unexpected table ${table}`);
    const where: ((r: Row) => boolean)[] = [];
    let cols: string[] = [];
    const run = () =>
      state.fail
        ? { data: null, error: { code: "42501", message: state.fail } }
        : { data: rows.filter((r) => where.every((w) => w(r))).map((r) => Object.fromEntries(cols.map((c) => [c, r[c as keyof Row]]))), error: null };
    const q = {
      select: (c: string) => ((cols = c.split(",").map((s) => s.trim())), q),
      eq: (c: keyof Row, v: string) => (where.push((r) => r[c] === v), q),
      in: (c: keyof Row, vs: string[]) => (where.push((r) => vs.includes(r[c])), q),
      like: (c: keyof Row, p: string) => (where.push((r) => r[c].startsWith(p.replace(/%$/, ""))), q),
      maybeSingle: async () => {
        const x = run();
        return { data: x.data?.[0] ?? null, error: x.error };
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  }
  const admin = {
    from: (t: string) => ({
      select: (c: string) => query(t).select(c),
      insert: async (row: Row) => {
        if (state.fail) return { error: { code: "42501", message: state.fail } };
        if (rows.some((r) => r.user_id === row.user_id && r.key === row.key)) return { error: { code: "23505", message: "duplicate key" } };
        rows.push(row);
        return { error: null };
      },
    }),
    rpc: async (fn: string, a: Record<string, unknown>) => (state.rpc.push({ fn, ...a }), { data: 1, error: null }),
  };
  return { rows, state, admin };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => (h.state.clients++, h.admin) }));

const env: Record<string, string | undefined> = {};
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.state.handler = fn), env: { get: (k: string) => env[k] } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.rows.length = 0;
  h.state.clients = 0;
  h.state.fail = null;
  h.state.rpc.length = 0;
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const linkRow = (user: string, scope: string, secret = SECRET) => ({ user_id: user, key: `content-studio-mcplink-${hash(secret)}-${scope}`, data: '{"createdAt":"2026-10-01T00:00:00.000Z"}' });
const revokedRow = (user: string, scope: string, secret = SECRET) => ({ user_id: user, key: `content-studio-mcprevoked-${hash(secret)}-${scope}`, data: '{"revokedAt":"2026-10-02T00:00:00.000Z"}' });
const draftsRow = (user: string, scope: string, hooks: string[]) => ({ user_id: user, key: `content-studio-drafts-${scope}`, data: JSON.stringify(hooks.map((hook, i) => ({ id: `d${i}`, hook, draft: hook }))) });
const rpc = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

async function post(token: string, body: unknown = rpc("list_posts")) {
  const r = await h.state.handler!(new Request(`http://x/functions/v1/content-studio-mcp/${token}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: r.status, text: await r.text() };
}
const answer = (text: string) => JSON.parse(JSON.parse(text).result.content[0].text);
const titles = (text: string) => answer(text).posts.map((p: { title: string }) => p.title);

describe("a connection link that isn't live", () => {
  it("turns away a token that isn't a link before anything is read", async () => {
    for (const bad of ["nope", `${A}.short`, `${A}.${SECRET}x`, `not-a-uuid.${SECRET}`, "%E0%A4%A", `${A}~bad%25id.${SECRET}`]) {
      const r = await post(bad);
      expect(r.status, bad).toBe(404);
      expect(JSON.parse(r.text), bad).toEqual({ error: DEAD });
    }
    expect(h.state.clients).toBe(0);
  });

  it("refuses a link of the right shape that nobody made, and saves nothing", async () => {
    h.rows.push(draftsRow(A, A, ["Mine"]));
    expect(await post(`${A}.${SECRET}`)).toEqual({ status: 404, text: JSON.stringify({ error: DEAD }) });
    expect((await post(`${A}.${SECRET}`, rpc("add_draft", { text: "Hello" }))).status).toBe(404);
    expect(h.rows.map((r) => r.key)).toEqual([`content-studio-drafts-${A}`]);
  });

  it("refuses a turned-off link even while a device still holds its link row, and saves nothing", async () => {
    h.rows.push(linkRow(A, A), revokedRow(A, A), draftsRow(A, A, ["Mine"]));
    expect(await post(`${A}.${SECRET}`)).toEqual({ status: 404, text: JSON.stringify({ error: DEAD }) });
    expect((await post(`${A}.${SECRET}`, rpc("add_draft", { text: "Hello" }))).status).toBe(404);
    expect(h.rows).toHaveLength(3);
  });

  it("refuses a link row that sits under another account, so a secret can't be pointed at someone else's user id", async () => {
    // B holds a row named for A's scope (a stray sync, or B forging one): A's data stays shut
    h.rows.push(linkRow(B, A, OTHER_SECRET), draftsRow(A, A, ["Mine"]));
    expect((await post(`${A}.${OTHER_SECRET}`)).status).toBe(404);
    // and B's own real link under A's id is no link at all
    h.rows.push(linkRow(B, B, OTHER_SECRET));
    expect((await post(`${A}.${OTHER_SECRET}`)).status).toBe(404);
  });
});

describe("a live connection link", () => {
  it("lists only its own user's posts, even when another account holds a row with the same key", async () => {
    h.rows.push(draftsRow(B, A, ["Not mine"]), linkRow(A, A), draftsRow(A, A, ["Mine"]));
    const r = await post(`${A}.${SECRET}`);
    expect(r.status).toBe(200);
    expect(titles(r.text)).toEqual(["Mine"]);
  });

  it("saves a second brand's draft from Claude under its own user, in that brand's inbox", async () => {
    const P1 = `${A}~p1abc`;
    h.rows.push(linkRow(A, P1));
    const r = await post(`${P1}.${SECRET}`, rpc("add_draft", { text: "Hello" }));
    expect(answer(r.text)).toMatchObject({ saved: true });
    const saved = h.rows.filter((x) => x.key.startsWith("content-studio-mcpdraft-"));
    expect(saved.map((x) => [x.user_id, x.key])).toEqual([[A, `content-studio-mcpdraft-claude-s00-${P1}`]]);
  });

  it("reads a second brand's posts through that brand's link, never the main brand's", async () => {
    const P1 = `${A}~p1abc`;
    h.rows.push(linkRow(A, P1), draftsRow(A, A, ["Main brand"]), draftsRow(A, P1, ["Second brand"]));
    expect(titles((await post(`${P1}.${SECRET}`)).text)).toEqual(["Second brand"]);
    // the main brand's token with the same secret isn't a link: its row is the second brand's
    expect((await post(`${A}.${SECRET}`)).status).toBe(404);
  });

  it("reads activity only from its own user's rows on a listed link, and counts the call against that user", async () => {
    env.NORTH_STAR_USERS = A;
    const at = new Date(Date.now() - 3_600_000).toISOString();
    const month = at.slice(0, 7);
    const ev = (id: string, title: string) => JSON.stringify([{ id, at, who: "you", kind: "post", title }]);
    h.rows.push(
      linkRow(A, A),
      { user_id: B, key: `content-studio-activity-${month}-dev999-${A}`, data: ev("x9", "Someone else's") },
      { user_id: A, key: `content-studio-activity-${month}-dev001-${A}`, data: ev("x1", "Mine") },
    );
    const r = await post(`${A}.${SECRET}`, rpc("get_activity"));
    expect(answer(r.text).events.map((e: { title: string }) => e.title)).toEqual(["Mine"]);
    expect(h.state.rpc).toEqual([expect.objectContaining({ fn: "cs_consume_ai_usage", p_user: A, p_feature: "mcp-calls" })]);
  });

  it("says try again, without the database's own words, when a read fails", async () => {
    h.rows.push(linkRow(A, A));
    h.state.fail = "permission denied for table cs_user_data at internal_host_42";
    const r = await post(`${A}.${SECRET}`);
    expect(r.status).toBe(500);
    expect(JSON.parse(r.text).error.message).toBe("Postmosis couldn't read your data right now. Try again in a minute.");
    expect(r.text).not.toContain("permission denied");
    expect(r.text).not.toContain("internal_host_42");
  });

  it("refuses a body over 64 KB without running a tool", async () => {
    h.rows.push(linkRow(A, A));
    const r = await post(`${A}.${SECRET}`, JSON.stringify(rpc("add_draft", { text: "x".repeat(70 * 1024) })));
    expect(r.status).toBe(413);
    expect(h.rows).toHaveLength(1);
  });
});
