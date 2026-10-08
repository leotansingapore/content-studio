import { describe, expect, it } from "vitest";
import { CARD_SETS, cardFormulas, sanitizeIdeas } from "./hookCard";

describe("hook card formulas", () => {
  it("every set is three real, different formulas, and no formula repeats across sets", () => {
    for (let n = 0; n < CARD_SETS.length; n++) {
      const f = cardFormulas(n);
      expect(f).toHaveLength(3);
      expect(f.every((x) => x && x.template)).toBe(true);
      expect(new Set(f.map((x) => x.id)).size).toBe(3);
    }
    expect(new Set(CARD_SETS.flat()).size).toBe(CARD_SETS.length * 3);
  });
  it("goes round: the next press after the last set starts again", () => {
    expect(cardFormulas(CARD_SETS.length).map((f) => f.id)).toEqual(cardFormulas(0).map((f) => f.id));
    expect(cardFormulas(1)[0].id).toBe("myth-bust");
  });
});

describe("the reply from the server", () => {
  it("keeps 2-3 hooks and a pick that points at one", () => {
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: " One " }, { formula: "b", text: "Two" }], pick: 1 })).toEqual({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "Two" }], pick: 1 });
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "Two" }], pick: 2 })?.pick).toBeNull();
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "  " }] })).toBeNull();
    expect(sanitizeIdeas(null)).toBeNull();
  });
});
