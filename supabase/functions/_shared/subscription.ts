// Postmosis subscription rules (docs/postmosis-billing.md): who a cs_subscriptions row lets in. Pure, no imports:
// the edge functions and the app (src/lib/subscription.ts) both read it, so the gate and the server agree.

/** Days a failed payment keeps access (with a banner) before the paywall. Stripe keeps retrying the card meanwhile. */
export const GRACE_DAYS = 7;
const DAY = 86_400_000;

export type SubRow = {
  status: string;
  past_due_since?: string | null;
  trial_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  stripe_customer_id?: string | null;
};

/** Statuses that open the studio outright. 'comp' is a free account given by hand; the rest are Stripe's own. */
export const GRANTS = new Set(["trialing", "active", "comp"]);

/** When a past_due row's grace runs out (ms), or null when it is not past_due. No start on file: it has run out. */
export function graceEnds(row: SubRow): number | null {
  if (row.status !== "past_due") return null;
  const since = row.past_due_since ? Date.parse(row.past_due_since) : NaN;
  return Number.isFinite(since) ? since + GRACE_DAYS * DAY : 0;
}

/**
 * Whether this row opens the studio: trialing, active or comp; past_due inside the grace period. Everything else
 * (canceled, unpaid, incomplete, incomplete_expired, paused, a status we do not know) does not.
 */
export function hasAccess(row: SubRow, now: number): boolean {
  if (GRANTS.has(row.status)) return true;
  const ends = graceEnds(row);
  return ends !== null && now < ends;
}

/** The app's gate. No row is an account from before billing (or a failed lookup, passed as null): always open. */
export const gateOf = (row: SubRow | null, now: number): "open" | "paywall" => (!row || hasAccess(row, now) ? "open" : "paywall");

/** Whole days left until an ISO time, never below 0; null with no time. */
export function daysLeft(iso: string | null | undefined, now: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : null;
}

/**
 * The server's read of one account's row, for functions holding the service key. Null for no row AND for any
 * failure (the table not there yet, a client without from()): an account is refused only on a row that says so.
 */
export async function readSubscription(admin: unknown, userId: string): Promise<SubRow | null> {
  try {
    // deno-lint-ignore no-explicit-any
    const { data } = await (admin as any).from("cs_subscriptions").select("status, past_due_since").eq("user_id", userId).maybeSingle();
    return data && typeof data.status === "string" ? (data as SubRow) : null;
  } catch {
    return null;
  }
}

/** A customer whose subscription has stopped giving access. Never true for an account with no row. */
export const lapsed = (row: SubRow | null, now: number): boolean => !!row && !hasAccess(row, now);
