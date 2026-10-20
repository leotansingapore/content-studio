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
import { deriveAngle, deriveTopic, type Angle, type Topic } from "@/lib/postLabels";
import { sureTag } from "../../supabase/functions/remix/teardown.ts";

// The labels and their keyword rules live in postLabels.ts (no imports), so the drop scripts load them under node.
export { ANGLES, TOPICS, deriveAngle, deriveTopic, type Angle, type Topic } from "@/lib/postLabels";

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
  { value: "for-you", label: "Best for you" },
  { value: "engagement", label: "Highest engagement" },
  { value: "viewed", label: "Most viewed" },
  { value: "liked", label: "Most liked" },
  { value: "commented", label: "Most commented" },
  { value: "newest", label: "Newest" },
  { value: "trending", label: "Trending now" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];

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

/** Jev's audience ids (AUDIENCE_TAGS) as /swipe's older labels; "general" speaks to no one group. */
const TAG_AUDIENCE: Record<string, Audience> = {
  "fresh-grads": "Fresh Grads",
  "young-adults": "Young Adults",
  parents: "Parents",
  families: "Families",
  hnw: "HNW",
  "business-owners": "Business Owners",
  "advisors-recruitment": "Advisors / Recruitment",
};

/**
 * useTags (find-ai-tagging, off unless the caller turns it on): a sure Jev tag from the drop (post.tags) wins over the
 * keyword rule for topic, angle and audience; an unsure or missing one falls back to the rule.
 */
export function enrich(
  post: TopPostWithAdvisor,
  averages: Record<string, number>,
  opts: { useTags?: boolean } = {},
): PostInsight {
  const text = `${post.idea?.hook ?? ""} ${post.caption ?? ""}`;
  const jev = opts.useTags ? post.tags : undefined;
  const topic = (sureTag(jev, "topic") as Topic | null) ?? deriveTopic(text, post.niche);
  const angle = (sureTag(jev, "angle") as Angle | null) ?? deriveAngle(text);
  const heard = sureTag(jev, "audience");
  const audiences = heard ? (TAG_AUDIENCE[heard] ? [TAG_AUDIENCE[heard]] : []) : deriveAudiences(post.audience, post.niche);
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
    case "viewed":
      return arr.sort((a, b) => (b.post.views || 0) - (a.post.views || 0));
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
          postScore(b, { ...ctx, target: null, trending: true }) -
          postScore(a, { ...ctx, target: null, trending: true }),
      );
    case "for-you":
      // Highest engagement, lifted by how well each post matches the Playbook.
      return arr.sort((a, b) => postScore(b, ctx) - postScore(a, ctx));
    case "engagement":
    default:
      return arr.sort((a, b) => postScore(b, { ...ctx, target: null }) - postScore(a, { ...ctx, target: null }));
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

// ---- Formats working now (the panel above the /swipe grid) ----------------

export interface GroupStat {
  label: string;
  posts: number;
  /** Mean engagement vs each creator's own average (1 = their norm). */
  ratio: number;
}

export interface WorkingNow {
  days: number;
  posts: number;
  formats: (GroupStat & { value: string })[];
  topics: GroupStat[];
  angles: GroupStat[];
}

function groupStats<T>(items: ScoredPost[], keyOf: (x: ScoredPost) => T | null): Map<T, GroupStat> {
  const m = new Map<T, { posts: number; sum: number }>();
  for (const x of items) {
    const k = keyOf(x);
    if (k === null) continue;
    const g = m.get(k) ?? { posts: 0, sum: 0 };
    g.posts += 1;
    g.sum += x.insight.ratio;
    m.set(k, g);
  }
  const out = new Map<T, GroupStat>();
  for (const [k, g] of m) out.set(k, { label: String(k), posts: g.posts, ratio: g.sum / g.posts });
  return out;
}

const byPostsThenRatio = (a: GroupStat, b: GroupStat) => b.posts - a.posts || b.ratio - a.ratio;

/**
 * Which formats beat their creator's norm in the last `days`, and the topics
 * and angles that recur most. Built on the same ratio as the breakout badge.
 */
export function formatsWorkingNow(items: ScoredPost[], now: number, days = 90): WorkingNow {
  const since = now - days * 86_400_000;
  const recent = items.filter((x) => {
    const t = x.post.timestamp ? Date.parse(x.post.timestamp) : NaN;
    return t >= since && t <= now;
  });
  const fmt = groupStats(recent, (x) => generatorFormat(x.post));
  const formats = FORMAT_OPTIONS.flatMap((f) => {
    const s = fmt.get(f.value);
    return s ? [{ ...s, value: f.value, label: f.label }] : [];
  }).sort((a, b) => b.ratio - a.ratio);
  const top3 = (m: Map<unknown, GroupStat>) => [...m.values()].sort(byPostsThenRatio).slice(0, 3);
  return {
    days,
    posts: recent.length,
    formats,
    topics: top3(groupStats(recent, (x) => x.insight.topic)),
    angles: top3(groupStats(recent, (x) => x.insight.angle)),
  };
}
