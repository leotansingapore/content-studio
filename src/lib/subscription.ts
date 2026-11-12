// Postmosis billing in the app (docs/postmosis-billing.md): this sign-in's cs_subscriptions row, what the gate does
// with it, and the words the studio shows about it. The access rule itself is the server's
// (supabase/functions/_shared/subscription.ts), so the gate and the functions can't disagree. An account with no
// row came from before billing and is never gated; a lookup that fails counts as no row (fail open).
import { callFn } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";
import { daysLeft, gateOf, graceEnds, type SubRow } from "../../supabase/functions/_shared/subscription.ts";

export { gateOf, type SubRow };

// shortcut: the list price, not what Stripe will charge after a promo code; the portal beside it shows the exact
// amount. Read the amount from Stripe into the row if codes come into regular use.
export const PRICE = "US$29";

let known: SubRow | null = null;

/** This sign-in's row as ProtectedRoute last read it; null for an account with none. */
export const subscriptionNow = (): SubRow | null => known;
/** Whether Settings shows Billing: only for an account that came in through checkout. */
export const billingShown = (): boolean => known !== null;

/** Reads the signed-in account's own row (RLS allows nothing else). Any error, or 4 seconds without an answer, is null. */
export async function loadSubscription(userId: string): Promise<SubRow | null> {
  known = null;
  try {
    const read = supabase
      .from("cs_subscriptions")
      .select("status, past_due_since, trial_end, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => (error ? null : (data as SubRow | null)));
    known = await Promise.race([read, new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
  } catch {
    known = null;
  }
  return known;
}

/** Sends the browser to Stripe's portal for this account (card, invoices, cancel). Throws an EdgeError in plain words. */
export async function openBillingPortal(): Promise<void> {
  const { url } = await callFn<{ url: string }>("postmosis-portal", {}, "Couldn't open billing. Try again in a minute.");
  window.location.assign(url);
}

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Singapore" }) : "");

/** The one line of billing state the studio keeps in view, or null when there is nothing the person needs to know. */
export function billingLine(row: SubRow | null, now: number): { text: string; warn: boolean } | null {
  if (!row) return null;
  if (row.status === "trialing") {
    const left = daysLeft(row.trial_end, now);
    if (left === null) return null;
    const days = `${left} ${left === 1 ? "day" : "days"} left in your trial.`;
    return { text: row.cancel_at_period_end ? `${days} It ends on ${day(row.trial_end)} and you won't be charged.` : `${days} ${PRICE} is charged on ${day(row.trial_end)}, then each month.`, warn: false };
  }
  if (row.status === "past_due") {
    const ends = graceEnds(row);
    return { text: `Your last payment didn't go through. Update your card by ${day(ends ? new Date(ends).toISOString() : null)} to keep your studio open.`, warn: true };
  }
  if (row.status === "active" && row.cancel_at_period_end) return { text: `Your plan ends on ${day(row.current_period_end)}. You won't be charged again.`, warn: false };
  return null;
}

/** What Settings > Billing says about the plan. */
export function billingSummary(row: SubRow | null, now: number): string {
  if (!row) return "There's no subscription on this account, and nothing to pay.";
  if (row.status === "comp") return "This is a free account. There's nothing to pay.";
  const line = billingLine(row, now);
  if (line) return line.text;
  if (row.status === "active") return `${PRICE} a month. Next charge on ${day(row.current_period_end)}.`;
  return paywallFor(row).body;
}

/** The paywall's words and its one button: the portal when a card needs fixing, a new checkout otherwise. */
export function paywallFor(row: SubRow): { title: string; body: string; button: string; action: "portal" | "checkout" } {
  if ((row.status === "past_due" || row.status === "unpaid") && row.stripe_customer_id) {
    return { title: "Your payment didn't go through", body: "We couldn't charge your card, so your studio is paused. Your posts and brand kit are still here. Update your card to open it again.", button: "Update your card", action: "portal" };
  }
  if (row.status === "canceled") {
    return { title: "Your subscription has ended", body: "Your posts and brand kit are still here. Subscribe again to get back to them.", button: `Subscribe again, ${PRICE} a month`, action: "checkout" };
  }
  return { title: "Your subscription isn't active", body: "The payment for this account was never completed, so the studio is closed. Subscribe to open it.", button: `Subscribe, ${PRICE} a month`, action: "checkout" };
}

/** A new checkout for this account's own email, so the subscription lands on this account. */
export const checkoutHref = (email: string) => `/start?plan=pay${email ? `&email=${encodeURIComponent(email)}` : ""}`;
