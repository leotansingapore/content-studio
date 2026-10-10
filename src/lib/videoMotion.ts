// Motion in the video editor: the picture eases in on the key lines Jev picked
// (video-assist mode "motion"), and a card counts up to each figure as it is
// said. The picks are kept on the source timeline, so they survive later cuts;
// where everything lands on the edit (spacing, a budget per minute, clear of
// the hook card, the face and the captions) is worked out here, in code, every
// time. Pure and tested (videoMotion.test.ts) except the server call and the
// drawing at the bottom.

import { readableOn } from "@/lib/carouselLayout";
import { callFn } from "@/lib/edgeFn";
import { STYLES, frameRect, outAt, srcAt, type Caption, type EditSettings, type Segment, type Sentence, type Word } from "@/lib/videoEdit";
import { outWithin, segLength } from "@/lib/fastPauses";
import { CHART, chartAnim, chartSize, newChart, paintChart, sanitizeCharts, shownRows, sideSpot, WIDE_MIN, type Chart } from "@/lib/videoCharts";

/** A key line Jev picked: where it is said on the source timeline, Jev's yes probability and, on the top few, its pop-up. */
export interface KeyLine {
  s: number;
  e: number;
  p: number;
  pop?: Popup;
}

/** One line of pop-up text (the LLM's words), the word or two to highlight, and the emoji Jev picked ("" for none). */
export interface Popup {
  text: string;
  key: string;
  emoji: string;
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
    if (g.end > s && g.start < e) return (acc + outWithin(g, Math.max(s, g.start))) / speed;
    acc += segLength(g);
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
    const q = o.pop && typeof o.pop === "object" ? (o.pop as Record<string, unknown>) : null;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const pop = q && str(q.text, 40) ? { text: str(q.text, 40), key: str(q.key, 40), emoji: str(q.emoji, 16) } : undefined;
    return s >= 0 && e > s && p >= 0 && p <= 1 ? [{ s, e, p, ...(pop ? { pop } : {}) }] : [];
  });
  return { lines };
}

// ---------- number cards ----------

/** A figure said in the video: "$500", "4%", "3 in 10", "S$1.2 million", and the words after it. */
export interface Figure {
  /** Its first and last word (indexes into the words). */
  start: number;
  end: number;
  prefix: string;
  value: number;
  decimals: number;
  comma: boolean;
  suffix: string;
  label: string;
}

const NUM = /^(S\$|US\$|\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k|m|bn|b)?(%)?$/i;
const MAGNITUDE: Record<string, string> = { thousand: " thousand", million: " million", billion: " billion" };
const bare = (w: string) => w.replace(/^[("'\u201c\u2018]+/, "").replace(/[)"'\u201d\u2019.,!?;:]+$/, "");

/**
 * Figures worth a card: money, a percentage, a size (thousand, million, k) or a
 * ratio (3 in 10). A bare number (an age, a count, a year) is not one. A
 * measured fact, so code, not a judgement.
 */
export function findFigures(words: Word[]): Figure[] {
  const out: Figure[] = [];
  for (let i = 0; i < words.length; i++) {
    const m = NUM.exec(bare(words[i].w));
    if (!m) continue;
    let j = i;
    const next = (n: number) => bare(words[j + n]?.w ?? "").toLowerCase();
    let prefix = m[1] ?? "";
    let mag = m[4] ? (m[4].toLowerCase() === "k" ? "k" : m[4].toUpperCase()) : "";
    let pct = !!m[5];
    let ratio = "";
    if (!mag && MAGNITUDE[next(1)]) { mag = MAGNITUDE[next(1)]; j++; }
    if (!pct && next(1) === "percent") { pct = true; j++; }
    else if (!pct && next(1) === "per" && next(2) === "cent") { pct = true; j += 2; }
    if (!prefix && /^(dollars?|bucks|sgd)$/.test(next(1))) { prefix = "$"; j++; }
    if (!prefix && !pct && !mag) {
      if (next(1) === "in" && /^\d+$/.test(next(2))) { ratio = ` in ${next(2)}`; j += 2; }
      else if (next(1) === "out" && next(2) === "of" && /^\d+$/.test(next(3))) { ratio = ` out of ${next(3)}`; j += 3; }
    }
    if (!prefix && !pct && !mag && !ratio) continue;
    // the label: up to 3 words said after it, to the end of the phrase ("a month", "on CPF")
    const label: string[] = [];
    // a figure that ends its phrase ("only 0.05%.") has no label: the next words are another thought
    for (let k = j + 1; k < words.length && label.length < 3 && !/[.,!?;:]$/.test(words[j].w); k++) {
      const w = bare(words[k].w);
      if (!w || NUM.test(w) || (label.join(" ") + " " + w).trim().length > 20) break;
      label.push(w);
      if (/[.,!?;:]$/.test(words[k].w)) break;
    }
    out.push({
      start: i,
      end: j,
      prefix,
      value: parseFloat(m[2].replace(/,/g, "") + (m[3] ?? "")),
      decimals: m[3] ? m[3].length - 1 : 0,
      comma: m[2].includes(","),
      suffix: mag + (pct ? "%" : "") + ratio,
      label: label.join(" "),
    });
    i = j;
  }
  return out;
}

/** A number card on the edited timeline: in at `from`, counting up to land as the figure is said, out at `to`. */
export interface Card {
  from: number;
  land: number;
  to: number;
  fig: Figure;
}

/** The card arrives a second before the figure finishes being said and stays 3 s; at most one every 5 s. */
export const CARD = { lead: 1, seconds: 3, min: 2.5, gap: 5, count: 0.8, arrive: 0.25, pulse: 0.33, leave: 0.25 };

export function numberCards(words: Word[], segs: Segment[], speed: number, total: number, hookEnd: number): Card[] {
  const out: Card[] = [];
  for (const fig of findFigures(words)) {
    const w = words[fig.end];
    const at = outAt(segs, w.s, speed);
    if (at === null) continue;
    const land = at + (w.e - w.s) / speed;
    const from = land - CARD.lead;
    const to = Math.min(total, from + CARD.seconds);
    if (from < hookEnd || from < 0 || to - from < CARD.min) continue;
    if (out.length && from < out[out.length - 1].from + CARD.gap) continue;
    out.push({ from, land, to, fig });
  }
  return out;
}

/** The figure as it reads while counting: 0 up to its value over CARD.count seconds, eased, landing at `land`. */
export function cardText(c: Card, out: number, final = false): string {
  const f = c.fig;
  const k = final ? 1 : Math.min(1, Math.max(0, (out - (c.land - CARD.count)) / CARD.count));
  const v = f.value * (0.5 - Math.cos(Math.PI * k) / 2);
  const n = f.decimals ? v.toFixed(f.decimals) : String(Math.round(v));
  const shown = f.comma || f.value >= 10000 ? Number(n).toLocaleString("en-US", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals }) : n;
  return `${f.prefix}${shown}${f.suffix}`;
}

// ---------- chart cards ----------

/** A chart card on the edited timeline. */
export interface ChartShow {
  from: number;
  to: number;
  chart: Chart;
}

/**
 * The charts on this edit, one at a time: in a beat before their line is said
 * (after the hook card), 4 s each. A chart that comes in while another shows
 * cuts that one short; one that would leave it under 2 s is not shown.
 */
export function chartShows(charts: Chart[], segs: Segment[], speed: number, total: number, hookEnd: number): ChartShow[] {
  const placed = charts.flatMap((chart) => {
    const at = shownRows(chart).length ? outOfSpan(segs, chart.s, chart.e, speed) : null;
    return at === null ? [] : [{ at, chart }];
  }).sort((a, b) => a.at - b.at);
  const out: ChartShow[] = [];
  for (const { at, chart } of placed) {
    const from = Math.max(0, hookEnd, at - CHART.lead);
    const to = Math.min(total, from + CHART.seconds);
    if (to - from < CHART.min) continue;
    const prev = out[out.length - 1];
    if (prev && from < prev.to) {
      if (from - prev.from < CHART.min) continue;
      prev.to = from;
    }
    out.push({ from, to, chart });
  }
  return out;
}

/** A chart started from a figure said in the video: the figure as its first row, written as the card shows it, and a row to fill in. */
export function chartOfFigure(fig: Figure, words: Word[]): Chart {
  return newChart(words[fig.start].s, words[fig.end].e, { label: fig.label, value: cardText({ from: 0, land: 0, to: 0, fig }, 0, true) });
}

// ---------- placing a card clear of the face and the captions ----------

/** Where the face sits in the source picture (shares of its width and height), found on this device. */
export interface FaceBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The middle of the boxes found at a few moments: steady even when one look misses or catches a hand. */
export function medianBox(boxes: FaceBox[]): FaceBox | null {
  if (!boxes.length) return null;
  const mid = (k: keyof FaceBox) => {
    const v = boxes.map((b) => b[k]).sort((a, b) => a - b);
    const h = v.length >> 1;
    return Math.round((v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2) * 1000) / 1000;
  };
  return { x0: mid("x0"), y0: mid("y0"), x1: mid("x1"), y1: mid("y1") };
}

/** The face's rows on the frame (shares of its height), with the top of the head above (`hair`: none = from the forehead) and the chin below; null without a box. */
export function faceBand(box: FaceBox | null | undefined, s: Pick<EditSettings, "fit">, W: number, H: number, vw: number, vh: number, hair = 0.6): [number, number] | null {
  if (!box || !vw || !vh) return null;
  const pad = box.y1 - box.y0;
  // the detector's box starts at the hairline; the hair above it reached half the box's height on a real talking head
  const y0 = box.y0 - pad * hair;
  const y1 = box.y1 + pad * 0.1;
  let top: number, h: number;
  if (s.fit === "framed") {
    const r = frameRect(W, H, vw, vh);
    [top, h] = [r.y, r.h];
  } else {
    const scale = s.fit === "blur" ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
    h = vh * scale;
    top = (H - h) / 2;
  }
  return [(top + y0 * h) / H, (top + y1 * h) / H];
}

/** The face's columns on the frame (shares of its width); null without a box. A crop that follows the face keeps it in the middle. */
export function faceCols(box: FaceBox | null | undefined, s: Pick<EditSettings, "fit" | "focusX" | "followFace">, W: number, H: number, vw: number, vh: number): [number, number] | null {
  if (!box || !vw || !vh) return null;
  let left: number, w: number;
  if (s.fit === "framed") {
    const r = frameRect(W, H, vw, vh);
    [left, w] = [r.x, r.w];
  } else if (s.fit === "blur") {
    w = vw * Math.min(W / vw, H / vh);
    left = (W - w) / 2;
  } else {
    w = vw * Math.max(W / vw, H / vh);
    const focus = s.followFace ? (box.x0 + box.x1) / 2 : s.focusX;
    left = Math.min(0, Math.max(W - w, W / 2 - w * focus));
  }
  return [(left + box.x0 * w) / W, (left + box.x1 * w) / W];
}

/**
 * The top of a block `h` tall (shares of the frame height) clear of every band,
 * between the app's top bar and its caption area: the first preferred spot that
 * is clear, else just under or just over a band. Null when nothing is clear.
 */
export function placeBlock(h: number, avoid: ([number, number] | null)[], prefer: number[], lo = 0.1, hi = 0.84): number | null {
  const bands = avoid.filter((b): b is [number, number] => !!b);
  const gap = 0.02;
  const spots = [...prefer, ...bands.map(([, b]) => b + gap), ...bands.map(([a]) => a - gap - h)];
  const clear = (t: number) => t >= lo && t + h <= hi && bands.every(([a, b]) => t + h <= a || t >= b);
  return spots.find(clear) ?? null;
}

/** Placed full size when it fits, else a little smaller (down to 70%) in a gap it fits; the first preferred spot when nothing does. */
export function fitBlock(h: number, avoid: ([number, number] | null)[], prefer: number[]): { top: number; scale: number } {
  for (const scale of [1, 0.85, 0.7]) {
    const top = placeBlock(h * scale, avoid, prefer);
    if (top !== null) return { top, scale };
  }
  return { top: prefer[0], scale: 1 };
}

/**
 * Where a chart goes on a tall or square frame (px): full size down to half clear
 * of the head and the captions; else beside the face when half a card fits
 * there; else clear of the face from the forehead down, down to half size; else
 * 12% from the top at 70%. A reel keeps clear of the app's top bar and caption
 * area; a feed post or a square uses nearly the whole frame.
 */
export function chartSpot(W: number, H: number, w: number, h: number, face: { head: [number, number] | null; core: [number, number] | null; cols: [number, number] | null }, capBand: [number, number] | null): { x: number; top: number; scale: number } {
  const [lo, hi] = H / W > 1.5 ? [0.1, 0.84] : [0.04, 0.96];
  const at = (band: [number, number] | null, scales: number[]) => {
    for (const scale of scales) {
      const top = placeBlock((h * scale) / H, [band, capBand], [0.12], lo, hi);
      if (top !== null) return { x: W / 2, top: top * H, scale: Math.min(scale, (W * 0.92) / w) };
    }
    return null;
  };
  const side = face.cols ? sideSpot(W, H, w, h, face.cols, capBand) : null;
  return at(face.head, [1, 0.85, 0.7, 0.6, 0.5]) ?? (side?.fits ? side : null) ?? at(face.core, [1, 0.85, 0.7, 0.6, 0.5]) ?? { x: W / 2, top: 0.12 * H, scale: 0.7 };
}

/** A band on the frame as it reads zoomed in by z about the row cy. */
export const zoomBand = (b: [number, number] | null, z: number, cy: number): [number, number] | null =>
  b && [cy + (b[0] - cy) * z, cy + (b[1] - cy) * z];

/**
 * Where the hook card goes (share of the frame height): today's place, 11% from
 * the top, unless the face is there; then the first spot clear of the face (and
 * of the captions, when given). Without a face found it stays where it was.
 */
export function hookTop(s: EditSettings, W: number, H: number, vw: number, vh: number, h: number, capBand: [number, number] | null): number {
  // the hook shows before any zoom on a key line; the punch-in on cuts may run under it
  const z = s.punchIn && !s.keyZooms ? STYLES[s.style].punch : 1;
  const face = zoomBand(faceBand(s.faceBox, s, W, H, vw, vh), z, 0.5);
  return face ? placeBlock(h, [face, capBand], [0.11]) ?? 0.11 : 0.11;
}

// ---------- sound effects, made in Web Audio (no files) ----------

export type CueKind = "whoosh" | "pop";
export interface Cue {
  at: number;
  kind: CueKind;
}

/** The joins between kept stretches, on the edited timeline. */
export function cutTimes(segs: Segment[], speed = 1): number[] {
  let acc = 0;
  return segs.slice(0, -1).map((g) => (acc += segLength(g)) / speed);
}

/** A whoosh as a card comes in, a zoom starts or (with a transition set) at a cut; a pop as a sticker or a pop-up shows. One at a time: a cue within 0.3 s of the last is dropped. */
export function sfxCues(m: Pick<MotionPlan, "zooms" | "cards"> & { pops?: Pop[]; charts?: ChartShow[] }, s: Pick<EditSettings, "transition" | "overlays">, segs: Segment[], speed = 1): Cue[] {
  const all: Cue[] = [
    ...(m.pops ?? []).map((p) => ({ at: p.at, kind: "pop" as const })),
    ...m.zooms.map((z) => ({ at: z.at, kind: "whoosh" as const })),
    ...m.cards.map((c) => ({ at: c.from, kind: "whoosh" as const })),
    ...(m.charts ?? []).map((c) => ({ at: c.from, kind: "whoosh" as const })),
    ...(s.transition ? cutTimes(segs, speed).map((at) => ({ at, kind: "whoosh" as const })) : []),
    ...(s.overlays ?? []).map((o) => ({ at: o.from, kind: "pop" as const })),
  ].sort((a, b) => a.at - b.at);
  const out: Cue[] = [];
  for (const c of all) if (!out.length || c.at - out[out.length - 1].at >= 0.3) out.push({ at: Math.round(c.at * 100) / 100, kind: c.kind });
  return out;
}

/** Feeds the playhead in; hands back the cues it just passed. A jump (a seek, a restart) plays nothing. */
export function cueTicker() {
  let last: number | null = null;
  return (cues: Cue[], out: number | null): Cue[] => {
    const prev = last;
    last = out;
    if (out === null || prev === null || out <= prev || out - prev > 0.5) return [];
    return cues.filter((c) => c.at > prev && c.at <= out);
  };
}

// ---------- pop-up text ----------

/** A pop-up on the edited timeline. */
export interface Pop {
  at: number;
  until: number;
  pop: Popup;
}

/** 2.5-3.5 s on screen (3 here), up to 2 a minute (1 to 3 in practice), at least 6 s apart. */
export const POP = { seconds: 3, min: 2.5, perMinute: 2, gap: 6, arrive: 0.2, leave: 0.25 };

/**
 * The pop-ups on this edit: the strongest key lines that have one, past the
 * hook card, one text layer at a time (never while a number card or a sticker
 * shows, `busy`).
 */
export function popupBeats(lines: KeyLine[], segs: Segment[], speed: number, total: number, hookEnd: number, busy: [number, number][]): Pop[] {
  const budget = Math.ceil((total / 60) * POP.perMinute);
  const out: Pop[] = [];
  for (const l of [...lines].filter((x) => x.pop && x.p >= KEY_MIN).sort((a, b) => b.p - a.p)) {
    if (out.length >= budget) break;
    const at = outOfSpan(segs, l.s, l.e, speed);
    if (at === null || at < hookEnd) continue;
    const until = Math.min(total, at + POP.seconds);
    if (until - at < POP.min) continue;
    if (out.some((x) => Math.abs(x.at - at) < POP.gap) || busy.some(([a, b]) => at < b && until > a)) continue;
    out.push({ at: Math.round(at * 100) / 100, until, pop: l.pop! });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- the music drop ----------

/** The music drops out over 0.15 s as the strongest key line starts, stays out 2 s and comes back over 0.5 s. */
export const DROP = { fade: 0.15, hold: 2, back: 0.5 };

/** What the music's volume is multiplied by at this point of the edit: 1, down to 0 through the drop. */
export function dropGain(at: number | null, out: number): number {
  if (at === null) return 1;
  const t = out - at;
  if (t < -DROP.fade || t >= DROP.hold + DROP.back) return 1;
  if (t < 0) return -t / DROP.fade;
  return t < DROP.hold ? 0 : smooth((t - DROP.hold) / DROP.back);
}

export interface MotionPlan {
  /** The zooms on key lines; empty when that is off or nothing was picked (the old punch-in on cuts applies). */
  zooms: Beat[];
  /** Number cards, when they are on (none while a chart shows). */
  cards: Card[];
  /** The chart cards the adviser added. */
  charts: ChartShow[];
  /** Pop-up text, when it is on. */
  pops: Pop[];
  /** Sound effects, when they are on. */
  cues: Cue[];
  /** Where the music drops out (the strongest key line), when there is music and it is not switched off. */
  drop: number | null;
}

const EMPTY: MotionPlan = { zooms: [], cards: [], charts: [], pops: [], cues: [], drop: null };
let memo: { s: EditSettings; segs: Segment[]; caps: Caption[]; total: number; plan: MotionPlan } | null = null;

/** Everything that moves on this edit, worked out once per edit (drawFrame asks every frame). */
export function motionOf(s: EditSettings, segs: Segment[], caps: Caption[], total: number): MotionPlan {
  if (memo && memo.s === s && memo.segs === segs && memo.caps === caps && memo.total === total) return memo.plan;
  const lines = sanitizeMotion(s.motion)?.lines ?? [];
  const hookEnd = s.hook?.trim() ? s.hookSeconds : 0;
  const speed = typeof s.speed === "number" && s.speed >= 1 ? s.speed : 1;
  const beats = lines.length ? keyBeats(lines, segs, speed, total, hookEnd) : [];
  const zooms = s.keyZooms ? beats : [];
  const charts = chartShows(sanitizeCharts(s.charts), segs, speed, total, hookEnd);
  const clear = (a: number, b: number) => !charts.some((c) => a < c.to && b > c.from);
  const cards = s.numberCards ? numberCards(caps.flatMap((c) => c.words), segs, speed, total, hookEnd).filter((c) => clear(c.from, c.to)) : [];
  // the strongest line placed on this edit (keyBeats always keeps it)
  const top = beats.reduce<Beat | null>((a, b) => (!a || b.p > a.p ? b : a), null);
  const busy = [...[...cards, ...charts].map((c): [number, number] => [c.from, c.to]), ...(s.overlays ?? []).map((o): [number, number] => [o.from, o.to])];
  const pops = s.popups ? popupBeats(lines, segs, speed, total, hookEnd, busy) : [];
  const plan = !segs.length ? EMPTY : {
    zooms,
    cards,
    charts,
    pops,
    cues: s.sfx ? sfxCues({ zooms, cards, pops, charts }, s, segs, speed) : [],
    drop: s.music && s.musicDrop !== false && top ? top.at : null,
  };
  memo = { s, segs, caps, total, plan };
  return plan;
}

export interface MotionReply {
  lines: { i: number; p: number }[] | null;
  popups?: ({ i: number } & Popup)[] | null;
}

/** Jev's picks for these lines (on the edited timeline), with their pop-ups, as key lines on the source timeline; null when Jev gave none. */
export function keyLinesFrom(reply: MotionReply | null | undefined, sent: Sentence[], segs: Segment[], speed: number): KeyLine[] | null {
  if (!Array.isArray(reply?.lines) || !reply.lines.length) return null;
  return reply.lines.flatMap((r) => {
    const x = sent[r.i];
    if (!x || typeof r.p !== "number") return [];
    const s = srcAt(segs, x.s, speed);
    const e = Math.max(s + 0.1, srcAt(segs, Math.max(x.s, x.e - 0.01), speed));
    const pop = reply.popups?.find((q) => q.i === r.i);
    return [{ s: Math.round(s * 100) / 100, e: Math.round(e * 100) / 100, p: r.p, ...(pop ? { pop: { text: pop.text, key: pop.key, emoji: pop.emoji } } : {}) }];
  });
}

/** Asks Jev which lines are key, with pop-up text for the top few (one "motion-picks" use). */
export async function pickKeyLines(sent: Sentence[], duration: number, hookSeconds: number): Promise<MotionReply> {
  return callFn<MotionReply>("video-assist", { mode: "motion", sentences: sent, duration, hookSeconds }, "Couldn't pick the key lines right now. Try again in a minute.");
}

// ---------- drawing (browser only) ----------

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The number card showing at this point of the edit, in the brand colour, clear
 * of the face and the captions (capBand: where drawFrame puts them). It rises in,
 * counts up, pulses once as it lands on the spoken figure and fades out.
 */
export function drawMotion(
  g: CanvasRenderingContext2D,
  m: MotionPlan,
  f: { settings: EditSettings; out: number; brand?: { color: string } | null; video: { videoWidth: number; videoHeight: number } },
  capBand: [number, number] | null,
) {
  const ch = m.charts.find((x) => f.out >= x.from && f.out < x.to);
  if (ch) return drawChart(g, m, ch, f, capBand);
  const c = m.cards.find((x) => f.out >= x.from && f.out < x.to);
  if (!c) {
    const p = m.pops.find((x) => f.out >= x.at && f.out < x.until);
    if (p) drawPopup(g, m, p, f, capBand);
    return;
  }
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = Math.min(W, H) / 1080;
  const s = f.settings;
  const bg = f.brand?.color ?? s.activeColor;
  const numPx = Math.round(150 * u);
  const labPx = Math.round(46 * u);
  const numFont = `900 ${numPx}px "Archivo Black", "Arial Black", Impact, system-ui, sans-serif`;
  const labFont = `700 ${labPx}px "DM Sans", Inter, system-ui, sans-serif`;
  g.save();
  g.font = numFont;
  // laid out on the final figure, so the card doesn't grow as the digits count up
  const final = cardText(c, f.out, true);
  const nw = Math.min(W * 0.84, g.measureText(final).width);
  g.font = labFont;
  const lw = c.fig.label ? Math.min(W * 0.84, g.measureText(c.fig.label).width) : 0;
  const bw = Math.max(nw, lw) + 112 * u;
  const bh = numPx * 1.05 + (c.fig.label ? labPx * 1.5 : 0) + 64 * u;
  // the face as big as a zoom on a key line makes it, so the card keeps its place through one
  const face = faceBand(s.faceBox, s, W, H, f.video.videoWidth, f.video.videoHeight);
  const fit = fitBlock(bh / H, [zoomBand(face, m.zooms.length ? KEY_ZOOM.peak : 1, 0.42), capBand], [0.12]);
  const top = fit.top * H;
  const t = f.out - c.from;
  const alpha = Math.min(ease(t / CARD.arrive), Math.min(1, Math.max(0, (c.to - f.out) / CARD.leave)));
  const pulse = f.out >= c.land && f.out < c.land + CARD.pulse ? 1 + 0.07 * Math.sin((Math.PI * (f.out - c.land)) / CARD.pulse) : 1;
  const sc = (0.92 + 0.08 * ease(t / CARD.arrive)) * pulse * fit.scale;
  g.globalAlpha = alpha;
  g.translate(W / 2, top + (bh * fit.scale) / 2 + (1 - ease(t / CARD.arrive)) * 40 * u);
  g.scale(sc, sc);
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 30 * u;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(-bw / 2, -bh / 2, bw, bh, 36 * u);
  g.fill();
  g.shadowColor = "transparent";
  const ink = readableOn(bg);
  g.fillStyle = ink;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = numFont;
  const ny = -bh / 2 + 32 * u + numPx * 0.55;
  g.fillText(cardText(c, f.out), -nw / 2, ny, W * 0.84);
  if (c.fig.label) {
    g.font = labFont;
    g.textAlign = "center";
    g.globalAlpha = alpha * 0.85;
    g.fillText(c.fig.label, 0, ny + numPx * 0.55 + labPx * 0.8, W * 0.84);
  }
  g.restore();
}

/**
 * A chart card, rising in like a number card. On a tall or square frame it sits
 * clear of the face and the captions, smaller (down to half) when the gap is
 * small; on a wide frame it goes beside the face.
 */
function drawChart(
  g: CanvasRenderingContext2D,
  m: MotionPlan,
  c: ChartShow,
  f: { settings: EditSettings; out: number; brand?: { color: string } | null; video: { videoWidth: number; videoHeight: number } },
  capBand: [number, number] | null,
) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = Math.min(W, H) / 1080;
  const s = f.settings;
  const { w, h } = chartSize(c.chart, u, W > H);
  const a = chartAnim(c.from, c.to, f.out, shownRows(c.chart).length);
  const vw = f.video.videoWidth;
  const vh = f.video.videoHeight;
  // the face as big as a zoom on a key line (or the punch-in on cuts) makes it, so the chart keeps its place through one
  const z = m.zooms.length ? KEY_ZOOM.peak : s.punchIn ? STYLES[s.style].punch : 1;
  const cy = m.zooms.length ? 0.42 : 0.5;
  const cols = zoomBand(faceCols(s.faceBox, s, W, H, vw, vh), z, 0.5);
  const { x, top, scale } = W > H ? sideSpot(W, H, w, h, cols, capBand, WIDE_MIN)
    : chartSpot(W, H, w, h, { head: zoomBand(faceBand(s.faceBox, s, W, H, vw, vh), z, cy), core: zoomBand(faceBand(s.faceBox, s, W, H, vw, vh, 0), z, cy), cols }, capBand);
  g.save();
  g.translate(x, top + (h * scale) / 2 + (1 - a.rise) * 40 * u);
  const sc = (0.92 + 0.08 * a.rise) * scale;
  g.scale(sc, sc);
  paintChart(g, c.chart, a, u, f.brand?.color ?? s.activeColor, W > H);
  g.restore();
}

// Peak gains, set from an export so each sound sits about 18 dB under a voice at the -14 LUFS the apps
// play at: a whoosh alone peaks near -31 LUFS momentary, a pop (shorter, so it reads lower) near -33.
export const SFX_GAIN = { whoosh: 0.2, pop: 0.14 };
const noise = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One sound effect into `out` at `t0`: a filtered-noise whoosh sweeping up, or a short falling sine pop. */
export function playCue(ctx: BaseAudioContext, out: AudioNode, kind: CueKind, t0 = ctx.currentTime) {
  const g = new GainNode(ctx, { gain: 0 });
  g.connect(out);
  if (kind === "whoosh") {
    let buf = noise.get(ctx);
    if (!buf) {
      buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.6), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise.set(ctx, buf);
    }
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    const bp = new BiquadFilterNode(ctx, { type: "bandpass", Q: 0.8, frequency: 300 });
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(2800, t0 + 0.32);
    bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.55);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(SFX_GAIN.whoosh, t0 + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    src.connect(bp).connect(g);
    src.start(t0);
    src.stop(t0 + 0.57);
  } else {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: 1200 });
    osc.frequency.setValueAtTime(1200, t0);
    osc.frequency.exponentialRampToValueAtTime(320, t0 + 0.08);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(SFX_GAIN.pop, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  }
}

/** The preview's sound effects, on their own audio context made with the first one played. */
export function previewSfx() {
  const tick = cueTicker();
  let ctx: AudioContext | null = null;
  return {
    sync(cues: Cue[], out: number | null) {
      for (const c of tick(cues, out)) {
        ctx ??= new AudioContext();
        void ctx.resume().catch(() => {});
        playCue(ctx, ctx.destination, c.kind);
      }
    },
    close() {
      void ctx?.close();
      ctx = null;
    },
  };
}

/**
 * A pop-up: the emoji above one line of text (white, a dark edge, the key words
 * in the highlight colour, no box), clear of the face and the captions. It pops
 * in over 0.2 s, the emoji settling a beat later, and fades over its last 0.25 s.
 */
function drawPopup(
  g: CanvasRenderingContext2D,
  m: MotionPlan,
  p: Pop,
  f: { settings: EditSettings; out: number; video: { videoWidth: number; videoHeight: number } },
  capBand: [number, number] | null,
) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = Math.min(W, H) / 1080;
  const s = f.settings;
  const px = Math.round(66 * u);
  const epx = Math.round(110 * u);
  const font = `900 ${px}px "Archivo Black", "Arial Black", Impact, system-ui, sans-serif`;
  g.save();
  g.font = font;
  // up to two lines across 86% of the frame
  const words = p.pop.text.split(/\s+/);
  const lines: string[][] = [[]];
  for (const w of words) {
    const line = lines[lines.length - 1];
    if (line.length && g.measureText([...line, w].join(" ")).width > W * 0.86) lines.push([w]);
    else line.push(w);
  }
  const shown = lines.slice(0, 2);
  const lh = px * 1.2;
  const bh = (p.pop.emoji ? epx * 1.25 : 0) + shown.length * lh + 24 * u;
  const face = faceBand(s.faceBox, s, W, H, f.video.videoWidth, f.video.videoHeight);
  const fit = fitBlock(bh / H, [zoomBand(face, m.zooms.length ? KEY_ZOOM.peak : 1, 0.42), capBand], [0.12]);
  const t = f.out - p.at;
  const inA = ease(t / POP.arrive);
  g.globalAlpha = Math.min(inA, Math.min(1, Math.max(0, (p.until - f.out) / POP.leave)));
  const cy = fit.top * H + (bh * fit.scale) / 2;
  g.translate(W / 2, cy);
  const sc = (0.85 + 0.15 * inA) * fit.scale;
  g.scale(sc, sc);
  let y = -bh / 2;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (p.pop.emoji) {
    // the emoji lands a beat after the text, overshooting a little
    const e = 1 + 0.18 * Math.max(0, 1 - t / 0.35) * Math.sin(Math.min(1, t / 0.35) * Math.PI);
    g.save();
    g.translate(0, y + epx * 0.6);
    g.scale(e, e);
    g.font = `${epx}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.fillText(p.pop.emoji, 0, 0);
    g.restore();
    y += epx * 1.25;
  }
  g.font = font;
  g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 18 * u;
  // the key words, by position in the text, so the same word elsewhere stays white
  const key = p.pop.key.toLowerCase();
  const from = key ? p.pop.text.toLowerCase().indexOf(key) : -1;
  let pos = 0;
  for (const line of shown) {
    const lw = g.measureText(line.join(" ")).width;
    let x = -lw / 2;
    g.textAlign = "left";
    for (const w of line) {
      const start = p.pop.text.indexOf(w, pos);
      pos = start + w.length;
      const hot = from >= 0 && start < from + key.length && pos > from;
      g.lineWidth = px * 0.16;
      g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText(w, x, y + lh / 2);
      g.fillStyle = hot ? s.activeColor : "#FFFFFF";
      g.fillText(w, x, y + lh / 2);
      x += g.measureText(w + " ").width;
    }
    y += lh;
  }
  g.restore();
}
