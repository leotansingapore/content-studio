// "Clone a reel" (/clone). A signed-in consultant sends {url, voice}; this reads
// the public Instagram reel or TikTok video through Apify (caption, transcript,
// numbers), then asks OpenAI to break down why it worked and write the
// consultant's own version.
//
// - Public post data is cached in cs_reel_sources (supabase/hub/010), so the
//   same post pasted again skips the scrape. Numbers are re-read after 24 hours;
//   transcripts are kept. Nothing about the consultant is stored here.
// - Every request that reaches a paid call counts once against the daily cap
//   (usageCaps "reel-clone"). A cache hit still counts: the AI call costs money.
// - The answer comes back within about 90 seconds. A scrape that is still
//   running then keeps going in the background and fills the cache, and a retry
//   re-attaches to that run (cs_reel_fetches) instead of starting another.
// - Only links that parseReelUrl accepts are sent to Apify, rebuilt from their
//   validated parts. This function never fetches a pasted URL itself.
//
// Secrets: APIFY_API_KEY, OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal, type UsageResult } from "../_shared/usageCaps.ts";
import {
  BACKGROUND_LIMIT_MS,
  CLONE_ERRORS,
  CLONE_RESPONSE_FORMAT,
  FETCH_BUDGET_MS,
  MAX_TRANSCRIPT_CHARS,
  RUN_REATTACH_MS,
  aiTimeoutMs,
  apifyJob,
  buildClonePrompt,
  cacheDecision,
  isApifyStorageUrl,
  mergeSource,
  parseReelUrl,
  pickIgItem,
  pickTiktokItem,
  sanitizeVoice,
  toCloneSource,
  validateCloneOutput,
  vttToText,
  type CloneErrorCode,
  type CloneOutput,
  type CloneResponse,
  type ParsedReelUrl,
  type SourceRow,
} from "./logic.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// deno-lint-ignore no-explicit-any
type Admin = any;

const APIFY_API = "https://api.apify.com/v2";
const OPENAI_MODEL = "gpt-4.1";
const FINISHED = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function failure(code: CloneErrorCode): Response {
  return json({ code, error: CLONE_ERRORS[code].message }, CLONE_ERRORS[code].status);
}

/** A failure the app has a message for. */
class CloneFailure extends Error {
  constructor(readonly code: CloneErrorCode) {
    super(code);
  }
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

async function apify(
  path: string,
  token: string,
  opts: { method?: string; body?: string; timeoutMs: number },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${APIFY_API}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (e) {
    console.error("apify request failed", path.split("?")[0], e);
    throw new CloneFailure("scrape_failed");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error("apify error", path.split("?")[0], res.status, detail);
    if (res.status === 402 || /platform-feature-disabled|invoice|payment|usage limit|credit/i.test(detail)) {
      throw new CloneFailure("scrape_paused");
    }
    throw new CloneFailure("scrape_failed");
  }
  return res.json();
}

function runOf(response: unknown): ApifyRun {
  const run = (response as { data?: ApifyRun } | null)?.data;
  if (!run || typeof run.id !== "string" || typeof run.status !== "string") {
    throw new CloneFailure("scrape_failed");
  }
  return run;
}

/** Subtitle text from Apify storage (the only host isApifyStorageUrl allows), or null. */
async function downloadSubtitles(link: string, token: string, timeoutMs: number): Promise<string | null> {
  if (!isApifyStorageUrl(link)) return null;
  try {
    const res = await fetch(link, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const text = vttToText((await res.text()).slice(0, 300_000));
    return text ? text.slice(0, MAX_TRANSCRIPT_CHARS) : null;
  } catch {
    return null;
  }
}

async function findSource(admin: Admin, parsed: ParsedReelUrl): Promise<SourceRow | null> {
  const query = admin.from("cs_reel_sources").select("*").eq("platform", parsed.platform);
  const { data, error } = parsed.postId
    ? await query.eq("post_id", parsed.postId).maybeSingle()
    : await query.contains("aliases", [parsed.lookupKey]).limit(1).maybeSingle();
  if (error) throw error;
  return (data as SourceRow | null) ?? null;
}

/** Reads the post through Apify and writes the cache. Throws CloneFailure. */
async function fetchSource(opts: {
  admin: Admin;
  token: string;
  parsed: ParsedReelUrl;
  existing: SourceRow | null;
  deadline: number;
}): Promise<SourceRow> {
  const { admin, token, parsed, existing, deadline } = opts;
  const remaining = () => deadline - Date.now();

  const { data: pending } = await admin
    .from("cs_reel_fetches")
    .select("run_id, started_at")
    .eq("lookup_key", parsed.lookupKey)
    .maybeSingle();
  const reattach = pending && Date.now() - Date.parse(pending.started_at) < RUN_REATTACH_MS;

  let run: ApifyRun;
  if (reattach) {
    run = runOf(await apify(`/actor-runs/${encodeURIComponent(pending.run_id)}`, token, { timeoutMs: 15_000 }));
  } else {
    const job = apifyJob(parsed, !existing?.transcript);
    run = runOf(
      await apify(`/acts/${job.actor}/runs`, token, {
        method: "POST",
        body: JSON.stringify(job.input),
        timeoutMs: 20_000,
      }),
    );
    const marked = await admin
      .from("cs_reel_fetches")
      .upsert({ lookup_key: parsed.lookupKey, run_id: run.id, started_at: new Date().toISOString() });
    if (marked.error) console.error("run marker write failed", marked.error);
  }

  while (!FINISHED.has(run.status)) {
    // waitForFinish holds each poll open for up to 60s.
    const secs = Math.min(60, Math.floor((remaining() - 3000) / 1000));
    if (secs < 1) throw new CloneFailure("timeout");
    run = runOf(
      await apify(`/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=${secs}`, token, {
        timeoutMs: (secs + 8) * 1000,
      }),
    );
  }
  const cleared = await admin.from("cs_reel_fetches").delete().eq("lookup_key", parsed.lookupKey).eq("run_id", run.id);
  if (cleared.error) console.error("run marker delete failed", cleared.error);
  if (run.status !== "SUCCEEDED") {
    console.error("apify run ended", run.id, run.status);
    throw new CloneFailure("scrape_failed");
  }

  const items = await apify(
    `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json`,
    token,
    { timeoutMs: 15_000 },
  );
  const list = Array.isArray(items) ? items : [];
  const fresh =
    parsed.platform === "instagram" ? pickIgItem(list, parsed.postId ?? "") : pickTiktokItem(list, parsed.postId);
  if (!fresh) throw new CloneFailure("not_found");
  if (!fresh.transcript && fresh.subtitleLink && remaining() > 3000) {
    fresh.transcript = await downloadSubtitles(fresh.subtitleLink, token, Math.min(10_000, remaining()));
  }

  // A short link only reveals its video id now; merge with any row already cached for that video.
  let base = existing && existing.post_id === fresh.postId ? existing : null;
  if (!base) {
    const { data } = await admin
      .from("cs_reel_sources")
      .select("*")
      .eq("platform", fresh.platform)
      .eq("post_id", fresh.postId)
      .maybeSingle();
    base = (data as SourceRow | null) ?? null;
  }
  const now = new Date().toISOString();
  const row = mergeSource(fresh, base, parsed.postId ? null : parsed.lookupKey, now);
  const saved = await admin.from("cs_reel_sources").upsert({ ...row, updated_at: now }, { onConflict: "platform,post_id" });
  if (saved.error) console.error("cache write failed", saved.error);
  return row;
}

type Raced<T> = { kind: "done"; value: T } | { kind: "timeout" } | { kind: "failed"; code: CloneErrorCode };

async function withinBudget<T>(work: Promise<T>, ms: number): Promise<Raced<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Raced<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), Math.max(0, ms));
  });
  try {
    return await Promise.race([
      work.then(
        (value): Raced<T> => ({ kind: "done", value }),
        (e): Raced<T> => {
          if (e instanceof CloneFailure) return { kind: "failed", code: e.code };
          console.error("fetch failed", e);
          return { kind: "failed", code: "scrape_failed" };
        },
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function keepRunning(work: Promise<unknown>) {
  const settled = work.catch((e) =>
    console.error("background fetch ended", e instanceof CloneFailure ? e.code : e),
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(settled);
}

async function writeClone(
  prompt: { system: string; user: string },
  apiKey: string,
  timeoutMs: number,
): Promise<CloneOutput> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 2000,
        response_format: CLONE_RESPONSE_FORMAT,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    console.error("openai request failed", e);
    throw new CloneFailure((e as Error)?.name === "TimeoutError" ? "timeout" : "ai_failed");
  }
  if (!res.ok) {
    console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new CloneFailure("ai_failed");
  }
  const data = await res.json().catch(() => null);
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) console.error("openai refused", String(message.refusal).slice(0, 200));
  const output = validateCloneOutput(message?.content ?? null);
  if (!output) {
    console.error("openai output rejected", String(message?.content ?? "").slice(0, 300));
    throw new CloneFailure("ai_failed");
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "bad_request", error: "Use POST." }, 405);
  const startedAt = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return failure("unauthorized");

    const body = await req.json().catch(() => ({}));
    const parsed = parseReelUrl(body?.url);
    if (parsed.ok === false) return json({ code: "bad_url", error: parsed.message }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("OPENAI_API_KEY is not set");
      return failure("not_configured");
    }
    const voice = sanitizeVoice(body?.voice);

    let row = await findSource(admin, parsed);
    const decision = cacheDecision(row, startedAt);

    // Counted once per request, just before its first paid call.
    let usage: UsageResult | null = null;
    const charge = async () => (usage ??= await consumeUsage(admin, uid, "reel-clone"));

    if (decision !== "use") {
      const apifyKey = Deno.env.get("APIFY_API_KEY");
      if (!apifyKey) {
        console.error("APIFY_API_KEY is not set");
        if (!row) return failure("not_configured");
      } else {
        const charged = await charge();
        if (!charged.allowed) {
          const refusal = usageRefusal(charged);
          return json(refusal.body, refusal.status);
        }
        const work = fetchSource({
          admin,
          token: apifyKey,
          parsed,
          existing: row,
          deadline: startedAt + BACKGROUND_LIMIT_MS,
        });
        const outcome = await withinBudget(work, FETCH_BUDGET_MS - (Date.now() - startedAt));
        if (outcome.kind === "done") {
          row = outcome.value;
        } else {
          if (outcome.kind === "timeout") keepRunning(work);
          const code = outcome.kind === "timeout" ? "timeout" : outcome.code;
          // Stale numbers beat no answer: fall back to the cached post when the refresh fails.
          if (!row) return failure(code);
          console.warn("refresh failed, using cached post", parsed.lookupKey, code);
        }
      }
    }

    const charged = await charge();
    if (!charged.allowed) {
      const refusal = usageRefusal(charged);
      return json(refusal.body, refusal.status);
    }
    const aiMs = aiTimeoutMs(Date.now() - startedAt);
    if (aiMs === 0) return failure("timeout");

    const source = toCloneSource(row!);
    const output = await writeClone(buildClonePrompt(source, voice), openaiKey, aiMs);
    console.log("clone-reel ok", parsed.platform, decision, `${Date.now() - startedAt}ms`);
    const response: CloneResponse = {
      source,
      ...output,
      cached: decision === "use",
      usage: { used: charged.used, limit: charged.limit },
    };
    return json(response);
  } catch (e) {
    if (e instanceof CloneFailure) return failure(e.code);
    console.error("clone-reel failed", e);
    return failure("server_error");
  }
});
