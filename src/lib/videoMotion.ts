// Motion in the video editor: the picture eases in on the key lines Jev picked
// (video-assist mode "motion"). The picks are kept on the source timeline, so
// they survive later cuts; where they land on the edit (spacing, a budget per
// minute, clear of the hook card) is worked out here, in code, every time.
// Pure and tested (videoMotion.test.ts) except the server call.

import { callFn } from "@/lib/edgeFn";
import { srcAt, type Caption, type EditSettings, type Segment, type Sentence } from "@/lib/videoEdit";

/** A key line Jev picked: where it is said on the source timeline and Jev's yes probability. */
export interface KeyLine {
  s: number;
  e: number;
  p: number;
}

/** A key line placed on the edited timeline. */
export interface Beat {
  at: number;
  p: number;
}

// The push: snap in, hold, drift out (mutonby/openshorts punch_in.py: 0.25 s, 1.3 s, 0.55 s),
// to 1.15x, the emphasis tier in ArtCog/chatmonteur skills/motion.md.
export const KEY_ZOOM = { peak: 1.15, rise: 0.25, hold: 1.3, fall: 0.55 };
const ZOOM_SPAN = KEY_ZOOM.rise + KEY_ZOOM.hold + KEY_ZOOM.fall;
/** At most one zoom every 6 s, about 3 a minute. */
export const ZOOM_GAP = 6;
export const ZOOMS_PER_MINUTE = 3;
/** Jev's yes probability a line needs to be zoomed on. */
export const KEY_MIN = 0.5;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Seconds into the edit where the stretch s-e is first heard (its start, or the first part a cut left), or null when all of it is cut. */
export function outOfSpan(segs: Segment[], s: number, e: number, speed = 1): number | null {
  let acc = 0;
  for (const g of segs) {
    if (g.end > s && g.start < e) return (acc + Math.max(0, s - g.start)) / speed;
    acc += g.end - g.start;
  }
  return null;
}

/**
 * The key lines on this edit, strongest first while there is budget: past the
 * hook card, a full zoom before the end, at least ZOOM_GAP apart. In time order.
 */
export function keyBeats(lines: KeyLine[], segs: Segment[], speed: number, total: number, hookEnd: number): Beat[] {
  // rounded up, so a 30 s reel gets 2
  const budget = Math.ceil((total / 60) * ZOOMS_PER_MINUTE);
  const placed = lines
    .filter((l) => l.p >= KEY_MIN)
    .flatMap((l) => {
      const at = outOfSpan(segs, l.s, l.e, speed);
      return at === null ? [] : [{ at: Math.round(at * 100) / 100, p: l.p }];
    })
    .sort((a, b) => b.p - a.p || a.at - b.at);
  const out: Beat[] = [];
  for (const b of placed) {
    if (out.length >= budget) break;
    if (b.at < hookEnd || b.at + ZOOM_SPAN > total + 0.2) continue;
    if (out.some((x) => Math.abs(x.at - b.at) < ZOOM_GAP)) continue;
    out.push(b);
  }
  return out.sort((a, b) => a.at - b.at);
}

/** How far the picture is zoomed in at this point of the edit, 1 to KEY_ZOOM.peak. */
export function keyZoom(beats: Beat[], out: number): number {
  let amount = 0;
  for (const b of beats) {
    const dt = out - b.at;
    if (dt < 0 || dt >= ZOOM_SPAN) continue;
    const { rise, hold, fall } = KEY_ZOOM;
    amount = Math.max(amount, dt < rise ? smooth(dt / rise) : dt < rise + hold ? 1 : 1 - smooth((dt - rise - hold) / fall));
  }
  return 1 + (KEY_ZOOM.peak - 1) * amount;
}

/** Stored picks, kept only when well formed. */
export function sanitizeMotion(raw: unknown): { lines: KeyLine[] } | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || !Array.isArray(r.lines)) return undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const lines = r.lines.slice(0, 200).flatMap((x): KeyLine[] => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const s = n(o.s), e = n(o.e), p = n(o.p);
    return s >= 0 && e > s && p >= 0 && p <= 1 ? [{ s, e, p }] : [];
  });
  return { lines };
}

export interface MotionPlan {
  /** The zooms on key lines; empty when that is off or nothing was picked (the old punch-in on cuts applies). */
  zooms: Beat[];
}

const EMPTY: MotionPlan = { zooms: [] };
let memo: { s: EditSettings; segs: Segment[]; caps: Caption[]; total: number; plan: MotionPlan } | null = null;

/** Everything that moves on this edit, worked out once per edit (drawFrame asks every frame). */
export function motionOf(s: EditSettings, segs: Segment[], caps: Caption[], total: number): MotionPlan {
  if (memo && memo.s === s && memo.segs === segs && memo.caps === caps && memo.total === total) return memo.plan;
  const lines = sanitizeMotion(s.motion)?.lines ?? [];
  const hookEnd = s.hook?.trim() ? s.hookSeconds : 0;
  const speed = typeof s.speed === "number" && s.speed >= 1 ? s.speed : 1;
  const plan = !segs.length || !lines.length ? EMPTY : { zooms: s.keyZooms ? keyBeats(lines, segs, speed, total, hookEnd) : [] };
  memo = { s, segs, caps, total, plan };
  return plan;
}

/** Jev's picks for these lines (on the edited timeline), as key lines on the source timeline; null when Jev gave none. */
export function keyLinesFrom(reply: { i: number; p: number }[] | null | undefined, sent: Sentence[], segs: Segment[], speed: number): KeyLine[] | null {
  if (!Array.isArray(reply) || !reply.length) return null;
  return reply.flatMap((r) => {
    const x = sent[r.i];
    if (!x || typeof r.p !== "number") return [];
    const s = srcAt(segs, x.s, speed);
    const e = Math.max(s + 0.1, srcAt(segs, Math.max(x.s, x.e - 0.01), speed));
    return [{ s: Math.round(s * 100) / 100, e: Math.round(e * 100) / 100, p: r.p }];
  });
}

/** Asks Jev which lines are key (one "motion-picks" use). */
export async function pickKeyLines(sent: Sentence[], duration: number, hookSeconds: number): Promise<{ i: number; p: number }[] | null> {
  const r = await callFn<{ lines: { i: number; p: number }[] | null }>("video-assist", { mode: "motion", sentences: sent, duration, hookSeconds }, "Couldn't pick the key lines right now. Try again in a minute.");
  return r.lines;
}
