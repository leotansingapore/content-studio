import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, type Deps, type Hold, type Row, type StripeEvent, type StripeSession, type StripeSub, checkoutParams, configOf, handlePortal, handleStart, handleWebhook, subscriptionIdOf, syncSubscription } from "./billing.ts";
import { gateOf } from "./subscription.ts";

// Paid sign-up with Stripe and the database faked: what each endpoint does switched off, who gets an account,
// which checkouts are attached and which are held, and what a subscription's row ends up saying.
const NOW = Date.parse("2026-11-12T04:00:00Z");
const SEC = Math.floor(NOW / 1000);
const PRICE = "price_postmosis";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const ON = { POSTMOSIS_CHECKOUT_ON: "1", POSTMOSIS_STRIPE_SECRET_KEY: "sk_test_x", POSTMOSIS_STRIPE_WEBHOOK_SECRET: "whsec_x", POSTMOSIS_PRICE_ID: PRICE };
const INBOX = "https://app.postmosis.com/auth?email=mei%40example.test&checkout=done";

type Account = { id: string; email: string; madeBy: string | null };
const w = {
  env: {} as Record<string, string>,
  now: NOW,
  accounts: [] as Account[],
  rows: [] as Row[],
  holds: [] as Hold[],
  logged: new Map<string, string>(),
  stripeCalls: [] as string[],
  checkouts: [] as Record<string, unknown>[],
  sessions: {} as Record<string, StripeSession>,
  subs: {} as Record<string, StripeSub>,
  events: {} as Record<string, StripeEvent>,
  portals: [] as string[],
  dbCalls: 0,
  saveFails: false,
  user: null as string | null,
  // every answer a public endpoint gave in the test, for the check after each one
  publicAnswers: [] as Response[],
};

const db: Db = {
  accountForEmail: async (email) => {
    const a = w.accounts.find((x) => x.email === email);
    return a ? { userId: a.id, madeBy: a.madeBy } : null;
  },
  createAccount: async (email, madeBy) => {
    if (w.accounts.some((x) => x.email === email)) return null;
    const id = `user-${w.accounts.length + 1}`;
    w.accounts.push({ id, email, madeBy });
    return id;
  },
  rowBySubscription: async (id) => w.rows.find((r) => r.stripe_subscription_id === id) ?? null,
  rowByUser: async (id) => w.rows.find((r) => r.user_id === id) ?? null,
  rowByCustomer: async (id) => w.rows.find((r) => r.stripe_customer_id === id) ?? null,
  saveRow: async (row) => {
    if (w.saveFails) throw new Error("write failed");
    w.rows = [...w.rows.filter((r) => r.user_id !== row.user_id), row];
  },
  saveHold: async (hold) => {
    w.holds = [...w.holds.filter((h) => h.stripe_subscription_id !== hold.stripe_subscription_id), hold];
  },
  claim: async (id, type) => (w.logged.has(id) ? false : (w.logged.set(id, type), true)),
  seen: async (id) => w.logged.has(id),
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

const keep = async (r: Promise<Response>) => {
  const res = await r;
  w.publicAnswers.push(res.clone());
  return res;
};
const start = (query: string, method = "GET") => keep(handleStart(new Request(`https://x.supabase.co/functions/v1/postmosis-start${query}`, { method }), deps));
const done = (id = SESSION) => start(`/done?session_id=${id}`);
const hook = (eventKey: string, signature = "good") => keep(handleWebhook(new Request("https://x/postmosis-webhook", { method: "POST", body: eventKey, headers: { "stripe-signature": signature } }), deps));
const portal = (body: unknown = {}) => handlePortal(new Request("https://x/postmosis-portal", { method: "POST", body: JSON.stringify(body) }), deps);
const event = (key: string, type: string, object: Record<string, unknown>) => (w.events[key] = { id: `evt_${key}`, type, data: { object } });
const to = (r: Response) => r.headers.get("Location") ?? "";
const mei = (madeBy: string | null = null) => w.accounts.push({ id: "old-user", email: "mei@example.test", madeBy });

beforeEach(() => {
  Object.assign(w, { env: { ...ON }, now: NOW, accounts: [], rows: [], holds: [], logged: new Map(), stripeCalls: [], checkouts: [], sessions: { [SESSION]: session() }, subs: { sub_1: sub() }, events: {}, portals: [], dbCalls: 0, saveFails: false, user: null, publicAnswers: [] });
});

// Holding a Stripe session, or forging a webhook call, must never be a way in: whatever a test did, no answer from
// /start, /start/done or the webhook carried a token, a session or a link that signs anyone in.
afterEach(async () => {
  for (const r of w.publicAnswers) {
    const location = to(r);
    const body = await r.text();
    expect(location, "no fragment").not.toContain("#");
    expect(`${location} ${body} ${[...r.headers.keys()].join(" ")}`).not.toMatch(/token|access_|refresh_|otp|[?&]code=|\/verify|set-cookie|authorization/i);
    if (location.startsWith("https://app.postmosis.com/")) {
      const u = new URL(location);
      expect(u.pathname).toBe("/auth");
      expect([...u.searchParams.keys()].sort()).toEqual(["checkout", "email"]);
    } else if (location) {
      expect(location.startsWith("https://postmosis.com/pricing") || location.startsWith("https://checkout.stripe.com/")).toBe(true);
    }
  }
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

  it("takes no email or customer from the address", async () => {
    await start("?plan=pay&email=Mei%40Example.test&customer=cus_victim");
    expect(w.checkouts[0]).not.toHaveProperty("customer_email");
    expect(w.checkouts[0]).not.toHaveProperty("customer");
  });
});

describe("/start/done", () => {
  it("creates the account and its row, then sends the browser to the sign-in page for that inbox, signed in to nothing", async () => {
    const r = await done();
    expect(r.status).toBe(303);
    expect(to(r)).toBe(INBOX);
    expect(await r.text()).toBe("");
    expect(w.accounts).toEqual([{ id: "user-1", email: "mei@example.test", madeBy: "sub_1" }]);
    expect(w.rows).toMatchObject([{ user_id: "user-1", email: "mei@example.test", status: "trialing", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", cancel_at_period_end: false, past_due_since: null }]);
    expect(w.rows[0].trial_end).toBe(new Date((SEC + 7 * 86_400) * 1000).toISOString());
    expect(w.holds).toEqual([]);
  });

  it("gives the same answer on every visit and at any age, and makes nothing twice", async () => {
    await done();
    w.sessions[SESSION] = session({ created: SEC - 30 * 86_400 });
    expect(to(await done())).toBe(INBOX);
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
  });

  it("is in step with the webhook whichever arrives first", async () => {
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    expect((await hook("c1")).status).toBe(200);
    expect(w.accounts).toEqual([{ id: "user-1", email: "mei@example.test", madeBy: "sub_1" }]);
    expect(to(await done())).toBe(INBOX);
    expect(w.accounts).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
    expect(w.holds).toEqual([]);
  });

  it("attaches to the account this subscription created even before its row is written (the other caller got that far)", async () => {
    mei("sub_1");
    await done();
    expect(w.rows).toMatchObject([{ user_id: "old-user", stripe_subscription_id: "sub_1" }]);
    expect(w.holds).toEqual([]);
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
    expect(w.holds).toEqual([]);
  });

  it("asks for a reload when the write fails, and works on the reload", async () => {
    w.saveFails = true;
    expect((await done()).status).toBe(503);
    w.saveFails = false;
    expect(to(await done())).toBe(INBOX);
  });
});

describe("a checkout under an email that already has an account", () => {
  it("never gives an account from before billing a row: it keeps full access through the checkout and its cancellation", async () => {
    mei();
    // the payer is told nothing different
    expect(to(await done())).toBe(INBOX);
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    await hook("c1");
    expect(w.rows).toEqual([]);
    expect(gateOf((await db.rowByUser("old-user")) ?? null, NOW)).toBe("open");
    expect(w.holds).toMatchObject([{ stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", email: "mei@example.test", status: "trialing", reason: "account_without_subscription" }]);

    w.subs.sub_1 = sub({ status: "canceled" });
    event("d1", "customer.subscription.deleted", { id: "sub_1" });
    expect((await hook("d1")).status).toBe(200);
    w.subs.sub_1 = sub({ status: "past_due" });
    event("f1", "invoice.payment_failed", { subscription: "sub_1" });
    await hook("f1");
    expect(w.rows).toEqual([]);
    expect(gateOf((await db.rowByUser("old-user")) ?? null, NOW + 90 * 86_400_000)).toBe("open");
    // the held checkout follows Stripe, so the owner sees what became of it
    expect(w.holds).toMatchObject([{ stripe_subscription_id: "sub_1", status: "past_due" }]);
    expect(w.accounts).toHaveLength(1);
  });

  it("does not count an account some other subscription created as this one's", async () => {
    mei("sub_other");
    await done();
    expect(w.rows).toEqual([]);
    expect(w.holds).toMatchObject([{ reason: "account_without_subscription" }]);
  });

  it("holds a checkout under a lapsed customer's email from another Stripe customer, and leaves their row alone", async () => {
    mei("sub_first");
    const theirs: Row = { user_id: "old-user", email: "mei@example.test", status: "canceled", stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" };
    w.rows.push({ ...theirs });
    // the payer is told nothing different
    expect(to(await done())).toBe(INBOX);
    event("c1", "checkout.session.completed", { id: SESSION, metadata: { app: "postmosis" }, subscription: "sub_1" });
    await hook("c1");
    expect(w.rows).toEqual([theirs]);
    expect(w.holds).toMatchObject([{ stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", reason: "customer_mismatch" }]);
    // the owner's Billing still opens the owner's own Stripe customer
    w.user = "old-user";
    await portal();
    expect(w.portals).toEqual(["cus_first"]);
  });

  it("holds it too when the lapsed row has no Stripe customer on file", async () => {
    mei("sub_first");
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "canceled", stripe_subscription_id: "sub_first" });
    await done();
    expect(w.rows).toMatchObject([{ stripe_subscription_id: "sub_first", status: "canceled" }]);
    expect(w.holds).toMatchObject([{ reason: "customer_mismatch" }]);
  });

  it("attaches a restart by the signed-in lapsed customer: the checkout is for their own Stripe customer", async () => {
    mei("sub_first");
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "canceled", stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" });
    w.user = "old-user";
    const r = await portal({ restart: true, customer: "cus_victim" });
    expect(await r.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/x" });
    expect(w.checkouts).toEqual([{ ...checkoutParams("pay", PRICE), customer: "cus_first", cancel_url: "https://app.postmosis.com/" }]);
    expect(w.portals).toEqual([]);
    // Stripe makes the subscription under that customer, whose email they have since changed at Stripe
    w.subs.sub_1 = sub({ status: "active", customer: { id: "cus_first", email: "mei.new@example.test" } });
    expect(to(await done())).toBe(INBOX);
    expect(w.rows).toMatchObject([{ user_id: "old-user", email: "mei@example.test", status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_first" }]);
    expect(w.holds).toEqual([]);
    expect(w.accounts).toHaveLength(1);
  });

  it("restarts only a subscription Stripe has finished with", async () => {
    mei("sub_first");
    w.user = "old-user";
    for (const status of ["active", "trialing", "past_due", "unpaid"]) {
      w.rows = [{ user_id: "old-user", email: "mei@example.test", status, past_due_since: new Date(NOW - 30 * 86_400_000).toISOString(), stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" }];
      const r = await portal({ restart: true });
      expect([status, r.status, (await r.json()).code]).toEqual([status, 409, "not_ended"]);
    }
    expect(w.checkouts).toEqual([]);
  });

  it("holds a second checkout beside a subscription that still gives access, so cancelling it locks nobody out", async () => {
    mei("sub_first");
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "active", stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" });
    await done();
    w.subs.sub_1 = sub({ status: "canceled" });
    event("d1", "customer.subscription.deleted", { id: "sub_1" });
    expect((await hook("d1")).status).toBe(200);
    expect(w.rows).toMatchObject([{ stripe_subscription_id: "sub_first", status: "active" }]);
    expect(w.holds).toMatchObject([{ stripe_subscription_id: "sub_1", reason: "second_subscription", status: "canceled" }]);
  });

  it("holds a second subscription from the same Stripe customer while the first still gives access", async () => {
    mei("sub_first");
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "active", stripe_subscription_id: "sub_first", stripe_customer_id: "cus_first" });
    w.subs.sub_1 = sub({ customer: { id: "cus_first", email: "mei@example.test" } });
    await done();
    expect(w.rows).toMatchObject([{ stripe_subscription_id: "sub_first", status: "active" }]);
    expect(w.holds).toMatchObject([{ stripe_subscription_id: "sub_1", reason: "second_subscription" }]);
  });

  it("never replaces a free account's row", async () => {
    mei();
    w.rows.push({ user_id: "old-user", email: "mei@example.test", status: "comp" });
    await done();
    expect(w.rows).toMatchObject([{ status: "comp" }]);
    expect(w.holds).toMatchObject([{ reason: "second_subscription" }]);
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
    expect(w.logged.has("evt_c1")).toBe(false);
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
    // and none for a customer Stripe gives no email for
    expect(await syncSubscription(db, sub({ status: "active", customer: "cus_1" }), { price: PRICE, now: NOW })).toBeNull();
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
