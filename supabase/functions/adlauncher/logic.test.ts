import { describe, expect, it } from "vitest";
import {
  AUTHORIZE_URL,
  IMAGE_MAX_BYTES,
  MCP_URL,
  SCOPE,
  STATE_TTL_MS,
  accountSummary,
  authorizeUrl,
  b64url,
  checkState,
  guardCall,
  mcpRequest,
  needsRefresh,
  parseImage,
  parseRequest,
  pkceChallenge,
  randomToken,
  readRpc,
  seal,
  tokenKey,
  tokenSet,
  toolAnswer,
  unseal,
} from "./logic";

const KEY = b64url(new Uint8Array(32).map((_, i) => i + 1));
const OTHER_KEY = b64url(new Uint8Array(32).map((_, i) => 200 - i));
const NOW = Date.parse("2026-10-27T10:00:00Z");
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

describe("PKCE and the authorize address", () => {
  it("makes the S256 challenge of RFC 7636's own example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes random tokens of the right length, never the same twice", () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("asks for a code with PKCE, the state, the resource and only the core scopes", () => {
    const u = new URL(authorizeUrl({ clientId: "cid", redirectUri: "https://consultant-content-studio.vercel.app/adlauncher", state: "s".repeat(43), challenge: "c" }));
    expect(`${u.origin}${u.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "https://consultant-content-studio.vercel.app/adlauncher",
      state: "s".repeat(43),
      code_challenge: "c",
      code_challenge_method: "S256",
      resource: MCP_URL,
      scope: "core:read core:write meta:launch",
    });
    expect(SCOPE).not.toMatch(/meta:modify|creative:generate/);
  });
});

describe("the state", () => {
  const row = { pending_state: "a".repeat(43), pending_at: new Date(NOW - 60_000).toISOString() };
  it("accepts the saved state under 10 minutes old", () => {
    expect(checkState(row, "a".repeat(43), NOW)).toBe("ok");
    expect(checkState({ ...row, pending_at: new Date(NOW - STATE_TTL_MS + 1000).toISOString() }, "a".repeat(43), NOW)).toBe("ok");
  });
  it("refuses one 10 minutes old or more, or saved in the future", () => {
    expect(checkState({ ...row, pending_at: new Date(NOW - STATE_TTL_MS).toISOString() }, "a".repeat(43), NOW)).toBe("expired");
    expect(checkState({ ...row, pending_at: new Date(NOW - 11 * 60_000).toISOString() }, "a".repeat(43), NOW)).toBe("expired");
    expect(checkState({ ...row, pending_at: new Date(NOW + 60_000).toISOString() }, "a".repeat(43), NOW)).toBe("expired");
    expect(checkState({ ...row, pending_at: null }, "a".repeat(43), NOW)).toBe("expired");
  });
  it("refuses another state, a missing one, or a row with none", () => {
    expect(checkState(row, "b".repeat(43), NOW)).toBe("mismatch");
    expect(checkState(row, "a".repeat(42), NOW)).toBe("mismatch");
    expect(checkState(row, undefined, NOW)).toBe("mismatch");
    expect(checkState({ ...row, pending_state: null }, "a".repeat(43), NOW)).toBe("mismatch");
    expect(checkState(null, "a".repeat(43), NOW)).toBe("mismatch");
  });
});

describe("token encryption", () => {
  it("round-trips a token, and the sealed form never holds it", async () => {
    const key = await tokenKey(KEY);
    const sealed = await seal(key, "mcp_at_secret", `${UID}:access`);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("mcp_at_secret");
    expect(await unseal(key, sealed, `${UID}:access`)).toBe("mcp_at_secret");
    expect(await seal(key, "mcp_at_secret", `${UID}:access`)).not.toBe(sealed);
  });
  it("won't open with another key, in another row or column, or once changed", async () => {
    const key = await tokenKey(KEY);
    const sealed = await seal(key, "mcp_at_secret", `${UID}:access`);
    await expect(unseal(await tokenKey(OTHER_KEY), sealed, `${UID}:access`)).rejects.toThrow();
    await expect(unseal(key, sealed, `${UID}:refresh`)).rejects.toThrow();
    await expect(unseal(key, sealed, `someone-else:access`)).rejects.toThrow();
    const [v, iv, ct] = sealed.split(".");
    await expect(unseal(key, `${v}.${iv}.${ct[0] === "A" ? "B" : "A"}${ct.slice(1)}`, `${UID}:access`)).rejects.toThrow();
    await expect(unseal(key, "plain-token", `${UID}:access`)).rejects.toThrow();
  });
  it("takes a 32-byte key in base64 or base64url, and nothing else", async () => {
    const std = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 250 - i)));
    await expect(tokenKey(std)).resolves.toBeTruthy();
    await expect(tokenKey(KEY)).resolves.toBeTruthy();
    await expect(tokenKey(b64url(new Uint8Array(16)))).rejects.toThrow(/32 bytes/);
    await expect(tokenKey(undefined)).rejects.toThrow();
    await expect(tokenKey("not base64 at all!")).rejects.toThrow();
  });
});

describe("refresh timing and the token answer", () => {
  it("refreshes with under 2 minutes left, or with no expiry known", () => {
    expect(needsRefresh(new Date(NOW + 3 * 60_000).toISOString(), NOW)).toBe(false);
    expect(needsRefresh(new Date(NOW + 2 * 60_000 + 1).toISOString(), NOW)).toBe(false);
    expect(needsRefresh(new Date(NOW + 119_000).toISOString(), NOW)).toBe(true);
    expect(needsRefresh(new Date(NOW - 1).toISOString(), NOW)).toBe(true);
    expect(needsRefresh(null, NOW)).toBe(true);
  });
  it("reads a token answer, with the 30-day sliding refresh", () => {
    expect(tokenSet({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: SCOPE, token_type: "Bearer" }, NOW)).toEqual({
      access: "a",
      refresh: "r",
      expiresAt: "2026-10-27T11:00:00.000Z",
      refreshExpiresAt: "2026-11-26T10:00:00.000Z",
      scope: SCOPE,
    });
    expect(tokenSet({ access_token: "a", refresh_token: "r" }, NOW)?.expiresAt).toBe("2026-10-27T11:00:00.000Z");
    expect(tokenSet({ access_token: "a" }, NOW)).toBeNull();
    expect(tokenSet({ error: "invalid_grant" }, NOW)).toBeNull();
    expect(tokenSet(null, NOW)).toBeNull();
  });
});

describe("the allowlist and the argument guard", () => {
  const ad = { name: "n", imageUrl: "https://x.supabase.co/storage/v1/object/sign/cs-ad-images/u/a.jpg?token=t", dryRun: true };
  it("calls only the eight tools, never a launch from a template or a blueprint, a pause or a budget change", () => {
    for (const t of ["whoami", "list-pages", "list-ad-accounts", "preflight-launch", "get-campaign-status", "get-campaign-metrics", "list-leads"]) {
      expect(guardCall(t, {}).ok, t).toBe(true);
    }
    expect(guardCall("create-campaign", ad).ok).toBe(true);
    for (const t of ["launch-from-template", "launch-from-blueprint", "launch-batch", "pause-campaign", "pause-ad", "update-budget", "update-adset", "generate-ad-image", "", 42, null]) {
      expect(guardCall(t, {}).ok, String(t)).toBe(false);
    }
  });
  it("refuses a template or a blueprint on any tool", () => {
    expect(guardCall("create-campaign", { ...ad, templateId: "t1" }).ok).toBe(false);
    expect(guardCall("create-campaign", { ...ad, blueprintId: "b1" }).ok).toBe(false);
    expect(guardCall("preflight-launch", { templateId: "t1" }).ok).toBe(false);
    expect(guardCall("preflight-launch", { blueprintId: "b1" }).ok).toBe(false);
  });
  it("refuses adding to a campaign that already exists", () => {
    expect(guardCall("create-campaign", { ...ad, appendToCampaignId: "c1", confirm: true }).ok).toBe(false);
    expect(guardCall("create-campaign", { ...ad, confirm: true }).ok).toBe(false);
  });
  it("makes every created campaign an image ad from an https picture", () => {
    const g = guardCall("create-campaign", { ...ad, mediaType: "video", videoUrl: "https://v" });
    expect(g.ok && g.args.mediaType).toBe("image");
    expect(guardCall("create-campaign", { ...ad, imageUrl: "data:image/png;base64,AAAA" }).ok).toBe(false);
    expect(guardCall("create-campaign", { ...ad, imageUrl: "http://plain.example/a.jpg" }).ok).toBe(false);
    expect(guardCall("create-campaign", { name: "n" }).ok).toBe(false);
  });
  it("keeps the arguments it was given, and refuses unreadable ones", () => {
    expect(guardCall("get-campaign-status", { campaignId: "c1" })).toEqual({ ok: true, tool: "get-campaign-status", args: { campaignId: "c1" } });
    expect(guardCall("whoami", undefined)).toEqual({ ok: true, tool: "whoami", args: {} });
    expect(guardCall("whoami", [1]).ok).toBe(false);
    expect(guardCall("whoami", "x").ok).toBe(false);
    expect(guardCall("whoami", null).ok).toBe(false);
    expect(guardCall("create-campaign", { ...ad, dryRun: "true" }).ok).toBe(false);
    expect(guardCall("list-leads", { q: "x".repeat(20_000) }).ok).toBe(false);
  });
});

describe("the MCP call and its answer", () => {
  it("sends one stateless tools/call with the era's headers", () => {
    const r = mcpRequest("tok", "whoami", {});
    expect(r.headers).toEqual({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "whoami",
    });
    expect(JSON.parse(r.body)).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } });
  });

  const answer = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }], structuredContent: { pages: [{ pageId: "p1", name: "Leo" }] } } };
  it("reads a JSON answer", () => {
    expect(readRpc("application/json", JSON.stringify(answer))).toEqual(answer);
    expect(readRpc("application/json", "not json")).toBeNull();
    expect(readRpc("application/json", JSON.stringify({ ...answer, id: 2 }))).toBeNull();
  });
  it("reads a server-sent-event answer past its progress notes", () => {
    const progress = { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 1, progress: 0.5 } };
    const stream = `: keep-alive\n\ndata: ${JSON.stringify(progress)}\n\nevent: message\ndata: ${JSON.stringify(answer)}\n\n`;
    expect(readRpc("text/event-stream", stream)).toEqual(answer);
    expect(readRpc("text/event-stream; charset=utf-8", stream.replace(/\n/g, "\r\n"))).toEqual(answer);
    expect(readRpc("text/event-stream", `data: ${JSON.stringify(progress)}\n\n`)).toBeNull();
    expect(readRpc("text/event-stream", "")).toBeNull();
  });
  it("takes a tool's structured data, or its text when there is none", () => {
    expect(toolAnswer(answer)).toEqual({ ok: true, data: { pages: [{ pageId: "p1", name: "Leo" }] } });
    expect(toolAnswer({ id: 1, result: { content: [{ type: "text", text: '{"a":1}' }] } })).toEqual({ ok: true, data: { a: 1 } });
    expect(toolAnswer({ id: 1, result: { content: [{ type: "text", text: "plain" }] } })).toEqual({ ok: true, data: "plain" });
  });
  it("gives a tool's failure in AdLauncher's own words", () => {
    const failed = { error: "daily budget 0.5 SGD is below Meta's 1.00 SGD minimum", hint: "Raise it.", code: "below_budget_floor" };
    expect(toolAnswer({ id: 1, result: { isError: true, structuredContent: failed, content: [] } })).toEqual({ ok: false, error: failed.error, hint: "Raise it.", code: "below_budget_floor" });
    expect(toolAnswer({ id: 1, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "No page." }) }] } })).toEqual({ ok: false, error: "No page.", hint: undefined, code: undefined });
    expect(toolAnswer({ id: 1, result: { isError: true, content: [{ type: "text", text: "Plain failure" }] } })).toMatchObject({ ok: false, error: "Plain failure" });
    expect(toolAnswer({ id: 1, error: { code: -32602, message: "Invalid params: cta" } })).toEqual({ ok: false, error: "Invalid params: cta", code: "rpc_-32602" });
    expect(toolAnswer(null)).toMatchObject({ ok: false, code: "unreadable" });
  });
});

describe("the account summary", () => {
  it("keeps what the page shows from whoami", () => {
    expect(
      accountSummary({
        organizationId: "o1",
        organizationName: "D'Marketing",
        role: "agency_owner",
        credentialScope: "organization",
        clientId: null,
        clientName: null,
        toolsets: ["core"],
        grants: ["core:read"],
        activeAdAccountId: "1234",
        activeAdAccountName: "Leo SG",
        accountCurrency: "SGD",
        activePageId: "p1",
        activePageName: "Leo Tan",
        metaTokenExpiresAt: null,
        credentialExpiresAt: null,
      }),
    ).toEqual({ organization: "D'Marketing", client: null, role: "agency_owner", adAccountId: "1234", adAccountName: "Leo SG", currency: "SGD", pageId: "p1", pageName: "Leo Tan" });
    expect(accountSummary(null)).toEqual({ organization: null, client: null, role: null, adAccountId: null, adAccountName: null, currency: null, pageId: null, pageName: null });
  });
});

describe("the ad picture", () => {
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3));
  const jpg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3));
  it("takes a PNG or a JPEG that really is one", () => {
    expect(parseImage(`data:image/png;base64,${png}`)).toMatchObject({ ok: true, type: "image/png", ext: "png" });
    expect(parseImage(`data:image/jpeg;base64,${jpg}`)).toMatchObject({ ok: true, type: "image/jpeg", ext: "jpg" });
    const r = parseImage(`data:image/jpeg;base64,${jpg}`);
    expect(r.ok && Array.from(r.bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  });
  it("refuses another type, a mismatch, a bare address or one over 4 MB", () => {
    expect(parseImage(`data:image/jpeg;base64,${png}`).ok).toBe(false);
    expect(parseImage(`data:image/png;base64,${jpg}`).ok).toBe(false);
    expect(parseImage(`data:image/gif;base64,${png}`).ok).toBe(false);
    expect(parseImage(`data:image/svg+xml;base64,${png}`).ok).toBe(false);
    expect(parseImage("https://example.com/a.png").ok).toBe(false);
    expect(parseImage(undefined).ok).toBe(false);
    expect(parseImage(`data:image/jpeg;base64,${"A".repeat(Math.ceil((IMAGE_MAX_BYTES + 10) / 3) * 4)}`)).toEqual({ ok: false, error: "The picture is over 4 MB." });
  });
});

describe("the request", () => {
  it("reads each action, and refuses a finish whose state isn't one of ours", () => {
    expect(parseRequest({ action: "status" })).toEqual({ ok: true, req: { action: "status" } });
    expect(parseRequest({ action: "finish", code: "c", state: "s".repeat(43) })).toEqual({ ok: true, req: { action: "finish", code: "c", state: "s".repeat(43) } });
    expect(parseRequest({ action: "finish", code: "c", state: "short" }).ok).toBe(false);
    expect(parseRequest({ action: "finish", state: "s".repeat(43) }).ok).toBe(false);
    expect(parseRequest({ action: "call", tool: "whoami" })).toEqual({ ok: true, req: { action: "call", tool: "whoami", args: undefined } });
    expect(parseRequest({ action: "launch" }).ok).toBe(false);
    expect(parseRequest(null).ok).toBe(false);
  });
});
