// The fixed tag lists posts and ads are labelled with (Jev Choice questions), declared once so the competitors
// function, remix, the drop scripts and the app share one list. Pure, no imports: Deno, node and vitest all load it.

export type HookFamilyId = "problem" | "desire" | "curiosity" | "proof" | "audience" | "offer" | "instruction";

/** How an ad opens. Criteria word for word from HOOK_FAMILIES in ~/.local/bin/ads-swipe-collect (AdLauncher's hookAngles.ts). */
export const HOOK_FAMILIES: { id: HookFamilyId; name: string; criteria: string }[] = [
  { id: "problem", name: "Problem", criteria: "Opens on something wrong in the reader's life: regret, a gap never worked out, a number never checked, stuck or frustrated, the cost of doing nothing" },
  { id: "desire", name: "Desire", criteria: "Opens on the outcome they want: a transformation, a lifestyle picture, a specific promise, a bold claim" },
  { id: "curiosity", name: "Curiosity", criteria: "Opens a loop the reader has to close: a question, a reframe, a myth bust, a hidden reason, a comparison" },
  { id: "proof", name: "Proof", criteria: "Opens with evidence that it works: a testimonial, numbers or volume, a case study result, a personal story, an authority or credential" },
  { id: "audience", name: "Audience", criteria: "Opens by naming who it is for: a demographic, life stage, situation or occupation callout" },
  { id: "offer", name: "Offer", criteria: "Opens on the deal itself: a free resource, a discount or price, urgency or scarcity, an announcement, what you get" },
  { id: "instruction", name: "Instruction", criteria: "Opens by teaching something: how-to steps, a listicle, mistakes to avoid, a named framework" },
];

/** The feeling an ad or post most tries to stir (find-ad-library's emotion question). */
export const FEELINGS = [
  { id: "worry", label: "Worry", meaning: "concern about a risk, a loss or a gap" },
  { id: "hope", label: "Hope", meaning: "a better future within reach" },
  { id: "relief", label: "Relief", meaning: "a burden taken off" },
  { id: "pride", label: "Pride", meaning: "status, achievement or being smart" },
  { id: "curiosity", label: "Curiosity", meaning: "wanting to know the answer" },
  { id: "urgency", label: "Urgency", meaning: "act now before it is gone" },
  { id: "trust", label: "Trust", meaning: "safety, credibility, being looked after" },
  { id: "fun", label: "Fun", meaning: "humour or delight" },
] as const;

/** Who it mainly speaks to: the /swipe audience slugs plus general. */
export const AUDIENCE_TAGS = [
  { id: "fresh-grads", label: "Fresh grads" },
  { id: "young-adults", label: "Young adults" },
  { id: "parents", label: "Parents" },
  { id: "families", label: "Families" },
  { id: "hnw", label: "High net worth" },
  { id: "business-owners", label: "Business owners" },
  { id: "advisors-recruitment", label: "Advisers and recruits" },
  { id: "general", label: "General" },
] as const;

/** What makes an opening line stop the scroll (remix-patterns' psychology question, the Hooks tab's "Why it works"). */
export const PSYCHOLOGY = [
  { id: "curiosity", label: "Curiosity", meaning: "It leaves a gap the reader wants closed" },
  { id: "fear-of-loss", label: "Fear of loss", meaning: "It points at money, time or safety the reader could lose" },
  { id: "social-proof", label: "Social proof", meaning: "It leans on what many people did" },
  { id: "authority", label: "Authority", meaning: "It leans on the writer's experience, numbers or credentials" },
  { id: "contrast", label: "Contrast", meaning: "It sets a common belief against a surprising truth" },
  { id: "identity", label: "Identity", meaning: "It names a group the reader belongs to" },
  { id: "story", label: "Story", meaning: "It opens a personal moment" },
  { id: "other", label: "Other", meaning: "None of these" },
] as const;

/** How the body of a post is built (remix-patterns' structure question). */
export const STRUCTURES = [
  { id: "list", label: "List", meaning: "A numbered or bulleted list of points" },
  { id: "story", label: "Story", meaning: "A story with a before, a turn and an after" },
  { id: "how-to", label: "How-to", meaning: "Steps to do something" },
  { id: "myth-bust", label: "Myth bust", meaning: "A common belief, then why it is wrong" },
  { id: "opinion", label: "Opinion", meaning: "A take the writer argues for" },
  { id: "question", label: "Question", meaning: "It asks the audience something and invites answers" },
  { id: "announcement", label: "Announcement", meaning: "News, an offer or an event" },
  { id: "other", label: "Other", meaning: "None of these" },
] as const;

/** A tag is kept when Jev's pick has this probability or more (decision 7: a proposal until the first real run). */
export const TAG_MIN = 0.5;

/** Jev's pick when it is one of `ids` and its probability is at least `min`, else null (unsure, off-list or no answer). */
export function pickTag(
  a: { choice?: string; probabilities?: Record<string, number> } | undefined,
  ids: readonly string[],
  min = TAG_MIN,
): string | null {
  const c = a?.choice;
  if (!c || !ids.includes(c)) return null;
  const p = a?.probabilities?.[c];
  return typeof p === "number" && p >= min ? c : null;
}
