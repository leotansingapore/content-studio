// Content Studio for Claude (MCP over plain HTTP POST). An adviser makes a
// connection link in Content Studio > Connect Claude and pastes it into Claude
// as a custom connector; the link is the credential (see logic.ts).
//
// No Supabase JWT arrives from Claude, so this deploys WITHOUT JWT verification
// and uses the service key, but every read and write is pinned to the user id
// in the link, and only after the link's hashed row is found for that user.
// A link whose user is on NORTH_STAR_USERS gets phase 6's tools, prompts and
// daily cap (logic.ts Caller); every other link answers as it always has.
//   supabase functions deploy content-studio-mcp --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { isAllowed } from "../market/logic.ts";
import { handleRpc, linkIsLive, linkKey, parseToken, revokedKey, sha256Hex, type Caller, type Store } from "./logic.ts";

const MAX_BODY = 64 * 1024;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

const DEAD_LINK = { error: "This connection link isn't active. Make a new one in Postmosis > Connect Claude." };

/** The body as text, or null past `max` bytes (a chunked body has no content-length to check). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// ponytail: no per-IP throttle; a forged token costs one primary-key lookup and the
// platform's limits apply. Add one if invocations ever spike.
// Log note: the secret sits in the URL path, so edge logs hold it; only project
// admins read those, and they can read the table directly anyway.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const last = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  let token = last;
  try {
    token = decodeURIComponent(last);
  } catch {
    // a malformed escape: parseToken refuses it as written
  }
  const link = parseToken(token);
  if (!link) return json(DEAD_LINK, 404);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Request too large." }, 413);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const table = () => admin.from("cs_user_data");
  try {
    // live only while its hashed row exists for this very user and it hasn't been turned off
    const hash = await sha256Hex(link.secret);
    const { data: found, error: linkError } = await table()
      .select("key, data")
      .eq("user_id", link.userId)
      .in("key", [linkKey(hash, link.scope), revokedKey(hash, link.scope)]);
    if (linkError) throw linkError;
    if (!linkIsLive((found ?? []).map((r) => r.key), hash, link.scope)) return json(DEAD_LINK, 404);
    // the name Leo gave the link on Connect Claude ({ createdAt, name? }), for the activity row add_draft writes
    let name: string | undefined;
    try {
      const v = JSON.parse((found ?? []).find((r) => r.key === linkKey(hash, link.scope))?.data ?? "{}")?.name;
      if (typeof v === "string" && v.trim()) name = v.trim().slice(0, 30);
    } catch {
      // an older or odd row: the link works without a name
    }
    const caller: Caller = { leo: isAllowed(Deno.env.get("NORTH_STAR_USERS"), link.userId), name, usage: admin };

    const store: Store = {
      async get(key) {
        const { data, error } = await table().select("data").eq("user_id", link.userId).eq("key", key).maybeSingle();
        if (error) throw error;
        return data?.data ?? null;
      },
      async insert(key, data) {
        const { error } = await table().insert({ user_id: link.userId, key, data });
        if (error?.code === "23505") return false; // slot taken
        if (error) throw error;
        return true;
      },
      async all(prefix) {
        // prefixes are logic.ts's fixed literals, which hold no LIKE wildcard
        const { data, error } = await table().select("key, data").eq("user_id", link.userId).like("key", `${prefix}%`);
        if (error) throw error;
        return (data ?? []).map((r) => ({ key: r.key, data: r.data }));
      },
    };

    const raw = await readLimited(req, MAX_BODY);
    if (raw === null) return json({ error: "Request too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    const messages = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const m of messages.slice(0, 20)) {
      const r = await handleRpc(m && typeof m === "object" ? m : {}, store, link, undefined, caller);
      if (r) replies.push(r);
    }
    if (!replies.length) return new Response(null, { status: 202, headers });
    return json(Array.isArray(body) ? replies : replies[0]);
  } catch (e) {
    console.error("content-studio-mcp failed", e instanceof Error ? e.message : String(e));
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Postmosis couldn't read your data right now. Try again in a minute." } }, 500);
  }
});
