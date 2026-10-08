// video-assist mode "hooks": three lines for the hook card of a filmed video,
// each written by the LLM in a different named formula (src/lib/hookFormulas.ts)
// from what the speaker says, and Jev's pick of the one to start with: the
// question Write's hooks already ask (writing-judge, asked in both option orders,
// a pick only when it leads by PICK_MARGIN). The LLM writes, Jev picks. Pure,
// so vitest covers it (hooks.test.ts).

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { hookQuestions, hookState, readHookPick } from "../writing-judge/logic.ts";

export interface FormulaIn {
  id: string;
  name: string;
  template: string;
  example: string;
  trap: string;
}

export interface HookLine {
  s: number;
  e: number;
  text: string;
}

/** The card is read in about 2 seconds: the LLM is asked for 10 words at most; the editor keeps 90 characters. */
export const HOOK_WORDS = 10;
export const HOOK_CHARS = 90;
const MAX_LINES = 400;
const MAX_CHARS = 6000;

const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function parseHooksRequest(body: unknown): { ok: true; lines: HookLine[]; duration: number; formulas: FormulaIn[] } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  let chars = 0;
  const lines = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, MAX_LINES)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: str(x.text, 300) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text)
    .filter((x) => (chars += x.text.length + 1) <= MAX_CHARS);
  const formulas = (Array.isArray(b.formulas) ? b.formulas : [])
    .slice(0, 3)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ id: str(x.id, 30), name: str(x.name, 40), template: str(x.template, 200), example: str(x.example, 240), trap: str(x.trap, 160) }))
    .filter((f) => /^[a-z-]+$/.test(f.id) && f.name && f.template);
  const duration = Number(b.duration);
  if (!Number.isFinite(duration) || duration < 3) return { ok: false, error: "The video is too short for a hook." };
  if (!lines.length) return { ok: false, error: "Caption the video first." };
  if (formulas.length < 2 || new Set(formulas.map((f) => f.id)).size !== formulas.length) return { ok: false, error: "Send two or three hook formulas." };
  return { ok: true, lines, duration, formulas };
}

export function buildHooksMessages(lines: HookLine[], formulas: FormulaIn[]): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You write the hook card for a short video a Singapore financial adviser filmed: the line set large on screen for the first seconds, read before the viewer decides to stay.",
        "Write one hook for each formula given, in that formula's shape, using only what the speaker says: their facts, figures, claims and stories.",
        `At most ${HOOK_WORDS} words: it is read in two seconds, so compress the formula's shape, shorter is better. Sentence case, plain words. Never invent a number, a client or a result; if a formula needs a number the speaker never says, keep its shape without one.`,
        "Never promise returns or guarantees and never name an insurer or a product. No em dashes, hashtags, emoji or quote marks.",
        'Reply with JSON only: {"hooks":[{"id":"<formula id>","text":string}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Formulas:",
        ...formulas.map((f) => `- ${f.id} (${f.name}). Shape: ${f.template} Example of the shape only, never its facts: ${f.example} Avoid: ${f.trap}`),
        "",
        "What they say:",
        lines.map((l) => l.text).join(" "),
      ].join("\n"),
    },
  ];
}

/**
 * A card line: one line, no quotes, hashtags or em dashes. One over the card's
 * 90 characters keeps its whole first sentences that fit, never half a sentence;
 * with none that fit it is dropped ("").
 */
export function cleanHook(v: unknown): string {
  const t = String(v ?? "")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/["\u201c\u201d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= HOOK_CHARS) return t;
  return (t.slice(0, HOOK_CHARS + 1).match(/^.*[.!?](?=\s|$)/)?.[0] ?? "").trim();
}

/** One hook per asked formula, in the asked order, distinct; null with fewer than two. */
export function parseHooksReply(content: string | null, formulas: FormulaIn[]): { formula: string; text: string }[] | null {
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const list = Array.isArray((raw as { hooks?: unknown })?.hooks) ? (raw as { hooks: unknown[] }).hooks : [];
  const out: { formula: string; text: string }[] = [];
  for (const f of formulas) {
    const o = list.find((x) => x && typeof x === "object" && (x as Record<string, unknown>).id === f.id) as Record<string, unknown> | undefined;
    const text = cleanHook(o?.text);
    if (text.split(" ").length >= 2 && !out.some((h) => h.text.toLowerCase() === text.toLowerCase())) out.push({ formula: f.id, text });
  }
  return out.length >= 2 ? out : null;
}

/** What Jev reads: where the card shows, who scrolls past, and what the video is about (its opening lines). */
export function hooksState(texts: string[], lines: HookLine[]) {
  return hookState({ hooks: texts, audience: "", topic: lines.map((l) => l.text).join(" ").slice(0, 400), platform: "Instagram Reels, TikTok and YouTube Shorts" });
}

export function hooksQuestions(texts: string[]): Record<string, JevQuestion> {
  return hookQuestions(texts);
}

/** The index of the hook Jev would start with, or null (no answer, or no hook clearly leads). */
export function hooksPick(answers: Record<string, JevAnswer> | null, count: number): number | null {
  return readHookPick(answers, count)?.index ?? null;
}
