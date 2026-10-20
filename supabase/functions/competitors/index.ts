// competitors (Discover > Competitors, docs/north-star/items/find-competitors.md): the list of businesses a brand
// watches. Modes, routed on body.mode:
//   read     a site (its home page: name, logo link, handles; free apart from the cap) or a bare name (one DataForSEO
//            Google search, about US$0.002, then Jev picks the official result). Links and handles never come here:
//            the app adds them itself with parseInput.
//   suggest  up to 6 competitors with a why line: the app's candidates plus up to 8 the LLM proposes (each site must
//            open), scored by Jev, then one LLM call for the why lines.
// Later waves add ads, posts, space, label and match.
//
// Leo only while NORTH_STAR_USERS lists the caller. Caps "competitor-read" and "competitor-suggest". A use goes back
// only when a provider never answered (502/503); "not found" and an empty list keep it (phase2-build-brief.md).
//
// Secrets (all set already): NORTH_STAR_USERS, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, OPENAI_API_KEY, TYPESAFE_API_KEY.
// Deploy WITH JWT verification:
//   supabase functions deploy competitors --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { dfs, dfsAuth } from "../_shared/dataforseo.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { readSite, siteUrl, type SiteFacts } from "../brand-dna/logic.ts";
import { isAllowed, newsFailed } from "../market/logic.ts";
import {
  type Ask, type Candidate, cleanSuggest, compareAsk, excluded, firstHttpsLogo, hostOf, nameTask, organicResults, parseInput, parseProposals,
  parseWhys, pickSite, PROPOSE_FORMAT, proposeMessages, siteAsk, siteRetry, suggestFilter, WHY_FORMAT, whyMessages,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as market: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const PAGE_BYTES = 300_000;
const HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const SITE_FAILED = "Couldn't read their site. Try again in a few minutes.";
const SUGGEST_FAILED = "Couldn't suggest anything right now. Try again in a few minutes.";
const jev = (a: Ask, who: string) => askJev(a.state, a.questions, { who });

/** A home page's facts, or whether the failure is worth another try (the site never answered). */
async function readHome(url: URL, deadline = AbortSignal.timeout(20_000)): Promise<{ ok: true; host: string; facts: SiteFacts } | { ok: false; retry: boolean }> {
  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, PAGE_BYTES, HTML, deadline);
  } catch (e) {
    console.warn("competitors: site", url.host, msg(e));
    return { ok: false, retry: siteRetry(e) };
  }
  if (!/html|xml|text/.test(page.type)) return { ok: false, retry: false };
  try {
    return { ok: true, host: hostOf(page.url), facts: readSite(new TextDecoder().decode(page.bytes), page.url) };
  } catch (e) {
    console.warn("competitors: read", url.host, msg(e));
    return { ok: false, retry: false };
  }
}

const found = (name: string, site: string | null, facts: SiteFacts | null, handles = facts?.handles ?? {}) =>
  json({ found: { name: name.slice(0, 80), site, logo: facts ? firstHttpsLogo(facts.logos) : null, handles } });

async function read(admin: Admin, uid: string, body: { input?: unknown }): Promise<Response> {
  const input = parseInput(body.input);
  if (!input || input.kind === "link") return fail(400, "bad_request", "Send a website or a name. Links and handles are added in the app.");
  const auth = input.kind === "name" ? dfsAuth() : null;
  if (input.kind === "name" && !auth) return fail(503, "failed", "Finding by name isn't switched on yet.");

  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "competitor-read");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }

  if (input.kind === "site") {
    const home = await readHome(siteUrl(input.site)!);
    if (home.ok) return found(home.facts.name || home.host, home.host, home.facts);
    if (home.retry) {
      await refundUsage(admin, uid, "competitor-read", day);
      return fail(502, "failed", SITE_FAILED);
    }
    return json({ notFound: true });
  }

  let serp: unknown;
  try {
    serp = await dfs("serp/google/organic/live/regular", nameTask(input.name), auth!, 30_000);
    if (newsFailed(serp)) throw new Error(`task answered ${(serp as { tasks?: { status_code?: number }[] })?.tasks?.[0]?.status_code}`);
  } catch (e) {
    console.error("competitors: search", msg(e));
    await refundUsage(admin, uid, "competitor-read", day);
    return fail(502, "failed", SITE_FAILED);
  }
  // DataForSEO answered (and billed): from here the use is kept, whatever comes back
  const results = organicResults(serp);
  if (!results.length) return json({ notFound: true });
  const picked = pickSite(await jev(siteAsk(input.name, results), "competitors site"), results);
  if ("notFound" in picked) return json({ notFound: true });
  if ("choices" in picked) return json({ choices: picked.choices.map((r) => ({ name: input.name, site: r.url, title: r.title })) });
  const at = parseInput(picked.pick.url);
  if (at?.kind === "link") return found(input.name, null, null, at.handles);
  if (at?.kind !== "site") return json({ notFound: true });
  const home = await readHome(siteUrl(picked.pick.url)!);
  return home.ok ? found(input.name, home.host, home.facts) : found(input.name, at.site, null, {});
}

async function suggest(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const clean = cleanSuggest(body);
  if (typeof clean === "string") return fail(400, "bad_request", clean);
  const { brand, candidates, exclude } = clean;
  if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "failed", "Suggestions aren't switched on yet.");

  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "competitor-suggest");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }
  const giveBack = () => refundUsage(admin, uid, "competitor-suggest", day);
  const ask = async (body: Record<string, unknown>) => {
    try {
      const res = await openaiChat(body, { signal: AbortSignal.timeout(45_000) });
      if (res.ok) return { ok: true as const, content: (await res.json())?.choices?.[0]?.message?.content };
      console.error("competitors suggest: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
    } catch (e) {
      console.error("competitors suggest: openai", msg(e));
    }
    return { ok: false as const };
  };

  const known = candidates.filter((c) => !excluded(c, exclude, brand));
  const proposed = await ask({ model: OPENAI_MODEL, max_tokens: 700, response_format: PROPOSE_FORMAT, messages: proposeMessages(brand, known.map((c) => c.name)) });
  if (!proposed.ok) {
    await giveBack();
    return fail(502, "failed", SUGGEST_FAILED);
  }
  // an invented domain doesn't open, so it is dropped here; what the page says about itself becomes its "about"
  const deadline = AbortSignal.timeout(20_000);
  const fresh = parseProposals(proposed.content).filter((p) => !excluded(p, exclude, brand) && !known.some((c) => c.name.toLowerCase() === p.name.toLowerCase()));
  const opened = await pool(fresh, 4, async (p, k): Promise<Candidate | null> => {
    const home = await readHome(siteUrl(p.site)!, deadline);
    return home.ok ? { key: `llm${k + 1}`, name: p.name, about: home.facts.description || home.facts.name, site: home.host } : null;
  });
  const all = [...known, ...opened.filter((c): c is Candidate => c !== null)];
  const scores = await pool(all, 10, async (c) => noulOf(await jev(compareAsk(brand, c), "competitors compare"), "compare"));
  const kept = suggestFilter(all, scores, exclude, brand);
  if (kept === null) {
    await giveBack();
    return json({ suggestions: [], note: "Suggestions are unavailable right now. Add one you know." });
  }
  if (!kept.length) return json({ suggestions: [] });

  const written = await ask({ model: OPENAI_MODEL, max_tokens: 900, response_format: WHY_FORMAT, messages: whyMessages(brand, kept) });
  if (!written.ok) {
    await giveBack();
    return fail(502, "failed", SUGGEST_FAILED);
  }
  const whys = parseWhys(written.content, kept.map((c) => c.key));
  return json({ suggestions: kept.map((c) => ({ name: c.name, site: c.site ?? null, why: whys[c.key] ?? "", score: Math.round(c.score * 100) / 100 })) });
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
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "read") return await read(admin, uid, body);
    if (body?.mode === "suggest") return await suggest(admin, uid, body);
    return fail(400, "bad_request", "Unknown mode.");
  } catch (e) {
    console.error("competitors failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
