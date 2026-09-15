// Weekly background refresh for "Your account audit". pg_cron calls this every
// hour (supabase/hub/005_social_audits.sql) with a shared secret. Each call
// refreshes up to BATCH audits that are a week old and were opened in the last
// 30 days, so nobody pays to refresh an account no one looks at.
//
// Secrets: AUDIT_REFRESH_SECRET (the same value is in Vault as
// cs_audit_refresh_secret), APIFY_API_KEY, OPENAI_API_KEY.
// Deploy with --no-verify-jwt: the secret header is the auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { claimAudit, runAudit } from "../_shared/auditRunner.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const BATCH = 3;
const WEEKLY_AFTER_MS = 6.5 * 86_400_000;
const VIEWED_WITHIN_MS = 30 * 86_400_000;
/** A failed weekly refresh waits this long before trying again. */
const RETRY_AFTER_MS = 86_400_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Constant-time comparison via digests, so timing leaks neither length nor prefix.
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("AUDIT_REFRESH_SECRET");
  if (!secret || !(await secretMatches(req.headers.get("x-refresh-secret") ?? "", secret))) {
    return json({ error: "forbidden" }, 403);
  }
  const apifyKey = Deno.env.get("APIFY_API_KEY");
  if (!apifyKey) return json({ error: "APIFY_API_KEY missing" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const { data: due, error } = await admin
    .from("cs_social_audits")
    .select("id")
    .neq("status", "refreshing")
    .lt("fetched_at", iso(now - WEEKLY_AFTER_MS))
    .gt("last_viewed_at", iso(now - VIEWED_WITHIN_MS))
    .or(`refresh_started_at.is.null,refresh_started_at.lt."${iso(now - RETRY_AFTER_MS)}"`)
    .order("fetched_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("could not list due audits", error);
    return json({ error: error.message }, 500);
  }

  const runs: Promise<void>[] = [];
  for (const { id } of due ?? []) {
    const claimed = await claimAudit(admin, id);
    if (!claimed) continue;
    const logged = await admin
      .from("cs_social_audit_runs")
      .insert({ user_id: claimed.user_id, audit_id: claimed.id, source: "weekly" });
    if (logged.error) console.error("run log insert failed", logged.error);
    runs.push(runAudit({ admin, audit: claimed, apifyKey, openaiKey: Deno.env.get("OPENAI_API_KEY") }));
  }
  const all = Promise.allSettled(runs);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(all);
  else await all;
  return json({ started: runs.length });
});
