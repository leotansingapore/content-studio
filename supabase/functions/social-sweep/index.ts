// The connected-accounts safety jobs (docs/zernio-connection.md, M5 and M6). pg_cron calls this with a
// shared secret (supabase/hub/021_social_sweep.sql): {"job":"recount"} daily at 03:15 Singapore time and
// {"job":"orphans"} on Sundays at 03:45. logic.ts decides and acts; this file wires Supabase and Zernio.
//
// Body: job "recount" | "orphans"; dryRun: true reads only and answers what it would do.
// Every run answers its counts and the writes that went through (done); logs carry counts only.
//
// Secrets: SOCIAL_SWEEP_SECRET (the same value is in Vault as cs_social_sweep_secret), ZERNIO_API_KEY
// (unset: answers {enabled:false} and does nothing), SOCIAL_CONNECT_USERS, ZERNIO_MAX_ACCOUNTS.
// Deploy with --no-verify-jwt: the secret header is the auth.
//   supabase functions deploy social-sweep --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { ZernioError, zernioClient } from "../_shared/zernio.ts";
import { teamCapOf } from "../social/logic.ts";
import { doneCounts, parseSweep, readAllRows, runSweep, secretMatches, sweepZernio, type MappingRow } from "./logic.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// Zernio's own words could name an account, so only its status and code
const errText = (e: unknown) =>
  (e instanceof ZernioError ? `ZernioError ${e.status} ${e.code}` : e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);

Deno.serve(async (req) => {
  const secret = Deno.env.get("SOCIAL_SWEEP_SECRET");
  if (!secret || !(await secretMatches(req.headers.get("x-social-sweep-secret") ?? "", secret))) return json({ error: "forbidden" }, 403);
  const key = Deno.env.get("ZERNIO_API_KEY");
  if (!key) return json({ enabled: false });
  const r = parseSweep(await req.json().catch(() => null));
  if (!r) return json({ error: "Send job recount or orphans, and dryRun true or false." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const loadRows = () =>
    readAllRows(async (after): Promise<MappingRow[]> => {
      let q = admin.from("cs_social_profiles").select("owner_id, profile_id, zernio_profile_id").order("zernio_profile_id").limit(500);
      if (after) q = q.gt("zernio_profile_id", after);
      const { data, error } = await q;
      if (error || !Array.isArray(data)) throw new Error(`cs_social_profiles read: ${error?.message}`);
      return data;
    });
  const done: string[] = [];
  try {
    const report = await runSweep(sweepZernio(zernioClient(key), r.dryRun, done), r, {
      loadRows,
      teamCap: teamCapOf(Deno.env.get("ZERNIO_MAX_ACCOUNTS")),
      allowlist: Deno.env.get("SOCIAL_CONNECT_USERS"),
    });
    const counts = doneCounts(done);
    console.log("social-sweep", r.job, r.dryRun ? "dry run" : "run", JSON.stringify(counts));
    return json({ enabled: true, ...r, ...report, counts, done });
  } catch (e) {
    // what went through before the failure is still reported
    console.error("social-sweep failed", r.job, errText(e), JSON.stringify(doneCounts(done)));
    return json({ enabled: true, ...r, error: errText(e), counts: doneCounts(done), done }, 502);
  }
});
