// One notify run with its I/O passed in: index.ts wires Supabase, web push
// and Resend; run.test.ts wires fakes, so what a run claims, sends and skips
// is tested without a network.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { callerAccounts, scopedList, ZernioError, type Zernio } from "../_shared/zernio.ts";
import {
  alertDay,
  alertPrefs,
  alertsEmail,
  alertsMailDay,
  failureMessage,
  failuresOf,
  FAIL_LOOKBACK_MS,
  reconnectMessage,
  reconnectsOf,
  type BrandRead,
  briefAsk,
  briefFindings,
  dueMessage,
  duePosts,
  emailWeeks,
  findingLine,
  goalAlert,
  marketAlert,
  marketOpen,
  moveAsk,
  outlierAlert,
  outlierHits,
  parsePrefs,
  pickedFindings,
  pickedMove,
  PREFS_PREFIX,
  profilesFrom,
  reportFacts,
  weekMoves,
  weeklyEmail,
  type Email,
  type Finding,
  type MoveId,
  type Prefs,
  type Profile,
  type PushMessage,
} from "./logic.ts";
import { isAllowed } from "../market/logic.ts";

/** Advisers per request. */
export const PAGE = 10;
/**
 * Stop starting new advisers after this much wall time and hand the rest of
 * the page to a fresh request: 60% of the 2s CPU cap, measured as wall time,
 * which is never less than CPU time.
 */
export const BUDGET_MS = 1200;
/** An email claimed this long ago and never marked sent may be claimed again. */
export const EMAIL_RETAKE = "30 minutes";
/** A device the app has not re-saved for this long gets no alerts (a sign-out that never reached the server). */
export const DEVICE_STALE_MS = 60 * 86_400_000;

export interface Options {
  dryRun: boolean;
  now: number;
  only: string | null;
  after: string | null;
  /** Set on a hand-off: the last adviser of the page that was cut short; no next page from here. */
  upTo: string | null;
  testTo: string | null;
  /** The market function's MARKET_USERS: who gets the Monday Your market reminder. */
  marketUsers?: string;
  /** NORTH_STAR_USERS: who gets What moved and the outlier alert (their brief and alerts switches still decide). */
  northStarUsers?: string;
  /** "social": the pass over everyone with a connected account (failed posts, accounts to reconnect); the hourly call starts it. */
  job?: "social";
}

/** A cs_social_profiles row: a brand and its Zernio profile. */
export interface SocialRow {
  profile_id: string;
  zernio_profile_id: string;
}

export interface Sub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  updated_at: string;
}

export interface AuthUser {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export interface PrefRow {
  user_id: string;
  key: string;
  data: string;
}

export interface Deps {
  listPrefs(q: { after: string | null; upTo: string | null; only: string | null; limit: number }): Promise<PrefRow[]>;
  userRows(uid: string): Promise<Record<string, string>>;
  subs(uid: string): Promise<Sub[]>;
  authUser(uid: string): Promise<AuthUser | null>;
  /** Which of these items already have a sent-log row (a dry run's claim; the outlier alert's look-up). */
  logged(uid: string, items: string[]): Promise<Set<string>>;
  /** cs_notify_claim: the items this run may send. */
  claim(uid: string, items: string[], retakeAfter: string | null): Promise<Set<string>>;
  markSent(uid: string, items: string[]): Promise<void>;
  /** How many devices took the alert. */
  sendPush(subs: Sub[], m: PushMessage): Promise<number>;
  sendEmail(to: string, email: Email, idempotencyKey: string): Promise<boolean>;
  /** Jev's answer to the week's move question, behind the adviser's "week-pick" daily cap; null without one. */
  pick(uid: string, ask: { state: string; questions: Record<string, JevQuestion> }): Promise<Record<string, JevAnswer> | null>;
  /** Jev's yes or no on each What moved finding, behind the adviser's "brief-pick" daily cap; null without one. */
  briefPick(uid: string, ask: { state: string; questions: Record<string, JevQuestion> }): Promise<Record<string, JevAnswer> | null>;
  /** Starts this function again as a fresh request with its own CPU budget. */
  next(body: { after?: string; upTo?: string; job?: "social" }): Promise<void>;
  clock(): number;
  /** The social job: up to `limit` owners from cs_social_profiles in id order, each with their notify key's data ("" without one). */
  listOwners(q: { after: string | null; upTo: string | null; only: string | null; limit: number }): Promise<PrefRow[]>;
  socialRows(uid: string): Promise<SocialRow[]>;
  /** The owner's synced drafts keys (content-studio-drafts-<uid>[~<profile>]), to name a failed post. */
  draftRows(uid: string): Promise<Record<string, string>>;
  /** Null without ZERNIO_API_KEY: the social job does nothing. */
  zernio: Zernio | null;
}

/** Shared demo and QA logins (user@demo.com) sit on a domain nobody here owns. */
const NEVER_MAIL = /@demo\.com$/i;

/** Only a confirmed address gets mail: anyone can sign up with someone else's. */
export function confirmedEmail(user: AuthUser | null): string | null {
  return user?.email && (user.email_confirmed_at || user.confirmed_at) && !NEVER_MAIL.test(user.email) ? user.email : null;
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

/** Jev's one move per reported profile (at most 3 asks), only where the week offers a choice. */
export async function weekPicks(deps: Deps, uid: string, profiles: Profile[], now: number): Promise<Record<string, MoveId>> {
  const out: Record<string, MoveId> = {};
  for (const { p, report } of emailWeeks(profiles, now).slice(0, 3)) {
    const moves = weekMoves(report);
    const ask = moveAsk(reportFacts(report), moves);
    if (!ask) continue;
    const move = pickedMove(await deps.pick(uid, ask), moves);
    if (move) out[p.id] = move.id;
  }
  return out;
}

/**
 * What moved per brand (at most 3 asks), once the email is ours to send. `scored` is every finding with Jev's
 * yes-probability, for a dry run's reader to check the 0.5 cut against.
 */
export async function briefPicks(deps: Deps, uid: string, profiles: Profile[], now: number) {
  const picked: Record<string, Finding[]> = {};
  const scored: { profile: string; findings: { id: string; line: string; p: number | null }[] }[] = [];
  for (const p of profiles) {
    if (scored.length >= 3) break;
    const findings = briefFindings(p, now);
    if (findings.length < 2) continue;
    const items = findings.map((f) => ({ id: f.id, kind: f.kind, line: findingLine(f) }));
    const answers = await deps.briefPick(uid, briefAsk(items, p.brand));
    picked[p.id] = pickedFindings(answers, findings);
    scored.push({ profile: p.id, findings: items.map((f, i) => ({ id: f.id, line: f.line, p: answers?.[`f${i}`]?.noul ?? null })) });
  }
  return { picked, scored };
}

export async function runUser(deps: Deps, uid: string, prefs: Prefs, o: Options) {
  // What moved, the outlier alert and linked live numbers go only to NORTH_STAR_USERS; everyone else's run is exactly
  // what it was.
  const listed = isAllowed(o.northStarUsers, uid);
  const profiles = profilesFrom(uid, await deps.userRows(uid), listed);
  const report: { user: string; push: object[]; email: object | null } = { user: uid.slice(0, 8), push: [], email: null };
  // A test send goes to a test inbox only: no phone alerts, nothing claimed or marked sent.
  const test = !!o.testTo;
  const available = async (items: string[], retakeAfter: string | null) => {
    if (o.dryRun) {
      const done = await deps.logged(uid, items);
      return new Set(items.filter((i) => !done.has(i)));
    }
    return deps.claim(uid, items, retakeAfter);
  };

  if (prefs.push && !test) {
    const subs = (await deps.subs(uid)).filter((s) => Date.parse(s.updated_at) >= o.now - DEVICE_STALE_MS);
    const due = duePosts(profiles, o.now);
    const goal = goalAlert(profiles, o.now);
    const market = marketAlert(profiles, o.now, isAllowed(o.marketUsers, uid));
    const hits = listed && prefs.alerts && subs.length ? outlierHits(profiles, o.now) : [];
    const hit = hits.length ? outlierAlert(hits, o.now, await deps.logged(uid, [alertDay(o.now), ...hits.map((h) => h.id)])) : null;
    const items = [...due.map((d) => d.item), ...(goal ? [goal.item] : []), ...(market ? [market.item] : []), ...(hit ? hit.items : [])];
    if (subs.length && items.length) {
      const mine = await available(items, null);
      const dueMine = due.filter((d) => mine.has(d.item));
      const sends: [PushMessage | null, string[]][] = [
        [dueMessage(dueMine), dueMine.map((d) => d.item)],
        [goal && mine.has(goal.item) ? goal.message : null, goal ? [goal.item] : []],
        [market && mine.has(market.item) ? market.message : null, market ? [market.item] : []],
        [hit && hit.items.every((i) => mine.has(i)) ? hit.message : null, hit ? hit.items : []],
      ];
      for (const [m, sent] of sends) {
        if (!m) continue;
        const delivered = o.dryRun ? null : await deps.sendPush(subs, m);
        if (delivered) await deps.markSent(uid, sent);
        report.push.push({ ...m, devices: subs.length, delivered });
      }
    }
  }

  if (prefs.email) {
    const due = weeklyEmail(profiles, o.now);
    if (due) {
      const to = o.testTo ?? confirmedEmail(await deps.authUser(uid));
      if (!to) {
        report.email = { skipped: "no confirmed sign-in email" };
      } else if (test || (await available([due.item], EMAIL_RETAKE)).has(due.item)) {
        // Jev is asked only once the email is ours to send, so an hourly rerun costs nothing.
        const picks = await weekPicks(deps, uid, profiles, o.now);
        const brief = listed && prefs.brief ? await briefPicks(deps, uid, profiles, o.now) : null;
        const email = weeklyEmail(profiles, o.now, picks, marketOpen(profiles, o.now, isAllowed(o.marketUsers, uid)), brief?.picked)!;
        const sent = o.dryRun ? null : await deps.sendEmail(to, email, `cs-${email.item}-${uid}${test ? "-test" : ""}`);
        // A failed send keeps its claim unsent; the next hourly run takes it again.
        if (sent && !test) await deps.markSent(uid, [email.item]);
        report.email = { to: mask(to), subject: email.subject, text: email.text, sent, ...(brief ? { brief: brief.scored } : {}) };
      }
    }
  }
  return report;
}

/** Zernio's own words could name an account, so a log gets only its status and code. */
const zernioErr = (e: unknown) => (e instanceof ZernioError ? `ZernioError ${e.status} ${e.code}` : e instanceof Error ? e.name : "error");

/**
 * One brand's failed and partly failed posts updated since `since`, and the health of any of its accounts that needs
 * reconnecting, each read scoped to the brand's own accounts (H3 in docs/zernio-connection.md).
 */
export async function readBrand(z: Zernio, row: SocialRow, since: string, want: { failed: boolean; accounts: boolean }): Promise<BrandRead> {
  const own = await callerAccounts(z, row.zernio_profile_id);
  const ids = new Set(own.map((a) => a._id));
  const read = (path: "/posts" | "/accounts/health", query = {}) => scopedList(z, path, row.zernio_profile_id, ids, query);
  const posts = want.failed && ids.size
    ? (await Promise.all(["failed", "partial"].map((status) => read("/posts", { status, updatedSince: since, limit: "50" })))).flat()
    : [];
  // health only when the account list already says one is broken: it carries when it broke, for the sent-log item
  const health = want.accounts && own.some((a) => a.needsReconnection === true) ? await read("/accounts/health") : [];
  return { profileId: row.profile_id, posts, health };
}

/**
 * The social job for one owner: new failures and broken connections across their brands, one phone alert per batch
 * (with phone alerts on) and at most one email a day. Nothing is told twice: each is claimed in the sent log first.
 */
export async function runAlerts(deps: Deps, uid: string, prefs: { failed: boolean; accounts: boolean; push: boolean }, o: Options) {
  const report: { user: string; push: object[]; email: object | null; errors?: string[] } = { user: uid.slice(0, 8), push: [], email: null };
  const test = !!o.testTo;
  const since = new Date(o.now - FAIL_LOOKBACK_MS).toISOString();
  const reads: BrandRead[] = [];
  const errors: string[] = [];
  for (const row of await deps.socialRows(uid)) {
    // one brand Zernio can't answer for leaves the others' alerts alone; the next hour reads it again
    try {
      reads.push(await readBrand(deps.zernio!, row, since, prefs));
    } catch (e) {
      errors.push(`${row.profile_id}: ${zernioErr(e)}`);
    }
  }
  if (errors.length) report.errors = errors;
  const posts = reads.some((r) => r.posts.length);
  const failures = prefs.failed && posts ? failuresOf(uid, reads, await deps.draftRows(uid)) : [];
  const reconnects = prefs.accounts ? reconnectsOf(reads) : [];
  if (!failures.length && !reconnects.length) return report;
  const available = async (items: string[], retakeAfter: string | null) => {
    if (o.dryRun) {
      const done = await deps.logged(uid, items);
      return new Set(items.filter((i) => !done.has(i)));
    }
    return deps.claim(uid, items, retakeAfter);
  };

  if (prefs.push && !test) {
    const subs = (await deps.subs(uid)).filter((s) => Date.parse(s.updated_at) >= o.now - DEVICE_STALE_MS);
    if (subs.length) {
      const mine = await available([...failures, ...reconnects].map((x) => x.item), null);
      const f = failures.filter((x) => mine.has(x.item));
      const r = reconnects.filter((x) => mine.has(x.item));
      const sends: [PushMessage | null, string[]][] = [
        [failureMessage(f), f.map((x) => x.item)],
        [reconnectMessage(r), r.map((x) => x.item)],
      ];
      for (const [m, sent] of sends) {
        if (!m) continue;
        const delivered = o.dryRun ? null : await deps.sendPush(subs, m);
        if (delivered) await deps.markSent(uid, sent);
        report.push.push({ ...m, devices: subs.length, delivered });
      }
    }
  }

  // the email takes each one under its own mail: item, so a phone alert already sent still reaches the day's email
  const mail = (x: { item: string }) => `mail:${x.item}`;
  const done = test ? new Set<string>() : await deps.logged(uid, [...failures, ...reconnects].map(mail));
  const f = failures.filter((x) => !done.has(mail(x)));
  const r = reconnects.filter((x) => !done.has(mail(x)));
  if (!f.length && !r.length) return report;
  const to = o.testTo ?? confirmedEmail(await deps.authUser(uid));
  if (!to) {
    report.email = { skipped: "no confirmed sign-in email" };
  } else if (test || (await available([alertsMailDay(o.now)], EMAIL_RETAKE)).has(alertsMailDay(o.now))) {
    const items = [...f, ...r].map(mail);
    const mine = test || o.dryRun ? new Set(items) : await deps.claim(uid, items, EMAIL_RETAKE);
    const email = alertsEmail(f.filter((x) => mine.has(mail(x))), r.filter((x) => mine.has(mail(x))), o.now);
    // another run claimed every one of them between the look-up and the claim
    if (!email) return report;
    const sent = o.dryRun ? null : await deps.sendEmail(to, email, `cs-${email.item}-${uid}${test ? "-test" : ""}`);
    // a failed send keeps both claims unsent; the next hourly run takes them again after EMAIL_RETAKE
    if (sent && !test) await deps.markSent(uid, [email.item, ...items.filter((i) => mine.has(i))]);
    report.email = { to: mask(to), subject: email.subject, text: email.text, sent };
  }
  return report;
}

export async function runPage(deps: Deps, o: Options) {
  const started = deps.clock();
  const social = o.job === "social";
  if (social && !deps.zernio) return { checked: 0, next: null, handedOff: false, reports: [] };
  const q = { after: o.after, upTo: o.upTo, only: o.only, limit: PAGE };
  const rows = social ? await deps.listOwners(q) : await deps.listPrefs(q);
  const chaining = !o.dryRun && !o.testTo && !o.only;
  const job = social ? { job: "social" as const } : {};
  const pending: Promise<void>[] = [];
  // Start the next page before working on this one, so a killed request cannot stop the chain.
  const next = rows.length === PAGE && !o.upTo ? rows[PAGE - 1].user_id : null;
  if (next && chaining) pending.push(deps.next({ after: next, ...job }));
  // The hourly call also starts the connected-accounts pass, a chain of its own.
  if (chaining && !social && !o.after && !o.upTo) pending.push(deps.next({ job: "social" }));

  const reports: object[] = [];
  let done: string | null = null;
  let handedOff = false;
  for (const row of rows) {
    if (chaining && done && deps.clock() - started > BUDGET_MS) {
      pending.push(deps.next({ after: done, upTo: o.upTo ?? rows[rows.length - 1].user_id, ...job }));
      handedOff = true;
      break;
    }
    done = row.user_id;
    // Only the key named after the row's own user counts, so nobody can switch on someone else.
    if (row.key !== `${PREFS_PREFIX}${row.user_id}`) continue;
    const prefs = parsePrefs(row.data);
    const alerts = alertPrefs(row.data);
    if (social ? !alerts.failed && !alerts.accounts : !prefs.email && !prefs.push) continue;
    try {
      reports.push(social ? await runAlerts(deps, row.user_id, alerts, o) : await runUser(deps, row.user_id, prefs, o));
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      console.error("notify failed for a user", msg);
      reports.push({ user: row.user_id.slice(0, 8), error: msg });
    }
  }
  const chained = await Promise.allSettled(pending);
  for (const c of chained) if (c.status === "rejected") console.error("next request failed", String(c.reason).slice(0, 200));
  return { checked: rows.length, next, handedOff, reports };
}
