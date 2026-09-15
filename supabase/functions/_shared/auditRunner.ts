// Network side of the own-account audit: read the account with Apify, ask
// OpenAI for advice, write the result. Used by audit-social-account (when a
// consultant opens Analytics) and refresh-social-audits (the weekly job).
// All the judging logic lives in socialAudit.ts, which is unit tested.

import {
  BUSY_TIMEOUT_MINUTES,
  MIN_POSTS_FOR_ADVICE,
  POSTS_TO_READ,
  buildAdvicePrompt,
  computeAudit,
  igProfile,
  normalizeIgPost,
  normalizeTiktokPost,
  snapshotFields,
  tiktokProfile,
  validateAdvice,
  type AuditAdvice,
  type AuditPlatform,
  type AuditProfile,
  type AuditStats,
  type RatedPost,
  type SocialPost,
} from "./socialAudit.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
type Item = Record<string, unknown>;

export interface AuditTarget {
  id: string;
  user_id: string;
  platform: AuditPlatform;
  handle: string;
  [column: string]: unknown;
}

/** A failure whose message is safe, and useful, to show the consultant. */
export class AuditError extends Error {}

const IG_PROFILE_ACTOR = "apify~instagram-profile-scraper";
const IG_POSTS_ACTOR = "apify~instagram-post-scraper";
const TIKTOK_ACTOR = "clockworks~tiktok-scraper";
const OPENAI_MODEL = "gpt-4.1-2025-04-14";
// An edge function gets about 150 seconds of wall-clock time. The scrapes run
// in parallel, then one OpenAI call, each capped well inside that.
const APIFY_TIMEOUT_SECS = 90;
const OPENAI_TIMEOUT_MS = 45_000;

async function apifyItems(actor: string, input: unknown, token: string): Promise<Item[]> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_SECS}&clean=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((APIFY_TIMEOUT_SECS + 15) * 1000),
      },
    );
  } catch (e) {
    console.error("apify request failed", actor, e);
    throw new AuditError("The platform took too long to answer. Try again in a few minutes.");
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    console.error("apify run failed", actor, res.status, detail);
    if (res.status === 402 || /platform-feature-disabled|invoice|payment|usage limit|credit/i.test(detail)) {
      throw new AuditError("Account audits are paused while the scraping account is sorted out. Try again later.");
    }
    if (res.status === 408) {
      throw new AuditError("The platform took too long to answer. Try again in a few minutes.");
    }
    throw new AuditError("Couldn't read the account right now. Try again in a few minutes.");
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as Item[]) : [];
}

function dedupe(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

export async function scrapeAccount(
  platform: AuditPlatform,
  handle: string,
  token: string,
): Promise<{ profile: AuditProfile; posts: SocialPost[] }> {
  if (platform === "instagram") {
    const [profiles, items] = await Promise.all([
      apifyItems(IG_PROFILE_ACTOR, { usernames: [handle] }, token),
      apifyItems(
        IG_POSTS_ACTOR,
        { username: [handle], resultsLimit: POSTS_TO_READ, dataDetailLevel: "detailedData" },
        token,
      ),
    ]);
    const raw = profiles.find((p) => !p.error);
    if (!raw) {
      throw new AuditError(`We couldn't find a public Instagram account called @${handle}. Check the spelling.`);
    }
    const profile = igProfile(raw, handle);
    if (profile.isPrivate) {
      throw new AuditError(`@${handle} is private, so its posts can't be read. Make the account public, then refresh.`);
    }
    const posts = items
      .map((i) => normalizeIgPost(i, handle))
      .filter((p): p is SocialPost => p !== null);
    return { profile, posts: dedupe(posts) };
  }

  const items = (
    await apifyItems(
      TIKTOK_ACTOR,
      { profiles: [handle], resultsPerPage: POSTS_TO_READ, profileSorting: "latest", excludePinnedPosts: false },
      token,
    )
  ).filter((i) => !i.error);
  if (items.length === 0) {
    throw new AuditError(
      `We couldn't find public TikTok videos for @${handle}. Check the spelling and that the account is public.`,
    );
  }
  const posts = items
    .map((i) => normalizeTiktokPost(i, handle))
    .filter((p): p is SocialPost => p !== null);
  return { profile: tiktokProfile(items, handle), posts: dedupe(posts) };
}

/** One JSON-mode chat completion. Returns the raw content, or null on any failure. */
export async function openAiJson(
  system: string,
  user: string,
  apiKey: string,
  opts: { temperature: number; maxTokens: number },
): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("openai error", e);
    return null;
  }
}

export async function writeAdvice(
  input: { platform: AuditPlatform; profile: AuditProfile; stats: AuditStats; posts: RatedPost[] },
  apiKey: string,
): Promise<AuditAdvice | null> {
  const { system, user } = buildAdvicePrompt(input);
  const content = await openAiJson(system, user, apiKey, { temperature: 0.4, maxTokens: 2000 });
  return content === null ? null : validateAdvice(content, input.posts.map((p) => p.id));
}

/**
 * Marks an audit as refreshing unless another refresh already holds it.
 * Returns the claimed row, or null when someone else got there first.
 */
export async function claimAudit(admin: Admin, auditId: string): Promise<AuditTarget | null> {
  const now = Date.now();
  const stuckBefore = new Date(now - BUSY_TIMEOUT_MINUTES * 60_000).toISOString();
  // The start time doubles as the claim token. Read the row back instead of
  // trusting the update's returned representation: on 2026-09-15 that came back
  // empty even though the update applied, which left audits stuck "refreshing".
  const token = new Date(now).toISOString();
  const { error } = await admin
    .from("cs_social_audits")
    .update({ status: "refreshing", refresh_started_at: token })
    .eq("id", auditId)
    .or(`status.neq.refreshing,refresh_started_at.lt."${stuckBefore}"`);
  if (error) {
    console.error("claim update failed", auditId, error);
    return null;
  }
  const { data, error: readError } = await admin
    .from("cs_social_audits")
    .select("*")
    .eq("id", auditId)
    .maybeSingle();
  if (readError || !data) {
    console.error("claim read-back failed", auditId, readError);
    return null;
  }
  const ours =
    data.status === "refreshing" &&
    data.refresh_started_at !== null &&
    Date.parse(data.refresh_started_at) === Date.parse(token);
  return ours ? data : null;
}

/** Reads the account, writes the audit and a snapshot. Never throws. */
export async function runAudit(opts: {
  admin: Admin;
  audit: AuditTarget;
  apifyKey: string;
  openaiKey?: string | null;
}): Promise<void> {
  const { admin, audit } = opts;
  try {
    const { profile, posts } = await scrapeAccount(audit.platform, audit.handle, opts.apifyKey);
    if (posts.length === 0) {
      throw new AuditError(`@${audit.handle} has no public posts we can read yet.`);
    }
    const { posts: rated, stats } = computeAudit(posts, audit.platform, profile.followers, Date.now());
    const advice =
      opts.openaiKey && stats.postsAnalyzed >= MIN_POSTS_FOR_ADVICE
        ? await writeAdvice({ platform: audit.platform, profile, stats, posts: rated }, opts.openaiKey)
        : null;
    const fetchedAt = new Date().toISOString();
    const { error } = await admin
      .from("cs_social_audits")
      .update({ status: "ready", error: null, profile, posts: rated, stats, advice, fetched_at: fetchedAt })
      .eq("id", audit.id);
    if (error) throw error;
    const snap = await admin
      .from("cs_social_snapshots")
      .insert({ audit_id: audit.id, user_id: audit.user_id, taken_at: fetchedAt, ...snapshotFields(stats) });
    if (snap.error) console.error("snapshot insert failed", audit.id, snap.error);
  } catch (e) {
    const message =
      e instanceof AuditError ? e.message : "Something went wrong reading the account. Try again in a few minutes.";
    console.error("audit failed", audit.platform, audit.handle, e);
    const { error } = await admin
      .from("cs_social_audits")
      .update({ status: "error", error: message })
      .eq("id", audit.id);
    if (error) console.error("could not record the audit failure", audit.id, error);
  }
}
