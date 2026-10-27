import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { b64url, pkceChallenge, unseal, tokenKey } from "./logic";

// The handler itself, with a fake database, bucket and AdLauncher: who gets in, the connect round trip, the
// refresh rules, the guard in front of every tool, and that no token ever reaches an answer.
const LEO = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const OTHER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const KEY = b64url(new Uint8Array(32).map((_, i) => i + 7));

const db = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const files: { path: string; type: string; size: number }[] = [];
  const reads: string[] = [];
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    from: () => {
      const where: [string, unknown][] = [];
      const match = (r: Record<string, unknown>) => where.every(([c, v]) => r[c] === v);
      let patch: Record<string, unknown> | null = null;
      let del = false;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (where.push([c, v]), q),
        maybeSingle: async () => {
          reads.push("row");
          // a copy, as the database answers: later writes don't reach a row already read
          const hit = [...rows.values()].find(match);
          return { data: hit ? { ...hit } : null, error: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          rows.set(String(row.user_id), { ...(rows.get(String(row.user_id)) ?? {}), ...row });
          return { error: null };
        },
        update: (p: Record<string, unknown>) => ((patch = p), q),
        delete: () => ((del = true), q),
        then: (resolve: (v: unknown) => void) => {
          const hit = [...rows.values()].filter(match);
          if (del) for (const r of hit) rows.delete(String(r.user_id));
          if (patch) for (const r of hit) Object.assign(r, patch);
          resolve({ data: hit.map((r) => ({ user_id: r.user_id })), error: null });
        },
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, o: { contentType: string }) => (files.push({ path: `${bucket}/${path}`, type: o.contentType, size: bytes.length }), { data: { path }, error: null }),
        createSignedUrl: async (path: string, secs: number) => ({ data: { signedUrl: `https://hub.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t&secs=${secs}` }, error: null }),
      }),
    },
  };
  return { rows, files, reads, admin, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const env: Record<string, string> = {};
/** Every outgoing call: where, the form or MCP body, and the bearer it carried. */
const sent: { url: string; form?: Record<string, string>; tool?: string; auth?: string; args?: Record<string, unknown>; headers?: Record<string, string> }[] = [];
// what the fake AdLauncher answers next
let tokenReplies: { status: number; body: unknown }[] = [];
let mcpReplies: { status: number; body: unknown; sse?: boolean }[] = [];
let minted = 0;
const pair = () => ((minted += 1), { access_token: `at_${minted}`, refresh_token: `rt_${minted}`, token_type: "Bearer", expires_in: 3600, scope: "core:read core:write meta:launch" });
const result = (structuredContent: unknown) => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent } });
const WHOAMI = { organizationName: "D'Marketing", role: "agency_owner", credentialScope: "organization", toolsets: ["core"], grants: [], activeAdAccountId: "1234", activeAdAccountName: "Leo SG", accountCurrency: "SGD", activePageId: "p1", activePageName: "Leo Tan" };

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init: RequestInit = {}) => {
    const url = String(u);
    const h = (init.headers ?? {}) as Record<string, string>;
    if (url.endsWith("/mcp/token") || url.endsWith("/mcp/revoke")) {
      sent.push({ url, form: Object.fromEntries(new URLSearchParams(String(init.body))) });
      if (url.endsWith("/mcp/revoke")) return new Response("{}");
      const r = tokenReplies.shift() ?? { status: 200, body: pair() };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    if (url === "https://autoadslauncher.com/mcp") {
      const body = JSON.parse(String(init.body));
      sent.push({ url, tool: body.params.name, auth: h.Authorization, args: body.params.arguments, headers: h });
      const r = mcpReplies.shift() ?? { status: 200, body: result(body.params.name === "whoami" ? WHOAMI : { ok: true }) };
      if (r.sse) return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\n\ndata: ${JSON.stringify(r.body)}\n\n`, { status: r.status, headers: { "Content-Type": "text/event-stream" } });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.rows.clear();
  db.files.length = 0;
  db.reads.length = 0;
  sent.length = 0;
  tokenReplies = [];
  mcpReplies = [];
  minted = 0;
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, {
    SUPABASE_URL: "https://hub.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    NORTH_STAR_USERS: LEO,
    ADLAUNCHER_CLIENT_ID: "mcp_client_1",
    ADLAUNCHER_REDIRECT_URI: "https://consultant-content-studio.vercel.app/adlauncher",
    ADLAUNCHER_TOKEN_KEY: KEY,
  });
});

const call = async (uid: string, body: unknown) => {
  const res = await db.handler!(new Request("http://x/adlauncher", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
};

/** Connects LEO through start and finish, as the page does. */
async function connect() {
  const { body } = await call(LEO, { action: "start" });
  const state = new URL(body.url).searchParams.get("state")!;
  return call(LEO, { action: "finish", code: "code_1", state });
}

const row = () => db.rows.get(LEO)!;
const key = () => tokenKey(KEY);
const tokensIn = (text: string) => /\b(at|rt)_\d+\b/.test(text) || text.includes("code_1");

describe("the adlauncher function", () => {
  it("refuses a sign-in that isn't Leo's before reading anything", async () => {
    const r = await call(OTHER, { action: "status" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("not_enabled");
    expect(db.reads).toEqual([]);
    expect(sent).toEqual([]);
    expect((await call("", { action: "status" })).status).toBe(401);
  });

  it("stays off until the client, the address and a 32-byte key are set", async () => {
    delete env.ADLAUNCHER_CLIENT_ID;
    expect((await call(LEO, { action: "status" })).status).toBe(503);
    env.ADLAUNCHER_CLIENT_ID = "mcp_client_1";
    env.ADLAUNCHER_TOKEN_KEY = b64url(new Uint8Array(16));
    expect((await call(LEO, { action: "status" })).body.code).toBe("unavailable");
  });

  it("starts with a state and an S256 challenge of a verifier it keeps sealed", async () => {
    const r = await call(LEO, { action: "start" });
    const u = new URL(r.body.url);
    expect(u.origin + u.pathname).toBe("https://autoadslauncher.com/mcp/authorize");
    expect(u.searchParams.get("state")).toBe(row().pending_state);
    expect(u.searchParams.get("redirect_uri")).toBe("https://consultant-content-studio.vercel.app/adlauncher");
    const verifier = await unseal(await key(), String(row().pending_verifier_enc), `${LEO}:verifier`);
    expect(String(row().pending_verifier_enc)).not.toContain(verifier);
    expect(u.searchParams.get("code_challenge")).toBe(await pkceChallenge(verifier));
    expect(r.text).not.toContain(verifier);
  });

  it("finishes once: spends the code with the verifier, keeps the tokens sealed and the whoami summary", async () => {
    const r = await connect();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      connected: true,
      account: { organization: "D'Marketing", client: null, role: "agency_owner", adAccountId: "1234", adAccountName: "Leo SG", currency: "SGD", pageId: "p1", pageName: "Leo Tan" },
      scope: "core:read core:write meta:launch",
    });
    expect(tokensIn(r.text)).toBe(false);
    const form = sent.find((s) => s.form?.grant_type === "authorization_code")!.form!;
    expect(form).toMatchObject({ code: "code_1", redirect_uri: "https://consultant-content-studio.vercel.app/adlauncher", client_id: "mcp_client_1" });
    expect(form.code_verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(sent.find((s) => s.tool === "whoami")?.auth).toBe("Bearer at_1");
    expect(row()).toMatchObject({ pending_state: null, pending_verifier_enc: null, pending_at: null });
    expect(String(row().access_enc)).not.toContain("at_1");
    expect(await unseal(await key(), String(row().access_enc), `${LEO}:access`)).toBe("at_1");
    expect(await unseal(await key(), String(row().refresh_enc), `${LEO}:refresh`)).toBe("rt_1");
    // the same state again is refused, with no second token request
    const before = sent.length;
    const again = await call(LEO, { action: "finish", code: "code_1", state: "x".repeat(43) });
    expect(again.status).toBe(400);
    expect(sent.length).toBe(before);
  });

  it("refuses a state that isn't the saved one, or one over 10 minutes old", async () => {
    const { body } = await call(LEO, { action: "start" });
    const state = new URL(body.url).searchParams.get("state")!;
    expect((await call(LEO, { action: "finish", code: "c", state: "y".repeat(43) })).body.code).toBe("stale");
    row().pending_at = new Date(Date.now() - 11 * 60_000).toISOString();
    const r = await call(LEO, { action: "finish", code: "c", state });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/10 minutes/);
    expect(sent).toEqual([]);
  });

  it("says connected, or reconnect once the tokens are gone", async () => {
    expect((await call(LEO, { action: "status" })).body).toEqual({ connected: false, reconnect: false, account: null });
    await connect();
    expect((await call(LEO, { action: "status" })).body).toMatchObject({ connected: true, account: { pageName: "Leo Tan" } });
    Object.assign(row(), { access_enc: null, refresh_enc: null });
    expect((await call(LEO, { action: "status" })).body).toMatchObject({ connected: false, reconnect: true, account: { pageName: "Leo Tan" } });
  });

  it("calls an allowed tool with the era's headers, and forces an image ad", async () => {
    await connect();
    sent.length = 0;
    const r = await call(LEO, { action: "call", tool: "create-campaign", args: { name: "n", imageUrl: "https://hub.supabase.co/a.jpg", mediaType: "video", dryRun: true } });
    expect(r.body).toEqual({ ok: true, data: { ok: true } });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers).toMatchObject({ "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "create-campaign", Authorization: "Bearer at_1" });
    expect(sent[0].args).toMatchObject({ mediaType: "image", dryRun: true });
  });

  it("never calls a tool off the list, a template or a blueprint", async () => {
    await connect();
    sent.length = 0;
    for (const [tool, args] of [
      ["launch-from-template", { templateId: "t" }],
      ["launch-from-blueprint", { blueprintId: "b" }],
      ["update-budget", { campaignId: "c", dailyBudget: 99 }],
      ["pause-campaign", { campaignId: "c" }],
      ["create-campaign", { name: "n", imageUrl: "https://a/b.jpg", templateId: "t" }],
      ["create-campaign", { name: "n", imageUrl: "https://a/b.jpg", appendToCampaignId: "c", confirm: true }],
      ["preflight-launch", { blueprintId: "b" }],
    ] as const) {
      const r = await call(LEO, { action: "call", tool, args });
      expect(r.status, tool).toBe(400);
      expect(r.body.code).toBe("refused");
    }
    expect(sent).toEqual([]);
  });

  it("refreshes first with under 2 minutes left, and keeps the new pair AdLauncher rotates to", async () => {
    await connect();
    row().expires_at = new Date(Date.now() + 60_000).toISOString();
    sent.length = 0;
    const r = await call(LEO, { action: "call", tool: "list-pages" });
    expect(r.body.ok).toBe(true);
    expect(sent.map((s) => s.form?.grant_type ?? s.tool)).toEqual(["refresh_token", "list-pages"]);
    expect(sent[0].form).toMatchObject({ refresh_token: "rt_1", client_id: "mcp_client_1" });
    expect(sent[1].auth).toBe("Bearer at_2");
    expect(await unseal(await key(), String(row().refresh_enc), `${LEO}:refresh`)).toBe("rt_2");
    expect(Date.parse(String(row().expires_at))).toBeGreaterThan(Date.now() + 50 * 60_000);
  });

  it("refreshes once on a 401 and tries again", async () => {
    await connect();
    sent.length = 0;
    mcpReplies = [{ status: 401, body: { error: "invalid_token" } }];
    const r = await call(LEO, { action: "call", tool: "list-ad-accounts" });
    expect(r.body.ok).toBe(true);
    expect(sent.map((s) => s.auth ?? s.form?.grant_type)).toEqual(["Bearer at_1", "refresh_token", "Bearer at_2"]);
  });

  it("marks the connection gone on a 401 after a refresh, keeping which account it was", async () => {
    await connect();
    mcpReplies = [{ status: 401, body: {} }, { status: 401, body: {} }];
    const r = await call(LEO, { action: "call", tool: "list-pages" });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ code: "reconnect", error: "Reconnect AdLauncher." });
    expect(row()).toMatchObject({ access_enc: null, refresh_enc: null });
    expect((await call(LEO, { action: "status" })).body).toMatchObject({ connected: false, reconnect: true });
  });

  it("marks it gone when AdLauncher refuses the refresh, and keeps it when AdLauncher is down", async () => {
    await connect();
    row().expires_at = new Date(Date.now() - 1).toISOString();
    tokenReplies = [{ status: 503, body: {} }];
    const down = await call(LEO, { action: "call", tool: "whoami" });
    expect(down.status).toBe(502);
    expect(row().refresh_enc).not.toBeNull();
    tokenReplies = [{ status: 400, body: { error: "invalid_grant" } }];
    const refused = await call(LEO, { action: "call", tool: "whoami" });
    expect(refused.body.code).toBe("reconnect");
    expect(row().refresh_enc).toBeNull();
  });

  it("passes a tool's refusal through in AdLauncher's words, from JSON or a stream", async () => {
    await connect();
    mcpReplies = [{ status: 200, sse: true, body: { jsonrpc: "2.0", id: 1, result: { isError: true, content: [], structuredContent: { error: "No Page.", hint: "Connect a Page.", code: "no_page" } } } }];
    const r = await call(LEO, { action: "call", tool: "preflight-launch", args: {} });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: false, error: "No Page.", hint: "Connect a Page.", code: "no_page" });
  });

  it("asks to reconnect before any call when nothing is connected", async () => {
    const r = await call(LEO, { action: "call", tool: "whoami" });
    expect(r.body.code).toBe("reconnect");
    expect(sent).toEqual([]);
  });

  it("files the picture under the caller in the private bucket and answers a year-long signed address", async () => {
    const jpg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 9, 9));
    const r = await call(LEO, { action: "image", dataUrl: `data:image/jpeg;base64,${jpg}` });
    expect(r.status).toBe(200);
    expect(db.files).toHaveLength(1);
    expect(db.files[0].path).toMatch(new RegExp(`^cs-ad-images/${LEO}/[A-Za-z0-9_-]{22}\\.jpg$`));
    expect(db.files[0].type).toBe("image/jpeg");
    expect(r.body.url).toMatch(/^https:\/\/hub\.supabase\.co\/storage\/v1\/object\/sign\/cs-ad-images\//);
    expect(r.body.url).toContain(`secs=${365 * 24 * 3600}`);
    expect((await call(LEO, { action: "image", dataUrl: "data:image/gif;base64,R0lGOD" })).status).toBe(400);
    expect(db.files).toHaveLength(1);
  });

  it("disconnects: revokes the refresh token and deletes the row", async () => {
    await connect();
    sent.length = 0;
    const r = await call(LEO, { action: "disconnect" });
    expect(r.body).toEqual({ connected: false });
    expect(sent[0]).toMatchObject({ url: "https://autoadslauncher.com/mcp/revoke", form: { token: "rt_1", token_type_hint: "refresh_token", client_id: "mcp_client_1" } });
    expect(db.rows.has(LEO)).toBe(false);
  });
});
