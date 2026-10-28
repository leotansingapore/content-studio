// What a brand's owner does, from the brand kit's "What do you do?" (src/components/ProfessionField.tsx), and what every
// AI writer does with it. Empty is a financial adviser: today's adviser prompts, byte for byte, which is also what any
// caller that sends no profession gets (the academy hub's Content Studio page, an older app build).
// No Deno or npm imports: the app imports this too.

export const ADVISER = "Financial adviser";
/** The common answers offered as chips; anything else is typed. */
export const PROFESSION_CHOICES = [ADVISER, "Coach", "Consultant", "Real estate agent", "Freelancer", "Lawyer"] as const;
export const MAX_PROFESSION_CHARS = 60;

/** The adviser chip as typed, both spellings, lower case: an exact match after trimming, nothing looser. */
const ADVISER_NAMES = ["financial adviser", "financial advisor"];

/** True for nothing set and for the adviser chip as typed (either spelling, any case, trimmed): both keep the adviser prompts. */
export const isAdviser = (p: unknown) => typeof p !== "string" || !p.trim() || ADVISER_NAMES.includes(p.trim().toLowerCase());

/**
 * The profession a writer gets, as one plain line in the brand's words ("Real estate agent" reads "real estate agent"
 * mid-sentence; "CPA" stays), or "" for an adviser. Only letters, digits, spaces and . , ' & ( ) / + - are kept, so it
 * can't open a new prompt line or a replace pattern ($&); writers still put it in with a replacer function.
 */
export function professionOf(raw: unknown): string {
  if (isAdviser(raw)) return "";
  const p = (raw as string).replace(/[^\p{L}\p{M}\p{N} .,'&()/+-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PROFESSION_CHARS).trim();
  return /^\p{Lu}\p{Ll}/u.test(p) ? p[0].toLowerCase() + p.slice(1) : p;
}

/** "a coach", "an accountant". */
export const aOrAn = (p: string) => `${/^[aeiou]/i.test(p) ? "an" : "a"} ${p}`;

/**
 * The honesty every brand keeps whatever it does, said for a person (the business speaker's rules, idea-dump
 * BUSINESS_RULE_LINES and remix FACTS_ONLY, which a business already gets in Leo's north-star modes).
 */
export const HONEST_LINE = "Never invent a number, a result, a client story or a testimonial, and never promise an outcome.";
