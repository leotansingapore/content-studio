// Funnel framework — the content concepts that drive ideation across the studio.
//
// Source: @willislaubx's frameworks, taught to financial consultants:
//   1. Trust = Personal + Professional
//        Personal  — win their hearts over: who you are as a person.
//        Professional — earn it: what you know and can demonstrate.
//   2. The ABC Content Funnel
//        A — Attraction     (top:    attention, relatability)
//        B — Building Trust (middle: pain-points, how you solve them)
//        C — Conversion     (bottom: the offer, why me / why now)
//
// This module is the single source of truth reused by the Generate page
// (funnel-aware drafting) and the Plan page (funnel-balanced calendars).

export type FunnelStageId = "attraction" | "trust" | "conversion";

export interface FunnelStage {
  id: FunnelStageId;
  letter: "A" | "B" | "C";
  label: string;
  tagline: string;
  goal: string;
  description: string;
  /** Concrete content types that belong at this stage (from the ABC funnel). */
  contentTypes: string[];
  /** Questions a post at this stage should help the reader answer. */
  answers: string[];
  /** Pillars that tend to fit this stage, in rotation order. */
  pillars: Array<"interest" | "identity" | "topic" | "market">;
  /** CTA style that suits this stage (matches GeneratePage CtaType values). */
  cta:
    | "dm-keyword"
    | "comment-keyword"
    | "save-share"
    | "book-call"
    | "open-question";
  /** Idea sources that fit this stage (matches GeneratePage IDEA_SOURCES values). */
  ideaSources: string[];
  /** Relative weight used to balance a content plan across the funnel. */
  weight: number;
  /** Tailwind accent classes for badges / cards. */
  accent: {
    badge: string;
    ring: string;
    dot: string;
    text: string;
  };
  /**
   * Directive injected into the generation context so the drafted post is
   * steered for this funnel stage (the edge function is prompt-driven, so we
   * steer it through the free-text context channel).
   */
  directive: string;
}

export const FUNNEL_STAGES: FunnelStage[] = [
  {
    id: "attraction",
    letter: "A",
    label: "Attraction",
    tagline: "Get attention. Be relatable.",
    goal: "Stop the scroll and become known — not sell.",
    description:
      "Top of funnel. Strangers meet you here. Lead with who you are, a relatable POV, a story, or a sharp who/what. Earn the attention before you earn anything else.",
    contentTypes: [
      "Relatable POV / hot take",
      "Personal story or lesson",
      "Who you are (interests, values)",
      "Case study / success story",
      "Myth-bust",
    ],
    answers: ["Who is this person?", "Can I relate to them?", "Is this worth my attention?"],
    pillars: ["identity", "interest", "topic"],
    cta: "open-question",
    ideaSources: ["personal-story", "myth-bust", "three-things"],
    weight: 4,
    accent: {
      badge: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300",
      ring: "ring-violet-500/30",
      dot: "bg-violet-500",
      text: "text-violet-600 dark:text-violet-300",
    },
    directive:
      "Funnel stage: ATTRACTION (top of funnel). Goal is reach and relatability, not selling. Lead with a scroll-stopping hook, a personal POV, a story, or a who/what. Keep any CTA soft (an open question or a save/share). Do NOT pitch a product or push a booking.",
  },
  {
    id: "trust",
    letter: "B",
    label: "Building Trust",
    tagline: "Name the pain. Show how you solve it.",
    goal: "Earn credibility by being genuinely useful.",
    description:
      "Middle of funnel. They know you exist — now prove you can help. Name a real pain-point or aspiration, teach something concrete, and show how you think. Give before you ask.",
    contentTypes: [
      "Pain-point breakdown",
      "How you solve a specific problem",
      "Teaching / framework / steps",
      "Free resource (checklist, worksheet)",
      "Before-and-after with real numbers",
    ],
    answers: ["Do they understand my problem?", "Can they actually help me?", "Do I trust their thinking?"],
    pillars: ["topic", "market", "identity"],
    cta: "save-share",
    ideaSources: ["real-question", "common-mistake", "before-after", "three-things"],
    weight: 4,
    accent: {
      badge: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
      ring: "ring-sky-500/30",
      dot: "bg-sky-500",
      text: "text-sky-600 dark:text-sky-300",
    },
    directive:
      "Funnel stage: BUILDING TRUST (middle of funnel). Goal is credibility. Name a real pain-point or aspiration, then teach something concrete and show how you think about solving it. Offer a free resource or invite a save. No hard sell — give first.",
  },
  {
    id: "conversion",
    letter: "C",
    label: "Conversion",
    tagline: "Make the offer. Why me, why now.",
    goal: "Invite the next step — clearly, without pressure.",
    description:
      "Bottom of funnel. They trust you; now make it easy to act. Be clear about what problem you solve, why now, and why you. Lead with value, then a direct but low-pressure CTA.",
    contentTypes: [
      "The offer / what working together looks like",
      "Why now (timing, cost of waiting)",
      "Why me (proof, positioning)",
      "Soft invitation to a 15-min review",
      "Free resource that bridges to a call",
    ],
    answers: ["What exactly do they offer?", "Why should I act now?", "Why them and not someone else?"],
    pillars: ["market", "topic", "identity"],
    cta: "dm-keyword",
    ideaSources: ["before-after", "real-question", "news-hook"],
    weight: 2,
    accent: {
      badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      ring: "ring-emerald-500/30",
      dot: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-300",
    },
    directive:
      "Funnel stage: CONVERSION (bottom of funnel). Goal is to invite the next step. Make the offer and reasoning clear: what problem this solves, why now, why you. Use a direct but low-pressure CTA (a DM keyword or a soft 15-min review). Still lead with value before the ask.",
  },
];

export function getFunnelStage(id: FunnelStageId): FunnelStage {
  return FUNNEL_STAGES.find((s) => s.id === id) ?? FUNNEL_STAGES[0];
}

// Trust = Personal + Professional (the second framework).
export interface TrustDimension {
  id: "personal" | "professional";
  label: string;
  heading: string;
  blurb: string;
  /** The building blocks to showcase online. */
  blocks: string[];
  /** Prompts that turn the dimension into a post idea. */
  prompts: string[];
  accent: string;
}

export const TRUST_DIMENSIONS: TrustDimension[] = [
  {
    id: "personal",
    label: "Personal",
    heading: "Win their hearts over",
    blurb: "Who you are as a person. People buy from people they like and relate to.",
    blocks: ["Beliefs", "Character", "Interests", "Values", "POVs"],
    prompts: [
      "A belief about money you hold that most advisors won't say out loud",
      "Something outside work — sport, skill, hobby — and what it taught you",
      "A challenge you went through and what changed",
      "A value you refuse to compromise on with clients",
    ],
    accent: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  {
    id: "professional",
    label: "Professional",
    heading: "Earn it",
    blurb: "What you know and can demonstrate. Competence earns the right to advise.",
    blocks: ["Education", "Competency", "Credibility", "Demonstration"],
    prompts: [
      "What problem do you solve better than anyone? Show it.",
      "How does your approach actually solve it — walk through the steps",
      "Why now — what's the cost of a client waiting another year?",
      "Why you — a result, a framework, or proof only you can show",
    ],
    accent: "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
];
