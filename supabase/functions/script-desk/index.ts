// script-desk (wave 1): the Scriptwriter, hook ideas, a
// reel's breakdown, both remix modes and Re-script with its claim check. It never calls a model: each request is filed
// in cs_ai_jobs (033) with its inputs only (logic.ts JobInputs, no prompt text); Leo's Mac claims it through
// script-worker, builds Claude Code's request from them with its private templates, and runs it on his own Claude
// Code, and the app polls here for the answer.
//
// Actions, on body.action (every one after sign-in and the gate):
//   write      body.entry: dials {topic?, dials}, hook {hook, about?, band?}, topic {topic, band?},
//              same-idea {url, breakdown?, band?}, same-structure {url, breakdown?, topic?, band?}
//   hooks      {topic}: 12 hook ideas
//   breakdown  {url}: why a reel worked
//   rescript   {url}: the reel's spoken words, re-scripted into the user
//   claims     {job}: the claim check on a finished re-script (no job when nothing changed)
//   job        {id}: where a job is; a done one comes back in its JSON shape
// Every filing action takes {context} (Me, Product, the avatar, niche, voice sample: logic.ts sanitizeContext) and
// {brand}. A reel ({url}) is read from clone-reel's cache (cs_reel_sources) only: Clone a reel reads it first.
//
// Leo only while NORTH_STAR_USERS lists the caller's uid (a real id: "*" opens nothing, logic.ts ownersOf; 403
// not_enabled before the body is read). A request over MAX_REQUEST_BYTES is refused before it counts. A filing counts one
// "script-desk" use (given back when the insert fails), at most MAX_OPEN of an owner's jobs are open at once (counted,
// then inserted: two filings at the same moment can pass it by one), and filing deletes that owner's rows older than
// KEEP_DAYS. Polling is free.
//
// Secrets (set already): NORTH_STAR_USERS. Needs 033 applied. Deploy WITH JWT verification (a new name):
//   supabase functions deploy script-desk --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { parseReelUrl } from "../clone-reel/logic.ts";
import { findSource } from "../clone-reel/source.ts";
import {
  DESK_COPY, KEEP_DAYS, LIMITS, MAX_OPEN, MAX_REQUEST_BYTES, PICKUP_SECONDS, RUN_LIMIT_MS, WRITE_ENTRIES, applyClaims, bytesOf, cleanBand, cleanBreakdown,
  cleanDials, cut, ownersOf, readBreakdown, readClaims, readHooks, readRescript, readScript, sanitizeContext, type Context, type JobInputs, type JobKind,
  type SourceReel,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as media-sort: the usage helpers reject createClient's inferred schema

const text = (v: unknown, max: number) => (typeof v === "string" ? cut(v.replace(/\s+/g, " ").trim(), max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const brandOf = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : "me");

/** The cached post behind a pasted link, as a job carries it; a Response when there is none. */
async function reelOf(admin: Admin, url: unknown): Promise<SourceReel | Response> {
  const parsed = parseReelUrl(url);
  if (parsed.ok === false) return fail(400, "bad_url", parsed.message);
  const row = await findSource(admin, parsed);
  if (!row) return fail(404, "not_cloned", DESK_COPY.notCloned);
  const m = row.metrics ?? null;
  return {
    platform: row.platform,
    author: row.author ?? "",
    views: m?.views ?? null,
    likes: m?.likes ?? null,
    comments: m?.comments ?? null,
    shares: m?.shares ?? null,
    postedAt: row.posted_at ?? null,
    caption: row.caption ?? "",
    transcript: row.transcript ?? "",
  };
}

type Filing = { kind: JobKind; request: JobInputs };

/** The job a filing action asks for, or the refusal to send. */
async function planOf(admin: Admin, action: string, body: Record<string, unknown>, context: Context): Promise<Filing | Response> {
  const topic = text(body.topic, LIMITS.topic);
  const band = cleanBand(body.band);
  if (action === "hooks") {
    if (!topic) return fail(400, "bad_request", "Type a topic first.");
    return { kind: "hooks", request: { topic, context } };
  }
  if (action === "breakdown" || action === "rescript") {
    const reel = await reelOf(admin, body.url);
    if (reel instanceof Response) return reel;
    if (action === "rescript" && !reel.transcript.trim()) return fail(422, "no_words", DESK_COPY.noWords);
    // a re-script's source and context are also what its claim check reads (claimsPlan)
    return { kind: action, request: { source: reel, context } };
  }
  const entry = WRITE_ENTRIES.find((e) => e === body.entry);
  if (!entry) return fail(400, "bad_request", "Unknown way to write.");
  if (entry === "dials") {
    const { dials, length } = cleanDials(body.dials);
    return { kind: "write", request: { entry, topic: topic || undefined, dials, length, context } };
  }
  if (entry === "hook") {
    const hook = text(body.hook, LIMITS.hook);
    if (!hook) return fail(400, "bad_request", "Pick a hook first.");
    return { kind: "write", request: { entry, hook, about: text(body.about, LIMITS.about) || undefined, band, context } };
  }
  if (entry === "topic") {
    if (!topic) return fail(400, "bad_request", "Type a topic first.");
    return { kind: "write", request: { entry, topic, band, context } };
  }
  const reel = await reelOf(admin, body.url);
  if (reel instanceof Response) return reel;
  const breakdown = cleanBreakdown(body.breakdown);
  return { kind: "write", request: { entry, source: reel, breakdown, ...(entry === "same-structure" && topic ? { topic } : {}), band, context } };
}

/** The claim check's job for a finished re-script, or its answer straight away when nothing changed. */
async function claimsPlan(admin: Admin, uid: string, id: unknown): Promise<Filing | Response> {
  if (typeof id !== "string" || !UUID.test(id)) return fail(400, "bad_request", "Which re-script?");
  const { data: row, error } = await admin.from("cs_ai_jobs").select("kind, status, result, request").eq("id", id).eq("owner_id", uid).maybeSingle();
  if (error) throw error;
  if (!row || row.kind !== "rescript") return fail(404, "gone", DESK_COPY.gone);
  if (row.status !== "done") return fail(409, "not_ready", DESK_COPY.notReady);
  const adapted = readRescript(row.result?.text);
  const original = typeof row.request?.source?.transcript === "string" ? row.request.source.transcript : "";
  if (!adapted || !original) return fail(422, "unreadable", DESK_COPY.unreadable);
  if (adapted.script.trim() === original.trim()) return json({ status: "done", result: { unsupported: [], script: adapted.script } });
  // the same facts the re-script had
  return { kind: "claims", request: { original, adapted: adapted.script, context: sanitizeContext(row.request?.context) } };
}

/** A done job's answer in its JSON shape; null when Claude's text can't be read as that shape. */
function answerOf(kind: JobKind, result: { text?: unknown } | null, request: Partial<JobInputs> | undefined): unknown {
  const t = result?.text;
  if (kind === "write") return readScript(t);
  if (kind === "hooks") {
    const hooks = readHooks(t);
    return hooks && { hooks };
  }
  if (kind === "breakdown") return readBreakdown(t);
  if (kind === "rescript") return readRescript(t);
  const unsupported = readClaims(t);
  const adapted = typeof request?.adapted === "string" ? request.adapted : "";
  return unsupported && { unsupported, script: applyClaims(adapted, unsupported) };
}

/**
 * Where one of the caller's jobs is. A job nobody took, or that never finished, is failed here, once; when the worker
 * claimed or answered it in the meantime, the job is read again and its real state answered.
 */
async function poll(admin: Admin, uid: string, id: unknown, again = false): Promise<Response> {
  if (typeof id !== "string" || !UUID.test(id)) return fail(400, "bad_request", "Which job?");
  const { data: row, error } = await admin
    .from("cs_ai_jobs").select("id, kind, status, result, error, created_at, claimed_at").eq("id", id).eq("owner_id", uid).maybeSingle();
  if (error) throw error;
  if (!row) return fail(404, "gone", DESK_COPY.gone);
  const now = Date.now();
  const giveUp = async (from: "queued" | "claimed", why: string) => {
    const { data: moved, error: e } = await admin
      .from("cs_ai_jobs").update({ status: "failed", error: why, done_at: new Date(now).toISOString() }).eq("id", id).eq("status", from).select("id");
    if (e) throw e;
    if (Array.isArray(moved) && moved.length === 1) return json({ status: "failed", error: why });
    return again ? json({ status: from }) : poll(admin, uid, id, true);
  };
  if (row.status === "queued") {
    return now - Date.parse(row.created_at) > PICKUP_SECONDS * 1000 ? giveUp("queued", DESK_COPY.noWorker) : json({ status: "queued" });
  }
  if (row.status === "claimed") {
    return now - Date.parse(row.claimed_at) > RUN_LIMIT_MS ? giveUp("claimed", DESK_COPY.stalled) : json({ status: "claimed" });
  }
  if (row.status === "failed") return json({ status: "failed", error: row.error || DESK_COPY.stalled });
  // the inputs (up to 60 KB) are read only for the one answer that needs them: a claim check's adapted script
  let request: Partial<JobInputs> | undefined;
  if (row.kind === "claims") {
    const { data, error: e } = await admin.from("cs_ai_jobs").select("request").eq("id", id).eq("owner_id", uid).maybeSingle();
    if (e) throw e;
    request = data?.request;
  }
  const result = answerOf(row.kind, row.result, request);
  return result ? json({ status: "done", result }) : json({ status: "failed", error: DESK_COPY.unreadable });
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
    if (!ownersOf(Deno.env.get("NORTH_STAR_USERS")).includes(uid)) return fail(403, "not_enabled", DESK_COPY.notAllowed);

    const body = (await req.json().catch(() => ({}))) ?? {};
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "job") return await poll(admin, uid, body.id);
    if (!["write", "hooks", "breakdown", "rescript", "claims"].includes(action)) return fail(400, "bad_request", "Unknown action.");

    const plan = action === "claims" ? await claimsPlan(admin, uid, body.job) : await planOf(admin, action, body, sanitizeContext(body.context));
    if (plan instanceof Response) return plan;

    const since = new Date(Date.now() - RUN_LIMIT_MS - PICKUP_SECONDS * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("cs_ai_jobs").select("id", { count: "exact", head: true }).eq("owner_id", uid).in("status", ["queued", "claimed"]).gt("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_OPEN) return fail(429, "too_many", DESK_COPY.tooMany);
    if (bytesOf(plan.request) > MAX_REQUEST_BYTES) return fail(413, "too_big", DESK_COPY.tooBig);
    const day = new Date().toISOString().slice(0, 10);
    const usage = await consumeUsage(admin, uid, "script-desk");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    // a week of rows at most; a sweep that fails leaves them for the next filing
    await admin.from("cs_ai_jobs").delete().eq("owner_id", uid).lt("created_at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString()).then(
      ({ error }: { error: unknown }) => error && console.warn("script-desk: sweep", msg(error)),
    );
    const { data: row, error } = await admin
      .from("cs_ai_jobs").insert({ owner_id: uid, profile_id: brandOf(body.brand), kind: plan.kind, request: plan.request }).select("id").single();
    if (error || !row?.id) {
      // nothing was filed: the use goes back
      await refundUsage(admin, uid, "script-desk", day);
      throw error ?? new Error("no id");
    }
    console.log("script-desk filed", plan.kind, action === "write" ? body.entry : "");
    return json({ job: row.id, kind: plan.kind, status: "queued" });
  } catch (e) {
    console.error("script-desk failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
