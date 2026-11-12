import { describe, expect, it } from "vitest";
import { GRACE_DAYS, daysLeft, gateOf, graceEnds, hasAccess } from "./subscription.ts";

const NOW = Date.parse("2026-11-12T04:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("who a subscription lets in", () => {
  it("opens the studio on a trial, a paid month and a free account", () => {
    for (const status of ["trialing", "active", "comp"]) expect(hasAccess({ status }, NOW), status).toBe(true);
  });

  it("closes it once cancelled, unpaid, never paid, paused, or on a status it does not know", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "", "ACTIVE", "something_new"]) {
      expect(hasAccess({ status }, NOW), status).toBe(false);
    }
  });

  it("keeps a failed payment in for the grace period, counted from when it failed, and not a day longer", () => {
    expect(GRACE_DAYS).toBe(7);
    expect(hasAccess({ status: "past_due", past_due_since: ago(0) }, NOW)).toBe(true);
    expect(hasAccess({ status: "past_due", past_due_since: ago(6.9) }, NOW)).toBe(true);
    expect(hasAccess({ status: "past_due", past_due_since: ago(7) }, NOW)).toBe(false);
    expect(hasAccess({ status: "past_due", past_due_since: ago(30) }, NOW)).toBe(false);
    expect(graceEnds({ status: "past_due", past_due_since: ago(1) })).toBe(NOW + 6 * DAY);
    expect(graceEnds({ status: "active", past_due_since: ago(1) })).toBeNull();
  });

  it("gives a failed payment with no start on file no grace", () => {
    expect(hasAccess({ status: "past_due" }, NOW)).toBe(false);
    expect(hasAccess({ status: "past_due", past_due_since: "not a date" }, NOW)).toBe(false);
  });
});

describe("the app's gate", () => {
  it("never gates an account with no row (from before billing, or a lookup that failed)", () => {
    expect(gateOf(null, NOW)).toBe("open");
  });

  it("shows the paywall only to a row with no access", () => {
    expect(gateOf({ status: "trialing" }, NOW)).toBe("open");
    expect(gateOf({ status: "past_due", past_due_since: ago(2) }, NOW)).toBe("open");
    expect(gateOf({ status: "canceled" }, NOW)).toBe("paywall");
    expect(gateOf({ status: "past_due", past_due_since: ago(8) }, NOW)).toBe("paywall");
  });
});

describe("days left", () => {
  it("rounds up to whole days and never goes below 0", () => {
    expect(daysLeft(new Date(NOW + 6.2 * DAY).toISOString(), NOW)).toBe(7);
    expect(daysLeft(new Date(NOW + 1000).toISOString(), NOW)).toBe(1);
    expect(daysLeft(ago(3), NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
  });
});
