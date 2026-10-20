// The connected-accounts safety jobs (docs/zernio-connection.md, M5 and M6), run by pg_cron:
//   recount (daily): the team-wide recount the social function runs on status and connect, so an
//     account over a cap stops billing within a day even when nobody opens Social accounts.
//   orphans (weekly): a Zernio profile this app made (cs_<uuid>_<brand>) that no cs_social_profiles row
//     names belongs to a deleted user: its pending posts and auto-DMs are deleted and its accounts
//     disconnected. The empty profile stays (M3). Rows whose owner is off SOCIAL_CONNECT_USERS but
//     still has accounts are only listed, for Leo to decide.
// Pure: Zernio, the mapping rows and the allowlist come in. The recount itself is social's (never a copy).

import { billed, callerAccounts, disconnectAccount, isZernioId, pathId, refId, scopedList, scopedPage, teamAccounts, ZernioError, type ZAccount, type Zernio } from "../_shared/zernio.ts";
import { isAllowed, overCapTeam, recount } from "../social/logic.ts";

export interface MappingRow {
  owner_id: string;
  profile_id: string;
  zernio_profile_id: string;
}

export interface SweepRequest {
  job: "recount" | "orphans";
  dryRun: boolean;
}

/** {job, dryRun?}. A dryRun that is not a boolean is refused rather than read as a real run. */
export function parseSweep(body: unknown): SweepRequest | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.job !== "recount" && b.job !== "orphans") return null;
  if (b.dryRun !== undefined && typeof b.dryRun !== "boolean") return null;
  return { job: b.job, dryRun: b.dryRun === true };
}

/** Constant-time comparison via digests, so timing leaks neither length nor prefix (as notify). */
export async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(provided)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

/**
 * The sweep's Zernio: never DELETE a profile (M3: Zernio would move its accounts to another of the team's
 * profiles), nothing but reads on a dry run, and every write that went through noted in done.
 */
export function sweepZernio(z: Zernio, dryRun: boolean, done: string[]): Zernio {
  return async (method, path, req) => {
    if (method !== "GET" && (dryRun || (method === "DELETE" && /^\/profiles(\/|$)/.test(path)))) throw new Error(`sweep refused ${method} ${path}`);
    const data = await z(method, path, req);
    if (method !== "GET") done.push(`${method} ${path}`);
    return data;
  };
}

/**
 * Every mapping row, keyset-paged by zernio_profile_id until a page comes back empty: a read cut short by
 * a row cap would make a live brand look orphaned. Out-of-order pages fail closed.
 */
export async function readAllRows(page: (after: string | null) => Promise<MappingRow[]>): Promise<MappingRow[]> {
  const rows: MappingRow[] = [];
  for (let after: string | null = null; ;) {
    const got = await page(after);
    if (!got.length) return rows;
    const last = got[got.length - 1].zernio_profile_id;
    if (after !== null && !(last > after)) throw new Error("mapping rows came back out of order");
    rows.push(...got);
    after = last;
  }
}

export interface Env {
  /** Called only after Zernio's profile list is read, so a profile made before it always finds its row. */
  loadRows: () => Promise<MappingRow[]>;
  /** True only when auth answers that no user has this id. Any other answer or error is false. */
  ownerGone: (uid: string) => Promise<boolean>;
  teamCap: number;
  /** One adviser's cap across their brands; social's default when left out. */
  userCap?: number;
  allowlist: string | undefined;
}

const short = (a: ZAccount) => ({ id: a._id, platform: a.platform, profileId: refId(a.profileId) });

/** M5, team-wide: social's recount, or on a dry run the accounts it would disconnect. */
async function recountJob(z: Zernio, env: Env, dryRun: boolean) {
  const rows = await env.loadRows();
  const c = { ownerOf: new Map(rows.map((r) => [r.zernio_profile_id, r.owner_id])), teamCap: env.teamCap, userCap: env.userCap };
  if (dryRun) return { wouldDisconnect: overCapTeam(await teamAccounts(z), c.ownerOf, c.teamCap, c.userCap).map(short) };
  return { accountsLeft: (await recount(z, c)).filter(billed).length };
}

const NAME = /^cs_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([a-z0-9]{1,40})$/;

/** Post statuses Zernio lets us delete that never reached a platform. Never published, never publishing. */
export const PENDING = ["draft", "scheduled", "failed", "partial", "cancelled"];
const MAX_PAGES = 10;

/** M6: profiles named cs_<uuid>_<brand> that no row names, neither by Zernio id nor by owner and brand. */
export function orphanProfiles(profiles: unknown[], rows: MappingRow[]): { id: string; owner: string }[] {
  const ids = new Set(rows.map((r) => r.zernio_profile_id));
  const brands = new Set(rows.map((r) => `${r.owner_id}_${r.profile_id}`));
  return profiles.flatMap((p) => {
    const { _id, name } = (p ?? {}) as { _id?: unknown; name?: unknown };
    const m = typeof name === "string" ? NAME.exec(name) : null;
    return m && isZernioId(_id) && !ids.has(_id) && !brands.has(`${m[1]}_${m[2]}`) ? [{ id: _id, owner: m[1] }] : [];
  });
}

export interface OrphanPlan {
  profileId: string;
  accounts: string[];
  posts: string[];
  automations: string[];
}

/** What an orphan holds. Posts and auto-DMs count only when every account they name is the profile's own (the C0 helpers). */
async function planOrphan(z: Zernio, profileId: string): Promise<OrphanPlan> {
  const accounts = (await callerAccounts(z, profileId)).map((a) => a._id);
  const own = new Set(accounts);
  const posts = new Set<string>();
  const automations: string[] = [];
  if (accounts.length) {
    for (const status of PENDING) {
      for (let page = 1, pages = 1; page <= Math.min(pages, MAX_PAGES); page++) {
        const r = await scopedPage(z, "/posts", profileId, own, { status, limit: "100", page: String(page) });
        pages = r.pages;
        // checked again: a published post is never on the list, whatever the filter returned
        for (const p of r.items as { _id?: unknown; status?: unknown }[]) if (isZernioId(p?._id) && PENDING.includes(p.status as string)) posts.add(p._id);
      }
    }
    for (const a of (await scopedList(z, "/comment-automations", profileId, own)) as { id?: unknown }[]) if (isZernioId(a?.id)) automations.push(a.id);
  }
  return { profileId, accounts, posts: [...posts], automations };
}

/** Posts and auto-DMs first, then the accounts, so nothing is left pending on them. Returns how many writes failed (a 404 is already gone). */
async function clearOrphan(z: Zernio, plan: OrphanPlan): Promise<number> {
  let failed = 0;
  const run = (p: Promise<unknown>) => p.catch((e) => void (e instanceof ZernioError && e.status === 404 ? 0 : failed++));
  for (const id of plan.posts) await run(z("DELETE", `/posts/${pathId(id)}`));
  for (const id of plan.automations) await run(z("DELETE", `/comment-automations/${pathId(id)}`));
  for (const id of plan.accounts) await run(disconnectAccount(z, id));
  return failed;
}

/** Report only: rows whose owner is off SOCIAL_CONNECT_USERS (while it is not *) and who still have billed accounts. */
export function offList(rows: MappingRow[], team: ZAccount[], allowlist: string | undefined) {
  const count = new Map<string, number>();
  for (const a of team.filter(billed)) count.set(refId(a.profileId), (count.get(refId(a.profileId)) ?? 0) + 1);
  return rows
    .filter((r) => !isAllowed(allowlist, r.owner_id) && count.get(r.zernio_profile_id))
    .map((r) => ({ ownerId: r.owner_id, profileId: r.profile_id, zernioProfileId: r.zernio_profile_id, accounts: count.get(r.zernio_profile_id) }));
}

// shortcut: every orphan in one request; page it like notify if a week ever leaves more than about 20.
async function orphansJob(z: Zernio, env: Env, dryRun: boolean) {
  const data = await z("GET", "/profiles", { query: { includeOverLimit: "true" } });
  if (!Array.isArray(data?.profiles)) throw new ZernioError(502, "unreadable", "Couldn't read the Zernio profiles.");
  const rows = await env.loadRows();
  const orphans = orphanProfiles(data.profiles, rows);
  const team = await teamAccounts(z);
  const plans: OrphanPlan[] = [];
  const failed: string[] = [];
  const ownerLive: string[] = [];
  let failedWrites = 0;
  for (const { id, owner } of orphans) {
    try {
      // M6 is a deleted user's profile: a live owner (a row the read missed, a first connect racing the sweep) is never cleared
      if (!(await env.ownerGone(owner))) {
        ownerLive.push(id);
        continue;
      }
      const plan = await planOrphan(z, id);
      if (plan.accounts.length + plan.posts.length + plan.automations.length) plans.push(plan);
      if (!dryRun) failedWrites += await clearOrphan(z, plan);
    } catch {
      // an unreadable or mismatched profile is left alone this week; the others still go
      failed.push(id);
    }
  }
  // found: what each orphan held (on a dry run, what would go); the writes that went through are in done
  return { orphans: orphans.length, found: plans, failed, ownerLive, failedWrites, offList: offList(rows, team, env.allowlist) };
}

/** Runs one job. z should be sweepZernio(...): it is what keeps a dry run read-only and profiles undeleted. */
export const runSweep = (z: Zernio, r: SweepRequest, env: Env) => (r.job === "recount" ? recountJob(z, env, r.dryRun) : orphansJob(z, env, r.dryRun));

/** Counts of the writes that went through, by kind. */
export function doneCounts(done: string[]) {
  const n = (re: RegExp) => done.filter((d) => re.test(d)).length;
  return { accountsDisconnected: n(/^DELETE \/accounts\//), postsDeleted: n(/^DELETE \/posts\//), automationsDeleted: n(/^DELETE \/comment-automations\//), notesWritten: n(/^PUT \/profiles\//) };
}
