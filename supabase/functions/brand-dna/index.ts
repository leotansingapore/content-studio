// brand-dna: "Add a brand from its website" (docs/brand-isolation.md, phase 2; Holo's Brand DNA flow). A signed-in
// adviser sends one address; this reads that home page (guarded like feed-ideas: public host, redirects re-checked,
// body capped), finds the name, colour, logo and social handles in the markup, has the LLM write the one-liner,
// audience, topics, edge and voice from the page's own words, and asks Jev which life stage it serves. Nothing is
// stored here: the app pre-fills the brand's own stores and the adviser confirms each field.
//
// For every signed-in account (Add a brand finds what the brand sells during the site read, 13 Nov):
//   mode products   the home page and the pages Jev picks from its links (its own pick, no deep read needed): their
//                   words, pictures and JSON-LD items, one strict LLM call and one Jev call (offer, named product,
//                   kind). Each item may carry a picture address seen on those pages (og:image, an img with alt, a
//                   JSON-LD image). Cap "brand-products", given back when the home page or OpenAI never answered.
//
// Phase 4, only for a uid on NORTH_STAR_USERS (403 not_enabled before any count for everyone else, whose read is
// pinned unchanged in index.test.ts):
//   deep: true      Jev picks up to 4 more pages from the home page's links; the writer reads them fenced. The answer
//                   gains pagesRead and lang (a listed uid gets both on any read). Counts "brand-dna" once.
//   mode image      one picture from the brand's site (public address, PNG, JPEG or WebP by its bytes, at most 2 MB)
//                   as a data URL. Cap "brand-image", given back when the site never answered.
//
// Phase 5 (brand-audiences), gated the same way:
//   mode audiences  up to 4 groups of people the brand serves, from its home page and the pages Jev picks (url), or
//                   from the profile it sends; one LLM call and one Jev request (a group of people, its life stage,
//                   the same as a saved one). Cap "audience-suggest", given back when the home page or OpenAI never
//                   answered; 422 none_new keeps the use.
//
// Daily caps "brand-dna", "brand-products", "brand-image", "audience-suggest". Deploy WITH JWT verification:
//   supabase functions deploy brand-dna --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev, choiceOf } from "../_shared/jev.ts";
import { professionAsk, professionFrom } from "./profession.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { consumeUsage, isOwnerId, OWNER_BRAND_READ_LIMIT, refundUsage, type UsageResult, usageRefusal } from "../_shared/usageCaps.ts";

// the owner's own id reads up to OWNER_BRAND_READ_LIMIT sites a day (dogfooding Add a brand); everyone else the shared cap
const readCap = (uid: string) => (isOwnerId(Deno.env.get("NORTH_STAR_USERS"), uid) ? OWNER_BRAND_READ_LIMIT : undefined);
import { safeFeedUrl } from "../feed-ideas/logic.ts";
import { isAllowed } from "../market/logic.ts";
import {
  AUDIENCES, audienceAsk, audienceMessages, audienceQuestions, AUDIENCES_FORMAT, clueLines, fencePages, keepAudiences, KINDS, offerAsk, pageQuestions,
  parseAudienceAsk, parseAudiences, parseProducts, parseWritten, pickPages, productClues, productMessages, PRODUCTS_FORMAT, readSite, type SiteFacts, siteUrl,
  withOffers, WRITE_FORMAT, writeMessages,
} from "./logic.ts";
import { colourful, icoPng, type LogoPick, logoPicks, logoWindow, lookFonts, lookPalette, stylesheetLinks, svgDataUrl, svgFile } from "./look.ts";

const PAGE_BYTES = 300_000;
const HOME_BYTES = 1_000_000;
// under the brand kit's 350,000-character limit once base64 grows it by a third
const LOGO_BYTES = 2_000_000;
const IMAGE_BYTES = 2_000_000;
const STYLE_BYTES = 300_000;
const HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const IMAGES = "image/png,image/webp,image/jpeg;q=0.8";
const LOGOS = "image/png,image/webp,image/svg+xml,image/jpeg;q=0.8,image/*;q=0.5";
const CSS = "text/css,*/*;q=0.1";
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

function dataUrl(bytes: Uint8Array, type: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

const logoFrom = async (picks: LogoPick[], page: string): Promise<{ dataUrl: string; svg: string } | null> => {
  const deadline = AbortSignal.timeout(15_000);
  let fetched = 0;
  for (const p of picks) {
    if (p.kind === "svg") {
      const url = svgDataUrl(p.svg, page);
      if (url) return { dataUrl: url, svg: p.svg };
      continue;
    }
    const u = safeFeedUrl(p.src);
    if (!u || fetched === 3 || deadline.aborted) continue;
    fetched++;
    const got = await fetchCapped(u, LOGO_BYTES + 1, LOGOS, deadline).catch(() => null);
    if (!got || got.bytes.byteLength > LOGO_BYTES) continue;
    const bytes = icoPng(got.bytes) ?? got.bytes;
    const type = imageType(bytes);
    if (type) {
      if (bytes.byteLength >= 200) return { dataUrl: dataUrl(bytes, type), svg: "" };
      continue;
    }
    const text = new TextDecoder().decode(got.bytes);
    const url = svgFile(text) ? svgDataUrl(text, page) : null;
    if (url) return { dataUrl: url, svg: text };
  }
  return null;
};

const safely = <T>(what: string, run: () => T, fallback: T): T => {
  try {
    return run();
  } catch (e) {
    console.warn("brand-dna: look", what, msg(e));
    return fallback;
  }
};

const sheetsOf = async (html: string, base: URL): Promise<string> => {
  const deadline = AbortSignal.timeout(8_000);
  const texts = await Promise.all(stylesheetLinks(html, base).map(async (href) => {
    const u = safeFeedUrl(href);
    const got = u ? await fetchCapped(u, STYLE_BYTES, CSS, deadline).catch(() => null) : null;
    return got && !/html/.test(got.type) ? new TextDecoder().decode(got.bytes) : "";
  }));
  return texts.filter(Boolean).join("\n");
};

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
      // the path is the site's own, but "//host/x" would resolve to another host: rebuild it on the home page's origin
      const at = new URL(`/${a.path.replace(/^\/+/, "")}`, home.origin);
      if (at.host !== home.host) return null;
      const page = await fetchCapped(at, PAGE_BYTES, HTML, deadline);
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
  const usage = await consumeUsage(admin, uid, "brand-products", readCap(uid));
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

async function image(admin: Admin, uid: string, body: { url?: unknown }): Promise<Response> {
  const url = safeFeedUrl(body?.url);
  if (!url) return fail(400, "bad_request", "Send the picture's web address.");
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "brand-image");
  if (!usage.allowed) return refusal(usage);
  let got: { bytes: Uint8Array };
  try {
    // the same guard as every page: public addresses only, redirects re-checked, at most one byte over the limit
    got = await fetchCapped(url, IMAGE_BYTES + 1, IMAGES, AbortSignal.timeout(15_000));
  } catch (e) {
    console.warn("brand-dna: image", url.host, msg(e));
    await refundUsage(admin, uid, "brand-image", day);
    return fail(502, "failed", "Couldn't fetch that picture. Upload one instead.");
  }
  if (got.bytes.byteLength > IMAGE_BYTES) return fail(422, "too_big", "That picture is over 2 MB. Upload one instead.");
  const type = imageType(got.bytes);
  if (!type) return fail(422, "not_image", "That address isn't a PNG, JPEG or WebP picture. Upload one instead.");
  return json({ dataUrl: dataUrl(got.bytes, type) });
}

async function audiences(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const parsed = parseAudienceAsk(body);
  if (!parsed.ok) return fail(400, "bad_request", parsed.error);
  const { url, profile, saved } = parsed.ask;
  if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "not_configured", "Suggestions aren't set up yet.");
  const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before it moves
  const usage = await consumeUsage(admin, uid, "audience-suggest");
  if (!usage.allowed) return refusal(usage);
  const giveBack = async (error: string) => (await refundUsage(admin, uid, "audience-suggest", day), fail(502, "failed", error));
  const where = url ? `on ${url.host}` : "in your profile";

  // a profile-only ask (parseAudienceAsk never hands it to siteUrl) skips the fetch
  let source: Parameters<typeof audienceMessages>[0] = { profile: profile! };
  let pagesRead: string[] = [];
  let business = profile?.oneLiner ?? "";
  if (url) {
    let page: { bytes: Uint8Array; type: string; url: URL };
    try {
      page = await fetchCapped(url, PAGE_BYTES, HTML, AbortSignal.timeout(20_000));
    } catch (e) {
      console.warn("brand-dna: audiences page", url.host, msg(e));
      return giveBack(`We couldn't read ${url.host}. Check the address, or suggest from your profile.`);
    }
    // the site answered: from here the use is kept
    if (!/html|xml|text/.test(page.type)) return fail(422, "not_a_page", `${url.host} didn't send a web page. Check the address.`);
    const html = new TextDecoder().decode(page.bytes);
    let site: SiteFacts;
    try {
      site = readSite(html, page.url);
    } catch (e) {
      console.warn("brand-dna: audiences read", url.host, msg(e));
      return fail(422, "unreadable", `We couldn't read ${url.host}. Check the address, or suggest from your profile.`);
    }
    const fenced = fencePages([{ url: page.url.href, text: site.text }, ...(await morePages(site, page.url)).map((p) => ({ url: p.url.href, text: p.text }))]);
    source = { site, url: page.url.href, fenced: fenced.block };
    pagesRead = fenced.read;
    business = site.name;
  }

  let reply: Response;
  try {
    reply = await openaiChat({ model: OPENAI_MODEL, max_tokens: 900, response_format: AUDIENCES_FORMAT, messages: audienceMessages(source, saved) }, { signal: AbortSignal.timeout(40_000) });
  } catch (e) {
    console.warn("brand-dna: audiences openai", msg(e));
    return giveBack("Couldn't suggest audiences right now. Try again in a few minutes.");
  }
  if (!reply.ok) {
    console.warn("brand-dna: audiences openai", reply.status);
    return giveBack("Couldn't suggest audiences right now. Try again in a few minutes.");
  }
  const cands = parseAudiences((await reply.json().catch(() => null))?.choices?.[0]?.message?.content);
  if (!cands) return fail(422, "bad_reply", "The suggestions came back unreadable. Try again.");

  const answers = cands.length
    ? await askJev({ business, country: "Singapore" }, audienceQuestions(cands, saved), { who: "brand-dna audiences", timeoutMs: 15_000 })
    : null;
  const kept = keepAudiences(cands, saved.length, answers);
  if (!kept.audiences.length) return fail(422, "none_new", `Nothing new ${where} about who you serve. Add one yourself.`);
  return json({ audiences: kept.audiences, pagesRead, scored: kept.scored });
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
  const mode = body?.mode === "products" || body?.mode === "image" || body?.mode === "audiences" ? body.mode : null;
  const deep = body?.deep === true;
  // products runs for every signed-in account (Add a brand), held to its own daily cap
  if (((mode && mode !== "products") || deep) && !listed) return fail(403, "not_enabled", "This isn't switched on for your account yet.");
  if (mode === "products") return await products(admin, uid, body);
  if (mode === "image") return await image(admin, uid, body);
  // before the plain read's siteUrl check, which would answer 400 to a profile-only body
  if (mode === "audiences") return await audiences(admin, uid, body);

  const url = siteUrl(body?.url);
  if (!url) return json({ error: "Type the brand's web address, like acme.sg." }, 400);

  const usage = await consumeUsage(admin, uid, "brand-dna", readCap(uid));
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }

  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, HOME_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", AbortSignal.timeout(20_000));
  } catch (e) {
    console.warn("brand-dna: page", url.host, e instanceof Error ? e.message : e);
    return json({ error: `We couldn't open ${url.host}. Check the address, or start with just a name.` }, 422);
  }
  if (!/html|xml|text/.test(page.type)) return json({ error: `${url.host} didn't send a web page. Check the address.` }, 422);
  const html = new TextDecoder().decode(page.bytes);
  let site: ReturnType<typeof readSite>;
  try {
    site = readSite(html, page.url);
  } catch (e) {
    console.warn("brand-dna: read", url.host, e instanceof Error ? e.message : e);
    return json({ error: `We couldn't read ${url.host}. Start with just a name instead.` }, 422);
  }

  // the deep read's other pages, each fenced on its own; with none (Jev silent, nothing picked, all failed) the prompt is today's
  const more = deep ? (await morePages(site, page.url)).map((p) => ({ url: p.url.href, text: p.text })) : [];
  const fenced = more.length ? fencePages([{ url: page.url.href, text: site.text }, ...more]) : null;

  const top = html.slice(0, PAGE_BYTES);
  const shown = safely("logo", () => logoWindow(html), top);
  const found = safely("logo", () => logoPicks(shown, page.url, site.name), [] as LogoPick[]);
  const picks: LogoPick[] = found.length ? found : [{ kind: "img", src: new URL("/favicon.ico", page.url).href, from: "icon" }];
  // the words (LLM) and the logo download run side by side; either may come back empty
  const [written, logo, css] = await Promise.all([
    openaiChat({ model: OPENAI_MODEL, max_tokens: 700, response_format: WRITE_FORMAT, messages: writeMessages(site, page.url.href, fenced?.block) }, { signal: AbortSignal.timeout(40_000) })
      .then(async (r) => (r.ok ? parseWritten((await r.json())?.choices?.[0]?.message?.content) : (console.warn("brand-dna: openai", r.status), null)))
      .catch((e) => (console.warn("brand-dna: openai", e instanceof Error ? e.message : e), null)),
    logoFrom(picks, shown).catch((e) => (console.warn("brand-dna: look logo", msg(e)), null)),
    sheetsOf(top, page.url).catch((e) => (console.warn("brand-dna: look sheets", msg(e)), "")),
  ]);
  const drawn = picks.flatMap((p) => (p.kind === "svg" && (p.from === "home link" || p.from === "header") ? [p.svg] : []))[0] ?? "";
  const palette = safely("colours", () => lookPalette(top, css, logo?.svg || drawn), { colours: [] as string[], neutrals: [] as string[] });
  const colours = palette.colours.slice(0, 4);
  const about = [written?.oneLiner, written?.audienceDetail, site.description].filter(Boolean).join(" ");
  // one Jev call answers both: who the brand helps, and what it does (docs/profession-pick.md)
  const told = about ? await askJev({ text: about.slice(0, 1500) }, { audience: audienceAsk, profession: professionAsk }, { who: "brand-dna" }) : null;
  const audience = told ? choiceOf(told, "audience", AUDIENCES) : null;

  return json({
    url: page.url.origin,
    name: written?.name || site.name,
    colour: colours.find(colourful) ?? site.colour ?? colours[0] ?? null,
    logo: logo?.dataUrl ?? null,
    handles: site.handles,
    oneLiner: written?.oneLiner ?? "",
    audience: audience ?? "general",
    audienceDetail: written?.audienceDetail ?? "",
    topics: written?.topics ?? [],
    edge: written?.edge ?? "",
    voice: written?.voice ?? "",
    colours,
    neutrals: palette.neutrals,
    fonts: safely("fonts", () => lookFonts(top, css).slice(0, 3), [] as string[]),
    profession: professionFrom(told),
    ...(listed ? { pagesRead: fenced?.read ?? [page.url.href], lang: site.lang } : {}),
  });
});
