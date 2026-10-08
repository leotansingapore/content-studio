// One notify run with its I/O passed in: index.ts wires Supabase, web push
// and Resend; run.test.ts wires fakes, so what a run claims, sends and skips
// is tested without a network.

import {
  dueMessage,
  duePosts,
  goalAlert,
  parsePrefs,
  PREFS_PREFIX,
  profilesFrom,
  weeklyEmail,
  type Email,
  type PushMessage,
} from "./logic.ts";

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
  /** Dry run: which of these items already have a sent-log row. */
  logged(uid: string, items: string[]): Promise<Set<string>>;
  /** cs_notify_claim: the items this run may send. */
  claim(uid: string, items: string[], retakeAfter: string | null): Promise<Set<string>>;
  markSent(uid: string, items: string[]): Promise<void>;
  /** How many devices took the alert. */
  sendPush(subs: Sub[], m: PushMessage): Promise<number>;
  sendEmail(to: string, email: Email, idempotencyKey: string): Promise<boolean>;
  /** Starts this function again as a fresh request with its own CPU budget. */
  next(body: { after: string; upTo?: string }): Promise<void>;
  clock(): number;
}

/** Only a confirmed address gets mail: anyone can sign up with someone else's. */
export function confirmedEmail(user: AuthUser | null): string | null {
  return user?.email && (user.email_confirmed_at || user.confirmed_at) ? user.email : null;
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

export async function runUser(deps: Deps, uid: string, prefs: { email: boolean; push: boolean }, o: Options) {
  const profiles = profilesFrom(uid, await deps.userRows(uid));
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
    const items = [...due.map((d) => d.item), ...(goal ? [goal.item] : [])];
    if (subs.length && items.length) {
      const mine = await available(items, null);
      const dueMine = due.filter((d) => mine.has(d.item));
      const sends: [PushMessage | null, string[]][] = [
        [dueMessage(dueMine), dueMine.map((d) => d.item)],
        [goal && mine.has(goal.item) ? goal.message : null, goal ? [goal.item] : []],
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
    const email = weeklyEmail(profiles, o.now);
    if (email) {
      const to = o.testTo ?? confirmedEmail(await deps.authUser(uid));
      if (!to) {
        report.email = { skipped: "no confirmed sign-in email" };
      } else if (test || (await available([email.item], EMAIL_RETAKE)).has(email.item)) {
        const sent = o.dryRun ? null : await deps.sendEmail(to, email, `cs-${email.item}-${uid}${test ? "-test" : ""}`);
        // A failed send keeps its claim unsent; the next hourly run takes it again.
        if (sent && !test) await deps.markSent(uid, [email.item]);
        report.email = { to: mask(to), subject: email.subject, text: email.text, sent };
      }
    }
  }
  return report;
}

export async function runPage(deps: Deps, o: Options) {
  const started = deps.clock();
  const rows = await deps.listPrefs({ after: o.after, upTo: o.upTo, only: o.only, limit: PAGE });
  const chaining = !o.dryRun && !o.testTo && !o.only;
  const pending: Promise<void>[] = [];
  // Start the next page before working on this one, so a killed request cannot stop the chain.
  const next = rows.length === PAGE && !o.upTo ? rows[PAGE - 1].user_id : null;
  if (next && chaining) pending.push(deps.next({ after: next }));

  const reports: object[] = [];
  let done: string | null = null;
  let handedOff = false;
  for (const row of rows) {
    if (chaining && done && deps.clock() - started > BUDGET_MS) {
      pending.push(deps.next({ after: done, upTo: o.upTo ?? rows[rows.length - 1].user_id }));
      handedOff = true;
      break;
    }
    done = row.user_id;
    // Only the key named after the row's own user counts, so nobody can switch on someone else.
    if (row.key !== `${PREFS_PREFIX}${row.user_id}`) continue;
    const prefs = parsePrefs(row.data);
    if (!prefs.email && !prefs.push) continue;
    try {
      reports.push(await runUser(deps, row.user_id, prefs, o));
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
