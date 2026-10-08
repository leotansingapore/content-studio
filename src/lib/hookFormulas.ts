// Named hook formulas for Write's hooks mode. Each hook is written with a
// different formula and shows the formula's name and the trap that ruins it,
// so the consultant picks with the shape in mind. Wording rewritten for
// Singapore financial consultants: no promised returns, no named insurers or
// products. Formula set ported from Jakeschincariol/linkedin-agent-skill (MIT).

export interface HookFormula {
  id: string; // stable: saved with hook rows, keep it when renaming
  name: string;
  template: string;
  example: string;
  bestFor: string;
  trap: string;
}

export const HOOK_FORMULAS: HookFormula[] = [
  {
    id: "contrarian",
    name: "Contrarian take",
    template: "Most people say {common advice}. After {what you have seen}, I disagree.",
    example: "Everyone says clear your home loan early. After 9 years of reading CPF statements, I'm not so sure.",
    bestFor: "Starting a debate. Brings the most comments.",
    trap: "Arguing against advice nobody actually follows.",
  },
  {
    id: "number-reveal",
    name: "Number reveal",
    template: "I {did something} {N} times. Here is what came out of it.",
    example: "I reviewed 40 young families' coverage this year. 31 had the same gap.",
    bestFor: "Anything you counted: reviews, questions, a challenge.",
    trap: "Hiding the number below the first line.",
  },
  {
    id: "mistake",
    name: "Mistake confession",
    template: "{What it cost} is what {one mistake} cost me.",
    example: "A client's trust is what one rushed fact-find cost me in my first year.",
    bestFor: "Trust. People share the posts where you got it wrong.",
    trap: "A humblebrag dressed up as a mistake.",
  },
  {
    id: "before-after",
    name: "Before and after",
    template: "{Some time ago} I {low point}. Now I {better point}. One change did it.",
    example: "Two years ago I spent Sundays chasing renewals. Now Sunday is family day. One checklist did it.",
    bestFor: "Showing you have walked the road your reader is on.",
    trap: "Crediting three changes. Name the one that mattered.",
  },
  {
    id: "list",
    name: "The list",
    template: "{N} things I wish I knew before {milestone}.",
    example: "5 things I wish I knew before my first CPF top-up.",
    bestFor: "Saves. People keep lists to read again.",
    trap: "Promising more than 10. Nobody believes 15 good ones.",
  },
  {
    id: "insider",
    name: "Insider view",
    template: "After {N} years as {role}, here is what nobody tells you about {topic}.",
    example: "After 8 years as a financial consultant, here is what nobody tells you about making a claim.",
    bestFor: "A point of view backed by real years in the job.",
    trap: "Calling common knowledge a secret.",
  },
  {
    id: "callout",
    name: "The callout",
    template: "If you still {outdated habit}, stop.",
    example: "If you still keep your policy documents in a drawer only you know about, stop.",
    bestFor: "Short posts with one clear instruction.",
    trap: "Talking down to your own readers.",
  },
  {
    id: "dilemma",
    name: "Real dilemma",
    template: "{A specific situation with a real cost}. What would you do?",
    example: "Your parents ask you to pay their hospital bill and your wedding is in 6 months. What would you do?",
    bestFor: "Comments. People answer a real dilemma.",
    trap: "A question with one obvious answer.",
  },
  {
    id: "cold-open",
    name: "Cold open",
    template: "\"{A line someone said}\" Then who said it, when, and why it stuck.",
    example: "\"I thought my company insurance covered this.\" A client told me that outside a ward last year.",
    bestFor: "Story posts that keep people reading.",
    trap: "A quote no real person would say.",
  },
  {
    id: "receipt",
    name: "The receipt",
    template: "{A hard number you can show}. {One line of context}.",
    example: "12 client reviews, 9 with no will in place. One question changed that.",
    bestFor: "Anything you can back with a figure or a screenshot.",
    trap: "A number with no story behind it.",
  },
  {
    id: "myth-bust",
    name: "Myth bust",
    template: "{Popular explanation} is not why {bad outcome} happens.",
    example: "Low pay is not why most fresh grads can't save.",
    bestFor: "Reframing a belief, then giving the real reason.",
    trap: "Busting the myth without naming the real cause.",
  },
  {
    id: "side-by-side",
    name: "Side by side",
    template: "{Option A} vs {option B}. {A verdict the reader won't expect}.",
    example: "A 2-hour review once a year vs a 20-minute check every quarter. The short one wins.",
    bestFor: "Habit and process posts. Often shared.",
    trap: "An unfair fight. Say what the losing side does well.",
  },
  {
    id: "permission",
    name: "Permission",
    template: "You are allowed to {thing the reader feels guilty about}.",
    example: "You are allowed to enjoy part of your bonus before you plan the rest.",
    bestFor: "Reaching people beyond your usual followers.",
    trap: "Generic self-care with nothing about money.",
  },
  {
    id: "blunt",
    name: "Short and blunt",
    template: "{One short sentence, three words or so.}",
    example: "I almost quit.",
    bestFor: "Stopping the scroll. The white space does the work.",
    trap: "Using it every week until it reads as a habit.",
  },
  {
    id: "warning",
    name: "The warning",
    template: "{Common habit} is quietly costing you {something they care about}.",
    example: "Not updating your CPF nomination is quietly making your family wait longer.",
    bestFor: "Readers who feel the problem but haven't linked it to the cause.",
    trap: "Scaring people without giving the fix.",
  },
  {
    id: "good-great",
    name: "Good vs great",
    template: "Good {people} {do X}. Great {people} {do Y}.",
    example: "Good savers track what they spend. Great savers decide where it goes first.",
    bestFor: "Quotable one-liners people screenshot.",
    trap: "Great is just trying harder. Make it a different action.",
  },
  {
    id: "time-saved",
    name: "Time saved",
    template: "{Task} used to take me {long time}. Now it takes {short time}.",
    example: "Putting together a client's coverage summary used to take me 2 hours. Now it takes 20 minutes.",
    bestFor: "How-to posts about a tool, a system or a habit.",
    trap: "A time saving nobody believes.",
  },
  {
    id: "my-rule",
    name: "My rule",
    template: "I don't {common practice}. Ever. Here's why.",
    example: "I don't recommend a plan in the first meeting. Ever.",
    bestFor: "Positioning: draws the right clients, puts off the wrong ones.",
    trap: "A rule you break often. Someone will know.",
  },
  {
    id: "curiosity",
    name: "Curiosity gap",
    template: "The {best or worst} {thing} I ever {did} {broke the obvious rule}.",
    example: "The best client meeting I ever had, I never opened my laptop.",
    bestFor: "Getting the see-more tap.",
    trap: "Never paying it off. Close the gap by line 4.",
  },
  {
    id: "walk-away",
    name: "The walk-away",
    template: "I {turned down or stopped} {something valuable}. {What happened}.",
    example: "I turned down a client who wanted to skip the fact-find. I'd do it again.",
    bestFor: "Values posts with a real result attached.",
    trap: "Walking away at no cost. Say what it cost you.",
  },
  {
    id: "give-it-away",
    name: "Give it away",
    template: "Here is the exact {thing} I use to {outcome}. Take it.",
    example: "Here is the exact 5-question checklist I use before any policy review. Take it.",
    bestFor: "Turning readers into conversations.",
    trap: "Making people ask for it. Put it in the post.",
  },
];

export const HOOKS_PER_SET = 3;

/** The n-th set of formulas: all different, and sets don't repeat until the list runs out. */
export function hookFormulaSet(n: number): HookFormula[] {
  const len = HOOK_FORMULAS.length;
  const start = (((n * HOOKS_PER_SET) % len) + len) % len;
  return Array.from({ length: HOOKS_PER_SET }, (_, k) => HOOK_FORMULAS[(start + k) % len]);
}

export const hookFormula = (id: string | undefined) => HOOK_FORMULAS.find((f) => f.id === id);

/**
 * The brief fields for one hook written with a formula. The generator ends its
 * hook prompt with its own style line, so the formula says it overrides it.
 */
export function hookFormulaFields(
  f: HookFormula,
  base: { ideaContext?: string; styleReference?: string },
): { ideaContext: string; styleReference: string } {
  const rule = [
    `Write this hook with the "${f.name}" formula. It overrides the hook style line and any other style reference.`,
    `Shape: ${f.template}`,
    `Example of the shape only, do not reuse its facts or numbers: ${f.example}`,
    `It works for: ${f.bestFor}`,
    `Avoid this trap: ${f.trap}`,
    "No promised or guaranteed returns, no named insurers or products.",
  ].join("\n");
  const pointer = `Hook formula: ${f.name}. Follow the formula in the style reference.`;
  return {
    ideaContext: base.ideaContext ? `${base.ideaContext}\n\n${pointer}` : pointer,
    styleReference: base.styleReference ? `${base.styleReference}\n${rule}` : rule,
  };
}
