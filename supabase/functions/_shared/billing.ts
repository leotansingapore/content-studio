// Postmosis paid sign-up: the three endpoints' whole behaviour, with Stripe and the database handed in, so
// billing.test.ts runs every rule with fakes. No imports but the access rules. Wiring: billingDeps.ts.
// Design, secrets, abuse cases and the go-live runbook: docs/postmosis-billing.md.

import { GRANTS, hasAccess, siteOf, type SubRow } from "./subscription.ts";

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

/**
 * The publishable key the embedded checkout page needs (POST /start/session only), or null. Anything not shaped
 * like one is treated as missing, so a secret key pasted into the wrong slot is never sent to a browser.
 */
export function publishableKeyOf(get: (k: string) => string | undefined): string | null {
  const pk = (get("POSTMOSIS_STRIPE_PUBLISHABLE_KEY") ?? "").trim();
  return /^pk_(test|live)_[A-Za-z0-9]{8,250}$/.test(pk) ? pk : null;
}

export type StripeSub = {
  id: string;
  status: string;
  customer: string | { id: string; email?: string | null };
  trial_end?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  items?: { data?: { price?: { id?: string }; current_period_end?: number | null }[] };
  metadata?: Record<string, string> | null;
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
  createCheckout(params: Record<string, unknown>): Promise<{ url?: string | null; client_secret?: string | null }>;
  session(id: string): Promise<StripeSession>;
  /** With the customer expanded. */
  subscription(id: string): Promise<StripeSub>;
  portal(customer: string, returnUrl: string): Promise<{ url: string }>;
  /** The event when the signature is good, else null. */
  verify(body: string, signature: string, whsec: string): Promise<StripeEvent | null>;
};

export type Row = SubRow & { user_id: string; email: string; stripe_subscription_id?: string | null };
export type Hold = { stripe_subscription_id: string; stripe_customer_id: string; email: string; status: string; reason: "account_without_subscription" | "second_subscription" | "customer_mismatch"; updated_at: string };
// Nothing here can mint a session, a token or a sign-in link: the public endpoints have no way to sign anyone in.
export type Db = {
  /** The account an email belongs to, and the subscription that created it (stamped at creation), if one did. */
  accountForEmail(email: string): Promise<{ userId: string; madeBy: string | null } | null>;
  /**
   * A new account stamped with the subscription that made it, and with the website typed before checkout when
   * there was one (user_metadata.postmosis_site); null when the email is already someone's.
   */
  createAccount(email: string, madeBy: string, site: string | null): Promise<string | null>;
  rowBySubscription(subscriptionId: string): Promise<Row | null>;
  rowByUser(userId: string): Promise<Row | null>;
  /** The row a Stripe customer already pays for, if any. */
  rowByCustomer(customerId: string): Promise<Row | null>;
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

/**
 * The Checkout Session for a plan. Every address is a constant, and the only thing from a request is a website
 * that passed siteOf. `customer` is set only by postmosis-portal's restart, from the signed-in caller's own row:
 * the public endpoints never set one. `embedded` is the session for the checkout page on postmosis.com, which
 * returns to /start/done exactly as the hosted one does.
 */
export function checkoutParams(plan: "pay" | "trial", price: string, o: { customer?: string | null; site?: string | null; embedded?: boolean } = {}): Record<string, unknown> {
  const { customer = null, site = null } = o;
  const done = `${APP}/start/done?session_id={CHECKOUT_SESSION_ID}`;
  return {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    // a card up front on a trial too
    payment_method_collection: "always",
    metadata: { app: "postmosis", plan, ...(site ? { site } : {}) },
    subscription_data: { metadata: { app: "postmosis", ...(site ? { site } : {}) }, ...(plan === "trial" ? { trial_period_days: TRIAL_DAYS } : {}) },
    ...(customer ? { customer } : {}),
    ...(o.embedded ? { ui_mode: "embedded", return_url: done } : { success_url: done, cancel_url: customer ? `${APP}/` : `${SITE}/pricing` }),
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
 * An email typed at Stripe proves nothing about who owns the inbox, so a checkout is attached to an existing
 * account in two cases only: (a) this subscription created the account, or (b) its Stripe customer is the one the
 * account's row already has, which only the signed-in restart (postmosis-portal) can bring about. An email match
 * is never enough, with or without a row: a stranger paying under a lapsed customer's email would otherwise put
 * their own Stripe customer on that row, and the owner's Billing page would open the stranger's portal. Everything
 * else is HELD (cs_held_checkouts) for the owner to attach or refund by hand; a hold never changes a row and
 * gates nobody. So is a second subscription beside one that still gives access.
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
  let email = existing?.email ?? "";
  if (!userId) {
    // nothing paid and no trial started: no account and no row
    const grants = GRANTS.has(sub.status);
    let reason: Hold["reason"] | null;
    // (b) found by the customer, not the email, so a customer who changed their email at Stripe still matches
    const theirs = await db.rowByCustomer(customer.id);
    if (theirs) {
      reason = hasAccess(theirs, o.now) ? "second_subscription" : null;
      userId = theirs.user_id;
      email = theirs.email;
    } else {
      if (!EMAIL.test(stripeEmail)) return null;
      let account = await db.accountForEmail(stripeEmail);
      if (!account) {
        if (!grants) return null;
        // the website typed before checkout goes on the account here and nowhere else: never onto an existing one
        const made = await db.createAccount(stripeEmail, sub.id, siteOf(sub.metadata?.site));
        // null: the other of webhook and /start/done made it a moment ago
        account = made ? { userId: made, madeBy: sub.id } : await db.accountForEmail(stripeEmail);
        if (!account) throw new Error("account neither created nor found");
      }
      const row = await db.rowByUser(account.userId);
      // (a), and only while the account has no row: a row here belongs to some other Stripe customer
      reason = row ? (hasAccess(row, o.now) ? "second_subscription" : "customer_mismatch") : account.madeBy === sub.id ? null : "account_without_subscription";
      userId = account.userId;
      email = stripeEmail;
    }
    if (reason) {
      // kept in step with Stripe afterwards, so the owner sees whether it is still being paid for
      await db.saveHold({ stripe_subscription_id: sub.id, stripe_customer_id: customer.id, email: stripeEmail || email, status: sub.status, reason, updated_at });
      return grants ? { email, held: true } : null;
    }
    if (!grants) return null;
  }
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

/** The checkout page's own origin, and a local dev server on any port. Nothing else is ever named in a CORS header. */
const ALLOWED_ORIGIN = /^(https:\/\/postmosis\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;

/**
 * POST /postmosis-start/session (public, no JWT): the embedded Checkout Session for postmosis.com/checkout. Takes
 * { plan, site? } and nothing else. Answers { clientSecret, publishableKey }, or { off: true } while checkout or
 * the publishable key is not set. Nothing of Stripe's but the client secret ever reaches the answer.
 */
async function handleSession(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const allowed = !!origin && ALLOWED_ORIGIN.test(origin);
  const answer = (body: unknown, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: {
        ...(body === null ? {} : { "Content-Type": "application/json" }),
        ...(allowed ? { "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "600" } : {}),
        Vary: "Origin",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  // another site's page is refused outright; no Origin at all is a server or curl, which CORS never guarded
  if (origin && !allowed) return answer({ error: "origin" }, 403);
  if (req.method === "OPTIONS") return answer(null, 204);
  if (req.method !== "POST") return answer({ error: "method" }, 405);
  const cfg = configOf(deps.env);
  const publishableKey = publishableKeyOf(deps.env);
  if (!cfg || !publishableKey) return answer({ off: true });
  const sent = await req.text().catch(() => "");
  let body: { plan?: unknown; site?: unknown } | null = null;
  try {
    // 2000 characters holds a plan and a 200-character site many times over
    body = sent.length <= 2000 ? JSON.parse(sent) : null;
  } catch {
    body = null;
  }
  const plan = planOf(typeof body?.plan === "string" ? body.plan : null);
  if (!plan) return answer({ error: "plan" }, 400);
  try {
    const session = await deps.stripe(cfg.key).createCheckout(checkoutParams(plan, cfg.price, { site: siteOf(body?.site), embedded: true }));
    if (typeof session.client_secret !== "string" || !session.client_secret) throw new Error("no client secret");
    return answer({ clientSecret: session.client_secret, publishableKey });
  } catch (e) {
    console.error("postmosis-start: embedded checkout failed", (e as { code?: string })?.code ?? "unknown");
    return answer({ error: "stripe" }, 502);
  }
}

/**
 * GET /postmosis-start?plan=pay|trial[&site=], GET /postmosis-start/done?session_id= and
 * POST /postmosis-start/session (public, no JWT).
 */
export async function handleStart(req: Request, deps: Deps): Promise<Response> {
  if (/\/session\/?$/.test(new URL(req.url).pathname)) return handleSession(req, deps);
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const cfg = configOf(deps.env);
  if (!cfg) return redirect(302, `${SITE}/pricing?checkout=off`);
  const url = new URL(req.url);
  const stripe = deps.stripe(cfg.key);

  if (!/\/done\/?$/.test(url.pathname)) {
    const plan = planOf(url.searchParams.get("plan"));
    if (!plan) return redirect(302, `${SITE}/pricing`);
    try {
      const session = await stripe.createCheckout(checkoutParams(plan, cfg.price, { site: siteOf(url.searchParams.get("site")) }));
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

/** Subscriptions Stripe has finished with: only these may be started again, or the old one could still charge. */
const ENDED = new Set(["canceled", "incomplete_expired"]);

/**
 * POST /postmosis-portal (JWT on). {} answers a Stripe customer portal link for the caller's own customer.
 * { restart: true } answers a new Checkout for the caller's own customer once their subscription has ended, so the
 * new subscription attaches to their row by its customer id (syncSubscription, rule b). The customer always comes
 * from the caller's row, never from the request.
 */
export async function handlePortal(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const cfg = configOf(deps.env);
  if (!cfg) return json({ code: "off", error: "Billing isn't available right now." }, 503);
  const uid = await deps.user!(req);
  if (!uid) return json({ error: "Sign in again." }, 401);
  const restart = ((await req.json().catch(() => null)) as { restart?: unknown } | null)?.restart === true;
  try {
    const row = await deps.db().rowByUser(uid);
    if (!row?.stripe_customer_id) return json({ code: "no_subscription", error: "There's no subscription on this account." }, 404);
    const stripe = deps.stripe(cfg.key);
    if (!restart) return json({ url: (await stripe.portal(row.stripe_customer_id, `${APP}/settings/billing`)).url });
    if (!ENDED.has(row.status)) return json({ code: "not_ended", error: "Your subscription is still open. Reload this page." }, 409);
    const session = await stripe.createCheckout(checkoutParams("pay", cfg.price, { customer: row.stripe_customer_id }));
    if (!session.url || !session.url.startsWith("https://")) throw new Error("no checkout url");
    return json({ url: session.url });
  } catch (e) {
    console.error("postmosis-portal failed", (e as { code?: string })?.code ?? "unknown");
    return json({ error: "Couldn't open billing. Try again in a minute." }, 500);
  }
}
