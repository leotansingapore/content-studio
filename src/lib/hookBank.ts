// The hook bank (/swipe?tab=hooks, Leo only; docs/north-star/items/remix-patterns.md part B): Write's 21 hook
// formulas, each with the real opening lines filed under it, best ratio first. Lines come from the weekly top-posts
// drop (src/data/hookBank.json, tagged by scripts/hook-bank.mjs; empty until its first run) and from the posts What
// worked tagged for your own Following accounts (the patterns cache). A line counts when its post did at least its
// account's usual (ratio 1.0 or more).

import bankData from "@/data/hookBank.json";
import type { FollowedAccount } from "@/lib/following";
import { HOOK_FORMULAS, type HookFormula } from "@/lib/hookFormulas";
import type { PatternsState } from "@/lib/patterns";
import { scoreAccount } from "../../supabase/functions/_shared/outlier.ts";
import { PSYCHOLOGY } from "../../supabase/functions/_shared/tags.ts";

export interface HookLine {
  id: string;
  /** The opening line, 140 characters at most. */
  text: string;
  /** A HOOK_FORMULAS id. */
  formula: string;
  /** A PSYCHOLOGY id; null when Jev was unsure (and always for Following lines). */
  psychology: string | null;
  /** "@handle" */
  from: string;
  ratio: number;
  url: string | null;
  /** From your own Following, not the drop. */
  following?: boolean;
}

export interface HookBank {
  fetched: string | null;
  /** Formula id -> what makes its example stop the scroll (a PSYCHOLOGY id), null when unsure. */
  formulas: Record<string, string | null>;
  hooks: HookLine[];
}

const FORMULA_IDS = new Set(HOOK_FORMULAS.map((f) => f.id));
/** The "Why it works" filter's values: PSYCHOLOGY without "other". */
export const WHY = PSYCHOLOGY.filter((p) => p.id !== "other");
const WHY_IDS = new Set<string>(WHY.map((p) => p.id));
export const whyLabel = (id: string | null | undefined) => WHY.find((p) => p.id === id)?.label.toLowerCase() ?? null;

/** The committed bank, read defensively: a bad or empty drop gives no lines, never a crash. */
export function readBank(raw: unknown): HookBank {
  const b = (raw ?? {}) as Partial<HookBank>;
  const formulas = b.formulas && typeof b.formulas === "object" ? b.formulas : {};
  const hooks = (Array.isArray(b.hooks) ? b.hooks : []).filter(
    (h): h is HookLine => Boolean(h) && typeof h.text === "string" && h.text.trim() !== "" && FORMULA_IDS.has(h.formula) && typeof h.ratio === "number" && h.ratio >= 1,
  );
  return {
    fetched: typeof b.fetched === "string" ? b.fetched : null,
    formulas: Object.fromEntries(Object.entries(formulas).map(([k, v]) => [k, typeof v === "string" && WHY_IDS.has(v) ? v : null])),
    hooks: hooks.map((h) => ({ ...h, psychology: WHY_IDS.has(h.psychology ?? "") ? h.psychology : null, url: typeof h.url === "string" ? h.url : null })),
  };
}

export const HOOK_BANK = readBank(bankData);

/** A caption's first sentence, cut at a word to 140 characters (scripts/hook-bank.mjs's rule). */
export function openingLine(caption: string): string {
  const text = caption.replace(/\s+/g, " ").trim();
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  return first.length <= 140 ? first : `${first.slice(0, 137).replace(/\s+\S*$/, "")}...`;
}

/** Your Following's lines: posts What worked tagged with a formula, still in the account's posts, at its usual or better. */
export function followingLines(following: FollowedAccount[], patterns: PatternsState, now = Date.now()): HookLine[] {
  const out: HookLine[] = [];
  for (const a of following) {
    const tags = patterns[`${a.platform}:${a.handle}`]?.tags;
    if (!tags) continue;
    const scores = scoreAccount(a.posts, now);
    for (const p of a.posts) {
      const formula = tags[p.id]?.formula ?? "";
      const ratio = scores[p.id]?.ratio;
      const text = openingLine(p.caption ?? "");
      if (!FORMULA_IDS.has(formula) || ratio == null || ratio < 1 || !text) continue;
      out.push({ id: `${a.platform}:${p.id}`, text, formula, psychology: null, from: `@${a.handle}`, ratio: Math.round(ratio * 10) / 10, url: p.url || null, following: true });
    }
  }
  return out;
}

export interface HookCard {
  formula: HookFormula;
  /** What makes the formula work, a PSYCHOLOGY id. */
  why: string | null;
  lines: HookLine[];
}

/**
 * The formula cards with their lines, best ratio first. A Following line takes its formula's "why". With `why`, a card
 * stays when its own why matches or a line's does; with a search, when its name, template or example matches (all its
 * lines) or a line does (only those lines).
 */
export function hookCards(lines: HookLine[], o: { formula?: string; why?: string; q?: string } = {}, whyOf: Record<string, string | null> = HOOK_BANK.formulas): HookCard[] {
  const words = (o.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  const why = o.why && o.why !== "all" ? o.why : null;
  return HOOK_FORMULAS.flatMap((f) => {
    if (o.formula && o.formula !== "all" && o.formula !== f.id) return [];
    const own = whyOf[f.id] ?? null;
    let mine = lines.filter((l) => l.formula === f.id && (!why || (l.psychology ?? own) === why));
    if (why && own !== why && !mine.length) return [];
    if (words.length && !hit(`${f.name} ${f.template} ${f.example}`)) {
      mine = mine.filter((l) => hit(l.text));
      if (!mine.length) return [];
    }
    return [{ formula: f, why: own, lines: [...mine].sort((a, b) => b.ratio - a.ratio) }];
  });
}
