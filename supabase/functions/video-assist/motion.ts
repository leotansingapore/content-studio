// video-assist mode "motion": Jev picks the key lines of a filmed talking head
// (the editor zooms in on them, drops the music on the strongest and puts a
// pop-up on the top few). Jev decides which lines matter; the editor lays them
// out in code (spacing, a budget per minute, clear of the hook card), so the
// picks survive later cuts. Pure, so vitest covers it (motion.test.ts).

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";

export interface MotionLine {
  s: number;
  e: number;
  text: string;
}

/** Lines judged per request; Jev is asked in chunks of KEY_CHUNK questions, side by side. */
export const MAX_KEY_LINES = 120;
export const KEY_CHUNK = 30;
const MAX_STATE_CHARS = 8000;

export function parseMotionRequest(body: unknown): { ok: true; lines: MotionLine[]; duration: number; hookSeconds: number } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const duration = Number(b.duration);
  const hook = Number(b.hookSeconds);
  const lines = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, 600)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: String(x.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text);
  if (!Number.isFinite(duration) || duration < 5) return { ok: false, error: "The video is too short for key lines." };
  if (lines.length < 2) return { ok: false, error: "Caption the video first." };
  return { ok: true, lines, duration, hookSeconds: Number.isFinite(hook) ? Math.min(10, Math.max(0, hook)) : 0 };
}

/** The lines worth asking about: 3 words or more, starting once the hook card is gone. Indexes into `lines`. */
export function eligibleLines(lines: MotionLine[], hookSeconds: number): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l.s >= hookSeconds - 0.05 && l.text.split(" ").length >= 3 && out.length < MAX_KEY_LINES) out.push(i);
  });
  return out;
}

/** What Jev reads: the whole video, each line tagged, so a line is judged against the rest. */
export function keyState(lines: MotionLine[]) {
  let chars = 0;
  return {
    video: "A short talking-head video filmed by a Singapore financial adviser, as a transcript line by line.",
    transcript: lines.map((l, i) => `L${i}| ${l.text}`).filter((t) => (chars += t.length + 1) <= MAX_STATE_CHARS).join("\n"),
  };
}

/** One Noul per eligible line, in chunks: is this a line the viewer must not miss? */
export function keyQuestions(lines: MotionLine[], idx: number[]): Record<string, JevQuestion>[] {
  const chunks: Record<string, JevQuestion>[] = [];
  idx.forEach((i, n) => {
    if (n % KEY_CHUNK === 0) chunks.push({});
    chunks[chunks.length - 1][`key_${i}`] = {
      type: "noul",
      instructions: {
        line: lines[i].text,
        line_before: i > 0 ? lines[i - 1].text : "",
        question: "Is `line` (read with `line_before` and the whole `transcript`) one of the few key lines of this video, a line the viewer must not miss?",
      },
      criteria: {
        true: "The main point, a surprising fact or figure, a strong claim or warning, the answer the video promised, or the line where the story turns.",
        false: "Set-up, a greeting, filler, a transition, a repeat of an earlier point, or a call to follow, comment or message.",
      },
    };
  });
  return chunks;
}

/** Each judged line's yes probability (2 decimals), in line order; null when Jev answered none of them. */
export function readKeyLines(answers: Record<string, JevAnswer> | null, idx: number[]): { i: number; p: number }[] | null {
  if (!answers) return null;
  const out = idx.flatMap((i) => {
    const p = answers[`key_${i}`]?.noul;
    return typeof p === "number" && Number.isFinite(p) ? [{ i, p: Math.round(Math.min(1, Math.max(0, p)) * 100) / 100 }] : [];
  });
  return out.length ? out : null;
}
