// The Apify reader Clone a reel uses, shared with remix (teardown) and remix-link: reads a public Instagram reel
// or TikTok video through Apify and keeps it in cs_reel_sources (supabase/hub/010). Moved out of index.ts with no
// behaviour change. Clone a reel keeps its own refresh rule (cacheDecision in logic.ts); remix and remix-link read
// through readPost below, which uses any cached row as it is.

import {
  BACKGROUND_LIMIT_MS,
  RUN_REATTACH_MS,
  apifyJob,
  isApifyStorageUrl,
  mergeSource,
  parseReelUrl,
  pickIgItem,
  pickTiktokItem,
  vttToText,
  MAX_TRANSCRIPT_CHARS,
  type CloneErrorCode,
  type ParsedReelUrl,
  type SourceRow,
} from "./logic.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// deno-lint-ignore no-explicit-any
type Admin = any;

export const APIFY_API = "https://api.apify.com/v2";
export const FINISHED = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/** A failure the app has a message for. */
export class CloneFailure extends Error {
  constructor(readonly code: CloneErrorCode) {
    super(code);
  }
}

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

export async function apify(
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

export function runOf(response: unknown): ApifyRun {
  const run = (response as { data?: ApifyRun } | null)?.data;
  if (!run || typeof run.id !== "string" || typeof run.status !== "string") {
    throw new CloneFailure("scrape_failed");
  }
  return run;
}

/** Subtitle text from Apify storage (the only host isApifyStorageUrl allows), or null. */
export async function downloadSubtitles(link: string, token: string, timeoutMs: number): Promise<string | null> {
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

export async function findSource(admin: Admin, parsed: ParsedReelUrl): Promise<SourceRow | null> {
  const query = admin.from("cs_reel_sources").select("*").eq("platform", parsed.platform);
  const { data, error } = parsed.postId
    ? await query.eq("post_id", parsed.postId).maybeSingle()
    : await query.contains("aliases", [parsed.lookupKey]).limit(1).maybeSingle();
  if (error) throw error;
  return (data as SourceRow | null) ?? null;
}

/** Reads the post through Apify and writes the cache. Throws CloneFailure. */
export async function fetchSource(opts: {
  admin: Admin;
  token: string;
  parsed: ParsedReelUrl;
  existing: SourceRow | null;
  deadline: number;
}): Promise<{ row: SourceRow; videoUrl: string | null }> {
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
  return { row, videoUrl: fresh.videoUrl };
}

export type Raced<T> = { kind: "done"; value: T } | { kind: "timeout" } | { kind: "failed"; code: CloneErrorCode };

export async function withinBudget<T>(work: Promise<T>, ms: number): Promise<Raced<T>> {
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

export function keepRunning(work: Promise<unknown>) {
  const settled = work.catch((e) =>
    console.error("background fetch ended", e instanceof CloneFailure ? e.code : e),
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(settled);
}

/**
 * How remix (teardown) and remix-link read a post: any cached cs_reel_sources row is used as it is, for free,
 * whatever its age or transcript, and Apify runs only when no row exists. Never cacheDecision's forced Instagram
 * refresh, which stays on clone-reel. Null when the link isn't an Instagram or TikTok post, when there is no row
 * and no Apify key, or when the read failed or ran past `budgetMs` (it then keeps going and fills the cache).
 */
export async function readPost(
  admin: Admin,
  url: string,
  token: string | undefined,
  budgetMs: number,
): Promise<{ row: SourceRow; cached: boolean } | null> {
  const parsed = parseReelUrl(url);
  if (parsed.ok === false) return null;
  const row = await findSource(admin, parsed);
  if (row) return { row, cached: true };
  if (!token) return null;
  const work = fetchSource({ admin, token, parsed, existing: null, deadline: Date.now() + BACKGROUND_LIMIT_MS });
  const outcome = await withinBudget(work, budgetMs);
  if (outcome.kind === "timeout") keepRunning(work);
  return outcome.kind === "done" ? { row: outcome.value.row, cached: false } : null;
}
