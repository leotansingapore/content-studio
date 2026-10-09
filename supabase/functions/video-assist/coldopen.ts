// video-assist mode "coldopen": which line of the edit to play first as a
// teaser before the video runs from its start (a cold open). Jev rates each
// candidate line as the very first words heard; the editor does the cutting.
// The two questions and their weights are ported from Leo's talking-head-reel
// skill (reel.py `openers`, same owner): a Score of how likely the viewer keeps
// watching (0.7 of the result) and a Noul of whether the line makes sense with
// nothing before it (0.3). Pure, so vitest covers it (coldopen.test.ts).

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { scoreOf, noulOf } from "../_shared/jev.ts";
import { CLIP_VIEWER } from "./logic.ts";

export interface ColdLine {
  s: number;
  e: number;
  text: string;
}

/** Lines rated per request, and per Jev call (two questions each). */
export const MAX_COLD = 40;
export const COLD_CHUNK = 15;
// Set from Jev runs on 2026-10-09 (jev-1.13.0) over three real takes:
// Leo's own (the talking-head-reel test, where he opened on the "$100,000"
// line): that line rated 0.46 and the take's own first line 0.23; an
// Instagram reel that already opens on its hook ("I posted 10 videos...")
// rated its first line 0.60 and its best later line 0.49; a Kallaway short,
// first line 0.41, best later line 0.58.
/** The best line must reach this (0 to 1) to open the video... */
export const COLD_MIN = 0.4;
/** ...and beat the edit's own first line by this much, or the video already opens strong. */
export const COLD_MARGIN = 0.1;

export function parseColdOpenRequest(body: unknown): { ok: true; lines: ColdLine[]; candidates: number[]; opening: number | null; title: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const lines = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, 400)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: String(x.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text);
  const candidates = [...new Set((Array.isArray(b.candidates) ? b.candidates : []).map(Number))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < lines.length)
    .slice(0, MAX_COLD);
  const opening = Number(b.opening);
  if (!lines.length) return { ok: false, error: "Caption the video first." };
  if (!candidates.length) return { ok: false, error: "No line in this edit is long enough to open with." };
  return {
    ok: true,
    lines,
    candidates,
    opening: Number.isInteger(opening) && opening >= 0 && opening < lines.length && !candidates.includes(opening) ? opening : null,
    title: String(b.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90),
  };
}

export function coldState(title: string) {
  return { viewer: CLIP_VIEWER, title: title || "(no title on screen)" };
}

/** Two questions per candidate line, in chunks of COLD_CHUNK lines. */
export function coldQuestions(lines: ColdLine[], candidates: number[]): Record<string, JevQuestion>[] {
  const chunks: Record<string, JevQuestion>[] = [];
  candidates.forEach((i, n) => {
    if (n % COLD_CHUNK === 0) chunks.push({});
    const q = chunks[chunks.length - 1];
    q[`hook_${i}`] = {
      type: "score",
      instructions: {
        line: lines[i].text,
        question: "`viewer` is scrolling short videos. `line` is the very first thing the speaker says in a video titled `title`. How likely is `viewer` to keep watching after hearing it?",
      },
      criteria: ["Swipes away: slow, vague or throat-clearing", "Might stay a second", "Likely stays: a concrete claim, number or problem they care about", "Hooked: a surprising claim, a number or a fear they feel right now"],
    };
    q[`alone_${i}`] = {
      type: "noul",
      instructions: { line: lines[i].text, question: 'Does `line` make sense heard first with no earlier context (no "that", "it", "this" pointing back to something unsaid)?' },
    };
  });
  return chunks;
}

/** Each rated line's result, 0 to 1 (2 decimals), best first; lines Jev did not rate are left out. */
export function rateColdLines(answers: Record<string, JevAnswer> | null, candidates: number[]): { i: number; p: number }[] {
  return candidates
    .flatMap((i) => {
      const hook = scoreOf(answers, `hook_${i}`);
      const alone = noulOf(answers, `alone_${i}`);
      if (hook === null || alone === null) return [];
      const p = 0.7 * Math.min(1, Math.max(0, hook / 3)) + 0.3 * Math.min(1, Math.max(0, alone));
      return [{ i, p: Math.round(p * 100) / 100 }];
    })
    .sort((a, b) => b.p - a.p || a.i - b.i);
}

/**
 * The line to open on: the best rated candidate, when it reaches COLD_MIN and
 * beats the edit's own first line (when that was rated) by COLD_MARGIN; else null.
 */
export function readColdPick(answers: Record<string, JevAnswer> | null, candidates: number[], opening: number | null): { i: number; p: number } | null {
  const best = rateColdLines(answers, candidates)[0];
  if (!best || best.p < COLD_MIN) return null;
  const start = opening === null ? undefined : rateColdLines(answers, [opening])[0];
  return start && best.p < start.p + COLD_MARGIN ? null : best;
}
