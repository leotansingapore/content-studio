// Content plan engine + store.
//
// Turns a consultant's F.A.D.S. positioning into a funnel-balanced posting
// calendar: every slot is mapped to an ABC funnel stage, seeded with a concrete
// angle + starter hook (from the curated inspiration library and, optionally, a
// competitor's angle), and routed into the Generate studio when it's time to
// write. Posted slots are checked off for accountability.
//
// Fully client-side and deterministic given the same (positioning, salt) — the
// generation edge function is only called later, when a slot is drafted.
//
// Persisted to localStorage: key content-studio-plan-${userId}

import inspirationData from "@/data/inspiration.json";
import { FUNNEL_STAGES, type FunnelStageId } from "@/data/funnelFramework";
import type { Positioning } from "@/lib/positioning";

export type PlanPillar = "interest" | "identity" | "topic" | "market";
export type PlanFormat = "carousel" | "short-video" | "text-post" | "story";

export interface PlanCompetitorSeed {
  name: string;
  handle: string;
  styleNotes: string;
}

export interface PlanItem {
  id: string;
  week: number;
  dayLabel: string;
  stage: FunnelStageId;
  pillar: PlanPillar;
  pillarDetail: string;
  format: PlanFormat;
  platform: string;
  audience: string;
  ctaType: string;
  ideaSource: string;
  angle: string;
  hook: string;
  seedId?: string;
  competitorHandle?: string;
  posted: boolean;
}

export interface ContentPlan {
  id: string;
  createdAt: string;
  cadence: number;
  weeks: number;
  salt: number;
  oneLiner: string;
  items: PlanItem[];
  /** Human-readable note when the plan was weighted by the user's own analytics. */
  performanceNote?: string;
}

interface InspirationSeed {
  id: string;
  pillar: string;
  format: string;
  platform: string;
  audience?: string;
  topic: string;
  hook: string;
  tags?: string[];
}

const SEEDS = inspirationData as InspirationSeed[];

const KEY_PREFIX = "content-studio-plan-";

const FORMAT_ROTATION: PlanFormat[] = ["text-post", "carousel", "short-video"];

const IDEA_SOURCE_LABELS: Record<string, string> = {
  "real-question": "a real client question this week",
  "common-mistake": "a common mistake people make",
  "news-hook": "a news / Budget hook",
  "personal-story": "a personal story or lesson",
  "before-after": "an anonymised before-and-after",
  "three-things": "3 things you didn't know about it",
  "myth-bust": "a myth worth busting",
};

// Social-pillar subjects (Attraction / personal-trust angles) when there's no
// authority topic to anchor on. Adapted from the Trust=Personal building blocks.
const SOCIAL_SUBJECTS = [
  "a belief about money most advisors won't say out loud",
  "something outside work that shaped how you advise",
  "a challenge you went through and what changed",
  "why you got into this — the real reason",
  "a value you refuse to compromise on with clients",
  "a lesson from your first year that you'd tell your younger self",
];

// Day patterns per cadence — front-load the week so the funnel arcs Mon -> end.
const DAY_PATTERNS: Record<number, string[]> = {
  3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Fri"],
  5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function dayPattern(cadence: number): string[] {
  if (DAY_PATTERNS[cadence]) return DAY_PATTERNS[cadence];
  const base = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const out: string[] = [];
  for (let i = 0; i < cadence; i++) out.push(base[i % base.length]);
  return out;
}

// Distribute `cadence` slots across stages by weight, ordered A -> B -> C so a
// week reads top-of-funnel to bottom-of-funnel.
function stageOrderForWeek(cadence: number): FunnelStageId[] {
  const totalWeight = FUNNEL_STAGES.reduce((s, st) => s + st.weight, 0);
  const counts = FUNNEL_STAGES.map((st) => ({
    id: st.id,
    n: Math.max(0, Math.round((cadence * st.weight) / totalWeight)),
  }));
  // Fix rounding drift so counts sum to cadence.
  let sum = counts.reduce((s, c) => s + c.n, 0);
  let i = 0;
  while (sum < cadence) {
    counts[i % counts.length].n += 1;
    sum++;
    i++;
  }
  i = 0;
  while (sum > cadence) {
    const c = counts[i % counts.length];
    if (c.n > 0) {
      c.n -= 1;
      sum--;
    }
    i++;
  }
  // Guarantee at least one Attraction slot when there's room.
  if (cadence >= 1 && counts[0].n === 0) {
    const donor = counts.find((c) => c.n > 1);
    if (donor) {
      donor.n -= 1;
      counts[0].n += 1;
    }
  }
  const order: FunnelStageId[] = [];
  for (const c of counts) for (let k = 0; k < c.n; k++) order.push(c.id);
  return order;
}

function pickSeed(
  pillar: PlanPillar,
  audience: string,
  offset: number,
): InspirationSeed | undefined {
  const wantSocial = pillar === "identity" || pillar === "interest";
  const pool = SEEDS.filter((s) => {
    const isSocial = s.pillar === "Social";
    if (wantSocial !== isSocial) return false;
    return true;
  });
  if (pool.length === 0) return undefined;
  const audienceMatched = pool.filter(
    (s) => !s.audience || s.audience === audience,
  );
  const finalPool = audienceMatched.length > 0 ? audienceMatched : pool;
  return finalPool[offset % finalPool.length];
}

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export interface GeneratePlanOptions {
  weeks?: number;
  salt?: number;
  competitors?: PlanCompetitorSeed[];
  /**
   * The user's own tracked results (from Analytics). When present, the plan
   * leans toward what has actually worked for them: the winning format takes
   * roughly half the slots, and posting days start with their best days.
   */
  performance?: {
    bestFormat?: PlanFormat | null;
    bestDays?: string[];
  };
}

export function generatePlan(
  positioning: Positioning,
  opts: GeneratePlanOptions = {},
): ContentPlan {
  const weeks = opts.weeks ?? 2;
  const salt = opts.salt ?? 0;
  const competitors = opts.competitors ?? [];
  const cadence = positioning.cadence || 3;
  const topics = positioning.topics.filter((t) => t.trim().length > 0);

  // Performance weighting: interleave the user's winning format into every
  // other rotation slot, and start the week on their best posting days.
  const bestFormat = opts.performance?.bestFormat ?? null;
  const formatRotation: PlanFormat[] = bestFormat
    ? FORMAT_ROTATION.filter((f) => f !== bestFormat).flatMap((f) => [
        bestFormat,
        f,
      ])
    : FORMAT_ROTATION;
  const bestDays = (opts.performance?.bestDays ?? []).filter((d) =>
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(d),
  );
  let days = dayPattern(cadence);
  if (bestDays.length > 0) {
    const rest = days.filter((d) => !bestDays.includes(d));
    days = [...bestDays, ...rest].slice(0, days.length);
  }

  const items: PlanItem[] = [];
  let globalIndex = 0;
  let authIndex = 0;
  let socialIndex = 0;

  for (let w = 1; w <= weeks; w++) {
    const order = stageOrderForWeek(cadence);
    for (let slot = 0; slot < order.length; slot++) {
      const stageId = order[slot];
      const stage = FUNNEL_STAGES.find((s) => s.id === stageId)!;
      const pillar = stage.pillars[(globalIndex + salt) % stage.pillars.length];
      const format = formatRotation[(globalIndex + salt) % formatRotation.length];
      const ideaSource =
        stage.ideaSources[(globalIndex + salt) % stage.ideaSources.length];
      const isSocial = pillar === "identity" || pillar === "interest";

      let pillarDetail: string;
      if (isSocial) {
        pillarDetail =
          SOCIAL_SUBJECTS[(socialIndex + salt) % SOCIAL_SUBJECTS.length];
        socialIndex++;
      } else if (topics.length > 0) {
        pillarDetail = topics[(authIndex + salt) % topics.length];
        authIndex++;
      } else {
        pillarDetail = positioning.audienceDetail || "your core financial topic";
      }

      const seed = pickSeed(pillar, positioning.audience, globalIndex + salt);

      const ideaLabel = IDEA_SOURCE_LABELS[ideaSource] ?? "a concrete angle";
      let angle: string;
      if (isSocial) {
        angle = titleCase(pillarDetail);
      } else {
        const anchor = titleCase(pillarDetail);
        angle = `${anchor} — ${ideaLabel}`;
      }
      // Borrow a concrete topical detail from the seed to keep it specific.
      if (!isSocial && seed && seed.topic && topics.length > 0) {
        angle = `${titleCase(pillarDetail)} — ${ideaLabel} (angle: ${seed.topic})`;
      }

      const hook =
        seed?.hook ??
        (isSocial
          ? "Most people think advisors only care about closing. Here's what actually drives me."
          : `If you ${pillarDetail.toLowerCase()}, there's one thing most people get wrong.`);

      const competitor =
        competitors.length > 0
          ? competitors[globalIndex % competitors.length]
          : undefined;

      items.push({
        id: `plan-${w}-${slot}-${globalIndex}`,
        week: w,
        dayLabel: `Wk ${w} · ${days[slot % days.length]}`,
        stage: stageId,
        pillar,
        pillarDetail,
        format,
        platform: positioning.platform,
        audience: positioning.audience,
        ctaType: stage.cta,
        ideaSource,
        angle,
        hook,
        seedId: seed?.id,
        competitorHandle: competitor?.handle,
        posted: false,
      });
      globalIndex++;
    }
  }

  const noteParts: string[] = [];
  if (bestFormat) {
    const label: Record<PlanFormat, string> = {
      "text-post": "text posts",
      carousel: "carousels",
      "short-video": "short videos",
      story: "stories",
    };
    noteParts.push(`more ${label[bestFormat]} (your best format)`);
  }
  if (bestDays.length > 0) {
    noteParts.push(`posting starts ${bestDays.join(" + ")} (your best days)`);
  }

  return {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    cadence,
    weeks,
    salt,
    oneLiner: positioning.oneLiner,
    items,
    performanceNote: noteParts.length
      ? `Weighted by your analytics: ${noteParts.join("; ")}.`
      : undefined,
  };
}

/** Build the /generate deep-link that prefills the studio for a plan item. */
export function planItemToGenerateUrl(item: PlanItem): string {
  const params = new URLSearchParams({
    pillar: item.pillar,
    detail: item.pillarDetail,
    audience: item.audience,
    format: item.format,
    platform: item.platform,
    cta: item.ctaType,
    funnel: item.stage,
    idea: item.ideaSource,
  });
  if (item.angle) params.set("ctx", item.angle);
  if (item.competitorHandle) params.set("ref", item.competitorHandle);
  return `/generate?${params.toString()}`;
}

// ---- calendar mapping ----

const WEEKDAY_OFFSET: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

// The upcoming Monday (today if it's already Monday).
export function upcomingMonday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const offset = (8 - (d.getDay() === 0 ? 7 : d.getDay())) % 7; // days until Mon
  d.setDate(d.getDate() + offset);
  return d;
}

// Map a plan item to a concrete calendar date, given the week-1 Monday.
export function planItemDate(item: PlanItem, week1Monday: Date): Date {
  const weekday = item.dayLabel.split("·").pop()?.trim() ?? "Mon";
  const off = WEEKDAY_OFFSET[weekday] ?? 0;
  const d = new Date(week1Monday);
  d.setDate(d.getDate() + (item.week - 1) * 7 + off);
  return d;
}

// ---- store ----

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadPlan(userId: string | null | undefined): ContentPlan | null {
  if (!userId) return null;
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ContentPlan;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function savePlan(userId: string, plan: ContentPlan): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(plan));
}

export function clearPlan(userId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(`${KEY_PREFIX}${userId}`);
}
