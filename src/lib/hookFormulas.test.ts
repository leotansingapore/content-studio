import { describe, expect, it } from "vitest";
import { HOOK_FORMULAS, HOOKS_PER_SET, formulaOfHook, hookFormula, hookFormulaFields, hookFormulaSet, provenFormulas, provenOpen } from "@/lib/hookFormulas";

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

  // live-p7a D9: Try new hooks on ActivityTracker wrote "After [your years] as a financial consultant, here's what
  // nobody tells you..." from Insider view's adviser shape and example
  it("asks a business brand's hooks as the business, never in an adviser's trade", () => {
    const base = { ideaContext: "Client chats in one app.", styleReference: "Plain." };
    for (const f of HOOK_FORMULAS) {
      expect(hookFormulaFields(f, base, "person"), f.id).toEqual(hookFormulaFields(f, base));
      const biz = hookFormulaFields(f, base, "business").styleReference;
      expect(biz, f.id).toContain("Write as the business: we, us or its name, never I, me or my.");
      expect(biz, f.id).not.toMatch(/financial consultant|years as \{role\}|insurers/i);
      expect(biz, f.id).toMatch(/^[\x20-\x7e\n]*$/);
    }
    const insider = hookFormulaFields(hookFormula("insider")!, {}, "business").styleReference;
    expect(insider).toContain("Shape: What nobody tells you about {topic}, from {what the business sees up close}.");
    expect(insider).not.toMatch(/\{N\}|years/);
  });
});

describe("formulaOfHook", () => {
  const rows = [
    { text: "  I reviewed 40 families.  ", formula: "number-reveal" },
    { text: "Low pay is not why fresh grads can't save.", formula: "myth-bust" },
    { text: "A hook from an old row", formula: "gone" },
  ];

  it("finds the formula the chosen hook was written with", () => {
    expect(formulaOfHook("I reviewed 40 families.", rows)?.name).toBe("Number reveal");
  });

  it("knows none for a hook that was typed, picked without a formula or names an old id", () => {
    expect(formulaOfHook("My own hook", rows)).toBeUndefined();
    expect(formulaOfHook("A hook from an old row", rows)).toBeUndefined();
    expect(formulaOfHook("", [{ text: "", formula: "list" }])).toBeUndefined();
  });
});

describe("proven formulas", () => {
  const line = (formula: string, ratio: number, from = "@a") => ({ formula, ratio, from, text: `${formula} ${ratio}` });

  it("ranks formulas by lines at their usual or better, then by the best ratio, each with its best line", () => {
    const bank = {
      hooks: [
        line("myth-bust", 1.2), line("myth-bust", 2.0, "@best"), line("myth-bust", 1.1),
        line("contrarian", 9.0), line("contrarian", 1.0),
        line("number-reveal", 3.0), line("number-reveal", 1.5),
        line("mistake", 4.0),
      ],
    };
    const got = provenFormulas(bank, 3);
    expect(got.map((p) => p.formula.id)).toEqual(["myth-bust", "contrarian", "number-reveal"]);
    expect(got[0].line.from).toBe("@best");
    expect(got[1].line.ratio).toBe(9);
    expect(provenFormulas(bank, 4).map((p) => p.formula.id)).toEqual(["myth-bust", "contrarian", "number-reveal", "mistake"]);
  });

  it("counts only lines at ratio 1.0 or more and real formula ids", () => {
    const bank = { hooks: [line("mistake", 0.9), line("mistake", 0.5), line("made-up", 5), line("contrarian", 1.0)] };
    expect(provenFormulas(bank).map((p) => p.formula.id)).toEqual(["contrarian"]);
  });

  it("returns fewer than n when the bank is thin, and the pill stays off under 3 formulas", () => {
    expect(provenFormulas({ hooks: [] })).toEqual([]);
    const two = { hooks: [line("myth-bust", 2), line("contrarian", 2), line("contrarian", 3)] };
    expect(provenFormulas(two)).toHaveLength(2);
    expect(provenOpen(two)).toBe(false);
    expect(provenOpen({ hooks: [...two.hooks, line("mistake", 0.99)] })).toBe(false);
    expect(provenOpen({ hooks: [...two.hooks, line("mistake", 1)] })).toBe(true);
    expect(HOOKS_PER_SET).toBe(3);
  });
});
