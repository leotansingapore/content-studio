import { describe, expect, it } from "vitest";
import { COMPLIANCE_FLAGS, hasComplianceErrors, scanCompliance } from "../../../src/lib/compliance.ts";
import { complianceIssues } from "./socialAudit.ts";

// Pin, written on the code before the rules moved to _shared/compliance.ts:
// what every importer gets today through its own door, src/lib/compliance.ts
// for the app and socialAudit's complianceIssues for the edge functions.
// Never update these by hand to make a change pass.

type Pin = {
  text: string;
  /** scanCompliance(text) as [ruleId, severity, match, id], in order. */
  flags: [string, "warn" | "error", string, string][];
  errors: boolean;
  /** complianceIssues(text). */
  issues: string[];
};

// The first 12 are the sample texts (the MAS question's phrases among them:
// a promised return, guaranteed, risk-free, an insurer, a policy, "you should
// buy"); the rest are edges of the patterns as they read today.
const PINS: Pin[] = [
  {
    text: "Guaranteed returns of 8% p.a. with zero risk.",
    flags: [["guarantee", "warn", "Guaranteed", "guarantee::guaranteed"]],
    errors: false,
    issues: ["guarantee"],
  },
  {
    text: "This plan is risk-free and 100% safe. Act now!",
    flags: [
      ["risk-free", "error", "risk-free", "risk-free::risk-free"],
      ["100-safe", "error", "100% safe", "100-safe::100% safe"],
      ["act-now", "warn", "Act now", "act-now::act now"],
    ],
    errors: true,
    issues: ["risk-free", "100-safe", "act-now"],
  },
  {
    text: "AIA is the best insurer in Singapore, and the best insurance you can buy.",
    flags: [
      ["best-superlative", "warn", "best insurance", "best-superlative::best insurance"],
      ["aia-best", "error", "AIA is the best", "aia-best::aia is the best"],
    ],
    errors: true,
    issues: ["best-superlative", "aia-best"],
  },
  {
    text: "Easy money: earn a 5% return every year, guaranteed.",
    flags: [
      ["guarantee", "warn", "guaranteed", "guarantee::guaranteed"],
      ["specific-return", "warn", "5% return", "specific-return::5% return"],
      ["easy-money", "error", "Easy money", "easy-money::easy money"],
    ],
    errors: true,
    issues: ["guarantee", "specific-return", "easy-money"],
  },
  {
    text: "Build a 3 to 6 month emergency fund before you invest.",
    flags: [],
    errors: false,
    issues: [],
  },
  {
    text: "Guaranteed, guaranteed, GUARANTEED.",
    flags: [["guarantee", "warn", "Guaranteed", "guarantee::guaranteed"]],
    errors: false,
    issues: ["guarantee"],
  },
  {
    text: "You should buy this whole life policy; it pays a 4% annual bonus.",
    flags: [["specific-return", "warn", "4% annual", "specific-return::4% annual"]],
    errors: false,
    issues: ["specific-return"],
  },
  {
    text: "No risk, no worries: the number one fund for retirees.",
    flags: [
      ["risk-free", "error", "No risk", "risk-free::no risk"],
      ["best-superlative", "warn", "number one fund", "best-superlative::number one fund"],
    ],
    errors: true,
    issues: ["risk-free", "best-superlative"],
  },
  {
    text: "Completely secure savings with a 3% interest rate. Sure profit.",
    flags: [
      ["100-safe", "error", "Completely secure", "100-safe::completely secure"],
      ["specific-return", "warn", "3% interest", "specific-return::3% interest"],
      ["easy-money", "error", "Sure profit", "easy-money::sure profit"],
    ],
    errors: true,
    issues: ["100-safe", "specific-return", "easy-money"],
  },
  {
    text: "#1 policy for families. Act today before prices rise, the #1 plan.",
    flags: [["act-now", "warn", "Act today", "act-now::act today"]],
    errors: false,
    issues: ["act-now"],
  },
  {
    text: "Projected, not guaranteed. Past results are not a promise. 2.5% rate illustrated.",
    flags: [
      ["guarantee", "warn", "guaranteed", "guarantee::guaranteed"],
      ["specific-return", "warn", "5% rate", "specific-return::5% rate"],
    ],
    errors: false,
    issues: ["guarantee", "specific-return"],
  },
  {
    text: "Risk free? No such thing.\nAsk me how a riskfree-sounding plan works, and why there is no-risk in nothing.",
    flags: [["risk-free", "error", "Risk free", "risk-free::risk free"]],
    errors: true,
    issues: ["risk-free"],
  },
  { text: "", flags: [], errors: false, issues: [] },
  {
    text: "Act nowhere near the guarantees we skip.",
    flags: [["guarantee", "warn", "guarantees", "guarantee::guarantees"]],
    errors: false,
    issues: ["guarantee"],
  },
  {
    text: "A riskless plan with no-risk wording and RISK-FREE caps.",
    flags: [["risk-free", "error", "RISK-FREE", "risk-free::risk-free"]],
    errors: true,
    issues: ["risk-free"],
  },
  {
    text: "The best plan ever, and the best fund too.",
    flags: [["best-superlative", "warn", "best plan", "best-superlative::best plan"]],
    errors: false,
    issues: ["best-superlative"],
  },
  { text: "Prudential and Great Eastern policies, compared.", flags: [], errors: false, issues: [] },
  {
    text: "This is 100%  secure and completely safe.",
    flags: [["100-safe", "error", "100%  secure", "100-safe::100%  secure"]],
    errors: true,
    issues: ["100-safe"],
  },
  {
    text: "Earn 12% annually, or 7%rate, or 9% p.a.x",
    flags: [["specific-return", "warn", "9% p.a.", "specific-return::9% p.a."]],
    errors: false,
    issues: ["specific-return"],
  },
];

const MESSAGES: Record<string, string> = {
  guarantee:
    "'Guarantee' is a regulated word in SG insurance / investment marketing - use 'projected' or 'expected' for non-guaranteed components.",
  "risk-free": "'Risk-free' is non-compliant for any market-linked product.",
  "100-safe": "'100% safe / secure' breaches MAS advertising rules.",
  "best-superlative": "Superlatives like 'best' / 'number one' need substantiation. Reword or remove.",
  "aia-best": "Direct brand-superlative claims are non-compliant.",
  "specific-return":
    "Specific return numbers must be substantiated and labelled (illustrated / projected / past). Add the qualifier.",
  "easy-money": "'Easy money / guaranteed profit' is non-compliant promotion.",
  "act-now": "'Act now' high-pressure language can fall foul of fair-dealing rules.",
};

describe("compliance pin (today's outputs)", () => {
  it("keeps the eight rules in today's order", () => {
    expect(COMPLIANCE_FLAGS.map((r) => r.id)).toEqual([
      "guarantee",
      "risk-free",
      "100-safe",
      "best-superlative",
      "aia-best",
      "specific-return",
      "easy-money",
      "act-now",
    ]);
  });

  it.each(PINS)("scanCompliance and hasComplianceErrors on %#", (pin) => {
    const flags = scanCompliance(pin.text);
    expect(flags.map((f) => [f.ruleId, f.severity, f.match, f.id])).toEqual(pin.flags);
    expect(flags.map((f) => f.message)).toEqual(pin.flags.map(([ruleId]) => MESSAGES[ruleId]));
    expect(hasComplianceErrors(flags)).toBe(pin.errors);
  });

  it.each(PINS)("complianceIssues on %#", (pin) => {
    expect(complianceIssues(pin.text)).toEqual(pin.issues);
  });

  it("gives nothing for input that is not a string", () => {
    for (const v of [null, undefined, 42, { a: 1 }]) expect(scanCompliance(v as unknown as string)).toEqual([]);
  });
});
