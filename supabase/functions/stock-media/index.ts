// Free stock photos (Media page) and B-roll clips (video editor) from Pexels.
// A signed-in adviser sends {kind: "photo"|"video", query, page?, orientation?};
// this answers {items, more} with each item's credit. The key stays here.
// Identical searches within the hour come from a cache and count nothing;
// every other search counts against the "stock-search" daily cap (cs_ai_usage).
//
// Secrets: PEXELS_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy stock-media --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { PER_PAGE, TtlCache, cacheKey, normalizePhotos, normalizeVideos, parseStockRequest, pexelsUrl, type StockItem } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ponytail: per-isolate cache, lost on a cold start; a table cache if Pexels' 20k/month ever gets close
const cache = new TtlCache<{ items: StockItem[]; more: boolean }>(300, 60 * 60 * 1000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseStockRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to search free photos." }, 401);

    const key = cacheKey(parsed.request);
    const hit = cache.get(key);
    if (hit) return json(hit);

    const apiKey = Deno.env.get("PEXELS_API_KEY");
    if (!apiKey) {
      console.error("PEXELS_API_KEY is not set");
      return json({ error: "Free photo search isn't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, "stock-search");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    let res: Response;
    try {
      res = await fetch(pexelsUrl(parsed.request), { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      console.error("stock-media pexels request failed", e);
      return json({ error: "Couldn't reach the photo library. Try again in a minute." }, 502);
    }
    if (!res.ok) {
      console.error("stock-media pexels", res.status, (await res.text()).slice(0, 200));
      return json({ error: res.status === 429 ? "The photo library is busy. Try again in a few minutes." : "Couldn't search right now. Try again in a minute." }, 502);
    }
    const data = await res.json().catch(() => null);
    const items = parsed.request.kind === "video" ? normalizeVideos(data) : normalizePhotos(data);
    const out = { items, more: !!data?.next_page && items.length >= PER_PAGE / 2 };
    cache.set(key, out);
    return json(out);
  } catch (e) {
    console.error("stock-media failed", e);
    return json({ error: "Couldn't search right now. Try again in a minute." }, 500);
  }
});
