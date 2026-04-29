// Compliance regex set for SG insurance / MAS-style marketing rules.
// Static, ASCII-only, additive. Severity = "warn" surfaces an amber chip;
// severity = "error" surfaces a red chip + a small "!" badge on the Copy
// button. Nothing here blocks copy - the guardrail is informational only.

export type ComplianceSeverity = "warn" | "error";

export interface ComplianceRule {
  id: string;
  pattern: RegExp;
  severity: ComplianceSeverity;
  message: string;
}

export const COMPLIANCE_FLAGS: ComplianceRule[] = [
  {
    id: "guarantee",
    pattern: /\b(guaranteed?|guarantee[ds]?)\b/i,
    severity: "warn",
    message:
      "'Guarantee' is a regulated word in SG insurance / investment marketing - use 'projected' or 'expected' for non-guaranteed components.",
  },
  {
    id: "risk-free",
    pattern: /\b(risk[-\s]?free|no\s+risk)\b/i,
    severity: "error",
    message: "'Risk-free' is non-compliant for any market-linked product.",
  },
  {
    id: "100-safe",
    pattern: /\b(100%|completely)\s+(safe|secure)\b/i,
    severity: "error",
    message: "'100% safe / secure' breaches MAS advertising rules.",
  },
  {
    id: "best-superlative",
    pattern: /\b(best|number\s*one|#1)\s+(insurance|policy|plan|fund|product)/i,
    severity: "warn",
    message:
      "Superlatives like 'best' / 'number one' need substantiation. Reword or remove.",
  },
  {
    id: "aia-best",
    pattern: /\bAIA\s+is\s+the\s+best/i,
    severity: "error",
    message: "Direct brand-superlative claims are non-compliant.",
  },
  {
    id: "specific-return",
    pattern: /\b(\d+%\s+(return|p\.a\.|annual)|\d+%\s+(rate|interest))\b/i,
    severity: "warn",
    message:
      "Specific return numbers must be substantiated and labelled (illustrated / projected / past). Add the qualifier.",
  },
  {
    id: "easy-money",
    pattern: /\b(easy|guaranteed|sure)\s+(money|profit|win)/i,
    severity: "error",
    message: "'Easy money / guaranteed profit' is non-compliant promotion.",
  },
  {
    id: "act-now",
    pattern: /\bact\s+(now|today)\b/i,
    severity: "warn",
    message:
      "'Act now' high-pressure language can fall foul of fair-dealing rules.",
  },
];

export interface ComplianceFlag {
  id: string;
  ruleId: string;
  severity: ComplianceSeverity;
  message: string;
  match: string;
}

export function scanCompliance(text: string): ComplianceFlag[] {
  if (!text || typeof text !== "string") return [];
  const flags: ComplianceFlag[] = [];
  const seen = new Set<string>();
  for (const rule of COMPLIANCE_FLAGS) {
    const m = text.match(rule.pattern);
    if (!m) continue;
    const matched = m[0];
    const dedupeKey = `${rule.id}::${matched.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    flags.push({
      id: dedupeKey,
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      match: matched,
    });
  }
  return flags;
}

export function hasComplianceErrors(flags: ComplianceFlag[]): boolean {
  return flags.some((f) => f.severity === "error");
}
