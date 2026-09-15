import { describe, expect, it } from "vitest";
import { checkoutStatus, subscriptionStatus } from "./membership";

describe("checkoutStatus", () => {
  it("grants access for a paid or trialing subscription", () => {
    expect(checkoutStatus("active", null)).toBe("active");
    expect(checkoutStatus("trialing", "canceled")).toBe("active");
  });

  it("grants nothing for an unpaid checkout and downgrades no one", () => {
    expect(checkoutStatus("incomplete", null)).toBe("none");
    expect(checkoutStatus("incomplete", "canceled")).toBe("canceled");
    expect(checkoutStatus("incomplete", "active")).toBe("active");
  });

  it("keeps a client a client", () => {
    expect(checkoutStatus("active", "client")).toBe("client");
  });
});

describe("subscriptionStatus", () => {
  it("follows Stripe for paying members", () => {
    expect(subscriptionStatus("active", "canceled")).toBe("active");
    expect(subscriptionStatus("past_due", "active")).toBe("canceled");
    expect(subscriptionStatus("canceled", "active")).toBe("canceled");
  });

  it("never downgrades a client", () => {
    expect(subscriptionStatus("canceled", "client")).toBe("client");
  });
});
