// Creators' niche filter: the ~65 raw niche tags in advisors.json folded into a few parent
// topics, so the filter is 8 chips instead of a wall. nicheGroups.test.ts fails when a new
// niche lands in the data without a parent here.
export const NICHE_GROUPS: { label: string; niches: string[] }[] = [
  { label: "Insurance", niches: ["insurance", "critical-illness", "protection", "small-business-insurance"] },
  {
    label: "Investing",
    niches: ["investing", "investing-basics", "investments", "etfs", "reits", "sg-stocks", "value-investing", "quant", "permanent-portfolio", "macro", "market-commentary"],
  },
  {
    label: "Wealth and estate planning",
    niches: ["financial-planning", "wealth-planning", "wealth-management", "wealth-accumulation", "long-term-wealth", "wealth-philosophy", "estate-planning", "legacy-planning", "fee-only-advice"],
  },
  { label: "CPF and retirement", niches: ["cpf", "cpf-for-foreigners", "retirement", "retirement-modelling", "semi-retirement", "fire", "srs", "tax-srs"] },
  {
    label: "Everyday money",
    niches: ["personal-finance", "budgeting", "cashflow", "spending", "credit-cards", "deals", "loans", "hdb", "property", "financial-education", "money-mindset"],
  },
  {
    label: "Life stages",
    niches: ["life-stage-money", "family-finance", "family-money", "couple-finance", "motherhood-money", "women-money", "expat-finance", "lifestyle", "lifestyle-money", "wellness-money"],
  },
  { label: "Career and business", niches: ["career", "career-money", "entrepreneurship", "business-planning"] },
  {
    label: "Growing a practice",
    niches: ["advisor-growth", "team-building", "mentorship", "personal-branding", "social-media-for-fcs", "social-selling", "content-strategy", "client-stories"],
  },
];

const GROUP_OF = new Map(NICHE_GROUPS.flatMap((g) => g.niches.map((n) => [n, g.label] as const)));

export const nicheGroup = (niche: string): string | undefined => GROUP_OF.get(niche);

/** True when no group is picked, or any of the creator's niches sits in a picked group. */
export const inNicheGroups = (niches: string[], picked: ReadonlySet<string>): boolean =>
  picked.size === 0 || niches.some((n) => picked.has(GROUP_OF.get(n) ?? ""));
