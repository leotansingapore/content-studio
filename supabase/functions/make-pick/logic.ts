// The formats that suit an ask (the agent's make skills, src/lib/makeSkills.ts): the app sends the message, what the
// brand sells and who for, and the formats it could make (each one line: its name and what it shows), and Jev ranks
// them. The agent shows the top SHOWN as a numbered pick list. Pure apart from nothing: index.ts asks Jev.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";

export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = 40;
export const SHOWN = 4;
const ID = /^[a-z0-9-]{1,60}$/;

export interface PickBody {
  message: string;
  brand: { sells: string; serves: string };
  candidates: { id: string; line: string }[];
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The request, or null when there is nothing to rank. Ids repeat at most once; blank lines are dropped. */
export function pickBody(raw: unknown): PickBody | null {
  const r = (raw ?? {}) as { message?: unknown; brand?: { sells?: unknown; serves?: unknown }; candidates?: unknown };
  const message = text(r.message, 500);
  if (!message || !Array.isArray(r.candidates)) return null;
  const seen = new Set<string>();
  const candidates = r.candidates
    .map((c) => ({ id: typeof c?.id === "string" ? c.id : "", line: text(c?.line, 200) }))
    .filter((c) => ID.test(c.id) && c.line && !seen.has(c.id) && seen.add(c.id))
    .slice(0, MAX_CANDIDATES);
  if (candidates.length < MIN_CANDIDATES) return null;
  return { message, brand: { sells: text(r.brand?.sells, 300), serves: text(r.brand?.serves, 200) }, candidates };
}

/** One choice over the formats, keyed f1, f2... in the order sent. */
export function pickAsk(b: PickBody): { state: Record<string, string>; questions: Record<string, JevQuestion> } {
  return {
    state: { message: b.message, ...(b.brand.sells ? { sells: b.brand.sells } : {}), ...(b.brand.serves ? { serves: b.brand.serves } : {}) },
    questions: {
      format: {
        type: "choice",
        instructions:
          "`message` asks a content app to make something for a business: `sells` is what the business sells and `serves` who it serves. Which of these formats would make the strongest piece for what the message asks, for this business and the people it serves?",
        criteria: Object.fromEntries(b.candidates.map((c, i) => [`f${i + 1}`, c.line])),
      },
    },
  };
}

/** The ids Jev ranked highest, best first, at most SHOWN; null when Jev gave no answer. */
export function ranked(answers: Record<string, JevAnswer> | null, b: PickBody): string[] | null {
  const a = answers?.format;
  if (!a) return null;
  const at = (k: string) => b.candidates[Number(k.slice(1)) - 1]?.id;
  const probs = Object.entries(a.probabilities ?? {}).filter(([k, p]) => at(k) && typeof p === "number" && Number.isFinite(p));
  const order = probs.sort((x, y) => y[1] - x[1]).map(([k]) => at(k)!);
  const first = typeof a.choice === "string" ? at(a.choice) : undefined;
  const ids = [...new Set([...(first ? [first] : []), ...order])].slice(0, SHOWN);
  return ids.length ? ids : null;
}
