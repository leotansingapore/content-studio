import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The Members Hub checkout: nothing reaches Stripe until both Stripe secrets are set and a signed-in user calls,
// and the session is always for that user (their own customer, or their email when they have none yet).
const MEI = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const TAN = "11111111-2222-4333-8444-555555555555";

const h = vi.hoisted(() => ({
  handler: null as null | ((r: Request) => Promise<Response>),
  sessions: [] as Record<string, unknown>[],
  stripeKeys: [] as string[],
  reads: [] as unknown[][],
  members: [] as { user_id: string; stripe_customer_id: string | null }[],
  users: {} as Record<string, { id: string; email: string }>,
}));
vi.mock("npm:@supabase/supabase-js@2", () => ({
  createClient: (_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) => ({
    // the anon client answers for the bearer it was made with; the service client reads hub_memberships
    auth: { getUser: async () => ({ data: { user: h.users[(opts?.global?.headers?.Authorization ?? "").replace(/^Bearer /, "")] ?? null } }) },
    from: (t: string) => {
      const where: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (where.push([c, v]), h.reads.push([key, t, c, v]), q),
        maybeSingle: async () => ({ data: h.members.find((m) => where.every(([c, v]) => (m as Record<string, unknown>)[c] === v)) ?? null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("npm:stripe@16", () => ({
  default: class {
    constructor(key: string) {
      h.stripeKeys.push(key);
    }
    checkout = { sessions: { create: async (p: Record<string, unknown>) => (h.sessions.push(p), { url: "https://checkout.stripe.test/c/s1" }) } };
  },
}));

const env: Record<string, string | undefined> = {};
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.sessions.length = 0;
  h.stripeKeys.length = 0;
  h.reads.length = 0;
  h.members.length = 0;
  h.users = { "mei-jwt": { id: MEI, email: "mei@example.test" } };
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test_x", HUB_PRICE_ID: "price_hub" });
});

const checkout = (jwt?: string, origin = "https://app.postmosis.com") =>
  h.handler!(new Request("http://x/hub-checkout", { method: "POST", headers: { origin, ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) } }));

describe("the Members Hub checkout", () => {
  it("says payments aren't set up, and calls nobody, until both Stripe secrets are set", async () => {
    for (const unset of [{ STRIPE_SECRET_KEY: undefined }, { HUB_PRICE_ID: undefined }, { STRIPE_SECRET_KEY: "" }, { HUB_PRICE_ID: "" }]) {
      Object.assign(env, { STRIPE_SECRET_KEY: "sk_test_x", HUB_PRICE_ID: "price_hub" }, unset);
      const r = await checkout("mei-jwt");
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: "payments-not-configured" });
    }
    expect(h.stripeKeys).toEqual([]);
    expect(h.reads).toEqual([]);
  });

  it("opens no checkout without a signed-in user", async () => {
    for (const jwt of [undefined, "someone-elses-expired-jwt"]) {
      const r = await checkout(jwt);
      expect(r.status).toBe(401);
    }
    expect(h.sessions).toEqual([]);
    expect(h.reads).toEqual([]);
  });

  it("opens a one-seat subscription for a first-time member under their own id and email", async () => {
    h.members.push({ user_id: TAN, stripe_customer_id: "cus_tan" });
    const r = await checkout("mei-jwt");
    expect(await r.json()).toEqual({ url: "https://checkout.stripe.test/c/s1" });
    expect(h.sessions).toEqual([
      {
        mode: "subscription",
        line_items: [{ price: "price_hub", quantity: 1 }],
        customer: undefined,
        customer_email: "mei@example.test",
        client_reference_id: MEI,
        success_url: "https://app.postmosis.com/hub?checkout=success",
        cancel_url: "https://app.postmosis.com/hub?checkout=cancel",
      },
    ]);
    // the membership is read with the service key, for this user only
    expect(h.reads).toEqual([["service", "hub_memberships", "user_id", MEI]]);
  });

  it("reuses a returning member's own Stripe customer, never someone else's", async () => {
    h.members.push({ user_id: TAN, stripe_customer_id: "cus_tan" }, { user_id: MEI, stripe_customer_id: "cus_mei" });
    await checkout("mei-jwt");
    expect(h.sessions[0]).toMatchObject({ customer: "cus_mei", customer_email: undefined, client_reference_id: MEI });
  });
});
