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
    for (let k = j + 1; k < words.length && label.length < 3; k++) {
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

/** The face's rows on the frame (shares of its height), with room for hair above and the chin below; null without a box. */
export function faceBand(box: FaceBox | null | undefined, s: Pick<EditSettings, "fit">, W: number, H: number, vw: number, vh: number): [number, number] | null {
  if (!box || !vw || !vh) return null;
  const pad = box.y1 - box.y0;
  const y0 = box.y0 - pad * 0.3;
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
  return segs.slice(0, -1).map((g) => (acc += g.end - g.start) / speed);
}

/** A whoosh as a card comes in, a zoom starts or (with a transition set) at a cut; a pop as a sticker shows. One at a time: a cue within 0.3 s of the last is dropped. */
export function sfxCues(m: Pick<MotionPlan, "zooms" | "cards">, s: Pick<EditSettings, "transition" | "overlays">, segs: Segment[], speed = 1): Cue[] {
  const all: Cue[] = [
    ...m.zooms.map((z) => ({ at: z.at, kind: "whoosh" as const })),
    ...m.cards.map((c) => ({ at: c.from, kind: "whoosh" as const })),
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

export interface MotionPlan {
  /** The zooms on key lines; empty when that is off or nothing was picked (the old punch-in on cuts applies). */
  zooms: Beat[];
  /** Number cards, when they are on. */
  cards: Card[];
  /** Sound effects, when they are on. */
  cues: Cue[];
}

const EMPTY: MotionPlan = { zooms: [], cards: [], cues: [] };
let memo: { s: EditSettings; segs: Segment[]; caps: Caption[]; total: number; plan: MotionPlan } | null = null;

/** Everything that moves on this edit, worked out once per edit (drawFrame asks every frame). */
export function motionOf(s: EditSettings, segs: Segment[], caps: Caption[], total: number): MotionPlan {
  if (memo && memo.s === s && memo.segs === segs && memo.caps === caps && memo.total === total) return memo.plan;
  const lines = sanitizeMotion(s.motion)?.lines ?? [];
  const hookEnd = s.hook?.trim() ? s.hookSeconds : 0;
  const speed = typeof s.speed === "number" && s.speed >= 1 ? s.speed : 1;
  const zooms = s.keyZooms && lines.length ? keyBeats(lines, segs, speed, total, hookEnd) : [];
  const cards = s.numberCards ? numberCards(caps.flatMap((c) => c.words), segs, speed, total, hookEnd) : [];
  const plan = !segs.length ? EMPTY : { zooms, cards, cues: s.sfx ? sfxCues({ zooms, cards }, s, segs, speed) : [] };
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
  const c = m.cards.find((x) => f.out >= x.from && f.out < x.to);
  if (!c) return;
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
