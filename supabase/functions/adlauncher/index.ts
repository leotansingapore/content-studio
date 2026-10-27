// adlauncher (docs/adlauncher-ads.md): Content Studio's connection to AdLauncher (autoadslauncher.com), which
// launches the ads the studio makes, always paused. One POST { action, ... } with the caller's own session:
//   status                  connected or not, and the account summary (whoami)
//   start                   a new state and PKCE verifier on the caller's row; answers the authorize address
//   finish {code, state}    the state must be the caller's and under 10 minutes old; saves the tokens
//   call {tool, args}       one allowlisted AdLauncher tool (logic.ts guardCall); refreshes once when needed
//   image {dataUrl}         a PNG or JPEG under 4 MB into the private cs-ad-images bucket; a 365-day signed address
//   disconnect              revokes the refresh token (best effort) and deletes the row
// Nothing here switches a campaign on, pauses it or changes a budget: those tools are not on the allowlist.
//
// Leo's sign-ins only (NORTH_STAR_USERS, as remix-link): everyone else is refused before any read.
// Secrets: ADLAUNCHER_CLIENT_ID and ADLAUNCHER_REDIRECT_URI (the client registered once at /mcp/register),
// ADLAUNCHER_TOKEN_KEY (32 random bytes, base64), NORTH_STAR_USERS. Off (503) until all three are set.
// Table and bucket: supabase/hub/025_adlauncher_links.sql, service role only. Tokens and the verifier are kept
// encrypted (logic.ts seal) and are never logged or answered.
// Deploy WITH JWT verification:
//   supabase functions deploy adlauncher --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { isAllowed } from "../social/logic.ts";
import {
  BUCKET,
  MCP_URL,
  RECONNECT,
  REVOKE_URL,
  SIGNED_URL_SECONDS,
  TOKEN_URL,
  accountSummary,
  authorizeUrl,
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
  type AdlTool,
  type TokenSet,
  type ToolAnswer,
} from "./logic.ts";

const TABLE = "cs_adlauncher_links";
const TOKEN_TIMEOUT_MS = 15_000;
// a live create-campaign makes the campaign, ad set, creative, form and ad on Meta in one call
const MCP_TIMEOUT_MS = 90_000;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

interface Row {
  user_id: string;
  access_enc: string | null;
  refresh_enc: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  scope: string | null;
  account: unknown;
  pending_state: string | null;
  pending_verifier_enc: string | null;
  pending_at: string | null;
}

/** The connection is gone (refused refresh, or a 401 after one): the browser shows Reconnect. */
class Reconnect extends Error {}
/** AdLauncher answered 401 to a tool call. */
class Unauthorized extends Error {}
/** AdLauncher can't be reached, is slow or is busy: nothing is changed here. */
class Upstream extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const slow = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** POST a form to AdLauncher's token endpoint: the token set, null when AdLauncher refuses (4xx). */
async function tokenRequest(form: Record<string, string>, now: number): Promise<TokenSet | null> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (e) {
    throw new Upstream(slow(e) ? 504 : 502, slow(e) ? "AdLauncher took too long to answer. Try again." : "Couldn't reach AdLauncher. Try again.");
  }
  if (res.status >= 500 || res.status === 429) throw new Upstream(502, "AdLauncher didn't answer. Try again in a minute.");
  if (!res.ok) return null;
  try {
    return tokenSet(JSON.parse(text), now);
  } catch {
    return null;
  }
}

/** One tools/call. A 401 throws Unauthorized; a refusal comes back as { ok: false } in AdLauncher's words. */
async function mcp(access: string, tool: AdlTool, args: Record<string, unknown>): Promise<ToolAnswer> {
  const r = mcpRequest(access, tool, args);
  let res: Response;
  let text: string;
  try {
    res = await fetch(MCP_URL, { method: "POST", headers: r.headers, body: r.body, signal: AbortSignal.timeout(MCP_TIMEOUT_MS) });
    text = await res.text();
  } catch (e) {
    throw new Upstream(slow(e) ? 504 : 502, slow(e) ? "AdLauncher took too long to answer. Try again." : "Couldn't reach AdLauncher. Try again.");
  }
  if (res.status === 401) throw new Unauthorized();
  if (res.status === 429) throw new Upstream(429, "AdLauncher is busy. Try again in a minute.");
  const frame = readRpc(res.headers.get("content-type"), text);
  if (!res.ok && !frame) throw new Upstream(502, `AdLauncher answered ${res.status}. Try again.`);
  return toolAnswer(frame);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);
  if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);

  const parsed = parseRequest(await req.json().catch(() => ({})));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const q = parsed.req;

  const clientId = Deno.env.get("ADLAUNCHER_CLIENT_ID")?.trim() ?? "";
  const redirectUri = Deno.env.get("ADLAUNCHER_REDIRECT_URI")?.trim() ?? "";
  const key = clientId && redirectUri ? await tokenKey(Deno.env.get("ADLAUNCHER_TOKEN_KEY")).catch(() => null) : null;
  if (!key) {
    console.error("adlauncher not set up: ADLAUNCHER_CLIENT_ID, ADLAUNCHER_REDIRECT_URI or ADLAUNCHER_TOKEN_KEY missing or malformed");
    return json({ code: "unavailable", error: "AdLauncher isn't set up yet." }, 503);
  }

  // every sealed value is bound to this sign-in and its column
  const bind = (col: "access" | "refresh" | "verifier") => `${uid}:${col}`;
  const stamp = () => new Date().toISOString();
  const getRow = async (): Promise<Row | null> => {
    const { data, error } = await admin.from(TABLE).select("*").eq("user_id", uid).maybeSingle();
    if (error) throw new Error(`${TABLE} read: ${error.message}`);
    return data as Row | null;
  };
  const save = async (patch: Partial<Row>) => {
    const { error } = await admin.from(TABLE).upsert({ user_id: uid, ...patch, updated_at: stamp() }, { onConflict: "user_id" });
    if (error) throw new Error(`${TABLE} write: ${error.message}`);
  };
  const saveTokens = async (t: TokenSet) =>
    save({
      access_enc: await seal(key, t.access, bind("access")),
      refresh_enc: await seal(key, t.refresh, bind("refresh")),
      expires_at: t.expiresAt,
      refresh_expires_at: t.refreshExpiresAt,
      scope: t.scope,
    });
  // the account summary stays, so the page can say which account to reconnect
  const markDisconnected = () => save({ access_enc: null, refresh_enc: null, expires_at: null, refresh_expires_at: null });
  /** A saved token; one this key can't open (the key was changed) is a connection to make again. */
  const openToken = async (sealed: string, col: "access" | "refresh") => {
    try {
      return await unseal(key, sealed, bind(col));
    } catch {
      await markDisconnected();
      throw new Reconnect();
    }
  };

  /** A fresh access token from the refresh token; a refusal disconnects. AdLauncher rotates the refresh token every time. */
  const refresh = async (row: Row): Promise<string> => {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: await openToken(row.refresh_enc!, "refresh"), client_id: clientId }, Date.now());
    if (!t) {
      await markDisconnected();
      throw new Reconnect();
    }
    await saveTokens(t);
    return t.access;
  };

  /** Runs one call with a live access token: refreshed first with under 2 minutes left, and once more on a 401. */
  const withAccess = async (fn: (access: string) => Promise<ToolAnswer>): Promise<ToolAnswer> => {
    const row = await getRow();
    if (!row?.access_enc || !row.refresh_enc) throw new Reconnect();
    const early = needsRefresh(row.expires_at, Date.now());
    const access = early ? await refresh(row) : await openToken(row.access_enc, "access");
    try {
      return await fn(access);
    } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
    }
    if (!early) {
      try {
        return await fn(await refresh(row));
      } catch (e) {
        if (!(e instanceof Unauthorized)) throw e;
      }
    }
    // a 401 straight after a refresh: AdLauncher no longer takes this connection
    await markDisconnected();
    throw new Reconnect();
  };

  try {
    switch (q.action) {
      case "status": {
        const row = await getRow();
        const live = !!row?.access_enc && !!row.refresh_enc && Date.parse(row.refresh_expires_at ?? "") > Date.now();
        if (live) return json({ connected: true, account: row!.account ?? null, scope: row!.scope });
        return json({ connected: false, reconnect: !!row?.account, account: row?.account ?? null });
      }

      case "start": {
        const state = randomToken(32);
        const verifier = randomToken(48);
        await save({ pending_state: state, pending_verifier_enc: await seal(key, verifier, bind("verifier")), pending_at: stamp() });
        return json({ url: authorizeUrl({ clientId, redirectUri, state, challenge: await pkceChallenge(verifier) }) });
      }

      case "finish": {
        const row = await getRow();
        const check = checkState(row, q.state, Date.now());
        if (check !== "ok") {
          return json({ code: "stale", error: check === "expired" ? "That sign-in took over 10 minutes. Press Connect again." : "That sign-in link is out of date. Press Connect again." }, 400);
        }
        // single use: the state is cleared before the code is spent, and only the request that cleared it goes on
        const { data: took, error } = await admin
          .from(TABLE)
          .update({ pending_state: null, pending_verifier_enc: null, pending_at: null, updated_at: stamp() })
          .eq("user_id", uid)
          .eq("pending_state", q.state)
          .select("user_id");
        if (error) throw new Error(`${TABLE} consume: ${error.message}`);
        if (!Array.isArray(took) || took.length === 0) return json({ code: "stale", error: "That sign-in link is out of date. Press Connect again." }, 400);
        const verifier = await unseal(key, row!.pending_verifier_enc!, bind("verifier")).catch(() => null);
        if (!verifier) return json({ code: "stale", error: "That sign-in link is out of date. Press Connect again." }, 400);
        const tokens = await tokenRequest({ grant_type: "authorization_code", code: q.code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId }, Date.now());
        if (!tokens) return json({ code: "refused", error: "AdLauncher didn't accept that sign-in. Press Connect again." }, 502);
        await saveTokens(tokens);
        let account = null;
        try {
          const who = await mcp(tokens.access, "whoami", {});
          if (who.ok) account = accountSummary(who.data);
        } catch {
          // connected all the same; the page shows the account once whoami answers
        }
        await save({ account });
        return json({ connected: true, account, scope: tokens.scope });
      }

      case "call": {
        const g = guardCall(q.tool, q.args);
        if (!g.ok) return json({ code: "refused", error: g.error }, 400);
        const answer = await withAccess((access) => mcp(access, g.tool, g.args));
        // whoami refreshes the summary the page shows
        if (g.tool === "whoami" && answer.ok) await save({ account: accountSummary(answer.data) });
        return json(answer);
      }

      case "image": {
        const img = parseImage(q.dataUrl);
        if (!img.ok) return json({ error: img.error }, 400);
        const path = `${uid}/${randomToken(16)}.${img.ext}`;
        const up = await admin.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: false });
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
        if (signed.error || !signed.data?.signedUrl) throw new Error(`sign: ${signed.error?.message ?? "no address"}`);
        return json({ url: signed.data.signedUrl });
      }

      case "disconnect": {
        const row = await getRow();
        if (row?.refresh_enc) {
          try {
            // revoking the refresh token revokes its access token too (one mcp_api_keys row at AdLauncher)
            await fetch(REVOKE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token: await unseal(key, row.refresh_enc, bind("refresh")), token_type_hint: "refresh_token", client_id: clientId }).toString(),
              signal: AbortSignal.timeout(5_000),
            });
          } catch {
            // best effort: the row goes either way, and the token dies in 30 days unused
          }
        }
        const { error } = await admin.from(TABLE).delete().eq("user_id", uid);
        if (error) throw new Error(`${TABLE} delete: ${error.message}`);
        return json({ connected: false });
      }
    }
  } catch (e) {
    if (e instanceof Reconnect) return json({ code: "reconnect", error: RECONNECT }, 409);
    if (e instanceof Upstream) return json({ code: "upstream", error: e.message }, e.status);
    console.error("adlauncher failed", q.action, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
