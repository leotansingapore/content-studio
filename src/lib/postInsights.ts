// Swipe-file intelligence: turn the raw scraped post + its advisor metadata
// into the structured fields the Top-posts page shows (topic, angle, audience,
// psychological trigger, structure) and a smarter rank than "most likes".
//
// Honesty rule (matches the page's contract): we DERIVE labels from data that
// exists — the caption, the idea breakdown, and the advisor's niche/audience —
// and we compute outperformance from each creator's OWN average in the dataset.
// We never invent numbers. Fields with no signal return null so the UI can show
// a graceful fallback instead of a fabricated one. Follower counts, shares and
// saves are NOT in the data, so engagement-rate ranking is intentionally absent.

import { engagementScore, generatorFormat, type TopPostWithAdvisor } from "@/lib/topPosts";
import type { Positioning } from "@/lib/positioning";

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

export const AUDIENCES = [
  "Fresh Grads",
  "Young Adults",
  "Parents",
  "Families",
  "HNW",
  "Business Owners",
  "Advisors / Recruitment",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const FORMAT_OPTIONS = [
  { value: "short-video", label: "Reels" },
  { value: "carousel", label: "Carousels" },
  { value: "text-post", label: "Single Posts" },
] as const;

export const SORTS = [
  { value: "engagement", label: "Highest engagement" },
  { value: "liked", label: "Most liked" },
  { value: "commented", label: "Most commented" },
  { value: "newest", label: "Newest" },
  { value: "trending", label: "Trending now" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];

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

// ---- Audience -------------------------------------------------------------

const AUD_STAGE: Record<string, Audience> = {
  student: "Fresh Grads",
  "young-adult": "Young Adults",
  "working-adult": "Young Adults",
  professional: "Young Adults",
  parent: "Parents",
  "business-owner": "Business Owners",
  "financial-advisors": "Advisors / Recruitment",
};
const AUD_NICHE: { audience: Audience; niches: string[] }[] = [
  { audience: "Families", niches: ["family-finance", "family-money", "motherhood-money"] },
  { audience: "HNW", niches: ["wealth-management", "wealth-planning", "legacy-planning", "estate-planning"] },
];

export function deriveAudiences(audience: string[] = [], niche: string[] = []): Audience[] {
  const out = new Set<Audience>();
  for (const a of audience) if (AUD_STAGE[a]) out.add(AUD_STAGE[a]);
  const nset = new Set(niche);
  for (const rule of AUD_NICHE) if (rule.niches.some((n) => nset.has(n))) out.add(rule.audience);
  return [...out];
}

// ---- Psychological trigger (detail view) ----------------------------------

const TRIGGER_RULES: { trigger: string; kw: RegExp }[] = [
  { trigger: "Curiosity gap", kw: /nobody tells|what (they|no one)|the truth about|here'?s why|you won'?t believe|secret|little-known/i },
  { trigger: "Loss aversion", kw: /\blose\b|\bloss\b|miss out|too late|regret|underinsured|before it'?s too late|costly mistake/i },
  { trigger: "Social proof", kw: /most people|everyone|thousands|9 out of 10|\d+% of|widely|our clients/i },
  { trigger: "Specificity", kw: /\$\d|\d+%|\d+ (ways|steps|things|tips|reasons)/i },
  { trigger: "Identity", kw: /if you'?re a|as a (parent|young|business|woman)|people like you|for (parents|grads|founders)/i },
  { trigger: "Aspiration", kw: /financial freedom|retire early|build wealth|financially free|\bf\.?i\.?r\.?e\b/i },
  { trigger: "Controversy", kw: /unpopular opinion|hot take|controversial|\bmyth\b/i },
  { trigger: "Storytelling", kw: /my client|\bwhen i\b|\bstory\b|years ago/i },
];

export function deriveTrigger(text: string): string | null {
  for (const rule of TRIGGER_RULES) if (rule.kw.test(text)) return rule.trigger;
  return null;
}

export function formatStructure(fmt: string, ideaFormat?: string): string {
  const base =
    fmt === "carousel"
      ? "Hook slide → 3–6 teaching slides → recap / CTA slide"
      : fmt === "short-video"
        ? "Scroll-stopping hook in the first 2 seconds → the payoff → a clear CTA"
        : "One-line hook → a short body that delivers on it → a clear CTA";
  return ideaFormat ? `${ideaFormat} · ${base}` : base;
}

// ---- The enriched insight per post ----------------------------------------

export interface PostInsight {
  topic: Topic | null;
  angle: Angle | null;
  audiences: Audience[];
  tags: string[]; // compact set for the card (topic, angle, up to 2 audiences)
  trigger: string | null;
  structure: string;
  ratio: number; // engagement vs this creator's own average (1 = average)
  breakout: boolean; // notably above the creator's norm
}

export const BREAKOUT_RATIO = 1.8;

export function enrich(
  post: TopPostWithAdvisor,
  averages: Record<string, number>,
): PostInsight {
  const text = `${post.idea?.hook ?? ""} ${post.caption ?? ""}`;
  const topic = deriveTopic(text, post.niche);
  const angle = deriveAngle(text);
  const audiences = deriveAudiences(post.audience, post.niche);
  const rawTags: (string | null)[] = [topic, angle, ...audiences.slice(0, 2)];
  const tags = rawTags.filter((t): t is string => t !== null);
  const ratio = outperformance(post, averages);
  return {
    topic,
    angle,
    audiences,
    tags: [...new Set(tags)].slice(0, 4),
    trigger: deriveTrigger(text),
    structure: formatStructure(generatorFormat(post), post.idea?.format),
    ratio,
    breakout: ratio >= BREAKOUT_RATIO,
  };
}

// ---- Ranking --------------------------------------------------------------

export function buildCreatorAverages(all: TopPostWithAdvisor[]): Record<string, number> {
  const groups: Record<string, number[]> = {};
  for (const p of all) (groups[p.handle] ??= []).push(engagementScore(p));
  const avg: Record<string, number> = {};
  for (const [h, arr] of Object.entries(groups)) {
    avg[h] = arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  return avg;
}

/** How far above (or below) this creator's own average this post performed. */
export function outperformance(
  post: TopPostWithAdvisor,
  averages: Record<string, number>,
): number {
  const a = averages[post.handle];
  if (!a || a <= 0) return 1;
  return engagementScore(post) / a;
}

function recencyFactor(ts: string | null | undefined, now: number): number {
  if (!ts) return 0.85;
  const d = (now - new Date(ts).getTime()) / 86_400_000;
  if (Number.isNaN(d)) return 0.85;
  if (d <= 30) return 1;
  if (d >= 365) return 0.6;
  return 1 - ((d - 30) / 335) * 0.4;
}

export interface PersonalTarget {
  audiences: Audience[];
  topics: string[]; // lowercased topic/keyword hints from the Playbook
}

/** Map a Playbook (positioning) into the audience/topic targets we rank on. */
export function personalTargetFromPositioning(
  p: Positioning | null,
): PersonalTarget | null {
  if (!p) return null;
  const stageToAud: Record<string, Audience> = {
    "young-adult": "Young Adults",
    "working-adult": "Young Adults",
    parent: "Parents",
    "pre-retiree": "Families",
  };
  const audiences: Audience[] = [];
  if (stageToAud[p.audience]) audiences.push(stageToAud[p.audience]);
  const topics = [
    ...p.topics.map((t) => t.toLowerCase().trim()),
    p.audienceDetail.toLowerCase(),
  ].filter(Boolean);
  if (audiences.length === 0 && topics.length === 0) return null;
  return { audiences, topics };
}

/** 0..1 how well a post matches the advisor's Playbook. */
export function personalMatch(insight: PostInsight, target: PersonalTarget | null): number {
  if (!target) return 0;
  let score = 0;
  if (
    target.audiences.length &&
    insight.audiences.some((a) => target.audiences.includes(a))
  ) {
    score += 0.5;
  }
  if (insight.topic) {
    const topicLc = insight.topic.toLowerCase();
    if (target.topics.some((t) => t && (topicLc.includes(t) || t.includes(topicLc.split(" ")[0])))) {
      score += 0.5;
    }
  }
  return Math.min(1, score);
}

export interface ScoredPost {
  post: TopPostWithAdvisor;
  insight: PostInsight;
}

export function postScore(
  item: ScoredPost,
  opts: {
    averages: Record<string, number>;
    now: number;
    trending?: boolean;
    target?: PersonalTarget | null;
  },
): number {
  const eng = engagementScore(item.post);
  const rec = recencyFactor(item.post.timestamp, opts.now);
  const outBonus = Math.min(1.5, Math.max(0, item.insight.ratio - 1)) * 0.4;
  const recBlend = opts.trending ? 0.2 + 0.8 * rec : 0.6 + 0.4 * rec;
  const personal = opts.target ? 1 + 0.6 * personalMatch(item.insight, opts.target) : 1;
  return eng * recBlend * (1 + outBonus) * personal;
}

export function sortPosts(
  items: ScoredPost[],
  sort: SortKey,
  ctx: { averages: Record<string, number>; now: number; target?: PersonalTarget | null },
): ScoredPost[] {
  const arr = [...items];
  switch (sort) {
    case "liked":
      return arr.sort((a, b) => (b.post.likes || 0) - (a.post.likes || 0));
    case "commented":
      return arr.sort((a, b) => (b.post.comments || 0) - (a.post.comments || 0));
    case "newest":
      return arr.sort(
        (a, b) =>
          new Date(b.post.timestamp || 0).getTime() -
          new Date(a.post.timestamp || 0).getTime(),
      );
    case "trending":
      return arr.sort(
        (a, b) =>
          postScore(b, { ...ctx, trending: true }) -
          postScore(a, { ...ctx, trending: true }),
      );
    case "engagement":
    default:
      return arr.sort((a, b) => postScore(b, ctx) - postScore(a, ctx));
  }
}

/** Posts sharing topic / angle / audience / creator with the target. */
export function similarPosts(
  target: ScoredPost,
  all: ScoredPost[],
  n = 5,
): ScoredPost[] {
  const key = (x: ScoredPost) => x.post.advisorId + "-" + x.post.shortCode;
  const targetKey = key(target);
  const scored = all
    .filter((x) => key(x) !== targetKey)
    .map((x) => {
      let s = 0;
      if (target.insight.topic && x.insight.topic === target.insight.topic) s += 2;
      if (target.insight.angle && x.insight.angle === target.insight.angle) s += 2;
      if (x.post.handle === target.post.handle) s += 1;
      if (x.insight.audiences.some((a) => target.insight.audiences.includes(a))) s += 1;
      return { x, s };
    })
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map((r) => r.x);
}
