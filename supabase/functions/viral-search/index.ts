// viral-search (/swipe?tab=search, docs/north-star/items/find-viral-search.md): public TikTok and YouTube videos for
// a keyword. POST { q, platforms?, brand?: { sells, serves } } -> { results: Found[], failed: { tiktok?, youtube? } }.
// TikTok: Apify clockworks~tiktok-scraper, 20 results, no paid add-ons (about US$0.075). YouTube: one DataForSEO
// YouTube organic block of 20 (US$0.002). Then Jev asks whether each result fits the search and the brand.
//
// Leo only while NORTH_STAR_USERS lists the caller. Caps "viral-search" (per person) and "viral-search-global" (on
// GLOBAL_COUNTER_USER). Both uses go back only when every platform searched failed on the provider (no answer,
// non-2xx, timeout); a platform that answered with nothing keeps them. The server stores nothing about a search.
//
// Secrets (all set already): NORTH_STAR_USERS, APIFY_API_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, TYPESAFE_API_KEY.
// Deploy WITH JWT verification:
//   supabase functions deploy viral-search --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { dfs, dfsAuth } from "../_shared/dataforseo.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { pool } from "../_shared/pool.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed, newsFailed } from "../market/logic.ts";
import {
  FAIL_DOWN, FAIL_SLOW, type Failed, type Found, parseRequest, relevanceAsks, type SearchPlatform, tiktokInput, tiktokResults, youtubeResults,
  youtubeTask,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const slow = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
// deno-lint-ignore no-explicit-any
type Admin = any; // as market: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const SEARCH_FAILED = "Couldn't search right now. Try again in a few minutes.";
// The actor's own run limit; the request gives up 10 s later, so each platform answers inside 70 s.
const APIFY_RUN_SECS = 60;
const PROVIDER_MS = 70_000;

type Outcome = Found[] | { failed: string };

// shortcut: a local Apify call (a 60 s run, not the audits' 90 s); move to auditRunner's apifyItems once competitor-feeds exports it and its timeout can be set.
async function tiktok(q: string, token: string): Promise<Outcome> {
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?timeout=${APIFY_RUN_SECS}&clean=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(tiktokInput(q)),
      signal: AbortSignal.timeout(PROVIDER_MS),
    });
    if (!res.ok) {
      console.error("viral-search: apify", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return { failed: res.status === 408 ? FAIL_SLOW : FAIL_DOWN };
    }
    const data = await res.json().catch(() => null);
    return tiktokResults(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("viral-search: apify", msg(e));
    return { failed: slow(e) ? FAIL_SLOW : FAIL_DOWN };
  }
}

async function youtube(q: string, auth: string): Promise<Outcome> {
  try {
    const serp = await dfs("serp/youtube/organic/live/advanced", youtubeTask(q), auth, PROVIDER_MS);
    if (newsFailed(serp)) throw new Error(`task answered ${(serp as { tasks?: { status_code?: number }[] })?.tasks?.[0]?.status_code}`);
    return youtubeResults(serp);
  } catch (e) {
    console.error("viral-search: dataforseo", msg(e));
    return { failed: slow(e) ? FAIL_SLOW : FAIL_DOWN };
  }
}

async function search(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = parseRequest(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  const apify = Deno.env.get("APIFY_API_KEY");
  const auth = dfsAuth();
  if ((r.platforms.includes("tiktok") && !apify) || (r.platforms.includes("youtube") && !auth)) {
    return fail(503, "not_configured", "Search isn't switched on yet.");
  }

  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, "viral-search");
  if (!mine.allowed) {
    const refusal = usageRefusal(mine);
    return json(refusal.body, refusal.status);
  }
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "viral-search-global");
  if (!everyone.allowed) {
    await refundUsage(admin, uid, "viral-search", day);
    if (everyone.reason === "limit") return fail(429, "global_limit", "Search is busy today. Try again after 8am Singapore time.");
    const refusal = usageRefusal(everyone);
    return json(refusal.body, refusal.status);
  }

  const outcomes = await Promise.all(r.platforms.map((p) => (p === "tiktok" ? tiktok(r.q, apify!) : youtube(r.q, auth!))));
  const failed: Failed = {};
  const results: Found[] = [];
  outcomes.forEach((o, k) => {
    if (Array.isArray(o)) results.push(...o);
    else failed[r.platforms[k] as SearchPlatform] = o.failed;
  });
  if (outcomes.every((o) => !Array.isArray(o))) {
    await Promise.all([refundUsage(admin, uid, "viral-search", day), refundUsage(admin, GLOBAL_COUNTER_USER, "viral-search-global", day)]);
    return fail(502, "failed", SEARCH_FAILED);
  }

  // Without Jev (no key, a timeout) relevance stays null and every result shows.
  const asks = relevanceAsks(r.q, r.brand, results);
  const answers = await pool(asks, 4, (a) => askJev(a.state, a.questions, { who: "viral-search relevance" }));
  asks.forEach((a, k) =>
    a.indexes.forEach((n) => {
      const p = noulOf(answers[k], `r${n}`);
      results[n].relevance = p === null ? null : Math.round(p * 100) / 100;
    })
  );
  return json({ results, failed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in again." }, 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail(403, "not_enabled", "This isn't switched on for your account yet.");
    return await search(admin, uid, await req.json().catch(() => ({})));
  } catch (e) {
    console.error("viral-search failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
