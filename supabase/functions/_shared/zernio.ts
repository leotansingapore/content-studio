// Zernio (zernio.com) client and the checks that keep each adviser inside their own Zernio profile.
// Zernio accepts any account, post or automation id on the team, whichever profile it sits in, so no
// id from a request reaches it before these checks (rules H1-H4 and M1-M4 in docs/zernio-connection.md).
// No Deno or npm imports, so vitest covers it; the key and fetch are passed in.

export const ZERNIO_BASE = "https://zernio.com/api/v1";
export const ZERNIO_TIMEOUT_MS = 15_000;

/** Platforms advisers may connect. Never X (twitter): Zernio bills its API calls through. */
export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "threads"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** One adviser may hold this many accounts across all their brand profiles (M5). */
export const USER_ACCOUNT_CAP = 6;

/** A refusal from Zernio, or no answer: {status, code, message}. */
export class ZernioError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ZernioError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** An id that is malformed or not the caller's. Always answered with a plain 404, whichever check failed. */
export class NotYours extends Error {
  constructor(why: string) {
    super(why);
    this.name = "NotYours";
  }
}

type Query = Record<string, string | undefined>;
export interface ZernioRequest {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
}
// deno-lint-ignore no-explicit-any
export type Zernio = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, req?: ZernioRequest) => Promise<any>;

/** Plain fetch with the Bearer key and a 15 s timeout. A path is letters, digits, /, _ and - only, so no id can climb out of it. */
export function zernioClient(apiKey: string, fetchFn: typeof fetch = fetch): Zernio {
  return async (method, path, req = {}) => {
    if (!/^(\/[A-Za-z0-9_-]+)+$/.test(path)) throw new NotYours(`bad path ${path}`);
    const url = new URL(ZERNIO_BASE + path);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;
    let res: Response;
    try {
      res = await fetchFn(url, {
        method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: AbortSignal.timeout(ZERNIO_TIMEOUT_MS),
      });
    } catch (e) {
      const slow = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ZernioError(slow ? 504 : 502, slow ? "timeout" : "unreachable", slow ? "Zernio took too long to answer." : "Couldn't reach Zernio.");
    }
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: the status alone says what happened
    }
    if (!res.ok) {
      const code = data?.code ?? data?.reason;
      throw new ZernioError(res.status, typeof code === "string" ? code : "", typeof data?.error === "string" ? data.error : `Zernio answered ${res.status}.`, data?.details);
    }
    return data;
  };
}

/** H1: Zernio ids are 24 lowercase hex characters. Checked before any other use of an id from a request. */
export const isZernioId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{24}$/.test(v);

/** src/lib/profiles.ts ids ("me" or p + base 36), the same check as cs_social_profiles. */
export const isProfileId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{1,40}$/.test(v);

/** An id for a URL path: checked, then encoded. Anything else never reaches Zernio. */
export function pathId(id: unknown): string {
  if (!isZernioId(id)) throw new NotYours("malformed id");
  return encodeURIComponent(id);
}

/** A Zernio reference comes back as an id string or as the populated object. */
export function refId(v: unknown): string {
  if (typeof v === "string") return v;
  const id = v && typeof v === "object" ? (v as { _id?: unknown })._id : undefined;
  return typeof id === "string" ? id : "";
}

export interface ZAccount {
  _id: string;
  platform: string;
  profileId: unknown;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  profilePicture?: string | null;
  needsReconnection?: boolean;
  enabled?: boolean;
}

/** Every account on the team, over-limit ones included (for the caps). Not a scope: never answer a caller with it. */
export async function teamAccounts(z: Zernio): Promise<ZAccount[]> {
  const data = await z("GET", "/accounts", { query: { includeOverLimit: "true" } });
  if (!Array.isArray(data?.accounts)) throw new ZernioError(502, "unreadable", "Couldn't read the connected accounts.");
  return data.accounts;
}

/**
 * M2: the accounts in the caller's Zernio profile. Fails closed: an unreadable list, a malformed id or
 * any account whose own profileId is not the mapped one throws, and an empty list matches nothing.
 */
export async function callerAccounts(z: Zernio, mappedId: string): Promise<ZAccount[]> {
  if (!isZernioId(mappedId)) throw new NotYours("no profile");
  const data = await z("GET", "/accounts", { query: { profileId: mappedId, includeOverLimit: "true" } });
  const list = data?.accounts;
  if (!Array.isArray(list)) throw new ZernioError(502, "unreadable", "Couldn't read your accounts.");
  for (const a of list) {
    if (!isZernioId(a?._id) || refId(a?.profileId) !== mappedId) throw new ZernioError(502, "scope_mismatch", "Couldn't read your accounts.");
  }
  return list;
}

/** Every requested account id is well formed and in the caller's set; an empty request is refused too. */
export function requireAccounts(own: Set<string>, requested: unknown): string[] {
  if (!Array.isArray(requested) || requested.length === 0) throw new NotYours("no accounts");
  for (const id of requested) if (!isZernioId(id) || !own.has(id)) throw new NotYours("account not yours");
  return requested as string[];
}

/** The accounts a post goes out from. */
function postAccounts(post: unknown): string[] {
  const platforms = (post as { platforms?: unknown } | null)?.platforms;
  return Array.isArray(platforms) ? platforms.map((p) => refId((p as { accountId?: unknown } | null)?.accountId)) : [];
}

/** [].every() is true, so an item naming no account is never the caller's. */
const allOwn = (ids: string[], own: Set<string>) => ids.length > 0 && ids.every((id) => isZernioId(id) && own.has(id));

/** A Zernio 404 reads the same as "not yours". */
async function getOwned(z: Zernio, path: string) {
  try {
    return await z("GET", path);
  } catch (e) {
    if (e instanceof ZernioError && e.status === 404) throw new NotYours("not found");
    throw e;
  }
}

/** H2: the post is the caller's only when it has platforms and every one posts from an account in their set. */
export async function checkPost(z: Zernio, own: Set<string>, postId: unknown) {
  const data = await getOwned(z, `/posts/${pathId(postId)}`);
  if (!allOwn(postAccounts(data?.post), own)) throw new NotYours("post not yours");
  return data.post;
}

/** M1: Zernio automations carry accountId, not profileId; it must be in the caller's set. Returns {automation, logs}. */
export async function checkAutomation(z: Zernio, own: Set<string>, automationId: unknown) {
  const data = await getOwned(z, `/comment-automations/${pathId(automationId)}`);
  if (!allOwn([refId(data?.automation?.accountId)], own)) throw new NotYours("automation not yours");
  return data;
}

// H3: the list, health and analytics reads, where each item's accounts sit. Add an endpoint here
// (from its doc page) before reading it; scopedList refuses any other path.
const SCOPED_LISTS = {
  "/accounts/health": { key: "accounts", accountsOf: (item: unknown) => [refId((item as { accountId?: unknown })?.accountId)] },
  "/posts": { key: "posts", accountsOf: postAccounts },
  "/comment-automations": { key: "automations", accountsOf: (item: unknown) => [refId((item as { accountId?: unknown })?.accountId)] },
} as const;
export type ScopedPath = keyof typeof SCOPED_LISTS;

/**
 * H3: every list, health and analytics read. profileId is always the mapped one (a query can't override
 * it), it refuses to call without one, and each item is kept only when all its accounts are the caller's.
 */
export async function scopedList(z: Zernio, path: ScopedPath, mappedId: string, own: Set<string>, query: Query = {}): Promise<unknown[]> {
  const spec = SCOPED_LISTS[path];
  if (!spec) throw new Error(`not a scoped list: ${path}`);
  if (!isZernioId(mappedId)) throw new NotYours("no profile");
  const data = await z("GET", path, { query: { ...query, profileId: mappedId } });
  const items = data?.[spec.key];
  if (!Array.isArray(items)) throw new ZernioError(502, "unreadable", "Couldn't read that from Zernio.");
  return items.filter((item) => allOwn(spec.accountsOf(item), own));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** H4: Zernio matches Idempotency-Key on the key alone for the whole team, so it always carries the caller and brand. */
export function idempotencyKey(uid: string, profileId: string, clientKey: unknown): string {
  if (!UUID.test(uid)) throw new Error("idempotencyKey needs the JWT user id");
  if (!isProfileId(profileId)) throw new NotYours("bad profile");
  if (typeof clientKey !== "string" || !UUID.test(clientKey)) throw new NotYours("bad client key");
  return `cs:${uid}:${profileId}:${clientKey.toLowerCase()}`;
}

/** The Zernio profile name for a brand: unique on the team, so a second create answers 409 with its id. */
export const zernioProfileName = (uid: string, profileId: string) => `cs_${uid}_${profileId}`;

/** The brand's row in cs_social_profiles, written only by the service role. */
export interface ProfileRow {
  get(): Promise<string | null>;
  /** insert ... on conflict (owner_id, profile_id) do nothing */
  insert(zernioProfileId: string): Promise<void>;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function profileByName(z: Zernio, name: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await pause(700 * attempt);
    const data = await z("GET", "/profiles", { query: { name } });
    const hits = Array.isArray(data?.profiles) ? data.profiles.filter((p: { name?: unknown }) => p?.name === name) : [];
    if (hits.length === 1 && isZernioId(hits[0]?._id)) return hits[0]._id;
  }
  return "";
}

/**
 * M4: the brand's Zernio profile, created on first connect. Safe to race and to retry: the create is
 * idempotent on the name, the insert does nothing on conflict, and the stored row wins.
 */
export async function ensureProfile(z: Zernio, row: ProfileRow, uid: string, profileId: string): Promise<string> {
  const stored = await row.get();
  if (stored) return stored;
  if (!isProfileId(profileId)) throw new NotYours("bad profile");
  const name = zernioProfileName(uid, profileId);
  let made = "";
  try {
    const data = await z("POST", "/profiles", { body: { name }, idempotencyKey: name });
    made = refId(data?.profile);
  } catch (e) {
    if (!(e instanceof ZernioError) || e.status !== 409) throw e;
    // profile_name_conflict names the existing profile; a create still in flight does not
    const existing = (e.details as { existingProfileId?: unknown } | null)?.existingProfileId;
    made = isZernioId(existing) ? existing : await profileByName(z, name);
  }
  if (!isZernioId(made)) throw new ZernioError(502, "unreadable", "Couldn't set up your Zernio profile.");
  await row.insert(made);
  const winner = await row.get();
  if (!isZernioId(winner)) throw new ZernioError(502, "unreadable", "Couldn't set up your Zernio profile.");
  // never delete the other profile (M3): it is empty and harmless
  if (winner !== made) console.warn("social: a concurrent first connect stored another Zernio profile", { made, winner });
  return winner;
}

/** Disconnect one checked account. False when it was already gone: Zernio answers a repeat with 404. */
export async function disconnectAccount(z: Zernio, accountId: string): Promise<boolean> {
  try {
    await z("DELETE", `/accounts/${pathId(accountId)}`);
    return true;
  } catch (e) {
    if (e instanceof ZernioError && e.status === 404) return false;
    throw e;
  }
}

/** Zernio bills enabled accounts; one created as a side effect (enabled: false) is not billed. */
export const billed = (a: ZAccount) => a?.enabled !== false && isZernioId(a?._id);

/** M5 counts: the team against its cap, and this adviser across all their brand profiles. */
export function capCounts(team: ZAccount[], userProfileIds: Set<string>, teamCap: number) {
  const list = team.filter(billed);
  return {
    team: list.length,
    teamCap,
    user: list.filter((a) => userProfileIds.has(refId(a.profileId))).length,
    userCap: USER_ACCOUNT_CAP,
  };
}
