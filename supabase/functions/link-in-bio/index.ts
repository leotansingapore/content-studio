// Link-in-bio pages: the public side of /l/<slug>.
//
//   GET /link-in-bio/<slug>            the published page (name, line, photo,
//                                      link labels and ids; never the URLs), or 404
//   GET /link-in-bio/<slug>/<linkId>   302 to that link's stored URL, counting
//                                      the click; unknown links go to the page
//
// Visitors send no Supabase JWT, so this deploys WITHOUT JWT verification and
// uses the service key, but it only calls the two service_role-only functions
// from supabase/hub/015_link_in_bio.sql:
//   supabase functions deploy link-in-bio --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
// Not an open redirect: the target is looked up on the server by (slug, link
// id), re-parsed here with new URL(), and only http(s) is followed. Bots and
// link previewers are redirected without counting; HEAD never counts.

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { isBot, pageUrl, parsePath, safeJson, safeRedirectUrl } from "./logic.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function reply(body: unknown, status: number, cache: string): Response {
  return new Response(safeJson(body), { status, headers: { ...JSON_HEADERS, "Cache-Control": cache } });
}

function redirect(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { ...JSON_HEADERS, Allow: "GET, HEAD, OPTIONS" } });
  }
  const route = parsePath(new URL(req.url).pathname);
  if (!route) return reply({ error: "not_found" }, 404, "no-store");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    if (!route.linkId) {
      const { data, error } = await admin.rpc("cs_bio_page_public", { p_slug: route.slug });
      if (error) throw error;
      return data ? reply(data, 200, "public, max-age=60") : reply({ error: "not_found" }, 404, "no-store");
    }

    const count = req.method === "GET" && !isBot(req.headers.get("user-agent"));
    const { data, error } = await admin.rpc("cs_bio_click", {
      p_slug: route.slug,
      p_link_id: route.linkId,
      p_count: count,
    });
    if (error) throw error;
    return redirect(safeRedirectUrl(data) ?? pageUrl(route.slug));
  } catch (e) {
    console.error("link-in-bio failed", e instanceof Error ? e.message : String(e));
    return route.linkId ? redirect(pageUrl(route.slug)) : reply({ error: "server" }, 500, "no-store");
  }
});
