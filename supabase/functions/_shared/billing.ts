// Postmosis paid sign-up: the three endpoints' whole behaviour, with Stripe and the database handed in, so
// billing.test.ts runs every rule with fakes. No imports but the access rules. Wiring: billingDeps.ts.
// Design, secrets, abuse cases and the go-live runbook: docs/postmosis-billing.md.

import { GRANTS, hasAccess, type SubRow } from "./subscription.ts";

export const APP = "https://app.postmosis.com";
export const SITE = "https://postmosis.com";
export const TRIAL_DAYS = 7;

export type Config = { key: string; whsec: string; price: string };

/** Switched on only with the flag and all three Stripe secrets; anything missing is off, for every endpoint. */
export function configOf(get: (k: string) => string | undefined): Config | null {
  const on = /^(1|true|on|yes)$/i.test((get("POSTMOSIS_CHECKOUT_ON") ?? "").trim());
  const key = get("POSTMOSIS_STRIPE_SECRET_KEY");
  const whsec = get("POSTMOSIS_STRIPE_WEBHOOK_SECRET");
  const price = get("POSTMOSIS_PRICE_ID");
  return on && key && whsec && price ? { key, whsec, price } : null;
}

export type StripeSub = {
  id: string;
  status: string;
  customer: string | { id: string; email?: string | null };
  trial_end?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  items?: { data?: { price?: { id?: string }; current_period_end?: number | null }[] };
};
export type StripeSession = {
  id: string;
  status?: string | null;
  created: number;
  metadata?: Record<string, string> | null;
  subscription?: string | { id: string } | null;
};
export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };
export type StripeApi = {
  createCheckout(params: Record<string, unknown>): Promise<{ url?: string | null }>;
  session(id: string): Promise<StripeSession>;
  /** With the customer expanded. */
  subscription(id: string): Promise<StripeSub>;
  portal(customer: string, returnUrl: string): Promise<{ url: string }>;
  /** The event when the signature is good, else null. */
  verify(body: string, signature: string, whsec: string): Promise<StripeEvent | null>;
};

export type Row = SubRow & { user_id: string; email: string; stripe_subscription_id?: string | null };
export type Hold = { stripe_subscription_id: string; stripe_customer_id: string; email: string; status: string; reason: "account_without_subscription" | "second_subscription"; updated_at: string };
// Nothing here can mint a session, a token or a sign-in link: the public endpoints have no way to sign anyone in.
export type Db = {
  /** The account an email belongs to, and the subscription that created it (stamped at creation), if one did. */
  accountForEmail(email: string): Promise<{ userId: string; madeBy: string | null } | null>;
  /** A new account stamped with the subscription that made it; null when the email is already someone's. */
  createAccount(email: string, madeBy: string): Promise<string | null>;
  rowBySubscription(subscriptionId: string): Promise<Row | null>;
  rowByUser(userId: string): Promise<Row | null>;
  saveRow(row: Row & { updated_at: string }): Promise<void>;
  /** A paid checkout that was not attached to any account: the owner attaches or refunds it by hand. */
  saveHold(hold: Hold): Promise<void>;
  /** Logs a finished event: false when it was already logged. */
  claim(id: string, type: string): Promise<boolean>;
  seen(id: string): Promise<boolean>;
};
export type Deps = {
  env: (k: string) => string | undefined;
  stripe: (key: string) => StripeApi;
  db: () => Db;
  now: () => number;
  /** postmosis-portal only: the signed-in caller. */
  user?: (req: Request) => Promise<string | null>;
};

const redirect = (status: 302 | 303, to: string) =>
  new Response(null, { status, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });

const EMAIL = /^[^\s@<>"'\\]{1,64}@[^\s@<>"'\\]{1,180}\.[a-z]{2,24}$/i;
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,250}$/;

export const planOf = (v: string | null): "pay" | "trial" | null => (v === "pay" || v === "trial" ? v : null);

/** The Checkout Session for a plan. Every address is a constant: nothing from the request but a checked email. */
export function checkoutParams(plan: "pay" | "trial", price: string, email: string | null): Record<string, unknown> {
  return {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    // a card up front on a trial too
    payment_method_collection: "always",
    metadata: { app: "postmosis", plan },
    subscription_data: { metadata: { app: "postmosis" }, ...(plan === "trial" ? { trial_period_days: TRIAL_DAYS } : {}) },
    ...(email ? { customer_email: email } : {}),
    success_url: `${APP}/start/done?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/pricing`,
  };
}

/** Ours, not the Members Hub's: the same Stripe account sends this webhook the hub's events too. */
export const isOurs = (sub: StripeSub, price: string): boolean => (sub.items?.data ?? []).some((i) => i.price?.id === price);

const iso = (sec: number | null | undefined): string | null => (typeof sec === "number" ? new Date(sec * 1000).toISOString() : null);
const customerOf = (sub: StripeSub) => (typeof sub.customer === "string" ? { id: sub.customer, email: null } : sub.customer);

/**
 * Makes cs_subscriptions say what Stripe says about one subscription, creating the account first when a paid or
 * trialing subscription has none. Run by the webhook and by /start/done, in either order, any number of times.
 *
 * An email typed at Stripe proves nothing about who owns the inbox, so a checkout is attached to an account that
 * already exists only when that account is a customer already: this subscription created it, or it has a
 * cs_subscriptions row whose subscription no longer gives access. An account with no row (from before billing)
 * is never given one here, or a stranger could pay under its email, cancel, and paywall it. Such a checkout, and a
 * second one beside a subscription that still gives access, is HELD (cs_held_checkouts) for the owner to attach or
 * refund by hand, and gates nobody.
 *
 * Returns null when nothing is on file for it (not ours, or nothing paid yet), else the checkout's email.
 */
export async function syncSubscription(db: Db, sub: StripeSub, o: { price: string; now: number }): Promise<{ email: string; held: boolean } | null> {
  if (!isOurs(sub, o.price)) return null;
  const customer = customerOf(sub);
  const stripeEmail = (customer.email ?? "").trim().toLowerCase();
  const updated_at = new Date(o.now).toISOString();
  const existing = await db.rowBySubscription(sub.id);
  let userId = existing?.user_id ?? null;
  if (!userId) {
    if (!EMAIL.test(stripeEmail)) return null;
    // nothing paid and no trial started: no account and no row
    const grants = GRANTS.has(sub.status);
    let account = await db.accountForEmail(stripeEmail);
    if (!account) {
      if (!grants) return null;
      const made = await db.createAccount(stripeEmail, sub.id);
      // null: the other of webhook and /start/done made it a moment ago
      account = made ? { userId: made, madeBy: sub.id } : await db.accountForEmail(stripeEmail);
      if (!account) throw new Error("account neither created nor found");
    }
    const row = await db.rowByUser(account.userId);
    const reason = !row ? (account.madeBy === sub.id ? null : "account_without_subscription") : hasAccess(row, o.now) ? "second_subscription" : null;
    if (reason) {
      // kept in step with Stripe afterwards, so the owner sees whether it is still being paid for
      await db.saveHold({ stripe_subscription_id: sub.id, stripe_customer_id: customer.id, email: stripeEmail, status: sub.status, reason, updated_at });
      return grants ? { email: stripeEmail, held: true } : null;
    }
    if (!grants) return null;
    userId = account.userId;
  }
  const email = existing?.email || stripeEmail;
  await db.saveRow({
    user_id: userId,
    email,
    status: sub.status,
    stripe_customer_id: customer.id,
    stripe_subscription_id: sub.id,
    trial_end: iso(sub.trial_end),
    current_period_end: iso(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end === true,
    past_due_since: sub.status === "past_due" ? existing?.past_due_since ?? updated_at : null,
    updated_at,
  });
  return { email, held: false };
}

/** Where /start/done ends: the app's sign-in page, which emails that address its sign-in link. Never a session. */
const inboxUrl = (email: string) => `${APP}/auth?email=${encodeURIComponent(email)}&checkout=done`;

/** GET /postmosis-start?plan=pay|trial[&email=] and GET /postmosis-start/done?session_id= (public, no JWT). */
export async function handleStart(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const cfg = configOf(deps.env);
  if (!cfg) return redirect(302, `${SITE}/pricing?checkout=off`);
  const url = new URL(req.url);
  const stripe = deps.stripe(cfg.key);

  if (!/\/done\/?$/.test(url.pathname)) {
    const plan = planOf(url.searchParams.get("plan"));
    if (!plan) return redirect(302, `${SITE}/pricing`);
    const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    try {
      const session = await stripe.createCheckout(checkoutParams(plan, cfg.price, EMAIL.test(email) ? email : null));
      if (!session.url || !session.url.startsWith("https://")) throw new Error("no checkout url");
      return redirect(303, session.url);
    } catch (e) {
      console.error("postmosis-start: checkout failed", (e as { code?: string })?.code ?? "unknown");
      return redirect(302, `${SITE}/pricing?checkout=error`);
    }
  }

  const id = url.searchParams.get("session_id") ?? "";
  if (!SESSION_ID.test(id)) return redirect(302, `${SITE}/pricing`);
  let session: StripeSession;
  try {
    session = await stripe.session(id);
  } catch {
    return redirect(302, `${SITE}/pricing`);
  }
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  // the hub's sessions live in the same Stripe account: only a finished session this function made counts
  if (session.metadata?.app !== "postmosis" || session.status !== "complete" || !subId) return redirect(302, `${SITE}/pricing?checkout=pending`);
  try {
    const done = await syncSubscription(deps.db(), await stripe.subscription(subId), { price: cfg.price, now: deps.now() });
    if (!done) return redirect(302, `${SITE}/pricing?checkout=pending`);
    // the same answer whether the checkout was attached or held: the payer learns nothing about the account
    return redirect(303, inboxUrl(done.email));
  } catch (e) {
    console.error("postmosis-start: done failed", (e as { code?: string })?.code ?? (e instanceof Error ? e.message : "unknown"));
    return text(503, "Your payment went through. Your account is still being set up: reload this page in a minute.\n");
  }
}

/** The subscription an event is about, whichever API version the endpoint renders it in. */
export function subscriptionIdOf(event: StripeEvent): string | null {
  const o = event.data.object as Record<string, any>;
  const id = (v: unknown) => (typeof v === "string" ? v : v && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);
  if (event.type === "checkout.session.completed") return o.metadata?.app === "postmosis" ? id(o.subscription) : null;
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") return id(o);
  if (event.type === "invoice.payment_failed") return id(o.subscription) ?? id(o.parent?.subscription_details?.subscription);
  return null;
}

/**
 * POST /postmosis-webhook (public, no JWT: the Stripe signature is the proof). A failed read or write answers 500
 * so Stripe retries; a finished event is logged and a repeat skipped. Stripe is asked again for the subscription
 * rather than trusting the event's copy, so events arriving out of order still leave the latest state.
 */
export async function handleWebhook(req: Request, deps: Deps): Promise<Response> {
  const cfg = configOf(deps.env);
  if (!cfg) return text(503, "not configured");
  const signature = req.headers.get("stripe-signature");
  if (req.method !== "POST" || !signature) return text(400, "missing signature");
  const stripe = deps.stripe(cfg.key);
  const event = await stripe.verify(await req.text(), signature, cfg.whsec).catch(() => null);
  if (!event) return text(400, "bad signature");

  let step = "event lookup";
  try {
    const db = deps.db();
    if (await db.seen(event.id)) return text(200, "already handled");
    const subId = subscriptionIdOf(event);
    if (subId) {
      step = "subscription lookup";
      const sub = await stripe.subscription(subId);
      step = "subscription write";
      await syncSubscription(db, sub, { price: cfg.price, now: deps.now() });
    }
    step = "event log";
    await db.claim(event.id, event.type);
    return text(200, "ok");
  } catch (e) {
    console.error(`postmosis-webhook: ${step} failed`, (e as { code?: string })?.code ?? (e instanceof Error ? e.message : "unknown"));
    return text(500, `${step} failed`);
  }
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** POST /postmosis-portal (JWT on): a Stripe customer portal link for the caller's own customer, never one from the request. */
export async function handlePortal(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const cfg = configOf(deps.env);
  if (!cfg) return json({ code: "off", error: "Billing isn't available right now." }, 503);
  const uid = await deps.user!(req);
  if (!uid) return json({ error: "Sign in again." }, 401);
  try {
    const row = await deps.db().rowByUser(uid);
    if (!row?.stripe_customer_id) return json({ code: "no_subscription", error: "There's no subscription on this account." }, 404);
    const { url } = await deps.stripe(cfg.key).portal(row.stripe_customer_id, `${APP}/settings/billing`);
    return json({ url });
  } catch (e) {
    console.error("postmosis-portal failed", (e as { code?: string })?.code ?? "unknown");
    return json({ error: "Couldn't open billing. Try again in a minute." }, 500);
  }
}
