// media-sort (brand-media-library step 1, brand-demo-videos): reads files people add on the device. Modes, on body.mode:
//   sort  one JPEG still of a photo or video (a video's frame 25% in): one low-detail vision call writes the alt text
//         and reads the words on it, then Jev looks at the still beside those words and picks one of seven types (the
//         words alone when Jev can't take the picture: a side under 280 px, a timeout, an error, an unreadable answer). Returns { alt, type }.
//   demo  1 to 3 stills from a demo's chosen window: one vision call says what the screen shows, then Jev answers three
//         questions (a named product, a projected return, someone's details). Returns { shows, flags }.
// Nothing is stored here; the files never leave the device apart from these stills.
//
// Leo only while NORTH_STAR_USERS lists the caller (403 not_enabled before anything is counted). Cap "media-sort"
// (both modes). A use goes back only when the vision call never answered (non-2xx, timeout, no connection: 502); a
// reply it can't read keeps it (422), and Jev returning nothing gives type "other" or no flags.
//
// Secrets (all set already): NORTH_STAR_USERS, OPENAI_API_KEY, TYPESAFE_API_KEY.
// Deploy WITH JWT verification (a new name: check `supabase functions list` first):
//   supabase functions deploy media-sort --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev } from "../_shared/jev.ts";
import { openaiChat } from "../_shared/openaiChat.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed } from "../market/logic.ts";
import {
  DEMO_FORMAT, demoAsk, demoMessages, IMAGE_TYPE_MIN, imageTypeAsk, parseDemo, parseDemoRequest, parseSortRequest, parseVision, readFlags, readType, SORT_FORMAT,
  sortMessages, typeAsk, usableType, VISION_MODEL,
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

/** The vision reply's text, or null when OpenAI never answered (non-2xx, timeout, no connection). */
async function look(body: Record<string, unknown>): Promise<{ content: unknown } | null> {
  try {
    const res = await openaiChat(body, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) return { content: (await res.json())?.choices?.[0]?.message?.content };
    console.error("media-sort: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
  } catch (e) {
    console.error("media-sort: openai", msg(e));
  }
  return null;
}

/** Counts the use, or the refusal to send. `day` is read before the counter, so a refund lands on the same row. */
async function spend(admin: Admin, uid: string): Promise<{ day: string } | Response> {
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "media-sort");
  if (usage.allowed) return { day };
  const r = usageRefusal(usage);
  return json(r.body, r.status);
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
    if (body?.mode !== "sort" && body?.mode !== "demo") return fail(400, "bad_request", "Unknown mode.");
    const r = body.mode === "sort" ? parseSortRequest(body) : parseDemoRequest(body);
    if (typeof r === "string") return fail(400, "bad_request", r);
    if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "failed", "Sorting isn't switched on yet.");

    const spent = await spend(admin, uid);
    if (spent instanceof Response) return spent;
    const sort = "kind" in r;
    const seen = await look(
      sort
        ? { model: VISION_MODEL, max_tokens: 150, response_format: SORT_FORMAT, messages: sortMessages(r) }
        : { model: VISION_MODEL, max_tokens: 200, response_format: DEMO_FORMAT, messages: demoMessages(r) },
    );
    if (!seen) {
      await refundUsage(admin, uid, "media-sort", spent.day);
      return fail(502, "failed", sort ? "Couldn't sort that file. Try again in a minute." : "Couldn't read what it shows. Try again in a minute.");
    }

    // OpenAI answered (and billed): from here the use is kept
    if (sort) {
      const v = parseVision(seen.content);
      if (!v) return fail(422, "unreadable", "Couldn't read that file.");
      const ref = `img-${crypto.randomUUID()}`;
      const pic = imageTypeAsk(v, r, ref);
      const looked = await askJev(pic.state, pic.questions, { who: "media-sort image", images: { [ref]: r.still } });
      if (usableType(looked)) return json({ alt: v.alt, type: readType(looked, IMAGE_TYPE_MIN) });
      // an older app's 360-wide landscape still is under 280 px tall, which Jev refuses, or the answer can't be read:
      // the words decide, as before
      const ask = typeAsk(v, r);
      return json({ alt: v.alt, type: readType(await askJev(ask.state, ask.questions, { who: "media-sort" })) });
    }
    const d = parseDemo(seen.content);
    if (!d) return fail(422, "unreadable", "Couldn't read what it shows. Add a line yourself.");
    const ask = demoAsk(d);
    return json({ shows: d.shows, flags: readFlags(await askJev(ask.state, ask.questions, { who: "media-sort demo" })) });
  } catch (e) {
    console.error("media-sort failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
