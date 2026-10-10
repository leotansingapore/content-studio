// Social accounts (Playbook > Social accounts): list, connect and disconnect an adviser's own accounts
// through Zernio. Every id from a request is checked against the caller's own Zernio profile before
// Zernio sees it (_shared/zernio.ts, docs/zernio-connection.md). Pure: Zernio and the row come in.

import {
  NotYours,
  SOCIAL_PLATFORMS,
  USER_ACCOUNT_CAP,
  ZernioError,
  billed,
  callerAccounts,
  capCounts,
  disconnectAccount,
  ensureProfile,
  isProfileId,
  isZernioId,
  pathId,
  refId,
  requireAccounts,
  scopedList,
  teamAccounts,
  type ProfileRow,
  type SocialPlatform,
  type ZAccount,
  type Zernio,
} from "../_shared/zernio.ts";

export const APP_ORIGIN = "https://consultant-content-studio.vercel.app";

/** Where Zernio sends the browser after sign-in. Built from a constant, never from the request. */
export const redirectUrl = (platform: SocialPlatform) => `${APP_ORIGIN}/accounts?connected=${platform}`;

/** SOCIAL_CONNECT_USERS: user ids separated by commas, or *. Entries are trimmed and empties ignored. */
export function isAllowed(list: string | undefined, uid: string): boolean {
  const entries = (list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return !!uid && (entries.includes("*") || entries.includes(uid));
}

/** ZERNIO_MAX_ACCOUNTS: the team cap, 2 when unset or not a whole number. */
export function teamCapOf(raw: string | undefined): number {
  const n = Number(raw?.trim() || NaN);
  return Number.isInteger(n) && n >= 0 ? n : 2;
}

export type SocialRequest =
  | { action: "status"; profileId: string | null }
  | { action: "connect"; profileId: string; platform: SocialPlatform; reconnectAccountId: string | null }
  /** accountId null: every account in the brand (the brand is being removed) */
  | { action: "disconnect"; profileId: string; accountId: string | null };

type Parsed = { ok: true; req: SocialRequest } | { ok: false; status: number; error: string };
const notFound: Parsed = { ok: false, status: 404, error: "Not found." };

export function parseRequest(body: unknown): Parsed {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const given = (k: string) => b[k] !== undefined && b[k] !== null;
  if (b.action === "status" && !given("profileId")) return { ok: true, req: { action: "status", profileId: null } };
  if (b.action !== "status" && b.action !== "connect" && b.action !== "disconnect") return { ok: false, status: 400, error: "Unknown action." };
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  if (b.action === "status") return { ok: true, req: { action: "status", profileId } };
  if (b.action === "connect") {
    if (!SOCIAL_PLATFORMS.includes(b.platform as SocialPlatform)) return { ok: false, status: 400, error: "That platform can't be connected here." };
    // H1: a malformed id is a 404 before any other use
    if (given("reconnectAccountId") && !isZernioId(b.reconnectAccountId)) return notFound;
    return { ok: true, req: { action: "connect", profileId, platform: b.platform as SocialPlatform, reconnectAccountId: given("reconnectAccountId") ? (b.reconnectAccountId as string) : null } };
  }
  if (b.all === true && !given("accountId")) return { ok: true, req: { action: "disconnect", profileId, accountId: null } };
  return isZernioId(b.accountId) ? { ok: true, req: { action: "disconnect", profileId, accountId: b.accountId } } : notFound;
}

/**
 * Off for this caller (no key, or not on SOCIAL_CONNECT_USERS), with no Zernio call. The bare status probe
 * is a plain 200 {enabled:false}, so a browser logs no failed request each time it asks; every other
 * action stays a 404.
 */
export function offReply(body: unknown): Reply {
  const r = parseRequest(body);
  return r.ok && r.req.action === "status" && !r.req.profileId ? ok({ enabled: false }) : { status: 404, body: { enabled: false, error: "Not enabled." } };
}

export interface Caller {
  uid: string;
  profileId: string;
  /** This brand's Zernio profile, or null before its first connect. */
  mapped: string | null;
  /** Every Zernio profile this adviser owns, for the per-adviser cap. */
  userProfiles: Set<string>;
  /** Every mapped Zernio profile -> its owner (all of cs_social_profiles), for the team-wide recount. */
  ownerOf: Map<string, string>;
  teamCap: number;
}

export type Reply = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

export interface AccountView {
  id: string;
  platform: string;
  username: string;
  name: string;
  url: string | null;
  picture: string | null;
  health: "healthy" | "warning" | "error" | "unknown";
  needsReconnect: boolean;
  issues: string[];
}

interface HealthItem {
  accountId?: unknown;
  status?: unknown;
  needsReconnect?: unknown;
  issues?: unknown;
}

const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

function view(a: ZAccount, h?: HealthItem): AccountView {
  const health = h?.status === "healthy" || h?.status === "warning" || h?.status === "error" ? h.status : "unknown";
  return {
    id: a._id,
    platform: a.platform,
    username: a.username ?? "",
    name: a.displayName ?? a.username ?? "",
    url: https(a.profileUrl),
    picture: https(a.profilePicture),
    health,
    needsReconnect: h?.needsReconnect === true || a.needsReconnection === true,
    issues: Array.isArray(h?.issues) ? h.issues.filter((i): i is string => typeof i === "string").slice(0, 5) : [],
  };
}

export interface RemovedNote {
  platform: string;
  username: string;
  at: string;
}

// A recount notes what it disconnected on the owner's Zernio profile description, so that adviser's own
// status can say so. Nothing else is stored there: the profiles are created by this function, name only.
const NOTE_PREFIX = "cs-removed:";
const NOTE_DAYS = 30;

/** The over-cap removals noted on a Zernio profile, newest first, from the last 30 days. */
export function removalNotes(description: unknown, now = Date.now()): RemovedNote[] {
  if (typeof description !== "string" || !description.startsWith(NOTE_PREFIX)) return [];
  try {
    const list = JSON.parse(description.slice(NOTE_PREFIX.length));
    if (!Array.isArray(list)) return [];
    return list.filter(
      (n) => n && typeof n.platform === "string" && typeof n.username === "string" && typeof n.at === "string" && now - Date.parse(n.at) < NOTE_DAYS * 864e5,
    );
  } catch {
    return [];
  }
}

export const withRemovalNotes = (description: unknown, added: RemovedNote[], now = Date.now()) =>
  NOTE_PREFIX + JSON.stringify([...added, ...removalNotes(description, now)].slice(0, 5));

const byAge = (a: ZAccount, b: ZAccount) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);

/**
 * M5, team-wide: which billed accounts to disconnect, newest first, whoever owns them. Each adviser is held
 * to 6 across all their brands first, then the team to its cap over what is left, so no more goes than
 * either cap needs. A Zernio id is a MongoDB ObjectId, which starts with its creation second, so a larger
 * id is a newer account.
 */
export function overCapTeam(team: ZAccount[], ownerOf: Map<string, string>, teamCap: number): ZAccount[] {
  const list = team.filter(billed).sort(byAge);
  const over = new Set<string>();
  const perOwner = new Map<string, ZAccount[]>();
  for (const a of list) {
    const owner = ownerOf.get(refId(a.profileId));
    if (owner) perOwner.set(owner, [...(perOwner.get(owner) ?? []), a]);
  }
  for (const mine of perOwner.values()) for (const a of mine.slice(USER_ACCOUNT_CAP)) over.add(a._id);
  for (const a of list.filter((x) => !over.has(x._id)).slice(Math.max(0, teamCap))) over.add(a._id);
  return list.filter((a) => over.has(a._id)).reverse();
}

/**
 * M5 recount, at the start of every status and connect: links collected while under the cap, or a
 * reconnect that came back as a new account, never keep billing past the next call by anyone. Each
 * affected adviser's Zernio profile gets a note. Returns the team as it stands after.
 */
export async function recount(z: Zernio, c: Pick<Caller, "ownerOf" | "teamCap">, now = Date.now()): Promise<ZAccount[]> {
  const team = await teamAccounts(z);
  const over = overCapTeam(team, c.ownerOf, c.teamCap);
  if (!over.length) return team;
  const at = new Date(now).toISOString();
  const byProfile = new Map<string, RemovedNote[]>();
  for (const a of over) {
    const pid = refId(a.profileId);
    // noted only when this call disconnected it, so a repeat never notes it twice
    if ((await disconnectAccount(z, a._id)) && c.ownerOf.has(pid)) byProfile.set(pid, [...(byProfile.get(pid) ?? []), { platform: a.platform, username: a.username ?? "", at }]);
  }
  for (const [pid, notes] of byProfile) {
    try {
      const data = await z("GET", `/profiles/${pathId(pid)}`);
      await z("PUT", `/profiles/${pathId(pid)}`, { body: { description: withRemovalNotes(data?.profile?.description, notes, now) } });
    } catch (e) {
      // the accounts are already disconnected; only the note is lost
      console.warn("social: couldn't note an over-cap removal", pid, e instanceof Error ? e.message : String(e));
    }
  }
  const gone = new Set(over.map((a) => a._id));
  return team.filter((a) => !gone.has(a._id));
}

/** The brand's accounts with health, what a recount removed from it, and the counts against the caps. */
export async function status(z: Zernio, c: Caller, now = Date.now()): Promise<Reply> {
  const counts = capCounts(await recount(z, c, now), c.userProfiles, c.teamCap);
  if (!c.mapped) return ok({ enabled: true, accounts: [], removed: [], ...counts });
  const own = await callerAccounts(z, c.mapped);
  const profile = await z("GET", `/profiles/${pathId(c.mapped)}`).catch(() => null);
  const health = (own.length ? await scopedList(z, "/accounts/health", c.mapped, new Set(own.map((a) => a._id))) : []) as HealthItem[];
  return ok({
    enabled: true,
    accounts: own.map((a) => view(a, health.find((h) => h.accountId === a._id))),
    removed: removalNotes(profile?.profile?.description, now),
    ...counts,
  });
}

async function authUrl(z: Zernio, mapped: string, platform: SocialPlatform, reconnectAccountId: string | null): Promise<string> {
  const data = await z("GET", `/connect/${platform}`, {
    query: { profileId: mapped, redirect_url: redirectUrl(platform), reconnectAccountId: reconnectAccountId ?? undefined },
  });
  // the browser goes straight there, so only an https link
  const url = https(data?.authUrl);
  if (!url) throw new ZernioError(502, "unreadable", "Zernio didn't send a sign-in link.");
  return url;
}

/** A sign-in link for the platform. A reconnect needs a checked account of that platform; anything else is cap-checked. */
export async function connect(z: Zernio, c: Caller, row: ProfileRow, platform: SocialPlatform, reconnectAccountId: string | null): Promise<Reply> {
  const team = await recount(z, c);
  // a reconnect that Zernio turns into a new account is caught by the next recount
  if (reconnectAccountId) {
    if (!c.mapped) throw new NotYours("no profile");
    const account = (await callerAccounts(z, c.mapped)).find((a) => a._id === reconnectAccountId);
    if (!account || account.platform !== platform) throw new NotYours("account not yours");
    return ok({ authUrl: await authUrl(z, c.mapped, platform, reconnectAccountId) });
  }
  const counts = capCounts(team, c.userProfiles, c.teamCap);
  if (counts.user >= counts.userCap) {
    return { status: 409, body: { code: "account_cap", error: `You have ${counts.user} accounts connected, the most one adviser can have.`, ...counts } };
  }
  if (counts.team >= counts.teamCap) {
    return { status: 409, body: { code: "account_cap", error: `All ${counts.teamCap} account places are in use. Disconnect one first.`, ...counts } };
  }
  const mapped = await ensureProfile(z, row, c.uid, c.profileId);
  return ok({ authUrl: await authUrl(z, mapped, platform, null) });
}

/** One checked account, or (accountId null) every account in the brand before it is removed. */
export async function disconnect(z: Zernio, c: Caller, accountId: string | null): Promise<Reply> {
  if (!c.mapped) {
    if (accountId) throw new NotYours("no profile");
    return ok({ disconnected: 0 });
  }
  const own = (await callerAccounts(z, c.mapped)).map((a) => a._id);
  const ids = accountId ? requireAccounts(new Set(own), [accountId]) : own;
  for (const id of ids) await disconnectAccount(z, id);
  return ok({ disconnected: ids.length });
}

/** What the caller sees when a step throws. Never Zernio's own words for a key or scope problem. */
export function errorReply(e: unknown): Reply {
  if (e instanceof NotYours) return { status: 404, body: { error: "Not found." } };
  if (e instanceof ZernioError) {
    if (e.status === 402) return { status: 402, body: { code: e.code || "payment_required", error: "No more accounts can be connected right now." } };
    if (e.status === 429) return { status: 429, body: { code: "rate_limited", error: "Too many tries. Wait a minute and try again." } };
    if (e.status === 504) return { status: 504, body: { code: "timeout", error: "Zernio took too long. Try again." } };
    if (e.status === 401 || e.status === 403) return { status: 503, body: { code: "unavailable", error: "Social accounts aren't available right now." } };
    return { status: 502, body: { code: "zernio_error", error: "Couldn't reach your social accounts. Try again in a few minutes." } };
  }
  return { status: 500, body: { error: "Something went wrong. Try again." } };
}
