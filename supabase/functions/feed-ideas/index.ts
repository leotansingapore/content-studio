// Your own news sources as post ideas (Discover > Top posts > News > Your feeds).
// A signed-in adviser sends up to 10 feed addresses; this fetches each one
// (guarded: see safeFeedUrl, redirects re-checked) and returns its newest items.
// One request counts once against the "feeds" daily cap.
//
// Deploy WITH JWT verification:
//   supabase functions deploy feed-ideas --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { MAX_FEEDS, parseFeed, safeFeedUrl } from "./logic.ts";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

/** Fetches a feed, following up to 3 redirects that each pass the same guard; the body is capped. */
async function fetchFeed(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "ContentStudio-FeedReader/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = safeFeedUrl(new URL(res.headers.get("location") ?? "", url).href);
      if (!next) throw new Error("That feed redirects somewhere we can't read.");
      url = next;
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`The feed answered ${res.status}.`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break; // the newest items are at the top; read what fits
      }
      chunks.push(value);
    }
    const all = new Uint8Array(Math.min(size, MAX_BYTES + 65536));
    let at = 0;
    for (const c of chunks) {
      all.set(c.subarray(0, Math.max(0, all.length - at)), at);
      at += c.byteLength;
    }
    return new TextDecoder().decode(all.subarray(0, Math.min(at, all.length)));
  }
  throw new Error("That feed redirects too many times.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const urls: unknown[] = Array.isArray(body?.urls) ? body.urls.slice(0, MAX_FEEDS) : [];
    if (!urls.length) return json({ error: "Add a feed address first." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to read your feeds." }, 401);
    const usage = await consumeUsage(admin, uid, "feeds");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    const feeds = await Promise.all(
      urls.map(async (raw) => {
        const u = safeFeedUrl(raw);
        if (!u) return { url: String(raw).slice(0, 200), title: "", items: [], error: "That isn't a feed address we can read." };
        try {
          const parsed = parseFeed(await fetchFeed(u), u.href);
          return { url: u.href, ...parsed, ...(parsed.items.length ? {} : { error: "No stories found at that address. Is it the RSS link?" }) };
        } catch (e) {
          return { url: u.href, title: "", items: [], error: e instanceof Error && e.name !== "TimeoutError" ? e.message : "That feed took too long to answer." };
        }
      }),
    );
    return json({ feeds });
  } catch (e) {
    console.error("feed-ideas failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't read your feeds right now. Try again in a minute." }, 500);
  }
});
