import { describe, expect, it } from "vitest";
import { MAS_QUESTION, MAS_WARN, masWarn } from "./mas";

describe("mas", () => {
  it("asks formats-skits' question word for word", () => {
    expect(MAS_QUESTION).toBe(
      "This is a script a licensed Singapore financial adviser will post on social media. Does any line promise or imply a return or result, call something guaranteed or risk-free, name an insurer or a specific policy, or tell the viewer what they personally should buy?",
    );
    expect(MAS_QUESTION).toMatch(/^[\x20-\x7e]+$/);
  });

  it("warns from 0.5 up, and says nothing when Jev gave nothing", () => {
    expect(MAS_WARN).toBe(0.5);
    expect(masWarn(0.49)).toBe(false);
    expect(masWarn(0.5)).toBe(true);
    expect(masWarn(0.93)).toBe(true);
    expect(masWarn(0)).toBe(false);
    expect(masWarn(null)).toBeNull();
    expect(masWarn(undefined)).toBeNull();
    expect(masWarn(Number.NaN)).toBeNull();
  });
});
