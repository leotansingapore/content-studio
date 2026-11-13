import { describe, expect, it } from "vitest";
import { HELD_LIMIT, handleHeld, stripeLink, testModeOf, type HeldDeps, type HeldRow } from "./logic.ts";
import { LEO_EMAILS } from "../_shared/leo.ts";

const ROW: HeldRow = {
  stripe_subscription_id: "sub_1Qa2b3C4d5",
  stripe_customer_id: "cus_9Zy8x7",
  email: "mei@example.test",
  status: "trialing",
  reason: "account_without_subscription",
  created_at: "2026-11-13T02:00:00Z",
  updated_at: "2026-11-13T02:05:00Z",
};

const post = (jwt?: string) => new Request("https://x.test/functions/v1/held-checkouts", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: "{}" });

function deps(over: Partial<HeldDeps> = {}) {
  const asked: number[] = [];
  const looked: string[][] = [];
  const d: HeldDeps = {
    email: async (jwt) => ({ leo: LEO_EMAILS[0], leo2: ` ${LEO_EMAILS[1].toUpperCase()} `, mei: "mei@example.test" })[jwt] ?? null,
    unresolved: async (limit) => {
      asked.push(limit);
      return [ROW];
    },
    onAccounts: async (ids) => {
      looked.push(ids);
      return [];
    },
    test: false,
    ...over,
  };
  return { d, asked, looked };
}

describe("held-checkouts", () => {
  it("answers the CORS preflight and refuses anything but POST", async () => {
    const { d } = deps();
    expect((await handleHeld(new Request("https://x.test", { method: "OPTIONS" }), d)).status).toBe(200);
    expect((await handleHeld(new Request("https://x.test", { method: "GET" }), d)).status).toBe(405);
  });

  it("refuses a caller with no sign-in, or one whose token reads as nobody, before reading the table", async () => {
    const { d, asked } = deps();
    expect((await handleHeld(post(), d)).status).toBe(401);
    expect((await handleHeld(post("stale"), d)).status).toBe(401);
    const thrown = deps({ email: async () => { throw new Error("auth down"); } });
    expect((await handleHeld(post("leo"), thrown.d)).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it("refuses every sign-in but Leo's two, before reading the table", async () => {
    const { d, asked } = deps();
    const res = await handleHeld(post("mei"), d);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_allowed" });
    expect(asked).toEqual([]);
  });

  it("gives Leo the unresolved rows with a link to each subscription in Stripe", async () => {
    for (const jwt of ["leo", "leo2"]) {
      const { d, asked } = deps();
      const res = await handleHeld(post(jwt), d);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toEqual({
        rows: [{ subscription: ROW.stripe_subscription_id, customer: ROW.stripe_customer_id, email: ROW.email, status: "trialing", reason: ROW.reason, at: ROW.created_at, updated: ROW.updated_at, link: "https://dashboard.stripe.com/subscriptions/sub_1Qa2b3C4d5", attached: false }],
        more: false,
        test: false,
      });
      expect(asked).toEqual([HELD_LIMIT + 1]);
    }
  });

  it("links to Stripe's test mode while the publishable key is a test one", async () => {
    const { d } = deps({ test: true });
    const body = await (await handleHeld(post("leo"), d)).json();
    expect(body.test).toBe(true);
    expect(body.rows[0].link).toBe("https://dashboard.stripe.com/test/subscriptions/sub_1Qa2b3C4d5");
    expect(stripeLink("sub_a/b?c", false)).toBe("https://dashboard.stripe.com/subscriptions/sub_a%2Fb%3Fc");
  });

  it("shows the first 200 and says there are more", async () => {
    const many = Array.from({ length: HELD_LIMIT + 1 }, (_, i) => ({ ...ROW, stripe_subscription_id: `sub_${i}` }));
    const { d } = deps({ unresolved: async () => many });
    const body = await (await handleHeld(post("leo"), d)).json();
    expect(body.rows).toHaveLength(HELD_LIMIT);
    expect(body.more).toBe(true);
  });

  it("marks a hold that billing has since put on an account, and lists it after the ones that need Leo", async () => {
    const later = { ...ROW, stripe_subscription_id: "sub_attached", created_at: "2026-11-13T03:00:00Z", reason: "second_subscription", status: "active" };
    const { d } = deps({ unresolved: async () => [later, ROW], onAccounts: async () => ["sub_attached"] });
    const body = await (await handleHeld(post("leo"), d)).json();
    expect(body.rows.map((r: { subscription: string; attached: boolean }) => [r.subscription, r.attached])).toEqual([["sub_1Qa2b3C4d5", false], ["sub_attached", true]]);
    const seen = deps();
    await handleHeld(post("leo"), seen.d);
    expect(seen.looked).toEqual([["sub_1Qa2b3C4d5"]]);
    const none = deps({ unresolved: async () => [], onAccounts: async () => { throw new Error("should not be asked"); } });
    expect((await (await handleHeld(post("leo"), none.d)).json()).rows).toEqual([]);
  });

  it("takes Stripe's mode from the secret key that makes the subscriptions, and from the publishable key only without one", () => {
    const env = (vars: Record<string, string>) => (k: string) => vars[k];
    expect(testModeOf(env({ POSTMOSIS_STRIPE_SECRET_KEY: "sk_test_abc" }), null)).toBe(true);
    expect(testModeOf(env({ POSTMOSIS_STRIPE_SECRET_KEY: "rk_test_abc" }), null)).toBe(true);
    expect(testModeOf(env({ POSTMOSIS_STRIPE_SECRET_KEY: "sk_live_abc" }), "pk_test_abcdefgh")).toBe(false);
    expect(testModeOf(env({}), "pk_test_abcdefgh")).toBe(true);
    expect(testModeOf(env({}), "pk_live_abcdefgh")).toBe(false);
    expect(testModeOf(env({}), null)).toBe(false);
  });

  it("says the read failed in plain words when the table can't be read", async () => {
    const { d } = deps({ unresolved: async () => { throw new Error("relation does not exist"); } });
    const res = await handleHeld(post("leo"), d);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "read_failed", error: "Couldn't read held payments. Try again in a minute." });
    const accounts = deps({ onAccounts: async () => { throw new Error("cs_subscriptions down"); } });
    expect((await handleHeld(post("leo"), accounts.d)).status).toBe(500);
  });
});
