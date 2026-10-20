import { describe, expect, it } from "vitest";
import { DAILY_LIMITS, type UsageFeature } from "../../supabase/functions/_shared/usageCaps";
import { NO_PRICE, PRICES, chipText, priceOf, reasonText } from "./prices";

const price = { usd: 2.75, kind: "about" as const };

describe("the browser's price table", () => {
  it("is the functions' table: every cap priced or on NO_PRICE, never both", () => {
    for (const f of Object.keys(DAILY_LIMITS) as UsageFeature[]) {
      expect([f in PRICES, NO_PRICE.includes(f)].filter(Boolean), f).toHaveLength(1);
    }
    expect(priceOf("ai-video", { slices: [7.5, 7.5] })).toEqual(price);
  });
});

describe("chipText", () => {
  it("shows the price and what is left after this run", () => {
    expect(chipText({ price, left: 2, leo: true })).toEqual({ text: "About US$2.75 | 1 left after this", out: false });
    expect(chipText({ price, left: 1, leo: true })).toEqual({ text: "About US$2.75 | Last one today", out: false });
  });

  it("says none left at 0 and marks the run out", () => {
    expect(chipText({ price, left: 0, leo: true })).toEqual({ text: "None left today", out: true });
  });

  it("counts several uses in one run", () => {
    expect(chipText({ price: { usd: 0.06, kind: "about" }, left: 10, uses: 3, leo: true })).toEqual({
      text: "About US$0.06 | 3 uses, 7 left after this",
      out: false,
    });
    expect(chipText({ price, left: 2, uses: 3, leo: true })).toEqual({ text: "About US$2.75 | 2 left today", out: true });
  });

  it("keeps today's text for everyone but Leo", () => {
    expect(chipText({ price, left: 2, leo: false })).toEqual({ text: "2 left today", out: false });
    expect(chipText({ price, left: 0, leo: false })).toEqual({ text: "None left today", out: true });
    expect(chipText({ price, left: null, leo: false }).text).toBe("");
  });

  it("shows the price only before usage is read", () => {
    expect(chipText({ price, left: null, leo: true })).toEqual({ text: "About US$2.75", out: false });
  });

  it("asks for the options before it can price them", () => {
    expect(chipText({ price: "pick", left: 2, leo: true })).toEqual({ text: "Pick your options to see the price", out: false });
  });

  it("shows uses left only for a cap with no price", () => {
    expect(chipText({ price: null, left: 3, leo: true }).text).toBe("2 left after this");
    expect(chipText({ price: null, left: null, leo: true }).text).toBe("");
  });
});

describe("reasonText", () => {
  it("explains a disabled button", () => {
    expect(reasonText({ left: 0 })).toBe("Back at 8am Singapore time.");
    expect(reasonText({ left: 2, uses: 3 })).toBe("This needs 3 uses and 2 are left today.");
    expect(reasonText({ left: 1, uses: 3 })).toBe("This needs 3 uses and 1 is left today.");
  });

  it("says nothing while the run can go or usage is unread", () => {
    expect(reasonText({ left: 2 })).toBeNull();
    expect(reasonText({ left: 3, uses: 3 })).toBeNull();
    expect(reasonText({ left: null, uses: 3 })).toBeNull();
  });
});
