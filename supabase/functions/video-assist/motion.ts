// video-assist mode "motion": Jev picks the key lines of a filmed talking head
// (the editor zooms in on them, drops the music on the strongest and puts a
// pop-up on the top few). Jev decides which lines matter and which emoji fits a
// pop-up; the LLM writes the pop-up's words; the editor lays them out in code
// (spacing, a budget per minute, clear of the hook card), so the picks survive
// later cuts. Pure, so vitest covers it (motion.test.ts).

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

// ---------- pop-up text on the top key lines ----------

/** Jev's yes probability a line needs to get a pop-up (as the editor's zooms). */
export const POPUP_MIN = 0.5;
export const POPUP_CHARS = 28;

/** The lines to write pop-ups for: the strongest, at least 6 s apart, up to 3 a minute (the editor shows up to 2). */
export function popupLines(lines: MotionLine[], picks: { i: number; p: number }[], duration: number): number[] {
  const budget = Math.min(12, Math.ceil((duration / 60) * 3));
  const out: number[] = [];
  for (const k of [...picks].filter((x) => x.p >= POPUP_MIN).sort((a, b) => b.p - a.p)) {
    if (out.length >= budget) break;
    if (out.some((i) => Math.abs(lines[i].s - lines[k.i].s) < 6)) continue;
    out.push(k.i);
  }
  return out.sort((a, b) => a - b);
}

export function buildPopupMessages(lines: MotionLine[], pick: number[]): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You write the pop-up text for key moments of a short video a Singapore financial adviser filmed. It shows on screen for 3 seconds while they say the line, above the captions.",
        `For each line: text, ONE line of at most ${POPUP_CHARS} characters that lands the point of what is said (not a quote of the whole line), in sentence case; and key, the 1 to 3 words of text to show in the highlight colour, copied exactly from text.`,
        "Only facts and figures the speaker says; never invent a number. Never promise returns or guarantees. No emoji, em dashes, quote marks or hashtags. Plain words.",
        'Reply with JSON only: {"popups":[{"id":"L3","text":string,"key":string}]}',
      ].join("\n"),
    },
    { role: "user", content: pick.map((i) => `L${i}: ${lines[i].text}${i > 0 ? `\n(said just before: ${lines[i - 1].text})` : ""}`).join("\n") },
  ];
}

/** Pop-ups for the asked lines only: text cut at a word to fit, key kept only when it is in the text. */
export function parsePopupReply(content: string | null, pick: number[]): { i: number; text: string; key: string }[] {
  if (!content) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray((raw as { popups?: unknown })?.popups) ? (raw as { popups: unknown[] }).popups : [];
  const clean = (v: unknown) => String(v ?? "").replace(/\s*—\s*/g, ", ").replace(/["“”#]/g, "").replace(/\s+/g, " ").trim();
  const out: { i: number; text: string; key: string }[] = [];
  for (const x of list) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const i = Number(String(o.id ?? "").replace(/^L/, ""));
    if (!pick.includes(i) || out.some((p) => p.i === i)) continue;
    let text = clean(o.text).replace(/[.]$/, "");
    if (text.length > POPUP_CHARS) text = text.slice(0, POPUP_CHARS + 1).replace(/\s+\S*$/, "");
    if (!text) continue;
    const key = clean(o.key);
    out.push({ i, text, key: key && text.toLowerCase().includes(key.toLowerCase()) ? key : "" });
  }
  return out;
}

/** The emoji Jev may pick for a pop-up, by the feeling of the line. */
export const EMOJI: Record<string, { emoji: string; when: string }> = {
  warning: { emoji: "⚠️", when: "A warning, a risk or a trap to watch for" },
  stop: { emoji: "\u{1F6AB}", when: "A mistake, a myth or something to stop doing" },
  money: { emoji: "\u{1F4B0}", when: "Money, a cost, savings or a payout" },
  growth: { emoji: "\u{1F4C8}", when: "Growth, returns or something adding up over time" },
  result: { emoji: "✅", when: "A result, a fix or the right way to do it" },
  idea: { emoji: "\u{1F4A1}", when: "A tip, an insight or a surprising fact" },
  time: { emoji: "⏰", when: "Timing, an age, a deadline or starting early" },
  protect: { emoji: "\u{1F6E1}️", when: "Protection, insurance or cover" },
  question: { emoji: "❓", when: "A question put to the viewer" },
  hot: { emoji: "\u{1F525}", when: "A strong opinion or a hot take" },
};

export function emojiQuestions(lines: MotionLine[], written: { i: number; text: string }[]): Record<string, JevQuestion> {
  return Object.fromEntries(
    written.map((w) => [
      `emoji_${w.i}`,
      {
        type: "choice",
        instructions: { line: lines[w.i].text, popup: w.text, question: "Which of these fits the feeling of `popup`, said over `line`, best?" },
        criteria: Object.fromEntries(Object.entries(EMOJI).map(([k, v]) => [k, v.when])),
      } satisfies JevQuestion,
    ]),
  );
}

/** Each pop-up with the emoji Jev picked, or none when Jev had no answer. */
export function withEmoji(answers: Record<string, JevAnswer> | null, written: { i: number; text: string; key: string }[]) {
  return written.map((w) => {
    const pick = answers?.[`emoji_${w.i}`]?.choice;
    return { ...w, emoji: typeof pick === "string" && pick in EMOJI ? EMOJI[pick].emoji : "" };
  });
}
