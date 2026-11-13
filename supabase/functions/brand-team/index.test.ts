import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// The handler itself: who may invite, what each step writes, and that nothing about an address's account leaks.
const OWNER = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const MEMBER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const STRANGER = "11111111-2222-4333-8444-555555555555";
const GLOBAL = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";

const db = vi.hoisted(() => {
  const state = {
    subs: new Map<string, { status: string; past_due_since?: string | null }>(),
    users: new Map<string, { id: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }>(),
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    upserts: [] as { table: string; row: Record<string, unknown>; opts: unknown }[],
    created: [] as Record<string, unknown>[],
    capped: new Set<string>(),
    inviteError: null as null | string,
    open: null as null | { invite_id: string; brand_id: string; email: string; brand_name: string; invited_by: string },
    ownerRows: [] as { status: string; past_due_since: string | null }[],
  };
  const admin = {
    auth: {
      getUser: async (jwt: string) => ({ data: { user: state.users.get(jwt) ?? null } }),
      admin: {
        createUser: async (u: { email: string; app_metadata: Record<string, unknown> }) => {
          state.created.push(u);
          const id = "99999999-9999-4999-8999-999999999999";
          state.users.set(id, { id, email: u.email, app_metadata: u.app_metadata, user_metadata: {} });
          return { data: { user: { id } }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: state.users.get(id) ?? null } }),
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcs.push({ fn, args });
      if (fn === "cs_consume_ai_usage") return { data: state.capped.has(String(args.p_feature)) ? null : 1, error: null };
      if (fn === "cs_brand_invite") return state.inviteError ? { data: null, error: { message: state.inviteError } } : { data: "inv-1", error: null };
      if (fn === "cs_brand_invite_open") return { data: state.open && args.p_hash === state.openHash ? [state.open] : [], error: null };
      if (fn === "cs_account_for_email") {
        const u = [...state.users.values()].find((x) => x.email === args.p_email);
        return { data: u ? [{ user_id: u.id, made_by: null }] : [], error: null };
      }
      if (fn === "cs_member_owner_rows") return { data: state.ownerRows, error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: table === "cs_subscriptions" ? state.subs.get(v) ?? null : null, error: null }) }),
      }),
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        state.upserts.push({ table, row, opts });
        if (table === "cs_subscriptions" && !state.subs.has(String(row.user_id))) state.subs.set(String(row.user_id), { status: String(row.status) });
        const done = { error: null };
        return Object.assign(Promise.resolve(done), { select: () => ({ single: async () => ({ data: { id: "brand-1" }, error: null }) }) });
      },
    }),
  };
  return { admin, state: state as typeof state & { openHash?: string }, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const mails: { to: string[]; subject: string; text: string; key: string | null }[] = [];
const env: Record<string, string> = {};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    mails.push({ to: body.to, subject: body.subject, text: body.text, key: new Headers(init.headers).get("Idempotency-Key") });
    return new Response("{}", { status: env.RESEND_FAIL ? 500 : 200 });
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  const s = db.state;
  s.subs.clear();
  s.users.clear();
  s.rpcs.length = 0;
  s.upserts.length = 0;
  s.created.length = 0;
  s.capped.clear();
  s.inviteError = null;
  s.open = null;
  s.ownerRows = [];
  mails.length = 0;
  Object.keys(env).forEach((k) => delete env[k]);
  env.RESEND_API_KEY = "re_test";
  s.users.set(OWNER, { id: OWNER, email: "owner@example.sg", app_metadata: {}, user_metadata: { full_name: "Leo Tan" } });
  s.users.set(MEMBER_ID, { id: MEMBER_ID, email: "member@example.sg", app_metadata: { postmosis_invited_by: OWNER }, user_metadata: {} });
  s.users.set(STRANGER, { id: STRANGER, email: "stranger@example.sg", app_metadata: {}, user_metadata: {} });
});

const call = (uid: string | null, body: unknown) =>
  db.handler!(new Request("http://x/brand-team", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
const invite = (uid: string, email = "Mei@Example.sg") => call(uid, { action: "invite", profileId: "pabc12", name: "Acme", email });
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

describe("inviting", () => {
  it("needs a signed-in owner whose own plan gives access", async () => {
    expect((await invite("")).status).toBe(401);
    // no row (an older account, an academy login, the public demo login), a lapsed row, a member row
    for (const row of [undefined, { status: "canceled" }, { status: "member" }]) {
      if (row) db.state.subs.set(STRANGER, row);
      else db.state.subs.delete(STRANGER);
      const res = await invite(STRANGER);
      expect(res.status, String(row?.status)).toBe(403);
      expect(await res.json()).toEqual({ error: "Inviting your team needs an active plan.", code: "plan" });
    }
    expect(db.state.rpcs.filter((r) => r.fn !== "cs_member_owner_rows")).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("emails a one-time link whose hash is all the database keeps, and makes no account", async () => {
    db.state.subs.set(OWNER, { status: "active" });
    const res = await invite(OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invited: true, email: "mei@example.sg" });
    expect(db.state.rpcs.filter((r) => r.fn === "cs_consume_ai_usage").map((r) => [r.args.p_user, r.args.p_feature])).toEqual([
      [OWNER, "brand-invite"],
      [GLOBAL, "brand-invite-global"],
    ]);
    expect(db.state.upserts).toEqual([{ table: "cs_brands", row: { owner_id: OWNER, profile_id: "pabc12", name: "Acme" }, opts: { onConflict: "owner_id,profile_id" } }]);
    const filed = db.state.rpcs.find((r) => r.fn === "cs_brand_invite")!;
    expect(filed.args).toMatchObject({ p_brand: "brand-1", p_inviter: OWNER, p_email: "mei@example.sg" });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: ["mei@example.sg"], subject: "Leo Tan invited you to Acme on Postmosis", key: "brand-invite-inv-1" });
    const token = mails[0].text.match(/brands\/join#([A-Za-z0-9_-]{43})/)![1];
    expect(filed.args.p_hash).toBe(sha(token));
    expect(JSON.stringify(filed.args)).not.toContain(token);
    // no account looked up or made at invite: the answer can't say whether the address has one
    expect(db.state.rpcs.some((r) => r.fn === "cs_account_for_email")).toBe(false);
    expect(db.state.created).toEqual([]);
  });

  it("stops at either daily cap, before anything is filed", async () => {
    db.state.subs.set(OWNER, { status: "trialing" });
    for (const feature of ["brand-invite", "brand-invite-global"]) {
      db.state.capped.clear();
      db.state.capped.add(feature);
      db.state.rpcs.length = 0;
      const res = await invite(OWNER);
      expect(res.status, feature).toBe(429);
      expect(db.state.rpcs.some((r) => r.fn === "cs_brand_invite")).toBe(false);
    }
    expect(mails).toEqual([]);
  });

  it("passes the database's refusals on in plain words, and keeps anything else generic", async () => {
    db.state.subs.set(OWNER, { status: "comp" });
    db.state.inviteError = "team_full";
    let res = await invite(OWNER);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^Your team is full/);
    db.state.inviteError = 'duplicate key value violates "cs_brand_invites_hash"';
    res = await invite(OWNER);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "That didn't go through. Try again in a minute." });
    expect(mails).toEqual([]);
  });

  it("says so when the email can't go, so the owner can press Invite again", async () => {
    db.state.subs.set(OWNER, { status: "active" });
    env.RESEND_FAIL = "1";
    expect((await invite(OWNER)).status).toBe(503);
    delete env.RESEND_API_KEY;
    expect((await invite(OWNER)).status).toBe(503);
  });
});

describe("opening an invite link", () => {
  const token = "A".repeat(43);
  const open = (email: string) => {
    db.state.open = { invite_id: "inv-1", brand_id: "brand-1", email, brand_name: "Acme", invited_by: OWNER };
    db.state.openHash = sha(token);
  };

  it("refuses a link that is used, revoked, expired or made up", async () => {
    const res = await call(null, { action: "start", token });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "This invite has expired or was already used. Ask for a new one." });
    expect(db.state.created).toEqual([]);
  });

  it("makes the invited address an account with a member row, only when it has none", async () => {
    open("new@example.sg");
    const res = await call(null, { action: "start", token });
    expect(await res.json()).toEqual({ email: "new@example.sg", brand: "Acme" });
    expect(db.state.created).toEqual([{ email: "new@example.sg", email_confirm: true, app_metadata: { postmosis_invited_by: OWNER } }]);
    expect(db.state.upserts).toEqual([
      { table: "cs_subscriptions", row: { user_id: "99999999-9999-4999-8999-999999999999", email: "new@example.sg", status: "member" }, opts: { onConflict: "user_id", ignoreDuplicates: true } },
    ]);
  });

  it("leaves an account that already exists exactly as it is", async () => {
    open("stranger@example.sg");
    db.state.subs.set(STRANGER, { status: "active" });
    const res = await call(null, { action: "start", token });
    expect(await res.json()).toEqual({ email: "stranger@example.sg", brand: "Acme" });
    expect(db.state.created).toEqual([]);
    expect(db.state.upserts).toEqual([]);
    expect(db.state.subs.get(STRANGER)).toEqual({ status: "active" });
  });
});

describe("whether a team covers an account", () => {
  it("opens a member account while an owner's plan gives access, and not after", async () => {
    db.state.subs.set(MEMBER_ID, { status: "member" });
    db.state.ownerRows = [{ status: "active", past_due_since: null }];
    expect(await (await call(MEMBER_ID, { action: "covered" })).json()).toEqual({ covered: true });
    db.state.ownerRows = [{ status: "canceled", past_due_since: null }];
    expect(await (await call(MEMBER_ID, { action: "covered" })).json()).toEqual({ covered: false });
  });

  it("writes the member row an invited account is missing, then answers for it", async () => {
    db.state.ownerRows = [];
    expect(await (await call(MEMBER_ID, { action: "covered" })).json()).toEqual({ covered: false });
    expect(db.state.upserts[0]).toMatchObject({ table: "cs_subscriptions", row: { user_id: MEMBER_ID, status: "member" }, opts: { ignoreDuplicates: true } });
  });

  it("leaves every other account to its own row", async () => {
    expect(await (await call(STRANGER, { action: "covered" })).json()).toEqual({ covered: true });
    db.state.subs.set(STRANGER, { status: "canceled" });
    expect(await (await call(STRANGER, { action: "covered" })).json()).toEqual({ covered: false });
    expect(db.state.upserts).toEqual([]);
    expect((await call("", { action: "covered" })).status).toBe(401);
  });
});
