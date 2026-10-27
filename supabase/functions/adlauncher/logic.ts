// AdLauncher (autoadslauncher.com, repo ~/agency-launchpad-90) over its MCP: the pure parts of the `adlauncher`
// function, so vitest covers them with no AdLauncher call. OAuth 2.1 with PKCE, the encrypted tokens, the tool
// allowlist and its argument guard, and reading the MCP's JSON or server-sent-event answers. Design and the
// facts read in AdLauncher's code: docs/adlauncher-ads.md.
// No Deno or npm imports: WebCrypto, fetch-free. The app imports its types and limits from here.

export const ADL_ORIGIN = "https://autoadslauncher.com";
export const MCP_URL = `${ADL_ORIGIN}/mcp`;
export const AUTHORIZE_URL = `${ADL_ORIGIN}/mcp/authorize`;
export const TOKEN_URL = `${ADL_ORIGIN}/mcp/token`;
export const REVOKE_URL = `${ADL_ORIGIN}/mcp/revoke`;
/** Everything we call is in AdLauncher's core toolset; never meta:modify or creative:generate. */
export const SCOPE = "core:read core:write meta:launch";
/** mcp-server-v2/lib/protocol.ts: this era also needs Mcp-Method and Mcp-Name on every tools/call. */
export const PROTOCOL_VERSION = "2026-07-28";

export const STATE_TTL_MS = 10 * 60_000;
/** Refresh when less than this is left on the access token (it lasts an hour). */
export const REFRESH_EARLY_MS = 2 * 60_000;
/** AdLauncher's refresh tokens last 30 days and slide on every refresh (mcp-oauth/oauth.ts). */
export const REFRESH_TTL_MS = 30 * 24 * 3600_000;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 365 * 24 * 3600;
export const ARGS_MAX_CHARS = 16_000;
export const BUCKET = "cs-ad-images";

export const RECONNECT = "Reconnect AdLauncher.";

/** The only tools this function will call. Never launch-from-template or launch-from-blueprint. */
export const TOOLS = [
  "whoami",
  "list-pages",
  "list-ad-accounts",
  "preflight-launch",
  "create-campaign",
  "get-campaign-status",
  "get-campaign-metrics",
  "list-leads",
] as const;
export type AdlTool = (typeof TOOLS)[number];

/** AdLauncher's copy limits (mcp-server-v2/lib/types.ts COPY_LIMITS). */
export const COPY_LIMITS = { headline: 200, primaryText: 2000 } as const;

// ---- base64url and random ----

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** n random bytes as base64url: 32 bytes give 43 characters. */
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// ---- PKCE and the authorize address ----

/** RFC 7636 S256: base64url(sha256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export function authorizeUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(AUTHORIZE_URL);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    resource: MCP_URL,
    scope: SCOPE,
  })) u.searchParams.set(k, v);
  return u.toString();
}

/** Same length and same characters, without stopping at the first difference. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Whether a returning state is the one this sign-in saved, and saved under 10 minutes ago. */
export function checkState(
  row: { pending_state?: string | null; pending_at?: string | null } | null | undefined,
  state: unknown,
  now: number,
): "ok" | "mismatch" | "expired" {
  if (!row?.pending_state || typeof state !== "string" || !sameString(row.pending_state, state)) return "mismatch";
  const at = Date.parse(row.pending_at ?? "");
  // a clock that says the state was saved in the future is as stale as one too old
  return Number.isFinite(at) && now - at >= 0 && now - at < STATE_TTL_MS ? "ok" : "expired";
}

// ---- token encryption (AES-GCM, ADLAUNCHER_TOKEN_KEY) ----

/** ADLAUNCHER_TOKEN_KEY: 32 random bytes, base64 or base64url. Anything else is refused. */
export async function tokenKey(raw: string | undefined): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromB64url((raw ?? "").trim().replace(/=+$/, ""));
  } catch {
    throw new Error("ADLAUNCHER_TOKEN_KEY is not base64");
  }
  if (bytes.length !== 32) throw new Error("ADLAUNCHER_TOKEN_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** "v1.<iv>.<ciphertext>". `bind` (user id and column) is the additional data, so a value can't move rows or columns. */
export async function seal(key: CryptoKey, plain: string, bind: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(bind) }, key, new TextEncoder().encode(plain));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function unseal(key: CryptoKey, sealed: string, bind: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("unreadable sealed value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv), additionalData: new TextEncoder().encode(bind) }, key, fromB64url(ct));
  return new TextDecoder().decode(plain);
}

// ---- tokens ----

export const needsRefresh = (expiresAt: string | null | undefined, now: number) => {
  const at = Date.parse(expiresAt ?? "");
  return !Number.isFinite(at) || at - now < REFRESH_EARLY_MS;
};

export interface TokenSet {
  access: string;
  refresh: string;
  expiresAt: string;
  refreshExpiresAt: string;
  scope: string | null;
}

/** AdLauncher's /mcp/token answer, or null when it isn't one. A refresh always hands back a new refresh token. */
export function tokenSet(body: unknown, now: number): TokenSet | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.access_token !== "string" || !b.access_token || typeof b.refresh_token !== "string" || !b.refresh_token) return null;
  const secs = typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in : 3600;
  return {
    access: b.access_token,
    refresh: b.refresh_token,
    expiresAt: new Date(now + secs * 1000).toISOString(),
    refreshExpiresAt: new Date(now + REFRESH_TTL_MS).toISOString(),
    scope: typeof b.scope === "string" ? b.scope.slice(0, 1000) : null,
  };
}

// ---- the allowlist and the argument guard ----

export type Guarded = { ok: true; tool: AdlTool; args: Record<string, unknown> } | { ok: false; error: string };

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The only door to AdLauncher's tools. A tool off the list never reaches it; no call may name a template or a
 * blueprint (a dry run there once created a real, billed campaign); create-campaign is an image ad, never added
 * to a campaign that is already running, and its picture is an https address.
 */
export function guardCall(tool: unknown, args: unknown): Guarded {
  if (typeof tool !== "string" || !(TOOLS as readonly string[]).includes(tool)) return { ok: false, error: "That isn't something the studio does in AdLauncher." };
  const a = args === undefined ? {} : args;
  if (!isPlain(a)) return { ok: false, error: "Those details aren't readable." };
  if (JSON.stringify(a).length > ARGS_MAX_CHARS) return { ok: false, error: "Those details are too long." };
  if ("templateId" in a || "blueprintId" in a || "blueprintIds" in a) return { ok: false, error: "Templates and blueprints are launched in AdLauncher itself." };
  if (tool !== "create-campaign") return { ok: true, tool: tool as AdlTool, args: a };
  if ("appendToCampaignId" in a || "confirm" in a) return { ok: false, error: "Adding to a campaign that already exists is done in AdLauncher itself." };
  if (a.dryRun !== undefined && typeof a.dryRun !== "boolean") return { ok: false, error: "Those details aren't readable." };
  if (typeof a.imageUrl !== "string" || !a.imageUrl.startsWith("https://")) return { ok: false, error: "The picture has to be uploaded first." };
  return { ok: true, tool: "create-campaign", args: { ...a, mediaType: "image" } };
}

// ---- the MCP call and its answer ----

/** One stateless tools/call: headers and body (AdLauncher's mcp-server-v2/lib/protocol.ts). */
export function mcpRequest(access: string, tool: AdlTool, args: Record<string, unknown>, id = 1): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": tool,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }),
  };
}

/** The JSON-RPC answer to request `id`, from a JSON body or a server-sent-event stream; null when there is none. */
export function readRpc(contentType: string | null, text: string, id = 1): Record<string, unknown> | null {
  const frames: unknown[] = [];
  if ((contentType ?? "").includes("text/event-stream")) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        frames.push(JSON.parse(data));
      } catch {
        // a keep-alive or a partial line: not an answer
      }
    }
  } else {
    try {
      frames.push(JSON.parse(text));
    } catch {
      return null;
    }
  }
  // progress notifications ride the same stream; the answer is the frame with our id and a result or an error
  const found = frames.find((f) => isPlain(f) && f.id === id && ("result" in f || "error" in f));
  return (found as Record<string, unknown> | undefined) ?? null;
}

export type ToolAnswer = { ok: true; data: unknown } | { ok: false; error: string; hint?: string; code?: string };

const firstText = (r: Record<string, unknown>) => {
  const c = Array.isArray(r.content) ? r.content.find((x) => isPlain(x) && x.type === "text") : null;
  return isPlain(c) && typeof c.text === "string" ? c.text : "";
};

/** A tool's answer: its structured data, or its failure in AdLauncher's own words (result.isError, or a JSON-RPC error). */
export function toolAnswer(frame: Record<string, unknown> | null): ToolAnswer {
  if (!frame) return { ok: false, error: "AdLauncher's answer wasn't readable.", code: "unreadable" };
  if (isPlain(frame.error)) {
    const e = frame.error;
    return { ok: false, error: typeof e.message === "string" && e.message ? e.message : "AdLauncher refused that.", code: `rpc_${String(e.code ?? "")}` };
  }
  const r = isPlain(frame.result) ? frame.result : {};
  const s = isPlain(r.structuredContent) ? r.structuredContent : null;
  if (r.isError === true) {
    let err: Record<string, unknown> = s ?? {};
    if (!s) {
      try {
        const parsed = JSON.parse(firstText(r));
        if (isPlain(parsed)) err = parsed;
      } catch {
        err = { error: firstText(r) };
      }
    }
    return {
      ok: false,
      error: typeof err.error === "string" && err.error ? err.error : "AdLauncher refused that.",
      hint: typeof err.hint === "string" && err.hint ? err.hint : undefined,
      code: typeof err.code === "string" && err.code ? err.code : undefined,
    };
  }
  if (r.structuredContent !== undefined) return { ok: true, data: r.structuredContent };
  try {
    return { ok: true, data: JSON.parse(firstText(r)) };
  } catch {
    return { ok: true, data: firstText(r) || null };
  }
}

// ---- the account summary (whoami) ----

export interface AccountSummary {
  organization: string | null;
  client: string | null;
  role: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  currency: string | null;
  pageId: string | null;
  pageName: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** whoami's answer (mcp-server-v2/tools/discovery.ts, frozen outputSchema) as what the page shows. */
export function accountSummary(w: unknown): AccountSummary {
  const o = isPlain(w) ? w : {};
  return {
    organization: str(o.organizationName),
    client: str(o.clientName),
    role: str(o.role),
    adAccountId: str(o.activeAdAccountId),
    adAccountName: str(o.activeAdAccountName),
    currency: str(o.accountCurrency),
    pageId: str(o.activePageId),
    pageName: str(o.activePageName),
  };
}

// ---- the ad picture ----

export type ParsedImage = { ok: true; bytes: Uint8Array; type: "image/png" | "image/jpeg"; ext: "png" | "jpg" } | { ok: false; error: string };

/** A PNG or JPEG data URL under 4 MB whose bytes really are that type. */
export function parseImage(dataUrl: unknown): ParsedImage {
  const m = typeof dataUrl === "string" ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl) : null;
  if (!m) return { ok: false, error: "Send the picture as a PNG or JPEG." };
  // base64 is 4 characters per 3 bytes: refuse before decoding anything that big
  if ((m[2].length * 3) / 4 > IMAGE_MAX_BYTES + 3) return { ok: false, error: "The picture is over 4 MB." };
  let bytes: Uint8Array;
  try {
    bytes = fromB64url(m[2].replace(/=+$/, ""));
  } catch {
    return { ok: false, error: "The picture isn't readable." };
  }
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, error: "The picture is over 4 MB." };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (m[1] === "png" ? !png : !jpeg) return { ok: false, error: "The picture isn't readable." };
  return m[1] === "png" ? { ok: true, bytes, type: "image/png", ext: "png" } : { ok: true, bytes, type: "image/jpeg", ext: "jpg" };
}

// ---- the request ----

export type AdlRequest =
  | { action: "status" }
  | { action: "start" }
  | { action: "finish"; code: string; state: string }
  | { action: "call"; tool: unknown; args: unknown }
  | { action: "image"; dataUrl: unknown }
  | { action: "disconnect" };

export function parseRequest(body: unknown): { ok: true; req: AdlRequest } | { ok: false; error: string } {
  const b = isPlain(body) ? body : {};
  switch (b.action) {
    case "status":
    case "start":
    case "disconnect":
      return { ok: true, req: { action: b.action } };
    case "finish":
      if (typeof b.code !== "string" || !b.code || b.code.length > 512 || typeof b.state !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(b.state)) {
        return { ok: false, error: "That sign-in link isn't readable. Press Connect again." };
      }
      return { ok: true, req: { action: "finish", code: b.code, state: b.state } };
    case "call":
      return { ok: true, req: { action: "call", tool: b.tool, args: b.args } };
    case "image":
      return { ok: true, req: { action: "image", dataUrl: b.dataUrl } };
    default:
      return { ok: false, error: "Unknown action." };
  }
}
