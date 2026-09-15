// Pure mapping from Stripe subscription state to hub_memberships.status.
// No Deno or npm imports, so vitest can test it (membership.test.ts).

export type MembershipStatus = "none" | "client" | "active" | "canceled";

const PAID = new Set(["active", "trialing"]);
const KNOWN = new Set<string>(["none", "client", "active", "canceled"]);

const known = (status: string | null): status is MembershipStatus =>
  status !== null && KNOWN.has(status);

/** After a subscription changes or is deleted. Clients keep client access whatever Stripe says. */
export function subscriptionStatus(stripeStatus: string, current: string | null): MembershipStatus {
  if (current === "client") return "client";
  return PAID.has(stripeStatus) ? "active" : "canceled";
}

/** After checkout. An unpaid checkout (e.g. awaiting 3-D Secure) grants nothing and downgrades no one. */
export function checkoutStatus(stripeStatus: string, current: string | null): MembershipStatus {
  if (current === "client") return "client";
  if (PAID.has(stripeStatus)) return "active";
  return known(current) ? current : "none";
}
