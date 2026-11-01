// competitors (Discover > Competitors, docs/north-star/items/find-competitors.md): the list of businesses a brand
// watches. Modes, routed on body.mode:
//   read     a site (its home page up to 1 MB: name, logo link, handles from links and JSON-LD sameAs; free apart
//            from the cap) or a bare name (one DataForSEO Google search, about US$0.002, then Jev picks the official
//            result). Links and handles never come here: the app adds them itself with parseInput.
//   suggest  up to 6 competitors with a why line: the app's candidates plus up to 8 the LLM proposes (each site must
//            open), scored by Jev, then one LLM call for the why lines.
//   ads      one competitor's Meta ads (apify~facebook-ads-scraper, up to 30 at US$5.80 per 1,000 on Free), in the
//            competitor's country, most impressions first; a handle with no page id first reads one ad for the id.
//   posts    one competitor's Instagram or TikTok posts, 30 kept (the actors Following uses).
//   space    Singapore's running Meta ads for up to 3 search words (the ads actor, 30 each, in parallel), minus the
//            tracked competitors' pages, judged by Jev against the brand; 60 kept.
//   label    hook family, feeling and audience for up to 60 ads (Jev only, from _shared/tags.ts).
//   match    which of up to 80 pooled posts and ads fit the brand, for /swipe's For you (Jev only).
//   similar  about 40 Instagram and TikTok accounts like the brand, for /swipe's Apps like yours: OpenAI writes TikTok
//            searches, Apify reads Instagram's similar accounts of the seeds and the searches, Jev keeps the ones that
//            fit. Their posts come through posts with scope "similar", on caps of their own. Both stop at Leo's US$40 a
//            month, counted from the across-everyone rows (find-similar-accounts.md).
//
// Leo only while NORTH_STAR_USERS lists the caller. Caps "competitor-read", "competitor-suggest", "competitor-ads",
// "competitor-posts", "space-ads", "ad-labels", "niche-match", "similar-find" and "similar-posts" per user; ads, posts,
// space and similar also across everyone on GLOBAL_COUNTER_USER. A use goes back only
// when a provider never answered (502/503); "not found", "private" and an empty list keep it (phase2-build-brief.md).
//
// Secrets (all set already): NORTH_STAR_USERS, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, OPENAI_API_KEY, TYPESAFE_API_KEY,
// APIFY_API_KEY.
// Deploy WITH JWT verification:
//   supabase functions deploy competitors --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { AuditError, apifyItems, scrapeAccount } from "../_shared/auditRunner.ts";
import { dfs, dfsAuth } from "../_shared/dataforseo.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, type UsageResult, usageRefusal } from "../_shared/usageCaps.ts";
import { siteUrl, type SiteFacts } from "../brand-dna/logic.ts";
import { isAllowed, newsFailed } from "../market/logic.ts";
import { parseTrackRequest, shapeResult } from "../track-accounts/logic.ts";
import {
  accountKey, ADS_ACTOR, ADS_MAX, adLibraryUrl, adsInput, type Ask, type Candidate, cleanAds, cleanLabel, cleanMatch, cleanSimilar, cleanSpace, cleanSuggest,
  compareAsk, excluded, firstHttpsLogo, type Handles, hostOf, IG_PROFILE_ACTOR, igCandidate, labelAsk, labelOf, matchAsk, matchScores, mergeSpace, monthLine,
  monthStart, nameTask, organicResults, pageMissing, pageOf, parseInput, parsePhrases, parseProposals, parseWhys, passesMonth, PHRASES_FORMAT, phrasesMessages,
  pickCandidates, pickSite, postsFailure, postsScope, PROPOSE_FORMAT, proposeMessages, readCompetitorSite, relatedOf, shapeAds, shapeSpaceAds, type SimilarCandidate,
  similarAsk, similarKeep, similarSearchInput, SIMILAR_MONTH_FEATURES, SIMILAR_MONTH_USD, SIMILAR_RELATED, similarSpent, similarUsd, siteAsk, SITE_BYTES,
  siteRetry, spaceAsk, spaceFilter, spaceUrl, suggestFilter, TIKTOK_ACTOR, tiktokCandidates, WHY_FORMAT, whyMessages,
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

const HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const SITE_FAILED = "Couldn't read their site. Try again in a few minutes.";
const SUGGEST_FAILED = "Couldn't suggest anything right now. Try again in a few minutes.";
const ADS_FAILED = "Couldn't read Meta's ad library right now. Try again in a few minutes.";
const ADS_PAUSED = "Ad checks are paused for today. They resume at 8am Singapore time.";
const POSTS_PAUSED = "Account checks are paused for today. They resume at 8am Singapore time.";
const LABELS_FAILED = "Couldn't sort these ads right now. Try again in a few minutes.";
const SIMILAR_FAILED = "Couldn't look for accounts right now. Try again in a few minutes.";
const SIMILAR_PAUSED = "Finding accounts is paused for today. It resumes at 8am Singapore time.";
// The Apify runs take up to ~105 s of the function's ~150 s; Jev questions not asked by then come back as fit null.
const SPACE_JEV_UNTIL_MS = 130_000;
// Apps like yours: the Apify runs finish by this point of the ~150 s, Jev asks until the next, the rest stays unjudged.
const SIMILAR_APIFY_UNTIL_MS = 115_000;
const SIMILAR_JEV_UNTIL_MS = 135_000;
// An ads read from a handle alone: the page-id probe's run limit, then the time both runs share.
const PROBE_SECS = 40;
const ADS_BUDGET_MS = 135_000;
const jev = (a: Ask, who: string) => askJev(a.state, a.questions, { who });
const refusal = (u: Extract<UsageResult, { allowed: false }>) => {
  const r = usageRefusal(u);
  return json(r.body, r.status);
};

/** A home page's facts, or whether the failure is worth another try (the site never answered). */
async function readHome(url: URL, deadline = AbortSignal.timeout(20_000)): Promise<{ ok: true; host: string; facts: SiteFacts & { handles: Handles } } | { ok: false; retry: boolean }> {
  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, SITE_BYTES, HTML, deadline);
  } catch (e) {
    console.warn("competitors: site", url.host, msg(e));
    return { ok: false, retry: siteRetry(e) };
  }
  if (!/html|xml|text/.test(page.type)) return { ok: false, retry: false };
  try {
    return { ok: true, host: hostOf(page.url), facts: readCompetitorSite(new TextDecoder().decode(page.bytes), page.url) };
  } catch (e) {
    console.warn("competitors: read", url.host, msg(e));
    return { ok: false, retry: false };
  }
}

const found = (name: string, site: string | null, facts: SiteFacts | null, handles: Handles = facts?.handles ?? {}) =>
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

async function ads(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = cleanAds(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  const token = Deno.env.get("APIFY_API_KEY");
  if (!token) return fail(503, "failed", "Ad checks aren't switched on yet.");

  const started = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, "competitor-ads");
  if (!mine.allowed) return refusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "competitor-ads-global");
  if (!everyone.allowed) {
    await refundUsage(admin, uid, "competitor-ads", day);
    return everyone.reason === "limit" ? fail(429, "global_limit", ADS_PAUSED) : refusal(everyone);
  }

  // A handle alone opens the page's ads in every country, so a Singapore read first takes one ad (any country, any
  // status) for the page id the country filter needs; the main read then takes 29, so a check still bills 30 at most.
  let pageId = r.fbPageId;
  let probe: unknown[] = [];
  let limit = ADS_MAX;
  let items: unknown[];
  try {
    if (!pageId && r.country === "SG") {
      probe = await apifyItems(ADS_ACTOR, adsInput(adLibraryUrl(r), 1), token, PROBE_SECS);
      pageId = pageOf(probe).pageId;
      limit = Math.max(1, ADS_MAX - probe.length);
    }
    // both runs inside the function's ~150 s: the main one gets what the probe left, up to the usual 90 s
    const secs = probe.length ? Math.min(90, Math.floor((ADS_BUDGET_MS - (Date.now() - started)) / 1000) - 15) : undefined;
    items = !pageId && r.country === "SG" ? [] : await apifyItems(ADS_ACTOR, adsInput(adLibraryUrl({ ...r, fbPageId: pageId }), limit), token, secs);
  } catch (e) {
    console.error("competitors ads: apify", r.competitorId, msg(e));
    await Promise.all([refundUsage(admin, uid, "competitor-ads", day), refundUsage(admin, GLOBAL_COUNTER_USER, "competitor-ads-global", day)]);
    return fail(502, "failed", ADS_FAILED);
  }
  // Apify answered (and billed): from here the uses are kept, ads or none
  if (!pageId && r.country === "SG") {
    if (pageMissing(probe)) return fail(422, "not_found", "That page wasn't found on Meta. Check the link.");
    // the probe looked in every country and found no ad at all: say so, rather than "none in Singapore"
    return json({ competitorId: r.competitorId, pageId: null, pageName: null, ads: [], checkedAt: new Date().toISOString(), country: "ALL", complete: true });
  }
  const list = shapeAds(items);
  if (!list.length && pageMissing(items)) return fail(422, "not_found", "That page wasn't found on Meta. Check the link.");
  const page = pageOf(items);
  return json({
    competitorId: r.competitorId, pageId: page.pageId ?? pageId, pageName: page.pageName ?? pageOf(probe).pageName, ads: list, checkedAt: new Date().toISOString(),
    // the country the ads came from, and whether that was every ad Meta lists there (fewer than asked for came back)
    country: r.country, complete: items.length < limit,
  });
}

async function posts(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = parseTrackRequest(body);
  if (!r.ok) return fail(400, "bad_request", r.error);
  const token = Deno.env.get("APIFY_API_KEY");
  if (!token) return fail(503, "failed", "Post checks aren't switched on yet.");

  const scope = postsScope(body);
  const mineCap = scope.similar ? "similar-posts" : "competitor-posts";
  const everyoneCap = scope.similar ? "similar-posts-global" : "competitor-posts-global";
  const month = scope.similar ? await monthGuard(admin, similarUsd.posts) : null;
  if (month && !month.ok) return month.res;
  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, mineCap);
  if (!mine.allowed) return refusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, everyoneCap);
  if (!everyone.allowed) {
    await refundUsage(admin, uid, mineCap, day);
    return everyone.reason === "limit" ? fail(429, "global_limit", POSTS_PAUSED) : refusal(everyone);
  }

  try {
    const read = await scrapeAccount(r.platform, r.handle, token, scope.read);
    return json({ ...shapeResult(r.platform, read.profile, read.posts, scope.kept), checkedAt: new Date().toISOString(), ...(month ? { month: month.after } : {}) });
  } catch (e) {
    if (!(e instanceof AuditError)) throw e;
    const f = postsFailure(e.message, r.handle);
    console.warn("competitors posts:", r.platform, r.handle, f.code, msg(e));
    if (f.refund) await Promise.all([refundUsage(admin, uid, mineCap, day), refundUsage(admin, GLOBAL_COUNTER_USER, everyoneCap, day)]);
    return fail(f.status, f.code, f.error);
  }
}

type MonthGuard = { ok: true; after: { spent: number; cap: number } } | { ok: false; res: Response };

/**
 * Leo's US$40 a month for Apps like yours, checked before any of its paid calls: this month's across-everyone counts
 * priced at their units, plus this call. Fails closed when the counter can't be read, as consumeUsage does.
 */
async function monthGuard(admin: Admin, add: number): Promise<MonthGuard> {
  let spent: number;
  try {
    const { data, error } = await admin.from("cs_ai_usage").select("feature, count").eq("user_id", GLOBAL_COUNTER_USER)
      .in("feature", [...SIMILAR_MONTH_FEATURES]).gte("day", monthStart());
    if (error) throw new Error(String(error.message ?? error));
    spent = similarSpent(data);
  } catch (e) {
    console.error("competitors similar: month", msg(e));
    const r = usageRefusal({ allowed: false, limit: 0, reason: "unavailable" });
    return { ok: false, res: json(r.body, r.status) };
  }
  const cap = SIMILAR_MONTH_USD;
  if (passesMonth(spent, add)) return { ok: false, res: json({ code: "month_limit", error: monthLine(), month: { spent: Math.round(spent * 100) / 100, cap } }, 429) };
  return { ok: true, after: { spent: Math.round((spent + add) * 100) / 100, cap } };
}

async function similar(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = cleanSimilar(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  const token = Deno.env.get("APIFY_API_KEY");
  if (!token || !Deno.env.get("OPENAI_API_KEY")) return fail(503, "failed", "Finding accounts isn't switched on yet.");

  const started = Date.now();
  const month = await monthGuard(admin, similarUsd.find);
  if (!month.ok) return month.res;
  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, "similar-find");
  if (!mine.allowed) return refusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "similar-find-global");
  if (!everyone.allowed) {
    await refundUsage(admin, uid, "similar-find", day);
    return everyone.reason === "limit" ? fail(429, "global_limit", SIMILAR_PAUSED) : refusal(everyone);
  }
  const giveBack = () => Promise.all([refundUsage(admin, uid, "similar-find", day), refundUsage(admin, GLOBAL_COUNTER_USER, "similar-find-global", day)]);

  let phrases: string[] = [];
  try {
    const res = await openaiChat({ model: OPENAI_MODEL, max_tokens: 300, response_format: PHRASES_FORMAT, messages: phrasesMessages(r.brand) }, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) phrases = parsePhrases((await res.json())?.choices?.[0]?.message?.content);
    else console.error("competitors similar: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
  } catch (e) {
    console.error("competitors similar: openai", msg(e));
  }
  // with no searches the seeds still have Instagram's similar accounts; with neither there is nothing to read
  if (!phrases.length && !r.seeds.instagram.length && !r.seeds.tiktok.length) {
    await giveBack();
    return fail(502, "failed", SIMILAR_FAILED);
  }

  // in parallel, as space does: each Apify run waits up to ~105 s; the second Instagram read gets what the first left
  const left = () => Math.min(60, Math.floor((SIMILAR_APIFY_UNTIL_MS - (Date.now() - started)) / 1000) - 15);
  const instagram = async () => {
    if (!r.seeds.instagram.length) return { seeds: [] as SimilarCandidate[], related: [] as SimilarCandidate[], ran: false };
    const seedItems = await apifyItems(IG_PROFILE_ACTOR, { usernames: r.seeds.instagram }, token, 40);
    const related = relatedOf(seedItems, r.exclude, r.seeds.instagram);
    const via = new Map(related.map((x) => [x.handle, x.via]));
    const items = related.length && left() >= 10
      ? await apifyItems(IG_PROFILE_ACTOR, { usernames: related.map((x) => x.handle).slice(0, SIMILAR_RELATED) }, token, left()).catch((e) => {
        console.error("competitors similar: related", msg(e));
        return [];
      })
      : [];
    return {
      seeds: seedItems.map((i) => igCandidate(i, "competitor")).filter((c): c is SimilarCandidate => c !== null),
      related: items.map((i) => igCandidate(i, via.get(String(i.username ?? "").toLowerCase()) ?? "")).filter((c): c is SimilarCandidate => c !== null),
      ran: true,
    };
  };
  const [ig, ...tt] = await Promise.allSettled([instagram(), ...phrases.map((p) => apifyItems(TIKTOK_ACTOR, similarSearchInput(p), token, 75))]);
  const answered = (ig.status === "fulfilled" && ig.value.ran) || tt.some((x) => x.status === "fulfilled");
  if (!answered) {
    console.error("competitors similar: apify", [ig, ...tt].map((x) => (x.status === "rejected" ? msg(x.reason) : "")).join(" | "));
    await giveBack();
    return fail(502, "failed", SIMILAR_FAILED);
  }
  // Apify answered (and billed): from here the uses are kept, unless Jev answers nothing
  const found = tiktokCandidates(tt.flatMap((x) => (x.status === "fulfilled" ? x.value : [])));
  const igv = ig.status === "fulfilled" ? ig.value : { seeds: [], related: [] };
  // a TikTok seed is judged on what a search said about it, else on its name alone
  const ttSeeds = r.seeds.tiktok.map((h): SimilarCandidate =>
    ({ ...(found.find((c) => c.handle === h) ?? { platform: "tiktok", handle: h, name: h, bio: "", followers: null, private: false }), via: "competitor" }));
  const cands = pickCandidates([igv.seeds, igv.related, ttSeeds, found], r.exclude, r.brand);

  const answers = await pool(cands, 12, async (c) => (Date.now() - started < SIMILAR_JEV_UNTIL_MS ? await jev(similarAsk(r.brand, c), "competitors similar") : null));
  // every decision, so the first real run can be read and SIMILAR_FIT set from it
  cands.forEach((c, k) =>
    console.log(`competitors similar: ${accountKey(c)} | ${c.bio.replace(/\s+/g, " ").slice(0, 80)} | ${answers[k]?.similar?.noul ?? "unjudged"} | ${answers[k]?.kind?.choice ?? "-"}`));
  const kept = similarKeep(cands, answers);
  const failed = tt.filter((x) => x.status === "rejected").length + (ig.status === "rejected" ? 1 : 0);
  if (kept === null) {
    await giveBack();
    return json({ accounts: [], phrases, failed, note: "Couldn't judge the accounts right now, so nothing new was kept. This run wasn't counted.", checkedAt: new Date().toISOString() });
  }
  return json({ accounts: kept, phrases, failed, month: month.after, checkedAt: new Date().toISOString() });
}

async function space(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = cleanSpace(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  const token = Deno.env.get("APIFY_API_KEY");
  if (!token) return fail(503, "failed", "Ad checks aren't switched on yet.");

  const started = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, "space-ads");
  if (!mine.allowed) return refusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "space-ads-global");
  if (!everyone.allowed) {
    await refundUsage(admin, uid, "space-ads", day);
    return everyone.reason === "limit" ? fail(429, "global_limit", ADS_PAUSED) : refusal(everyone);
  }

  // in parallel: apifyItems waits up to ~105 s a run, and three in a row would pass the function's limit
  const runs = await Promise.allSettled(r.keywords.map((k) => apifyItems(ADS_ACTOR, adsInput(spaceUrl(k), ADS_MAX, "relevancy_monthly_grouped"), token)));
  const failed = r.keywords.filter((_, k) => runs[k].status === "rejected");
  if (failed.length === r.keywords.length) {
    console.error("competitors space: apify", runs.map((x) => (x.status === "rejected" ? msg(x.reason) : "")).join(" | "));
    await Promise.all([refundUsage(admin, uid, "space-ads", day), refundUsage(admin, GLOBAL_COUNTER_USER, "space-ads-global", day)]);
    return fail(502, "failed", ADS_FAILED);
  }
  // a run answered (and billed): from here the uses are kept, ads or none
  const ads = mergeSpace(runs.map((x) => (x.status === "fulfilled" ? shapeSpaceAds(x.value) : [])), r.excludePageIds);
  // with neither what the brand sells nor who it serves there is nothing to judge by: every ad stays, fit null
  const judge = Boolean(r.brand.sells || r.brand.serves);
  const scores = await pool(ads, 6, async (a) =>
    judge && Date.now() - started < SPACE_JEV_UNTIL_MS ? noulOf(await jev(spaceAsk(r.brand, a), "competitors space"), "space") : null);
  return json({ ads: spaceFilter(ads, scores), failed, checkedAt: new Date().toISOString() });
}

async function label(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const ads = cleanLabel(body);
  if (typeof ads === "string") return fail(400, "bad_request", ads);
  if (!Deno.env.get("TYPESAFE_API_KEY")) return fail(503, "failed", "Sorting ads isn't switched on yet.");

  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "ad-labels");
  if (!usage.allowed) return refusal(usage);
  const labels = await pool(ads, 6, async (a) => labelOf(await jev(labelAsk(a), "competitors label")));
  // Jev never answered: nothing was judged, so the run goes back and the ads are asked again later
  if (labels.every((l) => l === null)) {
    await refundUsage(admin, uid, "ad-labels", day);
    return fail(502, "failed", LABELS_FAILED);
  }
  return json({ labels: Object.fromEntries(ads.flatMap((a, k) => (labels[k] ? [[a.id, labels[k]]] : []))) });
}

async function match(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = cleanMatch(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  // without Jev nothing can be judged: the feed shows everything by outlier score, and nothing is counted
  if (!Deno.env.get("TYPESAFE_API_KEY")) return json({ scores: {} });

  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "niche-match");
  if (!usage.allowed) return refusal(usage);
  const scores = await pool(r.items, 10, async (it) => noulOf(await jev(matchAsk(r.brand, it), "competitors match"), "match"));
  // Jev never answered: nothing was judged, so the run goes back and the app asks again next time
  if (scores.every((s) => s === null)) await refundUsage(admin, uid, "niche-match", day);
  return json({ scores: matchScores(r.items, scores) });
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
    if (body?.mode === "ads") return await ads(admin, uid, body);
    if (body?.mode === "posts") return await posts(admin, uid, body);
    if (body?.mode === "space") return await space(admin, uid, body);
    if (body?.mode === "label") return await label(admin, uid, body);
    if (body?.mode === "match") return await match(admin, uid, body);
    if (body?.mode === "similar") return await similar(admin, uid, body);
    return fail(400, "bad_request", "Unknown mode.");
  } catch (e) {
    console.error("competitors failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
