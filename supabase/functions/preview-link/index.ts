// Compliance preview links: the public side of /review/<token>. A manager or
// compliance officer with no account reads a post an adviser shared and
// leaves comments. The token in the URL is the only credential.
//
//   GET  /preview-link/<token>   the snapshot and its comments, or 200
//                                {gone: true} for an unknown, expired or
//                                turned-off link (no console error on the page)
//   POST /preview-link/<token>   {name, body, website} adds a comment
//
// No Supabase JWT arrives from a visitor, so this deploys WITHOUT JWT
// verification and uses the service key, but it can only call the two
// service_role-only functions from supabase/hub/012_preview_links.sql, which
// look the link up by sha256(token) and enforce expiry, revocation and caps:
//   supabase functions deploy preview-link --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
// Responses are JSON only (nosniff, CSP default-src 'none'), with <, > and &
// escaped, so no user text can render as HTML here.

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { MAX_BODY, allowedOrigin, parseCommentBody, safeJson, statusForComment, tokenFromPath } from "./logic.ts";

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

const NOT_FOUND = { error: "not_found", message: "This preview link has expired or been turned off. Ask the adviser for a new one." };

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

Deno.serve(async (req) => {
  const origin = allowedOrigin(req.headers.get("origin"));
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type";
  }
  const reply = (body: unknown, status = 200) => new Response(safeJson(body), { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST, OPTIONS" } });
  }
  const token = tokenFromPath(new URL(req.url).pathname);
  if (!token) return reply(NOT_FOUND, 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    if (req.method === "GET") {
      const { data, error } = await admin.rpc("cs_preview_link_view", { p_token: token });
      if (error) throw error;
      return data ? reply(data) : reply({ gone: true, ...NOT_FOUND });
    }

    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
      return reply({ error: "invalid", message: "That comment is too long." }, 413);
    }
    const raw = await readLimited(req, MAX_BODY);
    if (raw === null) return reply({ error: "invalid", message: "That comment is too long." }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return reply({ error: "invalid", message: "Something went wrong sending that. Try again." }, 400);
    }
    const input = parseCommentBody(parsed);
    if (!input) return reply({ error: "invalid", message: "Add your name and a comment." }, 400);
    // A bot filled the hidden field: look like success, write nothing.
    if (input.honeypot) return reply({ ok: true, comment: null });

    const { data, error } = await admin.rpc("cs_preview_link_comment", {
      p_token: token,
      p_name: input.name,
      p_body: input.body,
    });
    if (error) throw error;
    const result = (data ?? { ok: false, error: "invalid" }) as { ok: boolean; error?: string };
    return reply(result, statusForComment(result));
  } catch (e) {
    console.error("preview-link failed", e instanceof Error ? e.message : String(e));
    return reply({ error: "server", message: "Couldn't load this right now. Try again in a minute." }, 500);
  }
});
