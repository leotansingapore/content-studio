import { describe, expect, it } from "vitest";
import { HOOK_FORMULAS, HOOKS_PER_SET, hookFormula, hookFormulaFields, hookFormulaSet } from "@/lib/hookFormulas";

describe("hook formulas", () => {
  it("has 21 formulas with unique ids and every field filled", () => {
    expect(HOOK_FORMULAS).toHaveLength(21);
    expect(new Set(HOOK_FORMULAS.map((f) => f.id)).size).toBe(21);
    for (const f of HOOK_FORMULAS) {
      for (const v of [f.id, f.name, f.template, f.example, f.bestFor, f.trap]) expect(v.trim()).not.toBe("");
    }
  });

  it("keeps the wording plain ASCII and compliant", () => {
    const all = JSON.stringify(HOOK_FORMULAS);
    expect(all).toMatch(/^[\x20-\x7e]*$/);
    expect(all).not.toMatch(/guarantee|returns? of \d|AIA|Prudential|Great Eastern|Income Insurance|Manulife/i);
  });

  it("gives three different formulas per set and no repeats until the list runs out", () => {
    const seen: string[] = [];
    for (let n = 0; n < 7; n++) {
      const set = hookFormulaSet(n);
      expect(set).toHaveLength(HOOKS_PER_SET);
      expect(new Set(set.map((f) => f.id)).size).toBe(HOOKS_PER_SET);
      seen.push(...set.map((f) => f.id));
    }
    expect(new Set(seen).size).toBe(21);
    expect(hookFormulaSet(7)).toEqual(hookFormulaSet(0));
    expect(hookFormulaSet(-1)).toEqual(hookFormulaSet(6));
  });

  it("finds a formula by id and ignores unknown ones", () => {
    expect(hookFormula("myth-bust")?.name).toBe("Myth bust");
    expect(hookFormula("nope")).toBeUndefined();
    expect(hookFormula(undefined)).toBeUndefined();
  });

  it("puts the formula after the brief's own context and style reference", () => {
    const f = hookFormula("myth-bust")!;
    const out = hookFormulaFields(f, { ideaContext: "Client asked about CPF.", styleReference: "Match this vibe." });
    expect(out.ideaContext).toBe("Client asked about CPF.\n\nHook formula: Myth bust. Follow the formula in the style reference.");
    expect(out.styleReference.startsWith("Match this vibe.\nWrite this hook with the \"Myth bust\" formula. It overrides")).toBe(true);
    expect(out.styleReference).toContain(`Shape: ${f.template}`);
    expect(out.styleReference).toContain(`Avoid this trap: ${f.trap}`);
    expect(out.styleReference).toContain("No promised or guaranteed returns");
    const bare = hookFormulaFields(f, {});
    expect(bare.ideaContext).toBe("Hook formula: Myth bust. Follow the formula in the style reference.");
    expect(bare.styleReference.startsWith("Write this hook")).toBe(true);
  });
});
