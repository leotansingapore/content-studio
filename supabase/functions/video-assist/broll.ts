// video-assist mode "broll": B-roll placed for you on a filmed talking head.
// Jev picks the lines a cutaway visual helps (a few a minute, never the hook);
// the LLM writes a 1 to 3 word English stock search for each, in script order
// (the idea of MoneyPrinterTurbo's generate_terms); the editor finds the clips
// with stock-media and places them (src/lib/autoBroll.ts). Pure, so vitest
// covers it (broll.test.ts).

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { KEY_CHUNK, MAX_KEY_LINES, parseMotionRequest, type MotionLine } from "./motion.ts";

/** Jev's yes probability a line needs before it gets B-roll. */
export const BROLL_MIN = 0.5;
/** Seconds between the starts of two picks, so cutaways never run back to back. */
export const BROLL_GAP = 5;
/** Picks a minute of video, and on one video (the editor's MAX_BROLL). */
export const BROLL_PER_MIN = 3;
export const MAX_PICKS = 10;
/** The spoken hook: nothing before this many seconds, and never the first line. */
export const HOOK_FLOOR = 3;
const SEARCH_CHARS = 40;

export interface BrollRequest {
  lines: MotionLine[];
  duration: number;
  hookSeconds: number;
  /** Stretches already covered by B-roll on the edited timeline: their lines are left alone. */
  taken: { s: number; e: number }[];
  /** How many more clips fit on the video. */
  room: number;
}

export function parseBrollRequest(body: unknown): { ok: true; request: BrollRequest } | { ok: false; error: string } {
  const m = parseMotionRequest(body);
  if (!m.ok) return { ok: false, error: m.error.includes("short") ? "The video is too short for B-roll." : m.error };
  const b = body as Record<string, unknown>;
  const taken = (Array.isArray(b.taken) ? b.taken : [])
    .slice(0, 50)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s);
  const room = Number.isFinite(Number(b.room)) ? Math.min(MAX_PICKS, Math.max(0, Math.floor(Number(b.room)))) : MAX_PICKS;
  if (!room) return { ok: false, error: `This video already has ${MAX_PICKS} B-roll clips.` };
  return { ok: true, request: { lines: m.lines, duration: m.duration, hookSeconds: m.hookSeconds, taken, room } };
}

/** The lines worth asking about: 3 words or more, past the hook, not the first line, clear of B-roll already there. */
export function brollLines(r: Pick<BrollRequest, "lines" | "hookSeconds" | "taken">): number[] {
  const from = Math.max(r.hookSeconds, HOOK_FLOOR) - 0.05;
  const out: number[] = [];
  r.lines.forEach((l, i) => {
    if (i === 0 || l.s < from || l.text.split(" ").length < 3 || out.length >= MAX_KEY_LINES) return;
    if (r.taken.some((t) => l.s < t.e && l.e > t.s)) return;
    out.push(i);
  });
  return out;
}

/** One Noul per line, in chunks: would a cutaway picture help while this is said? */
export function brollQuestions(lines: MotionLine[], idx: number[]): Record<string, JevQuestion>[] {
  const chunks: Record<string, JevQuestion>[] = [];
  idx.forEach((i, n) => {
    if (n % KEY_CHUNK === 0) chunks.push({});
    chunks[chunks.length - 1][`broll_${i}`] = {
      type: "noul",
      instructions: {
        line: lines[i].text,
        line_before: i > 0 ? lines[i - 1].text : "",
        question: "While `line` is said (read with `line_before` and the whole `transcript`), would cutting away to a short visual (B-roll) help the viewer more than staying on the speaker's face?",
      },
      criteria: {
        true: "The line names or describes something a picture can show: a place, an object, people doing something, a life event, money, a product, a number or an idea a simple visual makes clearer.",
        false: "The speaker's own opinion, feeling or story beat where their face carries it, a greeting, set-up, filler, a question to the viewer, or a call to follow, comment or message.",
      },
    };
  });
  return chunks;
}

/** Each judged line's yes probability, or null when Jev answered none of them. */
export function readBroll(answers: Record<string, JevAnswer> | null, idx: number[]): { i: number; p: number }[] | null {
  if (!answers) return null;
  const out = idx.flatMap((i) => {
    const p = answers[`broll_${i}`]?.noul;
    return typeof p === "number" && Number.isFinite(p) ? [{ i, p }] : [];
  });
  return out.length ? out : null;
}

/** The lines that get B-roll: the likeliest first, BROLL_GAP seconds apart, up to 3 a minute and the room left; in script order. */
export function pickBrollLines(lines: MotionLine[], probs: { i: number; p: number }[], duration: number, room: number): number[] {
  const budget = Math.min(room, MAX_PICKS, Math.max(1, Math.ceil((duration / 60) * BROLL_PER_MIN)));
  const out: number[] = [];
  for (const k of [...probs].filter((x) => x.p >= BROLL_MIN).sort((a, b) => b.p - a.p)) {
    if (out.length >= budget) break;
    if (out.some((i) => Math.abs(lines[i].s - lines[k.i].s) < BROLL_GAP)) continue;
    out.push(k.i);
  }
  return out.sort((a, b) => a - b);
}

export function buildSearchMessages(lines: MotionLine[], pick: number[]): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You write stock video search terms for the B-roll in a short video a Singapore financial adviser filmed. A stock clip plays over each line while it is said.",
        "For each line: search, 1 to 3 English words a stock video library such as Pexels would match. Name something a camera can film (people, places, objects, actions), never an abstract word alone. Keep it general enough to find: family dinner, hospital bed, coins in jar, couple signing papers.",
        "Never a brand, a company, a person's name or words on screen. Keep the terms in the order of the lines: earlier terms show earlier moments.",
        'Reply with JSON only: {"terms":[{"id":"L3","search":string}]}',
      ].join("\n"),
    },
    { role: "user", content: pick.map((i) => `L${i}: ${lines[i].text}${i > 0 ? `\n(said just before: ${lines[i - 1].text})` : ""}`).join("\n") },
  ];
}

/** A search for each asked line: letters, digits, spaces and hyphens only, 3 words at most. Lines left out are dropped. */
export function parseSearchReply(content: string | null, pick: number[]): { i: number; search: string }[] {
  if (!content) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray((raw as { terms?: unknown })?.terms) ? (raw as { terms: unknown[] }).terms : [];
  const out: { i: number; search: string }[] = [];
  for (const x of list) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const i = Number(String(o.id ?? "").replace(/^L/, ""));
    if (!pick.includes(i) || out.some((p) => p.i === i)) continue;
    const search = String(o.search ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ").slice(0, SEARCH_CHARS).trim();
    if (search) out.push({ i, search });
  }
  return out.sort((a, b) => a.i - b.i);
}
