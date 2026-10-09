// Who is talking, for the crop that follows the face on a podcast with 2 or 3 people: the pure
// part. faceVision.ts looks at the video (faces, and each mouth's opening from its landmarks); this
// works out the people in each shot, which of them is talking in each look and where the crop
// goes. Ported from mutonby/openshorts active_speaker.py (MIT): mouth movement normalised per
// person, counted only while someone speaks, with a hold so the crop does not flicker.

import type { Word } from "@/lib/videoEdit";

/** One face seen in a look: centre and width as shares of the picture, and the mouth's opening as a share of the face's height (when its landmarks were read). */
export interface SeenFace {
  x: number;
  y: number;
  w: number;
  open?: number;
}

/** Someone who stays in the shot: where their face usually is, and the share of the looks they are seen in. */
export interface Person {
  x: number;
  y: number;
  w: number;
  share: number;
}

/** Faces narrower than this share of the picture are the background (an audience, a photo on the wall). */
export const MIN_FACE = 0.045;
/** A new speaker must lead for this long before the crop goes to them, so one "yeah" never takes the frame. */
export const HOLD_SECONDS = 1.2;
/** The talker's mouth must move this much more than the next person's (a share of the two together), else the look does not vote. */
const MIN_MARGIN = 0.15;
/** A mouth that barely moves in the whole shot is not stretched to look busy: its spread counts as at least this (a share of the face's height). */
const MIN_SPREAD = 0.02;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const pct = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};

/**
 * The people in these looks, left to right (up to 3): faces grouped by where they sit across the
 * picture, kept when seen in at least `minShare` of the looks made, each at the middle of its faces.
 */
export function peopleOf(looks: (SeenFace[] | null)[], minShare = 0.2): Person[] {
  const made = looks.filter((l) => l !== null).length;
  if (!made) return [];
  const faces = looks.flatMap((l) => l ?? []).filter((f) => f.w >= MIN_FACE).sort((a, b) => a.x - b.x);
  const groups: SeenFace[][] = [];
  for (const f of faces) {
    const g = groups[groups.length - 1];
    if (g && f.x - g[g.length - 1].x <= Math.max(0.04, f.w * 0.5)) g.push(f);
    else groups.push([f]);
  }
  return groups
    .filter((g) => g.length >= minShare * made)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((g) => ({ x: median(g.map((f) => f.x)), y: median(g.map((f) => f.y)), w: median(g.map((f) => f.w)), share: Math.min(1, g.length / made) }))
    .sort((a, b) => a.x - b.x)
    .map((p) => ({ x: round3(p.x), y: round3(p.y), w: round3(p.w), share: round3(p.share) }));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** The face in a look that is this person, if seen: the nearest one close enough to where they sit. */
export function faceOf(look: SeenFace[] | null, p: Person): SeenFace | null {
  let best: SeenFace | null = null;
  for (const f of look ?? []) if (Math.abs(f.x - p.x) <= Math.max(0.06, p.w) && (!best || Math.abs(f.x - p.x) < Math.abs(best.x - p.x))) best = f;
  return best;
}

/**
 * Each person's mouth activity on their own scale (openshorts normalise_activity): their 20th
 * percentile (at rest) taken off and divided by their 20th to 80th spread, so a well-lit or bigger
 * face does not win every look. Null stays null.
 */
export function normaliseActivity(cols: (number | null)[][]): (number | null)[][] {
  return cols.map((col) => {
    const v = col.filter((a): a is number => a !== null);
    if (!v.length) return col;
    const low = pct(v, 0.2);
    const spread = Math.max(MIN_SPREAD, pct(v, 0.8) - low);
    return col.map((a) => (a === null ? null : Math.max(0, (a - low) / spread)));
  });
}

/**
 * Who talks in each look, from per-person activity (already normalised) and whether anyone is
 * speaking then: the clear leader by MIN_MARGIN, or null (nobody speaking, too close to call, or
 * fewer than two mouths read).
 */
export function attribute(cols: (number | null)[][], speaking: boolean[]): (number | null)[] {
  return speaking.map((on, i) => {
    if (!on) return null;
    const vals = cols.map((c, p) => ({ p, a: c[i] })).filter((x): x is { p: number; a: number } => x.a !== null).sort((x, y) => y.a - x.a);
    if (vals.length < 2 || vals[0].a < 0.3) return null;
    const margin = (vals[0].a - vals[1].a) / (vals[0].a + vals[1].a);
    return margin >= MIN_MARGIN ? vals[0].p : null;
  });
}

/**
 * The speaker per look, held so it cannot flap (openshorts hold): an unclear look keeps the current
 * speaker, a new one must lead `need` looks in a row to take over, and then takes over from the
 * first of them (the whole video is known); the looks before anyone is clear go to the first speaker.
 */
export function holdSpeaker(verdicts: (number | null)[], need: number): (number | null)[] {
  const out: (number | null)[] = [];
  let cur: number | null = null;
  let pend: number | null = null, run = 0, runAt = 0;
  verdicts.forEach((v, i) => {
    out.push(cur);
    if (v === null) return;
    if (v === cur) { pend = null; run = 0; return; }
    if (v === pend) run++;
    else { pend = v; run = 1; runAt = i; }
    if (cur === null || run >= need) {
      cur = v;
      out.fill(cur, runAt);
      pend = null;
      run = 0;
    }
  });
  const first = out.find((v) => v !== null);
  return first === undefined ? out : out.map((v) => v ?? first);
}

/** Someone is saying a word during this stretch of the source. */
const saying = (words: Word[], a: number, b: number) => words.some((w) => w.s < b && w.e > a);

/** A gap between words at least this long (seconds) can be one person stopping and the next starting. */
const TURN_GAP = 0.2;

/** Where a new turn starts in (a, b]: the word after the longest pause there (words in time order), or null with no pause of TURN_GAP or more. */
export function turnStart(words: Word[], a: number, b: number): number | null {
  let best: number | null = null, gap = TURN_GAP - 1e-9;
  words.forEach((w, j) => {
    if (w.s <= a || w.s > b) return;
    const g = j ? w.s - words[j - 1].e : Infinity;
    if (g > gap) [best, gap] = [w.s, g];
  });
  return best;
}

/**
 * Where the crop goes in each look of a shot with two or three people in it at once (null for a
 * look in any other shot, which follows the face as before), and the moments it switches to a new
 * speaker (source seconds, as their turn starts). `looks` are every `step` seconds from `from`,
 * null where none was made; `shots` are the looks where a camera cut starts a new shot. Null when
 * no shot has a conversation in it.
 */
export function speakerPlan(looks: (SeenFace[] | null)[], from: number, step: number, words: Word[], shots: number[] = []): { x: (number | null)[]; switches: number[] } | null {
  const x: (number | null)[] = looks.map(() => null);
  const switches: number[] = [];
  const bounds = [...new Set([0, ...shots.filter((c) => c > 0 && c < looks.length), looks.length])].sort((a, b) => a - b);
  const need = Math.max(2, Math.ceil(HOLD_SECONDS / step));
  let any = false;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const b0 = bounds[k];
    const shot = looks.slice(b0, bounds[k + 1]);
    const people = peopleOf(shot, 0.3);
    if (people.length < 2) continue;
    // a conversation: at least two of them in the same look most of the time
    const made = shot.filter((l) => l !== null);
    const together = made.filter((l) => people.filter((p) => faceOf(l, p)).length >= 2).length;
    if (together < made.length * 0.5) continue;
    // mouth movement round each look its mouth was read in: how much the opening changed since the
    // reading before and up to the next (the whole video is known, so a turn is not seen a look
    // late); a look or two left unread (a dropped frame) is stepped over
    const cols = people.map((p) => {
      const open = shot.map((l) => faceOf(l, p)?.open ?? null);
      const read = open.flatMap((o, i) => (o === null ? [] : [i]));
      const move = read.map((i, j) => (j && i - read[j - 1] <= 3 ? Math.abs(open[i]! - open[read[j - 1]]!) : null));
      const act: (number | null)[] = open.map(() => null);
      read.forEach((i, j) => {
        const near = [move[j], move[j + 1] ?? null].filter((v): v is number => v !== null);
        if (near.length) act[i] = near.reduce((a, b) => a + b, 0) / near.length;
      });
      return act;
    });
    const at = (i: number) => from + (b0 + i) * step;
    const speaking = shot.map((_, i) => saying(words, at(i) - step, at(i) + step));
    const who = holdSpeaker(attribute(normaliseActivity(cols), speaking), need);
    if (who.every((v) => v === null)) continue;
    any = true;
    // each switch moves to where the new turn starts (seen from three looks before to one after the
    // look it was first clear in, never back past the switch before), so the crop cuts as they
    // start talking, not on the look grid
    for (let r = 1, last = 0; r < who.length; r++) {
      const [was, now] = [who[r - 1], who[r]];
      if (now === was) continue;
      let turn = turnStart(words, at(Math.max(last, r - 3)), at(r + 1)) ?? at(r) - step / 2;
      // the first look on the new speaker: the one the turn falls just before (or at)
      let first = Math.ceil((turn - from) / step - 1e-6) - b0;
      if (first < 1 || first >= who.length) [first, turn] = [r, at(r) - step / 2];
      for (let j = Math.min(first, r); j < Math.max(first, r); j++) who[j] = first < r ? now : was;
      switches.push(round3(turn));
      r = Math.max(r, first);
      last = first;
    }
    who.forEach((p, i) => {
      if (p !== null) x[b0 + i] = faceOf(shot[i], people[p])?.x ?? people[p].x;
    });
  }
  return any ? { x, switches } : null;
}
