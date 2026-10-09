// Cold open: the strongest line plays first as a teaser, then the video runs
// from its start (Leo's talking-head-reel signature does the same). Jev rates
// the lines as first words heard (video-assist mode "coldopen"); the line is
// kept on the source timeline, so later cuts still apply inside it, and the
// kept parts are reordered here: the line's parts first, then the edit, with
// the line heard again in its place (repeat) or taken out of it (move).

import { callFn } from "@/lib/edgeFn";
import { heardWords, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";

export type ColdOpen = NonNullable<EditSettings["coldOpen"]>;

/** A stored cold open, kept only when well formed and under 15 s. */
export function sanitizeColdOpen(raw: unknown): ColdOpen | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.s !== "number" || typeof r.e !== "number" || !Number.isFinite(r.s) || !Number.isFinite(r.e)) return undefined;
  if (r.s < 0 || r.e <= r.s || r.e - r.s > 15) return undefined;
  return { s: r.s, e: r.e, repeat: r.repeat !== false };
}

/** The part of a kept part inside [s, e), with its fast stretches clipped to it; null when none of it is. */
function clip(g: Segment, s: number, e: number): Segment | null {
  const start = Math.max(g.start, s);
  const end = Math.min(g.end, e);
  if (end - start < 0.04) return null;
  const fast = g.fast?.map(([a, b]): [number, number] => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b - a > 0.04);
  return fast?.length ? { start, end, fast } : { start, end };
}

/** The kept parts with the cold open first. Nothing changes when the line has been cut or trimmed away, or is already the opening. */
export function withColdOpen(segs: Segment[], raw: unknown): Segment[] {
  const co = sanitizeColdOpen(raw);
  if (!co || !segs.length) return segs;
  const line = segs.flatMap((g) => clip(g, co.s, co.e) ?? []);
  if (!line.length || line[0].start <= segs[0].start + 0.05) return segs;
  if (co.repeat) return [...line, ...segs];
  const rest = segs.flatMap((g) => [clip(g, g.start, co.s), clip(g, co.e, g.end)].filter((x): x is Segment => !!x));
  return [...line, ...rest];
}

/** How long the teaser runs before the edit starts (unspeeded seconds), 0 without one. */
export function coldLength(segs: Segment[], raw: unknown): number {
  const co = sanitizeColdOpen(raw);
  if (!co) return 0;
  let t = 0;
  for (const g of segs) {
    if (g.start < co.s - 0.001 || g.end > co.e + 0.001) break;
    t += g.end - g.start;
  }
  return t;
}

export interface ColdCandidates {
  /** Every sentence of the edit as heard, on the edited timeline, in order. */
  sentences: { s: number; e: number; text: string }[];
  /** Where each sentence was said (source seconds, padded a little), for the cold open. */
  source: { s: number; e: number }[];
  /** The sentences that could open the video: 4-30 words, 1-8 s, starting 3 s or more into the edit, every word kept. */
  candidates: number[];
  /** The edit's own first sentence, rated too, so a cold open only goes in when it opens stronger. */
  opening: number;
}

/** The edit's sentences (segs without a cold open), and which of them could be played first. */
export function coldCandidates(words: Word[], segs: Segment[], speed = 1): ColdCandidates {
  const heard = heardWords(words, segs, speed);
  const index = new Map(words.map((w, i) => [w, i]));
  const out: ColdCandidates = { sentences: [], source: [], candidates: [], opening: 0 };
  let cur: typeof heard = [];
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0];
    const last = cur[cur.length - 1];
    const i = out.sentences.length;
    out.sentences.push({ s: first.s, e: last.e, text: cur.map((w) => w.w).join(" ") });
    // padded a little, never into the word said before or after it
    const a = index.get(first.src)!;
    const b = index.get(last.src)!;
    out.source.push({ s: Math.max(0, first.src.s - 0.06, words[a - 1]?.e ?? 0), e: Math.min(last.src.e + 0.12, words[b + 1]?.s ?? Infinity) });
    // every word kept, in one run (no cut inside, on the source and the edit alike)
    const whole = b - a === cur.length - 1;
    const len = last.e - first.s;
    if (whole && cur.length >= 4 && cur.length <= 30 && len >= 1 && len <= 8 && first.s >= 3) out.candidates.push(i);
    cur = [];
  };
  for (const w of heard) {
    if (cur.length && (w.s - cur[cur.length - 1].e > 1 || w.src.s < cur[cur.length - 1].src.s)) flush();
    cur.push(w);
    if (/[.!?]["')\]]?$/.test(w.w)) flush();
  }
  flush();
  out.candidates = out.candidates.slice(0, 40);
  return out;
}

/** Jev's pick: the sentence to open on (an index into sentences), or null when none opens stronger than the start. */
export async function pickColdOpen(c: ColdCandidates, title: string): Promise<{ pick: number | null; why?: "language" | "unrated" }> {
  const res = await callFn<{ pick: { i: number } | null; why?: "language" | "unrated" }>(
    "video-assist",
    { mode: "coldopen", sentences: c.sentences, candidates: c.candidates, opening: c.opening, title },
    "Couldn't pick the line right now. Try again in a minute.",
  );
  const i = res?.pick?.i;
  return typeof i === "number" && c.candidates.includes(i) ? { pick: i } : { pick: null, why: res?.why === "language" || res?.why === "unrated" ? res.why : undefined };
}
