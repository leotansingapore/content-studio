// brand-dna: "Add a brand from its website" (docs/brand-isolation.md, phase 2; Holo's Brand DNA flow). A signed-in
// adviser sends one address; this reads that home page (guarded like feed-ideas: public host, redirects re-checked,
// body capped), finds the name, colour, logo and social handles in the markup, has the LLM write the one-liner,
// audience, topics, edge and voice from the page's own words, and asks Jev which life stage it serves. Nothing is
// stored here: the app pre-fills the brand's own stores and the adviser confirms each field.
//
// Phase 4, only for a uid on NORTH_STAR_USERS (403 not_enabled before any count for everyone else, whose read is
// pinned unchanged in index.test.ts):
//   deep: true      Jev picks up to 4 more pages from the home page's links; the writer reads them fenced. The answer
//                   gains pagesRead and lang (a listed uid gets both on any read). Counts "brand-dna" once.
//   mode products   the home page and the picked pages' words, pictures and JSON-LD items, one strict LLM call and one
//                   Jev call (offer, named product, kind). Cap "brand-products", given back when the home page or
//                   OpenAI never answered.
//
// Daily caps "brand-dna", "brand-products". Deploy WITH JWT verification:
//   supabase functions deploy brand-dna --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev, choiceOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { consumeUsage, refundUsage, type UsageResult, usageRefusal } from "../_shared/usageCaps.ts";
import { safeFeedUrl } from "../feed-ideas/logic.ts";
import { isAllowed } from "../market/logic.ts";
import {
  AUDIENCES, audienceAsk, clueLines, fencePages, KINDS, offerAsk, pageQuestions, parseProducts, parseWritten, pickPages, productClues, productMessages,
  PRODUCTS_FORMAT, readSite, type SiteFacts, siteUrl, withOffers, WRITE_FORMAT, writeMessages,
} from "./logic.ts";

const PAGE_BYTES = 300_000;
// under the brand kit's 350,000-character limit once base64 grows it by a third
const LOGO_BYTES = 250_000;
const HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const refusal = (u: Extract<UsageResult, { allowed: false }>) => {
  const r = usageRefusal(u);
  return json(r.body, r.status);
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as competitors: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

// the file's own first bytes, not the server's word for it
const imageType = (b: Uint8Array) =>
  b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png"
  : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg"
  : String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP" ? "image/webp"
  : null;

/** The first of up to 3 logos that is a small PNG, JPEG or WebP, as a data URL; 15 seconds for all of them. */
async function logoOf(candidates: string[]): Promise<string | null> {
  const deadline = AbortSignal.timeout(15_000);
  for (const href of candidates.slice(0, 3)) {
    const u = safeFeedUrl(href);
    if (!u || deadline.aborted) continue;
    try {
      const { bytes } = await fetchCapped(u, LOGO_BYTES + 1, "image/png,image/webp,image/jpeg;q=0.8", deadline);
      const type = imageType(bytes);
      if (bytes.byteLength > LOGO_BYTES || !type || bytes.byteLength < 200) continue;
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:${type};base64,${btoa(bin)}`;
    } catch {
      // the next candidate
    }
  }
  return null;
}

/**
 * The deep read's other pages: Jev picks up to 4 of the home page's links, fetched side by side through the same guard
 * (300 KB and 8 s each, 20 s for all of them). A page that fails or isn't a web page is left out; Jev answering
 * nothing leaves the home page alone.
 */
async function morePages(site: SiteFacts, home: URL): Promise<{ url: URL; html: string; text: string }[]> {
  const answers = await askJev({ site: site.name, home: home.origin }, pageQuestions(site.anchors), { who: "brand-dna pages", timeoutMs: 15_000 });
  const deadline = AbortSignal.timeout(20_000);
  const pages = await Promise.all(pickPages(answers, site.anchors).map(async (a) => {
    try {
      const page = await fetchCapped(new URL(a.path, home), PAGE_BYTES, HTML, deadline);
      // not a web page, or a link that lands back on the home page
      if (!/html|xml|text/.test(page.type) || page.url.href === home.href) return null;
      const html = new TextDecoder().decode(page.bytes);
      return { url: page.url, html, text: readSite(html, page.url).text };
    } catch (e) {
      console.warn("brand-dna: page", a.path, msg(e));
      return null;
    }
  }));
  return pages.filter((p) => p !== null);
}

const SCAN_FAILED = "Couldn't list what this site sells right now. Try again in a few minutes.";

async function products(admin: Admin, uid: string, body: { url?: unknown }): Promise<Response> {
  const url = siteUrl(body?.url);
  if (!url) return fail(400, "bad_request", "Type the brand's web address, like acme.sg.");
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "brand-products");
  if (!usage.allowed) return refusal(usage);
  const giveBack = async (error: string) => (await refundUsage(admin, uid, "brand-products", day), fail(502, "failed", error));

  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, PAGE_BYTES, HTML, AbortSignal.timeout(20_000));
  } catch (e) {
    console.warn("brand-dna: products page", url.host, msg(e));
    return giveBack(`We couldn't open ${url.host}. Check the address and try again.`);
  }
  // the site answered: from here the use is kept
  if (!/html|xml|text/.test(page.type)) return fail(422, "not_a_page", `${url.host} didn't send a web page. Check the address.`);
  const html = new TextDecoder().decode(page.bytes);
  let site: SiteFacts;
  try {
    site = readSite(html, page.url);
  } catch (e) {
    console.warn("brand-dna: products read", url.host, msg(e));
    return fail(422, "unreadable", `We couldn't read ${url.host}.`);
  }
  const read = [{ url: page.url, html, text: site.text }, ...(await morePages(site, page.url))]
    .map((p) => ({ url: p.url.href, text: p.text, clues: productClues(p.html, p.url) }));
  const fenced = fencePages(read.map((p) => ({ url: p.url, text: p.text, extra: clueLines(p.clues) })));
  const pages = read.filter((p) => fenced.read.includes(p.url)).map((p) => ({ url: p.url, pictures: p.clues.pictures }));

  let reply: Response;
  try {
    reply = await openaiChat({ model: OPENAI_MODEL, max_tokens: 2000, response_format: PRODUCTS_FORMAT, messages: productMessages(site, page.url.href, fenced.block) }, { signal: AbortSignal.timeout(50_000) });
  } catch (e) {
    console.warn("brand-dna: products openai", msg(e));
    return giveBack(SCAN_FAILED);
  }
  if (!reply.ok) {
    console.warn("brand-dna: products openai", reply.status);
    return giveBack(SCAN_FAILED);
  }
  const items = parseProducts((await reply.json().catch(() => null))?.choices?.[0]?.message?.content, pages);
  if (!items) return fail(422, "bad_reply", "The list came back unreadable. Try again.");

  const ask = offerAsk({ name: site.name, about: site.description }, items);
  const answers = await askJev(ask.state, ask.questions, { who: "brand-dna products", timeoutMs: 15_000 });
  return json({ site: page.url.origin, readAt: new Date().toISOString(), pagesRead: fenced.read, kind: choiceOf(answers, "kind", KINDS), items: withOffers(items, answers) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);

  const body = await req.json().catch(() => ({}));
  const listed = isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid);
  const mode = body?.mode === "products" ? body.mode : null;
  const deep = body?.deep === true;
  if ((mode || deep) && !listed) return fail(403, "not_enabled", "This isn't switched on for your account yet.");
  if (mode === "products") return await products(admin, uid, body);

  const url = siteUrl(body?.url);
  if (!url) return json({ error: "Type the brand's web address, like acme.sg." }, 400);

  const usage = await consumeUsage(admin, uid, "brand-dna");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }

  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, PAGE_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", AbortSignal.timeout(20_000));
  } catch (e) {
    console.warn("brand-dna: page", url.host, e instanceof Error ? e.message : e);
    return json({ error: `We couldn't open ${url.host}. Check the address, or start with just a name.` }, 422);
  }
  if (!/html|xml|text/.test(page.type)) return json({ error: `${url.host} didn't send a web page. Check the address.` }, 422);
  let site: ReturnType<typeof readSite>;
  try {
    site = readSite(new TextDecoder().decode(page.bytes), page.url);
  } catch (e) {
    console.warn("brand-dna: read", url.host, e instanceof Error ? e.message : e);
    return json({ error: `We couldn't read ${url.host}. Start with just a name instead.` }, 422);
  }

  // the deep read's other pages, each fenced on its own; with none (Jev silent, nothing picked, all failed) the prompt is today's
  const more = deep ? (await morePages(site, page.url)).map((p) => ({ url: p.url.href, text: p.text })) : [];
  const fenced = more.length ? fencePages([{ url: page.url.href, text: site.text }, ...more]) : null;

  // the words (LLM) and the logo download run side by side; either may come back empty
  const [written, logo] = await Promise.all([
    openaiChat({ model: OPENAI_MODEL, max_tokens: 700, response_format: WRITE_FORMAT, messages: writeMessages(site, page.url.href, fenced?.block) }, { signal: AbortSignal.timeout(40_000) })
      .then(async (r) => (r.ok ? parseWritten((await r.json())?.choices?.[0]?.message?.content) : (console.warn("brand-dna: openai", r.status), null)))
      .catch((e) => (console.warn("brand-dna: openai", e instanceof Error ? e.message : e), null)),
    logoOf(site.logos),
  ]);
  const about = [written?.oneLiner, written?.audienceDetail, site.description].filter(Boolean).join(" ");
  const audience = about ? choiceOf(await askJev({ text: about.slice(0, 1500) }, { audience: audienceAsk }, { who: "brand-dna" }), "audience", AUDIENCES) : null;

  return json({
    url: page.url.origin,
    name: written?.name || site.name,
    colour: site.colour,
    logo,
    handles: site.handles,
    oneLiner: written?.oneLiner ?? "",
    audience: audience ?? "general",
    audienceDetail: written?.audienceDetail ?? "",
    topics: written?.topics ?? [],
    edge: written?.edge ?? "",
    voice: written?.voice ?? "",
    ...(listed ? { pagesRead: fenced?.read ?? [page.url.href], lang: site.lang } : {}),
  });
});
