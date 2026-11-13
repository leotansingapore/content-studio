import { describe, expect, it, vi } from "vitest";

const covers = vi.hoisted(() => ({ answer: true, asked: 0 }));
vi.mock("@/lib/sharedBrands", () => ({ teamCoversMe: async () => (covers.asked++, covers.answer) }));
import { billingLine, billingSummary, gateOf, paywallFor, paywallRow } from "./subscription";

const NOW = Date.parse("2026-11-12T04:00:00Z");
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe("the billing line", () => {
  it("says nothing to an account with no row, a paid-up one or a free one", () => {
    expect(billingLine(null, NOW)).toBeNull();
    expect(billingLine({ status: "active", current_period_end: at(20) }, NOW)).toBeNull();
    expect(billingLine({ status: "comp" }, NOW)).toBeNull();
  });

  it("shows a trial's days left, the charge date and the amount", () => {
    expect(billingLine({ status: "trialing", trial_end: at(6.2) }, NOW)).toEqual({ text: "7 days left in your trial. US$29 is charged on 18 November, then each month.", warn: false });
    expect(billingLine({ status: "trialing", trial_end: at(0.4) }, NOW)?.text).toBe("1 day left in your trial. US$29 is charged on 12 November, then each month.");
  });

  it("promises no charge on a trial that was cancelled", () => {
    expect(billingLine({ status: "trialing", trial_end: at(3), cancel_at_period_end: true }, NOW)?.text).toBe("3 days left in your trial. It ends on 15 November and you won't be charged.");
  });

  it("warns about a failed payment with the day access stops", () => {
    expect(billingLine({ status: "past_due", past_due_since: at(-2) }, NOW)).toEqual({ text: "Your last payment didn't go through. Update your card by 17 November to keep your studio open.", warn: true });
  });

  it("says when a cancelled plan ends", () => {
    expect(billingLine({ status: "active", cancel_at_period_end: true, current_period_end: at(10) }, NOW)?.text).toBe("Your plan ends on 22 November. You won't be charged again.");
  });
});

describe("Settings > Billing", () => {
  it("names the next charge on a paid plan, and nothing to pay with no row or a free account", () => {
    expect(billingSummary({ status: "active", current_period_end: at(20) }, NOW)).toBe("US$29 a month. Next charge on 2 December.");
    expect(billingSummary(null, NOW)).toContain("nothing to pay");
    expect(billingSummary({ status: "comp" }, NOW)).toContain("nothing to pay");
  });
});

describe("the paywall", () => {
  it("is shown only to a row with no access", () => {
    expect(gateOf(null, NOW)).toBe("open");
    expect(gateOf({ status: "active" }, NOW)).toBe("open");
    expect(gateOf({ status: "canceled" }, NOW)).toBe("paywall");
  });

  it("offers a new checkout only once the subscription has ended, and the portal otherwise", () => {
    expect(paywallFor({ status: "canceled", stripe_customer_id: "cus_1" })).toMatchObject({ action: "restart", title: "Your subscription has ended" });
    expect(paywallFor({ status: "incomplete_expired" }).action).toBe("restart");
    // still open at Stripe: a second subscription beside it could charge twice
    expect(paywallFor({ status: "past_due", stripe_customer_id: "cus_1" })).toMatchObject({ action: "portal", button: "Update your card" });
    expect(paywallFor({ status: "unpaid" }).action).toBe("portal");
    expect(paywallFor({ status: "paused" })).toMatchObject({ action: "portal", button: "Manage billing" });
  });
});

describe("an account made by an invite (docs/shared-brands.md)", () => {
  it("is told its team access ended and pointed at the plans, not at a checkout it has no customer for", () => {
    expect(paywallFor({ status: "member" })).toEqual({
      title: "Your team access has ended",
      body: "The brand you were invited to isn't shared with you any more, or its owner's plan has ended. Ask them, or start your own plan.",
      button: "See plans",
      action: "plans",
    });
  });

  it("opens while a team covers it, asking the server only for member accounts", async () => {
    covers.asked = 0;
    covers.answer = true;
    expect(await paywallRow({ status: "member" }, false)).toBeNull();
    // an invited account whose row is missing is a member too
    expect(await paywallRow(null, true)).toBeNull();
    covers.answer = false;
    expect(await paywallRow({ status: "member" }, false)).toEqual({ status: "member" });
    expect(await paywallRow(null, true)).toEqual({ status: "member" });
    expect(covers.asked).toBe(4);
    // everyone else: the row alone, as before
    expect(await paywallRow(null, false)).toBeNull();
    expect(await paywallRow({ status: "active" }, false)).toBeNull();
    expect(await paywallRow({ status: "canceled" }, true)).toEqual({ status: "canceled" });
    expect(covers.asked).toBe(4);
  });
});
