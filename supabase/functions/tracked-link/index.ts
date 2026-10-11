// Tracked short links: the public side of /t/<slug> (docs/tracked-links.md).
//
//   GET /tracked-link/<slug>                 302 to the link's stored URL,
//                                            counting the tap and the person;
//                                            an unknown slug gets a plain-text 404
//   GET /tracked-link/report/<report slug>   a campaign's public report (JSON), or 404
//
// The app serves /t/<slug> through a vercel.json rewrite to this function.
// Visitors send no Supabase JWT, so this deploys WITHOUT JWT verification and
// uses the service key, but it only calls the two service_role-only functions
// from supabase/hub/019_tracked_links.sql:
//   supabase functions deploy tracked-link --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
// Not an open redirect: the target is looked up on the server by slug,
// re-parsed here with new URL(), and only http(s) is followed. Bots and link
// previewers are sent on without counting; HEAD never counts. The visitor key
// (SHA-256 of IP and user agent) and the IP are never logged.

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { NOT_FOUND_TEXT, clientIp, isBot, parsePath, safeJson, safeRedirectUrl, visitorKey } from "./logic.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "no-store",
};

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
  });

const notFound = () => text(404, NOT_FOUND_TEXT);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { ...JSON_HEADERS, Allow: "GET, HEAD, OPTIONS" } });
  }
  const route = parsePath(new URL(req.url).pathname);
  if (!route) return notFound();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    if (route.kind === "report") {
      const { data, error } = await admin.rpc("cs_tracked_link_report_public", { p_report_slug: route.slug });
      if (error) throw error;
      return new Response(safeJson(data ?? { error: "not_found" }), { status: data ? 200 : 404, headers: JSON_HEADERS });
    }

    const ua = req.headers.get("user-agent");
    const count = req.method === "GET" && !isBot(ua);
    const { data, error } = await admin.rpc("cs_tracked_link_click", {
      p_slug: route.slug,
      p_visitor: count ? await visitorKey(clientIp(req.headers), ua) : null,
      p_count: count,
    });
    if (error) throw error;
    const to = safeRedirectUrl(data);
    if (!to) return notFound();
    return new Response(null, {
      status: 302,
      headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin" },
    });
  } catch (e) {
    // Only the error code: a message could carry the request's values.
    console.error("tracked-link failed", (e as { code?: string })?.code ?? "unknown");
    return route.kind === "report"
      ? new Response(safeJson({ error: "server" }), { status: 500, headers: JSON_HEADERS })
      : text(503, "Couldn't open this link. Try again in a minute.\n");
  }
});
