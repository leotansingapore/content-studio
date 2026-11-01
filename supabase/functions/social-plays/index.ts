// social-plays (/social-north-star, docs/north-star/items/social-north-star.md): the formats that win among a brand's
// Apps like yours references, as plays. One call: Jev labels each post not labelled before with a format family and a
// hook shape, looking at its cover when the cover opens as a JPEG or PNG Jev takes (else the words alone); the posts
// are grouped into plays (logic.ts groupPlays, which the app runs on the same posts); and OpenAI writes each play's
// recipe from its best examples (words only). The brand's own recent posts come in the same call, labelled the same
// way, for the page's progress. Nothing is stored here: the app keeps the labels and the plays.
//
// Leo only while NORTH_STAR_USERS lists the caller. Caps "social-plays" a user and "social-plays-global" across
// everyone on GLOBAL_COUNTER_USER. Jev answering none of the posts it was asked about gives both uses back (502); a
// recipe call that fails keeps the labels and says so; a build that asked Jev nothing and wrote nothing goes back too.
//
// Secrets (all set already): NORTH_STAR_USERS, TYPESAFE_API_KEY, OPENAI_API_KEY.
// Deploy WITH JWT verification:
//   supabase functions deploy social-plays --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, type UsageResult, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed } from "../market/logic.ts";
import {
  cleanPlays, COVER_BYTES, type Family, groupPlays, imageSize, jevTakes, labelAsk, labelOf, parseRecipes, type PlayPost, type PostLabel, type Recipe, RECIPE_FORMAT,
  recipeMessages,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as competitors: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const FAILED = "Couldn't sort the posts right now. Try again in a few minutes.";
const PAUSED = "Building plays is paused for today. It resumes at 8am Singapore time.";
const RECIPES_FAILED = "Couldn't write the recipes right now. They come with the next build.";
// Jev asks until this point of the function's ~150 s (what is left is asked on the next build), then the recipe call.
const JEV_UNTIL_MS = 105_000;
const RECIPE_BY_MS = 140_000;
const IMAGE = "image/jpeg,image/png;q=0.9,*/*;q=0.5";

const refusal = (u: Extract<UsageResult, { allowed: false }>) => {
  const r = usageRefusal(u);
  return json(r.body, r.status);
};

function dataUrl(bytes: Uint8Array, type: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

/** The cover as a data URL Jev takes, or null (gone, expired, WebP or HEIC, or a side out of Jev's range). */
async function coverOf(href: string): Promise<string | null> {
  try {
    const page = await fetchCapped(new URL(href), COVER_BYTES, IMAGE, AbortSignal.timeout(6_000));
    const size = imageSize(page.bytes);
    return size && jevTakes(size) ? dataUrl(page.bytes, size.type) : null;
  } catch (e) {
    console.warn("social-plays: cover", new URL(href).hostname, msg(e));
    return null;
  }
}

/** One post's label, from its cover and words; a call Jev refuses with the picture is asked once more on the words. */
async function label(p: PlayPost): Promise<{ label: PostLabel | null; looked: boolean }> {
  const pic = p.cover ? await coverOf(p.cover) : null;
  if (pic) {
    const ref = crypto.randomUUID();
    const a = labelAsk(p, ref);
    const seen = labelOf(await askJev(a.state, a.questions, { who: "social-plays label", images: { [ref]: pic }, timeoutMs: 12_000 }));
    if (seen) return { label: seen, looked: true };
  }
  const a = labelAsk(p, null);
  return { label: labelOf(await askJev(a.state, a.questions, { who: "social-plays label" })), looked: false };
}

async function plays(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = cleanPlays(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  if (!Deno.env.get("TYPESAFE_API_KEY")) return fail(503, "failed", "Building plays isn't switched on yet.");

  const started = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const mine = await consumeUsage(admin, uid, "social-plays");
  if (!mine.allowed) return refusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "social-plays-global");
  if (!everyone.allowed) {
    await refundUsage(admin, uid, "social-plays", day);
    return everyone.reason === "limit" ? fail(429, "global_limit", PAUSED) : refusal(everyone);
  }
  const giveBack = () => Promise.all([refundUsage(admin, uid, "social-plays", day), refundUsage(admin, GLOBAL_COUNTER_USER, "social-plays-global", day)]);

  const ask = [...r.posts, ...r.own].filter((p) => !p.label);
  const answers = await pool(ask, 8, async (p) => (Date.now() - started < JEV_UNTIL_MS ? await label(p) : null));
  // every decision, so the first real build can be read and FAMILY_MIN set from it
  ask.forEach((p, k) =>
    console.log(`social-plays: ${p.key} | ${answers[k]?.looked ? "cover" : "words"} | ${answers[k]?.label?.family ?? "unjudged"} | ${answers[k]?.label?.hook ?? "-"}`));
  const fresh: Record<string, PostLabel> = Object.fromEntries(ask.flatMap((p, k) => (answers[k]?.label ? [[p.key, answers[k]!.label!]] : [])));
  if (ask.length && !Object.keys(fresh).length) {
    await giveBack();
    return fail(502, "failed", FAILED);
  }

  // Jev answered (and billed), or every post came labelled: from here the uses are kept, unless nothing at all is paid
  const groups = groupPlays(r.posts, fresh);
  let recipes: Partial<Record<Family, Recipe>> = {};
  let note: string | undefined;
  if (groups.length) {
    try {
      if (!Deno.env.get("OPENAI_API_KEY")) throw new Error("no OPENAI_API_KEY");
      const res = await openaiChat(
        { model: OPENAI_MODEL, max_tokens: 1800, response_format: RECIPE_FORMAT, messages: recipeMessages(groups, fresh) },
        { signal: AbortSignal.timeout(Math.max(5_000, RECIPE_BY_MS - (Date.now() - started))) },
      );
      if (res.ok) recipes = parseRecipes((await res.json())?.choices?.[0]?.message?.content, groups.map((g) => g.id));
      else console.error("social-plays: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
    } catch (e) {
      console.error("social-plays: openai", msg(e));
    }
    if (!Object.keys(recipes).length) note = RECIPES_FAILED;
  }
  // nothing asked of Jev and no recipe written: nothing was paid for
  if (!ask.length && !Object.keys(recipes).length) await giveBack();
  return json({ labels: fresh, recipes, asked: ask.length, ...(note ? { note } : {}), checkedAt: new Date().toISOString() });
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
    return await plays(admin, uid, await req.json().catch(() => ({})));
  } catch (e) {
    console.error("social-plays failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
