// Keyword alerts (Top posts > News > Mentions): recent Google News results in
// Singapore for up to 5 keywords (a name, a product, a topic), via DataForSEO.
// One check counts once against the "mentions" daily cap; each keyword is one
// paid DataForSEO request of 10 results.
//
// Secrets: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD. Deploy WITH JWT verification:
//   supabase functions deploy mentions --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { cleanKeywords, parseNews, searchTerm } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const keywords = cleanKeywords((await req.json().catch(() => ({})))?.keywords);
    if (!keywords.length) return json({ error: "Add a name, product or topic to watch first." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to check mentions." }, 401);

    const login = Deno.env.get("DATAFORSEO_LOGIN");
    const password = Deno.env.get("DATAFORSEO_PASSWORD");
    if (!login || !password) {
      console.error("DATAFORSEO credentials are not set");
      return json({ error: "Mentions aren't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, "mentions");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    const auth = `Basic ${btoa(`${login}:${password}`)}`;
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        try {
          const res = await fetch("https://api.dataforseo.com/v3/serp/google/news/live/advanced", {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/json" },
            body: JSON.stringify([{ keyword: searchTerm(keyword), location_code: 2702, language_code: "en", depth: 10 }]),
            signal: AbortSignal.timeout(25_000),
          });
          if (!res.ok) throw new Error(`news search answered ${res.status}`);
          return { keyword, items: parseNews(await res.json()) };
        } catch (e) {
          console.error("mentions lookup failed", e instanceof Error ? e.message : String(e));
          return { keyword, items: [], error: "Couldn't check this one right now." };
        }
      }),
    );
    return json({ results, checkedAt: new Date().toISOString() });
  } catch (e) {
    console.error("mentions failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't check mentions right now. Try again in a minute." }, 500);
  }
});
