import { beforeEach, describe, expect, it } from "vitest";
import { type Db, type Deps, type Row, type StripeEvent, type StripeSession, type StripeSub, checkoutParams, configOf, handlePortal, handleStart, handleWebhook, maySignIn, subscriptionIdOf, syncSubscription } from "./billing.ts";

// Paid sign-up with Stripe and the database faked: what each endpoint does switched off, who gets an account,
// who is signed in, and what a subscription's row ends up saying.
const NOW = Date.parse("2026-11-12T04:00:00Z");
const SEC = Math.floor(NOW / 1000);
const PRICE = "price_postmosis";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const ON = { POSTMOSIS_CHECKOUT_ON: "1", POSTMOSIS_STRIPE_SECRET_KEY: "sk_test_x", POSTMOSIS_STRIPE_WEBHOOK_SECRET: "whsec_x", POSTMOSIS_PRICE_ID: PRICE };

type Account = { id: string; email: string; checkout: string | null };
const w = {
  env: {} as Record<string, string>,
  now: NOW,
  accounts: [] as Account[],
  rows: [] as Row[],
  claimed: new Map<string, string>(),
  tokens: [] as string[],
  stripeCalls: [] as string[],
  checkouts: [] as Record<string, unknown>[],
  sessions: {} as Record<string, StripeSession>,
  subs: {} as Record<string, StripeSub>,
  events: {} as Record<string, StripeEvent>,
  portals: [] as string[],
  dbCalls: 0,
  saveFails: false,
  user: null as string | null,
};

const db: Db = {
  accountForEmail: async (email) => {
    const a = w.accounts.find((x) => x.email === email);
    return a ? { userId: a.id, checkout: a.checkout } : null;
  },
  createAccount: async (email, checkout) => {
    if (w.accounts.some((x) => x.email === email)) return null;
    const id = `user-${w.accounts.length + 1}`;
    w.accounts.push({ id, email, checkout });
    return id;
  },
  rowBySubscription: async (id) => w.rows.find((r) => r.stripe_subscription_id === id) ?? null,
  rowByUser: async (id) => w.rows.find((r) => r.user_id === id) ?? null,
  saveRow: async (row) => {
    if (w.saveFails) throw new Error("write failed");
    w.rows = [...w.rows.filter((r) => r.user_id !== row.user_id), row];
  },
  claim: async (id, type) => (w.claimed.has(id) ? false : (w.claimed.set(id, type), true)),
  seen: async (id) => w.claimed.has(id),
  signInToken: async (email) => (w.tokens.push(email), `tok-${email}`),
};
const deps: Deps = {
  env: (k) => w.env[k],
  now: () => w.now,
  db: () => (w.dbCalls++, db),
  user: async () => w.user,
  stripe: () => ({
    createCheckout: async (p) => (w.stripeCalls.push("checkout"), w.checkouts.push(p), { url: "https://checkout.stripe.com/c/pay/x" }),
    session: async (id) => {
      w.stripeCalls.push(`session ${id}`);
      if (!w.sessions[id]) throw new Error("No such checkout.session");
      return w.sessions[id];
    },
    subscription: async (id) => (w.stripeCalls.push(`sub ${id}`), w.subs[id]),
    portal: async (customer) => (w.stripeCalls.push("portal"), w.portals.push(customer), { url: "https://billing.stripe.com/p/session/x" }),
    verify: async (body, signature) => (signature === "good" ? w.events[body] ?? null : null),
  }),
};

const sub = (over: Partial<StripeSub> = {}): StripeSub => ({
  id: "sub_1",
  status: "trialing",
  customer: { id: "cus_1", email: "Mei@Example.test" },
  trial_end: SEC + 7 * 86_400,
  current_period_end: SEC + 7 * 86_400,
  cancel_at_period_end: false,
  items: { data: [{ price: { id: PRICE } }] },
  ...over,
});
const session = (over: Partial<StripeSession> = {}): StripeSession => ({ id: SESSION, status: "complete", created: SEC - 120, metadata: { app: "postmosis", plan: "trial" }, subscription: "sub_1", ...over });

const start = (query: string, method = "GET") => handleStart(new Request(`https://x.supabase.co/functions/v1/postmosis-start${query}`, { method }), deps);
const done = (id = SESSION) => start(`/done?session_id=${id}`);
const hook = (eventKey: string, signature = "good") => handleWebhook(new Request("https://x/postmosis-webhook", { method: "POST", body: eventKey, headers: { "stripe-signature": signature } }), deps);
const portal = () => handlePortal(new Request("https://x/postmosis-portal", { method: "POST" }), deps);
const event = (key: string, type: string, object: Record<string, unknown>) => (w.events[key] = { id: `evt_${key}`, type, data: { object } });
const to = (r: Response) => r.headers.get("Location") ?? "";

beforeEach(() => {
  Object.assign(w, { env: { ...ON }, now: NOW, accounts: [], rows: [], claimed: new Map(), tokens: [], stripeCalls: [], checkouts: [], sessions: { [SESSION]: session() }, subs: { sub_1: sub() }, events: {}, portals: [], dbCalls: 0, saveFails: false, user: null });
});

describe("switched off", () => {
  const offs: [string, Record<string, string>][] = [
    ["nothing set", {}],
    ["the flag missing", { ...ON, POSTMOSIS_CHECKOUT_ON: "" }],
    ["the flag set to 0", { ...ON, POSTMOSIS_CHECKOUT_ON: "0" }],
    ["no secret key", { ...ON, POSTMOSIS_STRIPE_SECRET_KEY: "" }],
    ["no webhook secret", { ...ON, POSTMOSIS_STRIPE_WEBHOOK_SECRET: "" }],
    ["no price", { ...ON, POSTMOSIS_PRICE_ID: "" }],
  ];
  for (const [name, env] of offs) {
    it(`with ${name}, every endpoint answers off and calls neither Stripe nor the database`, async () => {
      w.env = env;
      w.user = "user-1";
      event("e1", "customer.subscription.updated", { id: "sub_1" });
      expect(configOf(deps.env)).toBeNull();
      for (const r of [await start("?plan=pay"), await start("?plan=trial"), await done()]) {
        expect(r.status).toBe(302);
        expect(to(r)).toBe("https://postmosis.com/pricing?checkout=off");
      }
      expect((await hook("e1")).status).toBe(503);
      const p = await portal();
      expect(p.status).toBe(503);
      expect((await p.json()).code).toBe("off");
      expect(w.stripeCalls).toEqual([]);
      expect(w.dbCalls).toBe(0);
      expect(w.accounts).toEqual([]);
    });
  }

  it("is on with the flag and all three secrets", () => {
    expect(configOf(deps.env)).toEqual({ key: "sk_test_x", whsec: "whsec_x", price: PRICE });
  });
});

describe("/start", () => {
  it("sends pay now to a subscription checkout for the one price, with promo codes and constant return addresses", async () => {
    const r = await start("?plan=pay");
    expect(r.status).toBe(303);
    expect(to(r)).toBe("https://checkout.stripe.com/c/pay/x");
    expect(w.checkouts[0]).toEqual({
      mode: "subscription",
      line_items: [{ price: PRICE, quantity: 1 }],
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata: { app: "postmosis", plan: "pay" },
      subscription_data: { metadata: { app: "postmosis" } },
      success_url: "https://app.postmosis.com/start/done?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://postmosis.com/pricing",
    });
  });

  it("gives the 7-day trial only to plan=trial", async () => {
    await start("?plan=trial");
    expect(w.checkouts[0].subscription_data).toEqual({ metadata: { app: "postmosis" }, trial_period_days: 7 });
    expect(checkoutParams("pay", PRICE, null).subscription_data).not.toHaveProperty("trial_period_days");
  });

  it("sends any other plan back to pricing without a checkout", async () => {
    for (const q of ["", "?plan=free", "?plan=TRIAL", "?plan=trial%20"]) {
      const r = await start(q);
      expect([r.status, to(r)], q).toEqual([302, "https://postmosis.com/pricing"]);
    }
    expect((await start("?plan=pay", "POST")).status).toBe(405);
    expect(w.stripeCalls).toEqual([]);
  });

  it("fills in a well-formed email and drops anything else", async () => {
    await start("?plan=pay&email=Mei%40Example.test");
    await start("?plan=pay&email=%3Cscript%3E%40x.test");
    await start("?plan=pay&email=nope");
    expect(w.checkouts.map((c) => c.customer_email)).toEqual(["mei@example.test", undefined, undefined]);
  });
});

describe("/start/done", () => {
  it("creates the account and its row, then signs the new account in once", async () => {
    const r = await done();
    expect(r.status).toBe(303);
    expect(to(r)).toBe("https://app.postmosis.com/auth?email=mei%40example.test#token_hash=tok-mei%40example.test");
    expect(w.accounts).toEqual([{ id: "user-1", email: "mei@example.test", checkout: SESSION }]);
    expect(w.rows).toMatchObject([{ user_id: "user-1", email: "mei@example.test", status: "trialing", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", cancel_at_period_end: false, past_due_since: null }]);
    expect(w.rows[0].trial_end).toBe(new Date((SEC + 7 * 86_400) * 1000).toISOString());
  });

  it("accepts a session id once: the second visit gets the sign-in page, not a session", async () => {
    await done();
    const again = await done();
    expect(to(again)).toBe("https://app.postmosis.com/auth?email=mei%40example.test");
    expect(w.tokens).toEqual(["mei@example.test"]);
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
  });

  it("signs in only within 60 minutes of the session's creation", async () => {
    expect(maySignIn(true, SEC - 59 * 60, NOW)).toBe(true);
    expect(maySignIn(true, SEC - 60 * 60, NOW)).toBe(false);
    w.sessions[SESSION] = session({ created: SEC - 61 * 60 });
    const r = await done();
    expect(to(r)).toBe("https://app.postmosis.com/auth?email=mei%40example.test");
    expect(w.tokens).toEqual([]);
    // the account and row are still made: the emailed sign-in link works from /auth
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
  });

  it("attaches the subscription to an account that already has the email, and never signs in to it", async () => {
    w.accounts.push({ id: "old-user", email: "mei@example.test", checkout: null });
    const r = await done();
    expect(to(r)).toBe("https://app.postmosis.com/auth?email=mei%40example.test");
    expect(w.tokens).toEqual([]);
    expect(w.claimed.size).toBe(0);
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toMatchObject([{ user_id: "old-user", stripe_subscription_id: "sub_1", status: "trialing" }]);
    expect(maySignIn(false, SEC, NOW)).toBe(false);
  });

  it("does not sign in to an account an earlier checkout created", async () => {
    w.accounts.push({ id: "old-user", email: "mei@example.test", checkout: "cs_test_someOtherSession" });
    expect(to(await done())).toBe("https://app.postmosis.com/auth?email=mei%40example.test");
    expect(w.tokens).toEqual([]);
  });

  it("still signs the new account in when the webhook got there first", async () => {
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    expect((await hook("c1")).status).toBe(200);
    expect(w.accounts).toEqual([{ id: "user-1", email: "mei@example.test", checkout: SESSION }]);
    expect(to(await done())).toContain("#token_hash=");
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
  });

  it("refuses a session that is not finished, not ours, malformed or unknown, creating nothing", async () => {
    w.sessions[SESSION] = session({ status: "open" });
    expect(to(await done())).toBe("https://postmosis.com/pricing?checkout=pending");
    // a Members Hub checkout from the same Stripe account
    w.sessions[SESSION] = session({ metadata: null });
    expect(to(await done())).toBe("https://postmosis.com/pricing?checkout=pending");
    w.sessions[SESSION] = session();
    w.subs.sub_1 = sub({ items: { data: [{ price: { id: "price_hub" } }] } });
    expect(to(await done())).toBe("https://postmosis.com/pricing?checkout=pending");
    w.subs.sub_1 = sub({ status: "incomplete" });
    expect(to(await done())).toBe("https://postmosis.com/pricing?checkout=pending");
    expect(to(await done("cs_test_unknownSession123"))).toBe("https://postmosis.com/pricing");
    const calls = w.stripeCalls.length;
    for (const bad of ["", "abc", "cs_test_../../x", "sub_123456789012", "cs_test_a b"]) expect(to(await done(encodeURIComponent(bad))), bad).toBe("https://postmosis.com/pricing");
    expect(w.stripeCalls).toHaveLength(calls);
    expect(w.accounts).toEqual([]);
    expect(w.rows).toEqual([]);
    expect(w.tokens).toEqual([]);
  });

  it("asks for a reload, and uses up nothing, when the write fails", async () => {
    w.saveFails = true;
    expect((await done()).status).toBe(503);
    expect(w.claimed.size).toBe(0);
    w.saveFails = false;
    expect(to(await done())).toContain("#token_hash=");
  });
});

describe("a second checkout under an email that already has a live subscription", () => {
  it("leaves the first subscription on the row, so cancelling the second locks nobody out", async () => {
    w.accounts.push({ id: "old-user", email: "mei@example.test", checkout: null });
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "active", stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" });
    await done();
    expect(w.rows).toMatchObject([{ stripe_subscription_id: "sub_first", status: "active" }]);
    w.subs.sub_1 = sub({ status: "canceled" });
    event("d1", "customer.subscription.deleted", { id: "sub_1" });
    expect((await hook("d1")).status).toBe(200);
    expect(w.rows).toMatchObject([{ stripe_subscription_id: "sub_first", status: "active" }]);
  });

  it("replaces a row whose subscription no longer gives access", async () => {
    w.accounts.push({ id: "old-user", email: "mei@example.test", checkout: null });
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "canceled", stripe_subscription_id: "sub_first" });
    await done();
    expect(w.rows).toMatchObject([{ user_id: "old-user", stripe_subscription_id: "sub_1", status: "trialing" }]);
  });

  it("never replaces a free account's row", async () => {
    w.accounts.push({ id: "old-user", email: "mei@example.test", checkout: null });
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "comp" });
    await done();
    expect(w.rows).toMatchObject([{ status: "comp" }]);
  });
});

describe("the webhook", () => {
  it("refuses a missing or bad signature before touching anything", async () => {
    event("e1", "customer.subscription.updated", { id: "sub_1" });
    expect((await hook("e1", "forged")).status).toBe(400);
    expect((await handleWebhook(new Request("https://x/postmosis-webhook", { method: "POST", body: "e1" }), deps)).status).toBe(400);
    expect(w.dbCalls).toBe(0);
    expect(w.rows).toEqual([]);
  });

  it("follows the subscription through a failed payment, recovery and cancellation, reading Stripe each time", async () => {
    await done();
    w.subs.sub_1 = sub({ status: "past_due" });
    // the event's own copy says active: Stripe's current answer wins
    event("f1", "invoice.payment_failed", { id: "in_1", subscription: "sub_1", status: "active" });
    expect((await hook("f1")).status).toBe(200);
    expect(w.rows[0]).toMatchObject({ status: "past_due", past_due_since: new Date(NOW).toISOString() });

    w.now = NOW + 3 * 86_400_000;
    event("u1", "customer.subscription.updated", { id: "sub_1" });
    await hook("u1");
    // the grace period still counts from the first failure
    expect(w.rows[0]).toMatchObject({ status: "past_due", past_due_since: new Date(NOW).toISOString() });

    w.subs.sub_1 = sub({ status: "active", cancel_at_period_end: true });
    event("u2", "customer.subscription.updated", { id: "sub_1" });
    await hook("u2");
    expect(w.rows[0]).toMatchObject({ status: "active", past_due_since: null, cancel_at_period_end: true });

    w.subs.sub_1 = sub({ status: "canceled" });
    event("d1", "customer.subscription.deleted", { id: "sub_1" });
    await hook("d1");
    expect(w.rows[0]).toMatchObject({ status: "canceled", user_id: "user-1" });
    expect(w.accounts).toHaveLength(1);
  });

  it("handles an event once", async () => {
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    await hook("c1");
    const calls = w.stripeCalls.length;
    const again = await hook("c1");
    expect([again.status, await again.text()]).toEqual([200, "already handled"]);
    expect(w.stripeCalls).toHaveLength(calls);
  });

  it("answers 500 and leaves the event unlogged when a write fails, so Stripe sends it again", async () => {
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    w.saveFails = true;
    expect((await hook("c1")).status).toBe(500);
    expect(w.claimed.has("evt_c1")).toBe(false);
    w.saveFails = false;
    expect((await hook("c1")).status).toBe(200);
    expect(w.rows).toHaveLength(1);
  });

  it("skips the Members Hub's events from the same Stripe account", async () => {
    w.subs.sub_hub = sub({ id: "sub_hub", items: { data: [{ price: { id: "price_hub" } }] } });
    event("h1", "checkout.session.completed", { id: "cs_test_hubSession1234", client_reference_id: "someone", subscription: "sub_hub" });
    event("h2", "customer.subscription.updated", { id: "sub_hub" });
    expect((await hook("h1")).status).toBe(200);
    expect((await hook("h2")).status).toBe(200);
    expect(w.stripeCalls).toEqual(["sub sub_hub"]);
    expect(w.accounts).toEqual([]);
    expect(w.rows).toEqual([]);
  });

  it("creates no account for a subscription that was never paid", async () => {
    w.subs.sub_1 = sub({ status: "incomplete_expired" });
    event("u1", "customer.subscription.updated", { id: "sub_1" });
    expect((await hook("u1")).status).toBe(200);
    expect(w.accounts).toEqual([]);
    expect(await syncSubscription(db, sub({ status: "active", customer: "cus_1" }), { price: PRICE, sessionId: null, now: NOW })).toBeNull();
  });

  it("finds the subscription in each event it listens for, and in no other", () => {
    const of = (type: string, object: Record<string, unknown>) => subscriptionIdOf({ id: "evt", type, data: { object } });
    expect(of("invoice.payment_failed", { subscription: "sub_9" })).toBe("sub_9");
    expect(of("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_9" } } })).toBe("sub_9");
    expect(of("customer.subscription.deleted", { id: "sub_9" })).toBe("sub_9");
    expect(of("checkout.session.completed", { metadata: { app: "postmosis" }, subscription: { id: "sub_9" } })).toBe("sub_9");
    expect(of("checkout.session.completed", { subscription: "sub_9" })).toBeNull();
    expect(of("invoice.paid", { subscription: "sub_9" })).toBeNull();
  });
});

describe("the billing portal", () => {
  it("opens the caller's own Stripe customer, whatever the request says", async () => {
    await done();
    w.user = "user-1";
    const r = await handlePortal(new Request("https://x/postmosis-portal", { method: "POST", body: JSON.stringify({ customer: "cus_victim" }) }), deps);
    expect(await r.json()).toEqual({ url: "https://billing.stripe.com/p/session/x" });
    expect(w.portals).toEqual(["cus_1"]);
  });

  it("refuses a signed-out caller and an account with no subscription", async () => {
    expect((await portal()).status).toBe(401);
    w.user = "someone-else";
    expect((await portal()).status).toBe(404);
    expect(w.portals).toEqual([]);
  });
});
