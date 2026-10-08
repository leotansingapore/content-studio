// Engage this week (Discover > Following): the 2 "likely clients" are people
// who commented on the adviser's own recent posts (kept by the account audit),
// and Jev judges which comments sound like someone thinking about their own
// money. Pure, so vitest covers the candidates, the questions and the pick.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import type { Commenter } from "../_shared/socialAudit.ts";

export const MAX_CANDIDATES = 15;
const WINDOW_DAYS = 45;
/** Below this, Jev doesn't call it a likely client and the person shows as a recent commenter instead. */
export const LIKELY_AT = 0.3;

export interface AuditLike {
  platform: string;
  handle: string;
  posts?: { url?: string; postedAt?: string | null; commenters?: Commenter[] }[] | null;
}

export interface Candidate extends Commenter {
  platform: string;
  postUrl: string;
}

/** Everyone who commented on the adviser's posts in the last 45 days, one each with all their comments (newest first), newest commenter first. */
export function candidatesFrom(audits: AuditLike[], now = Date.now()): Candidate[] {
  const own = new Set(audits.map((a) => a.handle));
  const best = new Map<string, Candidate>();
  for (const a of audits) {
    for (const p of a.posts ?? []) {
      for (const c of p.commenters ?? []) {
        const when = c.at ? Date.parse(c.at) : p.postedAt ? Date.parse(p.postedAt) : NaN;
        if (!Number.isFinite(when) || now - when > WINDOW_DAYS * 86_400_000 || own.has(c.user)) continue;
        const key = `${a.platform}:${c.user}`;
        const prev = best.get(key);
        const cand = { ...c, at: c.at ?? p.postedAt ?? null, platform: a.platform, postUrl: p.url ?? "" };
        if (!prev) best.set(key, cand);
        else {
          const [newer, older] = (prev.at ?? "") < (cand.at ?? "") ? [cand, prev] : [prev, cand];
          best.set(key, { ...newer, text: `${newer.text} / ${older.text}`.slice(0, 400) });
        }
      }
    }
  }
  return [...best.values()].sort((x, y) => (y.at ?? "").localeCompare(x.at ?? "")).slice(0, MAX_CANDIDATES);
}

/** Jev reads English best: a comment that is mostly other scripts gets no judgment. */
export const readable = (t: string) => {
  const letters = t.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters.replace(/[^A-Za-z]/g, "").length / letters.length >= 0.7;
};

export function jevAsk(cands: Candidate[]): { state: Record<string, string>; questions: Record<string, JevQuestion> } {
  const state: Record<string, string> = {};
  const questions: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    if (!readable(c.text)) return;
    state[`c${i}`] = c.text;
    questions[`c${i}`] = {
      type: "noul",
      instructions: `\`c${i}\` is a comment on a Singapore financial adviser's social media post. Does the person who wrote it sound like a possible client?`,
      criteria: {
        true: "Someone thinking about their own money, insurance, savings, investments, CPF, retirement or a financial decision, or asking the adviser something about it.",
        false: "A friend's greeting, an emoji or one-word reaction, a bot or spam, a business promoting itself, or another adviser.",
      },
    };
  });
  return { state, questions };
}

export interface Pick extends Candidate {
  why: "likely" | "recent";
}

/** The 2 people to reach out to: the likeliest clients by Jev, topped up with the newest commenters. */
export function pickClients(cands: Candidate[], answers: Record<string, JevAnswer> | null, n = 2): Pick[] {
  const scored = cands
    .map((c, i) => ({ c, p: answers?.[`c${i}`]?.noul }))
    .filter((x): x is { c: Candidate; p: number } => typeof x.p === "number" && x.p >= LIKELY_AT)
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map((x) => ({ ...x.c, why: "likely" as const }));
  const rest = cands.filter((c) => !scored.some((s) => s.user === c.user && s.platform === c.platform)).slice(0, n - scored.length);
  return [...scored, ...rest.map((c) => ({ ...c, why: "recent" as const }))];
}
