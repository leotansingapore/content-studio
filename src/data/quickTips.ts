// Quick tips — short, actionable nudges sprinkled through the studio to inspire
// better content. Grouped loosely by where they're most useful.

export interface QuickTip {
  id: string;
  text: string;
  /** Loose context tag so pages can surface relevant tips. */
  context: "generate" | "plan" | "funnel" | "voice" | "any";
}

export const QUICK_TIPS: QuickTip[] = [
  // Funnel thinking
  {
    id: "t-funnel-balance",
    text: "Trust = Personal + Professional. Alternate posts that show WHO you are with posts that show WHAT you know — both, not just one.",
    context: "funnel",
  },
  {
    id: "t-attraction-relate",
    text: "Attraction posts don't sell. If a stranger can't relate to your first line, they'll never reach your offer.",
    context: "funnel",
  },
  {
    id: "t-trust-give",
    text: "Building trust means giving first. Teach one concrete thing — a number, a step, a worksheet — before you ever ask.",
    context: "funnel",
  },
  {
    id: "t-conversion-direct",
    text: "Bottom-of-funnel posts can be direct. 'DM me REVIEW' converts better than a vague 'link in bio'.",
    context: "funnel",
  },
  // Hooks + ideas
  {
    id: "t-hook-question",
    text: "Your best hook is a real client question. Screenshot-worthy beats clever.",
    context: "generate",
  },
  {
    id: "t-one-idea",
    text: "One idea per post. If you're teaching 3 things, that's 3 posts — not one crowded carousel.",
    context: "generate",
  },
  {
    id: "t-numbers",
    text: "Show the work. A before/after with real numbers earns more trust than any adjective.",
    context: "generate",
  },
  {
    id: "t-pov",
    text: "Post the POV you're slightly afraid to share. Beliefs and POVs are what make you un-ignorable.",
    context: "generate",
  },
  {
    id: "t-cut",
    text: "Draft long, then cut 30% of the words. The version you're embarrassed is too short is usually the right length.",
    context: "generate",
  },
  // Plan + consistency
  {
    id: "t-consistency",
    text: "Consistency beats brilliance. Three honest posts a week for a year will outperform one viral hit.",
    context: "plan",
  },
  {
    id: "t-free-resource",
    text: "A free resource (checklist, worksheet, calculator) is the cheapest trust-builder you'll ever make. Plan one a week.",
    context: "plan",
  },
  {
    id: "t-batch",
    text: "Batch your week in one sitting. Draft Monday-to-Friday on Sunday, edit daily, post on time.",
    context: "plan",
  },
  {
    id: "t-competitor",
    text: "Study a competitor's angle, never their words. Borrow the structure, write it in your own voice and niche.",
    context: "plan",
  },
  // Voice
  {
    id: "t-voice",
    text: "Paste 3-5 of your past posts into Voice once. Every draft after that sounds like you, not generic AI.",
    context: "voice",
  },
];

export function tipsFor(context: QuickTip["context"]): QuickTip[] {
  const matched = QUICK_TIPS.filter(
    (t) => t.context === context || t.context === "any",
  );
  return matched.length > 0 ? matched : QUICK_TIPS;
}
