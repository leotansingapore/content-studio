import type { JevAnswer } from "../_shared/jev.ts";
import { ADVISER } from "../_shared/profession.ts";

export const PROFESSION_PICKS = {
  adviser: ADVISER,
  coach: "Coach",
  consultant: "Consultant",
  realtor: "Real estate agent",
  freelancer: "Freelancer",
  lawyer: "Lawyer",
} as const;

export type ProfessionKey = keyof typeof PROFESSION_PICKS;

export const professionAsk = {
  type: "choice" as const,
  instructions: "What does the person or business behind this website do for a living?",
  criteria: {
    adviser: "A financial adviser, planner or insurance agent: insurance, savings, investment or retirement plans for clients",
    coach: "A coach: career, life, business, health or fitness coaching for people",
    consultant: "A consultant or agency doing projects or services for other businesses",
    realtor: "A real estate agent or agency: buying, selling or renting homes and property",
    freelancer: "One person selling their own services, like design, writing, photography or software",
    lawyer: "A lawyer or a law firm",
    other: "Something else: a shop, a product, an app, a clinic, a school, a restaurant or a large company, or the page doesn't say",
  },
};

// set from the 13 Nov shadow run: 0.6 named postmosis.com a freelancer at 0.80; 0.85 fills 18 of 30 labelled sites, 0 wrong
export const PROFESSION_MIN = 0.85;

export const professionAnswer = (answers: Record<string, JevAnswer> | null): { key: string | null; p: number | null } => {
  const a = answers?.profession;
  const key = typeof a?.choice === "string" ? a.choice : null;
  const p = key ? a?.probabilities?.[key] : undefined;
  return { key, p: typeof p === "number" && Number.isFinite(p) ? p : null };
};

export function professionFrom(answers: Record<string, JevAnswer> | null, min = PROFESSION_MIN): string {
  const { key, p } = professionAnswer(answers);
  if (!key || p === null || p < min || !Object.keys(PROFESSION_PICKS).includes(key)) return "";
  return PROFESSION_PICKS[key as ProfessionKey];
}

export const aboutText = (written: { oneLiner?: string; audienceDetail?: string } | null, description: string) =>
  [written?.oneLiner, written?.audienceDetail, description].filter(Boolean).join(" ").slice(0, 1500);
