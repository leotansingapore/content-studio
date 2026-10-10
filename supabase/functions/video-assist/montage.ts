// video-assist modes "montage" and "montage-pick": a video from a theme, no filming.
//   montage: the LLM writes 6 to 10 beats (a shot to find, two stock searches, optional words on screen,
//     seconds), and Jev picks the one colour grade over all of them (a decision, so not the LLM).
//   montage-pick: for each beat the editor found stock candidates for, Jev picks the one that fits it,
//     or says none does (the editor then tries the broader search, and tells the adviser what it used).
// Pure, so vitest covers it (montage.test.ts). Candidates are described by their Pexels page name
// (a slug like "woman-walking-on-street"), the only words a stock video carries; Jev reads text only.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";

/** The colour looks of the editor (src/lib/videoEdit.ts FILTERS); montage.test.ts keeps the two lists equal. */
export const GRADES = {
  warm: "Warm, golden and friendly: mornings, family, home, hope, new starts.",
  cool: "Cool and calm: city, work, planning, steady and professional.",
  vivid: "Bright and punchy: energy, fun, food, colour, high spirits.",
  mono: "Black and white: serious, reflective, dramatic or timeless.",
  film: "Soft faded film: nostalgic, gentle, memories, slow days.",
} as const;
export type Grade = keyof typeof GRADES;
export const DEFAULT_GRADE: Grade = "warm";

export const MIN_BEATS = 6;
export const MAX_BEATS = 10;
export const BEAT_MIN = 2;
export const BEAT_MAX = 6;
export const LEN_MIN = 20;
export const LEN_MAX = 45;
export const MAX_THEME = 80;
export const TEXT_CHARS = 32;
export const MAX_CANDIDATES = 6;

export interface Beat {
  /** The shot, in a sentence: what Jev reads to match a clip. */
  say: string;
  /** A 1 to 3 word stock search, and a broader one for when it finds nothing that fits. */
  search: string;
  fallback: string;
  /** Words on screen over the beat, or empty. */
  text: string;
  seconds: number;
}

export function parseMontageRequest(body: unknown): { ok: true; theme: string; seconds: number } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const theme = typeof b.theme === "string" ? b.theme.replace(/\s+/g, " ").trim() : "";
  if (theme.length < 3) return { ok: false, error: "Type a theme for the montage." };
  if (theme.length > MAX_THEME) return { ok: false, error: `Keep the theme under ${MAX_THEME} characters.` };
  const n = Number(b.seconds);
  return { ok: true, theme, seconds: Math.min(LEN_MAX, Math.max(LEN_MIN, Number.isFinite(n) ? Math.round(n) : 30)) };
}

export function buildMontageMessages(theme: string, seconds: number): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You plan a short montage for a Singapore financial adviser to post. No filming: each beat is filled with a stock video clip.",
        `Write ${MIN_BEATS} to ${MAX_BEATS} beats that add up to about ${seconds} seconds, each ${BEAT_MIN} to ${BEAT_MAX} seconds, in the order they play. Open on the strongest image and close on a calm one.`,
        "Each beat: say (the shot in one plain sentence, at most 90 characters, something a camera can film), search (1 to 3 English words a stock library such as Pexels would match), fallback (1 to 2 broader English words for when search finds nothing), text (words on screen over the beat, at most 32 characters, sentence case, or an empty string; give words to about half the beats), seconds.",
        "Singapore is the default: people are Singaporean or Asian, places are Singapore (HDB blocks, hawker centres, MRT, Marina Bay) when the theme allows. Searches stay general enough to find: asian woman commuting, hawker centre, city skyline at dawn. Never a brand, a person's name or words on screen in a search.",
        "On-screen words are short and warm, in the adviser's voice. Never invent a number or a fact, never promise returns or guarantees. No emoji, em dashes, quote marks or hashtags.",
        'Reply with JSON only: {"beats":[{"say":string,"search":string,"fallback":string,"text":string,"seconds":number}]}',
      ].join("\n"),
    },
    { role: "user", content: `Theme: ${theme}` },
  ];
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s*—\s*/g, ", ").replace(/["“”#]/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const terms = (v: unknown, n: number) => String(v ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/** Beats of 2 to 6 s that run for about `want` seconds: surplus beats are dropped from the end (never below 6), then the lengths scaled. */
export function fitBeats(beats: Beat[], want: number): Beat[] {
  const out = beats.slice(0, MAX_BEATS).map((b) => ({ ...b, seconds: Math.min(BEAT_MAX, Math.max(BEAT_MIN, b.seconds)) }));
  const sum = () => out.reduce((n, b) => n + b.seconds, 0);
  while (out.length > MIN_BEATS && sum() > want + 3) out.pop();
  const total = sum();
  if (total < want - 3 || total > want + 3) {
    const k = want / total;
    for (const b of out) b.seconds = Math.min(BEAT_MAX, Math.max(BEAT_MIN, Math.round(b.seconds * k * 10) / 10));
  }
  return out;
}

/** The beats the LLM wrote, cleaned and fitted; null when fewer than MIN_BEATS usable ones came back. */
export function parseMontageReply(content: string | null, want: number): Beat[] | null {
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const list = Array.isArray((raw as { beats?: unknown })?.beats) ? (raw as { beats: unknown[] }).beats : [];
  const beats = list.flatMap((x): Beat[] => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const search = terms(o.search, 3);
    const say = clean(o.say, 90);
    if (!search || !say) return [];
    let text = clean(o.text, 200).replace(/[.]$/, "");
    if (text.length > TEXT_CHARS) text = text.slice(0, TEXT_CHARS + 1).replace(/\s+\S*$/, "");
    const n = Number(o.seconds);
    return [{ say, search, fallback: terms(o.fallback, 2) || search, text, seconds: Number.isFinite(n) ? n : 4 }];
  });
  return list.length && beats.length >= MIN_BEATS ? fitBeats(beats, want) : null;
}

/** One Choice: the grade that suits the theme. */
export function gradeQuestion(theme: string): Record<string, JevQuestion> {
  return { grade: { type: "choice", instructions: { theme, question: "Which colour grade suits a montage on `theme`?" }, criteria: { ...GRADES } } };
}

export function readGrade(answers: Record<string, JevAnswer> | null): Grade {
  const c = answers?.grade?.choice;
  return typeof c === "string" && c in GRADES ? (c as Grade) : DEFAULT_GRADE;
}

// ---------- which clip fits a beat ----------

export interface PickAsk {
  say: string;
  /** Stock candidates, each described by its Pexels page name. */
  candidates: { desc: string }[];
}

export function parsePickRequest(body: unknown): { ok: true; theme: string; beats: PickAsk[] } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const list = Array.isArray(b.beats) ? b.beats.slice(0, MAX_BEATS) : [];
  const beats = list.map((x): PickAsk => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const cands = (Array.isArray(o.candidates) ? o.candidates : []).slice(0, MAX_CANDIDATES).map((c) => ({ desc: clean((c as { desc?: unknown })?.desc, 100) }));
    return { say: clean(o.say, 90), candidates: cands };
  });
  if (!beats.length || beats.some((x) => !x.say)) return { ok: false, error: "Nothing to pick from." };
  return { ok: true, theme: clean(b.theme, MAX_THEME), beats };
}

/** One Choice per beat that has candidates: which one shows it, or none. */
export function pickQuestions(beats: PickAsk[]): Record<string, JevQuestion> {
  return Object.fromEntries(beats.flatMap((b, i): [string, JevQuestion][] => b.candidates.length ? [[
    `pick_${i}`,
    {
      type: "choice",
      instructions: { beat: b.say, question: "Which stock clip, described by its page name, best shows `beat`?" },
      criteria: { ...Object.fromEntries(b.candidates.map((c, j) => [`c${j}`, c.desc || "an unlabelled clip"])), none: "None of these shows the beat; they are about something else." },
    },
  ]] : []));
}

/** Per beat: the candidate's index, -1 when Jev says none fits, null when it gave no answer (the editor takes the first). */
export function readPicks(answers: Record<string, JevAnswer> | null, beats: PickAsk[]): (number | null)[] {
  return beats.map((b, i) => {
    const c = answers?.[`pick_${i}`]?.choice;
    if (c === "none") return -1;
    const n = typeof c === "string" && /^c\d+$/.test(c) ? Number(c.slice(1)) : NaN;
    return n < b.candidates.length ? n : null;
  });
}
