// /swipe's topic and angle labels and the keyword rules that pick them, moved out of postInsights.ts (which re-exports
// them) with no imports, so node loads this file too (scripts/tag-top-posts.mjs compares the rules with Jev's tags).

export const TOPICS = [
  "Insurance",
  "Investment",
  "CPF",
  "Retirement",
  "Estate Planning",
  "Money Habits",
  "Career / FA Life",
  "Personal Brand",
] as const;
export type Topic = (typeof TOPICS)[number];

export const ANGLES = [
  "Storytelling",
  "Contrarian",
  "Educational",
  "Emotional",
  "Relatable",
  "Objection Handling",
  "Humour",
  "Authority",
] as const;
export type Angle = (typeof ANGLES)[number];

// ---- Topic ----------------------------------------------------------------

const TOPIC_RULES: { topic: Topic; kw: RegExp; niches: string[] }[] = [
  { topic: "CPF", kw: /\bcpf\b|medisave|ordinary account|special account|retirement account|cpf life/i, niches: ["cpf", "cpf-for-foreigners"] },
  { topic: "Estate Planning", kw: /\bwill\b|estate|legacy|inheritance|\blpa\b|nomination|trust fund/i, niches: ["estate-planning", "legacy-planning"] },
  { topic: "Retirement", kw: /retire|retirement|\bsrs\b|semi-retire|pension/i, niches: ["retirement", "retirement-modelling", "semi-retirement", "srs", "tax-srs"] },
  { topic: "Insurance", kw: /insurance|insured|coverage|\bpolicy\b|premium|\bclaim|critical illness|hospitalisation|term life|whole life|\bilp\b/i, niches: ["insurance", "critical-illness", "protection", "small-business-insurance"] },
  { topic: "Investment", kw: /invest|\betf|stocks?|\breit|portfolio|dividend|\bfund\b|equit|bonds?|index fund|s&p/i, niches: ["investments", "investing", "investing-basics", "etfs", "sg-stocks", "reits", "value-investing", "quant", "wealth-accumulation", "long-term-wealth", "fire", "permanent-portfolio", "macro", "market-commentary"] },
  { topic: "Money Habits", kw: /budget|savings?|spend|debt|cashflow|money habit|frugal|emergency fund|mindset/i, niches: ["budgeting", "cashflow", "spending", "money-mindset", "personal-finance", "couple-finance", "family-money", "wellness-money"] },
  { topic: "Career / FA Life", kw: /advisor|advisory|prospect|recruit|mdrt|financial consultant|my agency|social selling|content strateg/i, niches: ["career", "career-money", "advisor-growth", "team-building", "social-selling", "social-media-for-fcs", "mentorship", "content-strategy"] },
  { topic: "Personal Brand", kw: /personal brand|behind the scenes|build your brand|my story/i, niches: ["personal-branding", "personal-brand"] },
];

export function deriveTopic(text: string, niche: string[] = []): Topic | null {
  const nset = new Set(niche);
  for (const rule of TOPIC_RULES) {
    if (rule.kw.test(text)) return rule.topic;
  }
  for (const rule of TOPIC_RULES) {
    if (rule.niches.some((n) => nset.has(n))) return rule.topic;
  }
  return null;
}

// ---- Angle ----------------------------------------------------------------

const ANGLE_RULES: { angle: Angle; kw: RegExp }[] = [
  { angle: "Contrarian", kw: /unpopular opinion|hot take|\bmyth\b|stop (doing|telling|believing)|you'?re wrong|nobody tells you|don'?t believe|controversial/i },
  { angle: "Objection Handling", kw: /too expensive|can'?t afford|already have|i don'?t need|not enough time|\bexcuse|objection|do it later/i },
  { angle: "Storytelling", kw: /\bwhen i\b|my client|last (week|month|year)|years ago|i remember|true story|a client of mine/i },
  { angle: "Humour", kw: /😂|🤣|😅|\blol\b|haha|\bjokes?\b|\bngl\b/i },
  { angle: "Emotional", kw: /passed away|\bdied\b|diagnos|\bfear\b|scared|regret|peace of mind|protect (your|their) family|heartbreak/i },
  { angle: "Relatable", kw: /we'?ve all|you know that feeling|every singaporean|be honest|relatable/i },
  { angle: "Educational", kw: /step-by-step|how to|here'?s how|\bguide\b|explained|breakdown|\btips\b|what is|the basics|\b101\b/i },
];

export function deriveAngle(text: string): Angle | null {
  for (const rule of ANGLE_RULES) if (rule.kw.test(text)) return rule.angle;
  // Data/number-heavy posts with no other signal read as authority.
  if (/\d+%|\bs?\$\d|\d{3,}/.test(text)) return "Authority";
  return null;
}
