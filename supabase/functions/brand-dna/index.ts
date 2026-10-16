// brand-dna: "Add a brand from its website" (docs/brand-isolation.md, phase 2; Holo's Brand DNA flow). A signed-in
// adviser sends one address; this reads that home page (guarded like feed-ideas: public host, redirects re-checked,
// body capped), finds the name, colour, logo and social handles in the markup, has the LLM write the one-liner,
// audience, topics, edge and voice from the page's own words, and asks Jev which life stage it serves. Nothing is
// stored here: the app pre-fills the brand's own stores and the adviser confirms each field.
//
// Daily cap "brand-dna". Deploy WITH JWT verification:
//   supabase functions deploy brand-dna --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev, choiceOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { safeFeedUrl } from "../feed-ideas/logic.ts";
import { AUDIENCES, audienceAsk, parseWritten, readSite, siteUrl, WRITE_FORMAT, writeMessages } from "./logic.ts";

const PAGE_BYTES = 1_500_000;
const LOGO_BYTES = 300_000;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

/** Follows up to 3 redirects that each pass the same guard, and reads at most `max` bytes. */
async function fetchCapped(start: URL, max: number, accept: string): Promise<{ bytes: Uint8Array; type: string; url: URL }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "ContentStudio-BrandReader/1.0", Accept: accept } });
    if (res.status >= 300 && res.status < 400) {
      const next = safeFeedUrl(new URL(res.headers.get("location") ?? "", url).href);
      if (!next) throw new Error("redirects somewhere we can't read");
      url = next;
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`answered ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let at = 0;
    for (const c of chunks) (bytes.set(c, at), (at += c.byteLength));
    return { bytes, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), url };
  }
  throw new Error("redirects too many times");
}

/** The first logo that is a small PNG, JPEG or WebP, as a data URL (the brand kit keeps logos inline). */
async function logoOf(candidates: string[]): Promise<string | null> {
  for (const href of candidates) {
    const u = safeFeedUrl(href);
    if (!u) continue;
    try {
      const { bytes, type } = await fetchCapped(u, LOGO_BYTES + 1, "image/png,image/webp,image/jpeg;q=0.8");
      if (bytes.byteLength > LOGO_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(type) || bytes.byteLength < 200) continue;
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:${type};base64,${btoa(bin)}`;
    } catch {
      // the next candidate
    }
  }
  return null;
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
  const url = siteUrl(body?.url);
  if (!url) return json({ error: "Type the brand's web address, like acme.sg." }, 400);

  const usage = await consumeUsage(admin, uid, "brand-dna");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }

  let page: { bytes: Uint8Array; type: string; url: URL };
  try {
    page = await fetchCapped(url, PAGE_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
  } catch (e) {
    console.warn("brand-dna: page", url.host, e instanceof Error ? e.message : e);
    return json({ error: `We couldn't open ${url.host}. Check the address, or start with just a name.` }, 422);
  }
  if (!/html|xml|text/.test(page.type)) return json({ error: `${url.host} didn't send a web page. Check the address.` }, 422);
  const site = readSite(new TextDecoder().decode(page.bytes), page.url);

  // the words (LLM) and the logo download run side by side; either may come back empty
  const [written, logo] = await Promise.all([
    openaiChat({ model: OPENAI_MODEL, max_tokens: 700, response_format: WRITE_FORMAT, messages: writeMessages(site, page.url.href) }, { signal: AbortSignal.timeout(40_000) })
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
  });
});
