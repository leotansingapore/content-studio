// Hook card ideas in the video editor: three lines written from what is said,
// each in a different named formula (hookFormulas.ts), and the one Jev would
// start with (video-assist mode "hooks", one "vibe-edit" use).

import { callFn } from "@/lib/edgeFn";
import { hookFormula, type HookFormula } from "@/lib/hookFormulas";
import type { Sentence } from "@/lib/videoEdit";

/** Formulas that work as a few words on screen over a talking head, three at a time, mixed. */
export const CARD_SETS = [
  ["number-reveal", "warning", "contrarian"],
  ["myth-bust", "list", "curiosity"],
  ["callout", "mistake", "receipt"],
  ["insider", "good-great", "blunt"],
] as const;

/** The n-th set of formulas, round and round. */
export function cardFormulas(n: number): HookFormula[] {
  const set = CARD_SETS[((n % CARD_SETS.length) + CARD_SETS.length) % CARD_SETS.length];
  return set.map((id) => hookFormula(id)!);
}

export interface HookIdeas {
  hooks: { formula: string; text: string }[];
  /** Jev's pick to start with, or null when it had no clear answer. */
  pick: number | null;
}

/** The reply, kept only when well formed: 2-3 hooks of plain text, a pick that points at one of them. */
export function sanitizeIdeas(raw: unknown): HookIdeas | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hooks = (Array.isArray(r.hooks) ? r.hooks : [])
    .filter((h): h is { formula: string; text: string } => !!h && typeof h.formula === "string" && typeof h.text === "string" && !!h.text.trim())
    .slice(0, 3)
    .map((h) => ({ formula: h.formula, text: h.text.trim().slice(0, 90) }));
  if (hooks.length < 2) return null;
  const pick = typeof r.pick === "number" && Number.isInteger(r.pick) && r.pick >= 0 && r.pick < hooks.length ? r.pick : null;
  return { hooks, pick };
}

export async function writeHooks(sentences: Sentence[], duration: number, set: number): Promise<HookIdeas> {
  const formulas = cardFormulas(set).map(({ id, name, template, example, trap }) => ({ id, name, template, example, trap }));
  const res = sanitizeIdeas(await callFn("video-assist", { mode: "hooks", sentences, duration, formulas }, "Couldn't write hooks right now. Try again in a minute."));
  if (!res) throw new Error("The hooks came back incomplete. Try again.");
  return res;
}
