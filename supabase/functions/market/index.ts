// Your market (Discover > Your market): one check a week of an adviser's market. ChatGPT search's answer to up to
// 5 client questions (DataForSEO llm_scraper, about USD 0.004 each), the news on their Mentions keywords (the same
// request as mentions) and their Following accounts' best posts, each judged by Jev against who they serve.
// Leo only while MARKET_USERS lists him. Rules in logic.ts (tested); design in
// docs/superpowers/specs/2026-10-15-market-watch-design.md.
//
// action "searches" (Searches on Trends, docs/north-star/items/find-search-topics.md) is gated by NORTH_STAR_USERS
// alone, before MARKET_USERS (decision 11 of the phase-2 brief). One a week per brand ("search-topics:<profile>" row),
// caps search-topics and search-topics-global; all three come back only when DataForSEO answered no seed at all.
//
// Secrets: MARKET_USERS (user ids separated by commas, or *), DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
// OPENAI_API_KEY, TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy market --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { dfs, dfsAuth, SINGAPORE } from "../_shared/dataforseo.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, usageRefusal, type UsageFeature } from "../_shared/usageCaps.ts";
import { parseNews } from "../mentions/logic.ts";
import {
  type Ask, type CheckInput, type GeoRead, type JudgedNews, type MarketDigest, MAX_SOURCES, accountGate, accountRefusal, answerGist, checkProblem, cleanInput,
  earlierWeekDays, overAccountWeek, profileFeature,
  candidates, cleanSearches, keptByJev, MAX_JUDGED, MAX_TOPICS, recentVideos, relatedKeywords, relatedTask, searchAsk, searchesProblem, searchFeature, searchWeekRefusal,
  toTopic, VIDEO_CHECKS, videosTask,
  foldStories, geoAsk, geoJudged, isAllowed, judgeNews, judgePost, keepAsk, keepTop, newsAsk, newsFailed, newsItems, newsTask, paidPartsFailed,
  parseAnswer, parseSuggest, pickNews, position, postAsk, sameStoryAsk, sameStoryOf, shortlistAct, shownNews, SUGGEST_FORMAT, suggestMessages, takeSlots,
  utcDay,
  weekGate, weeklyRefusal,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as clone-reel: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const jev = (a: Ask, who: string) => askJev(a.state, a.questions, { who });

async function suggest(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const input = cleanInput(body);
  if (!input.audience) return json({ error: "Say who you serve first." }, 400);
  if (!Deno.env.get("OPENAI_API_KEY")) return json({ error: "Suggestions aren't switched on yet." }, 503);
  const usage = await consumeUsage(admin, uid, "market-suggest");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }
  const res = await openaiChat(
    { model: OPENAI_MODEL, max_tokens: 900, response_format: SUGGEST_FORMAT, messages: suggestMessages(input) },
    { signal: AbortSignal.timeout(45_000) },
  );
  if (!res.ok) {
    console.error("market suggest: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return json({ error: "Couldn't suggest anything right now. Add your own below." }, 502);
  }
  const cand = parseSuggest((await res.json())?.choices?.[0]?.message?.content);
  const score = (kind: "keyword" | "question") => async (v: string) => noulOf(await jev(keepAsk(kind, input.audience, v), "market keep"), "keep");
  const [kw, qs] = await Promise.all([Promise.all(cand.keywords.map(score("keyword"))), Promise.all(cand.questions.map(score("question")))]);
  return json({ keywords: keepTop(cand.keywords, kw), questions: keepTop(cand.questions, qs) });
}

async function readAnswer(question: string, input: CheckInput, auth: string): Promise<GeoRead> {
  try {
    const parsed = parseAnswer(await dfs("ai_optimization/chat_gpt/llm_scraper/live/advanced", { keyword: question, location_code: SINGAPORE, language_code: "en", force_web_search: true }, auth, 100_000), input.name);
    if (!parsed) return { question, position: null, sources: [], checkUrl: null, error: "No answer came back for this one." };
    let pos = position(parsed.answer, parsed.sources, input.site, input.name, null);
    if (pos === "named") pos = position(parsed.answer, parsed.sources, input.site, input.name, geoJudged(await jev(geoAsk(input.name, parsed.answer), "market geo")));
    return { question, position: pos, gist: answerGist(parsed.answer), sources: parsed.sources.slice(0, MAX_SOURCES), named: parsed.named, checkUrl: parsed.checkUrl };
  } catch (e) {
    console.error("market geo failed", msg(e));
    return { question, position: null, sources: [], checkUrl: null, error: "Couldn't read the AI answer for this one." };
  }
}

/** The news for every keyword, judged, with repeats pointed at their first report. null when every lookup failed. */
async function readNews(input: CheckInput, auth: string, now: Date): Promise<JudgedNews[] | null> {
  const found = await Promise.all(input.keywords.map(async (k) => {
    try {
      const body = await dfs("serp/google/news/live/advanced", newsTask(k), auth, 25_000);
      if (newsFailed(body)) throw new Error(`news task answered ${(body as { tasks?: { status_code?: number }[] })?.tasks?.[0]?.status_code}`);
      return newsItems(k, parseNews(body), now);
    } catch (e) {
      console.error("market news failed", msg(e));
      return null;
    }
  }));
  if (input.keywords.length && found.every((f) => f === null)) return null;
  const items = pickNews(found.map((f) => f ?? []));
  const judged = await pool(items, 10, async (n) => judgeNews(n, await jev(newsAsk(input, n), "market news")));
  const linked = await pool(judged, 10, async (n, k) => {
    const a = n.relevant ? sameStoryAsk(n, judged.slice(0, k)) : null;
    const sameAs = a ? sameStoryOf(await jev(a, "market same story"), a.ids) : undefined;
    return sameAs ? { ...n, sameAs } : n;
  });
  return shortlistAct(foldStories(linked));
}

async function check(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const input = cleanInput(body);
  const problem = checkProblem(input);
  if (problem) return json({ error: problem }, 400);
  const auth = dfsAuth();
  if (!auth) return json({ error: "Your market isn't switched on yet." }, 503);

  const now = new Date();
  const today = utcDay(now.getTime());
  const usage = (feature: string, days: string[]) => admin.from("cs_ai_usage").select("day,count").eq("user_id", uid).eq("feature", feature).in("day", days);
  const [profileWeek, accountWeek] = await Promise.all([usage(profileFeature(input.profile), earlierWeekDays(now)), usage("market-check", [today, ...earlierWeekDays(now)])]);
  // Fail closed: these checks cost money, so an unreadable counter blocks them.
  if (profileWeek.error || accountWeek.error) return json({ code: "usage_unavailable", error: "This is unavailable for a moment. Try again shortly." }, 503);
  const gate = weekGate(profileWeek.data, now);
  if (!gate.open) {
    const r = weeklyRefusal(gate.nextDay);
    return json(r.body, r.status);
  }
  const account = accountGate(accountWeek.data, now);
  if (!account.open) {
    const r = accountRefusal(account.nextDay);
    return json(r.body, r.status);
  }
  const slot = await takeSlots(admin, uid, input.profile, today);
  if (!slot.ok) return json(slot.body, slot.status);
  const giveBack = async () => {
    await refundUsage(admin, uid, profileFeature(input.profile) as UsageFeature, today);
    await refundUsage(admin, uid, "market-check", today);
    await refundUsage(admin, GLOBAL_COUNTER_USER, "market-check-global", today);
  };
  const after = await usage("market-check", [today, ...earlierWeekDays(now)]);
  if (after.error || overAccountWeek(after.data, now)) {
    await giveBack();
    if (after.error) return json({ code: "usage_unavailable", error: "This is unavailable for a moment. Try again shortly." }, 503);
    const r = accountRefusal(utcDay(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000));
    return json(r.body, r.status);
  }

  const [geo, news, posts] = await Promise.all([
    Promise.all(input.questions.map((q) => readAnswer(q, input, auth))),
    readNews(input, auth, now),
    pool(input.posts, 10, async (p) => judgePost(p, await jev(postAsk(input, p), "market post"))),
  ]);
  if (paidPartsFailed(input, news === null, geo)) {
    await giveBack();
    return json({ error: "Couldn't reach the news or the AI answers. This check wasn't counted; try again in a few minutes." }, 502);
  }
  const digest: MarketDigest = { checkedAt: now.toISOString(), news: shownNews(news ?? []), geo, posts };
  return json(digest);
}

const UNAVAILABLE = { code: "usage_unavailable", error: "This is unavailable for a moment. Try again shortly." };
const SEARCHES_FAILED = "Couldn't read searches just now. Nothing was used up. Try again.";

async function searches(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const input = cleanSearches(body);
  const problem = searchesProblem(input);
  if (problem) return json({ code: "bad_request", error: problem }, 400);
  const auth = dfsAuth();
  if (!auth) return json({ code: "not_configured", error: "Searches aren't switched on yet." }, 503);

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const feature = searchFeature(input.profile);
  // the brand's week: a check on any of the 6 days before, then today's row taken atomically (one a day)
  const week = await admin.from("cs_ai_usage").select("day,count").eq("user_id", uid).eq("feature", feature).in("day", earlierWeekDays(now));
  if (week.error) return json(UNAVAILABLE, 503);
  const gate = weekGate(week.data, now);
  if (!gate.open) {
    const r = searchWeekRefusal(gate.nextDay);
    return json(r.body, r.status);
  }
  let slot: unknown;
  try {
    const { data, error } = await admin.rpc("cs_consume_ai_usage", { p_user: uid, p_feature: feature, p_limit: 1 });
    if (error) return json(UNAVAILABLE, 503);
    slot = data;
  } catch {
    return json(UNAVAILABLE, 503);
  }
  if (typeof slot !== "number") {
    const r = searchWeekRefusal(utcDay(Date.parse(`${day}T00:00:00Z`) + 7 * 86_400_000));
    return json(r.body, r.status);
  }
  // refundUsage only matches on the feature text, so the brand's free-text row is safe to pass through it
  const giveBackBrand = () => refundUsage(admin, uid, feature as UsageFeature, day);
  const mine = await consumeUsage(admin, uid, "search-topics");
  if (!mine.allowed) {
    await giveBackBrand();
    const r = usageRefusal(mine);
    return json(r.body, r.status);
  }
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "search-topics-global");
  if (!everyone.allowed) {
    await giveBackBrand();
    await refundUsage(admin, uid, "search-topics", day);
    if (everyone.reason === "limit") return json({ code: "global_limit", error: "Search checks are paused for today. Try again after 8am Singapore time." }, 429);
    const r = usageRefusal(everyone);
    return json(r.body, r.status);
  }

  const reads = await Promise.all(input.seeds.map(async (seed) => {
    try {
      const res = await dfs("dataforseo_labs/google/related_keywords/live", relatedTask(seed), auth, 60_000);
      if (newsFailed(res)) throw new Error(`labs task answered ${(res as { tasks?: { status_code?: number }[] })?.tasks?.[0]?.status_code}`);
      return relatedKeywords(res, seed);
    } catch (e) {
      console.error("market searches: labs failed", msg(e));
      return null;
    }
  }));
  if (reads.every((r) => r === null)) {
    await giveBackBrand();
    await refundUsage(admin, uid, "search-topics", day);
    await refundUsage(admin, GLOBAL_COUNTER_USER, "search-topics-global", day);
    return json({ code: "failed", error: SEARCHES_FAILED }, 502);
  }

  const found = candidates(reads.map((r) => r ?? [])).slice(0, MAX_JUDGED);
  const answers = await pool(found, 6, (k) => jev(searchAsk(input, k.keyword), "market searches"));
  // the keep and safe lines are proposals: every keyword with its scores, for the integrator's read of the first checks
  console.log("market searches: jev", JSON.stringify(found.map((k, n) => [k.keyword, k.volume, noulOf(answers[n], "keep"), noulOf(answers[n], "safe")])));
  const kept = found.filter((_, n) => keptByJev(answers[n])).slice(0, MAX_TOPICS);
  const supply = await pool(kept.slice(0, VIDEO_CHECKS), 5, async (k) => {
    try {
      const res = await dfs("serp/youtube/organic/live/advanced", videosTask(k.keyword), auth, 40_000);
      if (newsFailed(res)) throw new Error(`youtube task answered ${(res as { tasks?: { status_code?: number }[] })?.tasks?.[0]?.status_code}`);
      return recentVideos(res, now);
    } catch (e) {
      console.error("market searches: youtube failed", msg(e));
      return null;
    }
  });
  return json({ checkedAt: now.toISOString(), topics: kept.map((k, n) => toTopic(k, supply[n] ?? null)), filtered: answers.some((a) => a !== null) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to check your market." }, 401);
    if (body?.action === "searches") {
      if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
      return await searches(admin, uid, body);
    }
    const enabled = isAllowed(Deno.env.get("MARKET_USERS"), uid);
    // off is a plain 200 for the status probe, so the browser logs no failed request
    if (body?.action === "status") return json({ enabled });
    if (!enabled) return json({ error: "Your market is not enabled for this account yet." }, 404);
    if (body?.action === "suggest") return await suggest(admin, uid, body);
    if (body?.action === "check") return await check(admin, uid, body);
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("market failed", msg(e));
    return json({ error: "Couldn't check your market right now. Try again in a minute." }, 500);
  }
});
