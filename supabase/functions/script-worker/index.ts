// script-worker: the one door a paired worker (scripts/script-worker/worker.mjs on Leo's Mac) uses to take the
// script desk's jobs (cs_ai_jobs, 033) and hand back Claude Code's answers: claim, build the request on the Mac, run
// it with no tools on the Mac's own Claude Code, report. Ops, on body.op:
//   claim   {worker}: the oldest queued job filed in the last PICKUP_SECONDS, now this worker's, as {job: {id, kind,
//           request}}, the request being the job's inputs (script-desk logic.ts JobInputs: no prompt text, which
//           only the worker's private templates hold); {job: null} when there is none.
//   done    {id, worker, text, model?, ms?}: the answer, kept only while the job is still this worker's claim.
//   failed  {id, worker, error, ms?}: a plain sentence the person reads, on the same condition.
//
// Deployed WITHOUT JWT verification (the worker has no Supabase sign-in), like notify and social-sweep: everything
// without the x-script-worker-secret header matching SCRIPT_WORKER_SECRET is refused with 403 before the body is read.
// For this Leo-only phase there is one shared secret, and a claim only hands out jobs of the uids listed in
// NORTH_STAR_USERS (never "*": the jobs run on Leo's own Claude plan). Per-user pairing comes with wave 4.
//
// Secrets: SCRIPT_WORKER_SECRET (new, not set yet; the same value goes in the Mac's keychain as
// cs-script-worker-secret), NORTH_STAR_USERS (set). Needs 033 applied.
//   supabase functions deploy script-worker --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { secretMatches } from "../social-sweep/logic.ts";
import { PICKUP_SECONDS, cut, ownersOf } from "../script-desk/logic.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Claude's answer is a few KB; 15,000 characters stay under the row's 64 KB check even at 4 bytes each. */
export const MAX_TEXT = 15_000;

// Postgres jsonb refuses a lone half of an emoji anywhere in a string (a report the worker cut mid-text): U+FFFD for it.
const whole = (s: string) => s.toWellFormed();
const workerOf = (v: unknown) => (typeof v === "string" ? v.replace(/[^A-Za-z0-9._ -]/g, "").trim().slice(0, 80) : "");
const msOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 3_600_000) : null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const secret = Deno.env.get("SCRIPT_WORKER_SECRET");
  if (!secret || !(await secretMatches(req.headers.get("x-script-worker-secret") ?? "", secret))) return json({ error: "Forbidden." }, 403);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = (await req.json().catch(() => ({}))) ?? {};
    const worker = workerOf(body.worker);
    if (!worker) return json({ error: "Name the worker." }, 400);

    if (body.op === "claim") {
      const owners = ownersOf(Deno.env.get("NORTH_STAR_USERS"));
      if (!owners.length) return json({ job: null });
      const { data, error } = await admin.rpc("cs_claim_ai_job", { p_worker: worker, p_owners: owners, p_pickup_seconds: PICKUP_SECONDS });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.id) return json({ job: null });
      console.log("script-worker claimed", row.kind, worker);
      return json({ job: { id: row.id, kind: row.kind, request: row.request ?? {} } });
    }

    if (body.op !== "done" && body.op !== "failed") return json({ error: "Unknown op." }, 400);
    if (typeof body.id !== "string" || !UUID.test(body.id)) return json({ error: "Which job?" }, 400);
    const ms = msOf(body.ms);
    let values: Record<string, unknown>;
    if (body.op === "done") {
      if (typeof body.text !== "string" || !body.text.trim()) return json({ error: "No answer." }, 400);
      const model = typeof body.model === "string" ? whole(cut(body.model, 80)) : null;
      // a cut answer is unreadable JSON: an answer past the cap is a failure the person can retry
      values = body.text.length > MAX_TEXT
        ? { status: "failed", error: "Claude's answer was too long to keep. Try again.", done_at: new Date().toISOString() }
        : { status: "done", result: { text: whole(body.text), model, ms }, done_at: new Date().toISOString() };
    } else {
      const error = typeof body.error === "string" && body.error.trim() ? whole(cut(body.error.trim(), 500)) : "Claude Code on your Mac didn't finish this. Try again.";
      values = { status: "failed", error, done_at: new Date().toISOString() };
    }
    // only this worker's live claim: a job script-desk already gave up on stays failed
    const { data, error } = await admin.from("cs_ai_jobs").update(values).eq("id", body.id).eq("status", "claimed").eq("worker", worker).select("id, kind");
    if (error) throw error;
    const kept = Array.isArray(data) && data.length === 1;
    console.log("script-worker", body.op, kept ? data[0].kind : "not kept", worker, ms ?? "");
    return json({ ok: kept });
  } catch (e) {
    console.error("script-worker failed", (e instanceof Error ? e.message : String(e)).slice(0, 200));
    return json({ error: "Something went wrong." }, 500);
  }
});

