// A notification stack (/make/notification-stack): a client's worries pop up one by one as phone notification cards,
// newest on top and the older ones pushed down a slot, at most 4 on screen (the oldest falls off the bottom), then one
// big word lands under the stack. The timing is the talking-head-reel skill's notify panel, which QA'd clean: a new
// card enters 0.12 s after the push starts, so two texts never overlap. The cards are "notify" stickers (each one's
// x/y is the stack's top slot) and the word is a words block, so the editor draws, edits and exports them like any
// other sticker. Our own plain card, as notesCard.ts: a coloured circle with a letter, a label line and the message;
// no status bar, no platform logos or fonts. Pure and tested (notifyStack.test.ts) except the drawing at the bottom.

import { readableOn } from "@/lib/carouselLayout";
import type { Measure } from "@/lib/slideshowDraw";
import { BLOCK_W, FONTS, NOTIFY_LABEL_MAX, newOverlay, wallSettings, type EditSettings, type Overlay } from "@/lib/videoEdit";

export const STACK_MIN = 2;
export const STACK_MAX = 6;
/** Cards on screen at once: a fifth pushes the oldest off. */
export const STACK_SHOW = 4;
/** One line on a card at 36 px, shrinking to fit. */
export const LINE_MAX = 45;
export const WORD_MAX = 14;
export { NOTIFY_LABEL_MAX as LABEL_MAX };
/** Seconds: the first card, the even gap between cards (and from the last card to the word), the word's hold to the end. */
export const STACK_TIME = { first: 0.6, gap: 1.5, hold: 2.5 };
/** The push down (0.35 s), the new card's 0.12 s lag and 0.3 s drop-in from 20 px up; the fifth slides 50 px and fades. */
export const STACK_MOVE = { push: 0.35, lag: 0.12, enter: 0.3, rise: 20, fall: 50, shrink: 0.94 };
/** A card on a 1080-wide frame: 940 x 118, one every 134 px. */
export const CARD = { w: 940, h: 118, pitch: 134, r: 34 };
/** Between the stack's last slot and the word. */
const WORD_GAP = 64;
/** The icon's circle until the editor's sticker colour changes it. */
export const ICON_COLOR = "#2563EB";
const WORD_SIZES = [2.5, 2.25, 2, 1.75, 1.5, 1.25, 1];

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** The typed lines worth a card: trimmed, empty ones dropped, at most 6 of 45 characters. */
export const stackLines = (lines: string[]): string[] =>
  lines.map((l) => l.trim().replace(/\s+/g, " ").slice(0, LINE_MAX)).filter(Boolean).slice(0, STACK_MAX);

/** When each card lands (its push starts), when the word lands, and the video's length: evenly spaced. */
export function stackTimes(n: number): { cards: number[]; word: number; total: number } {
  const k = Math.min(STACK_MAX, Math.max(0, Math.floor(n)));
  const cards = Array.from({ length: k }, (_, i) => r2(STACK_TIME.first + i * STACK_TIME.gap));
  const word = r2(STACK_TIME.first + k * STACK_TIME.gap);
  return { cards, word, total: r2(word + STACK_TIME.hold) };
}

export interface CardPose {
  /** Down from the top slot, in px on a 1080-wide frame. */
  dy: number;
  alpha: number;
  scale: number;
}

/**
 * Card i at time t, the cards' start times in order: hidden until 0.12 s after its own start, then it drops in at the
 * top; each newer card's start pushes it down a slot over 0.35 s, and the push that would make it the fifth on screen
 * slides it 50 px and fades it out for good. null while it is not on screen.
 */
export function cardPose(starts: number[], i: number, t: number): CardPose | null {
  const m = STACK_MOVE;
  const at = starts[i];
  if (at === undefined || t < at + m.lag) return null;
  const e = ease((t - at - m.lag) / m.enter);
  let dy = -m.rise * (1 - e);
  let alpha = e;
  let scale = 1;
  for (let k = i + 1; k < starts.length && starts[k] <= t; k++) {
    const slot = k - i;
    const q = ease((t - starts[k]) / m.push);
    if (slot < STACK_SHOW) dy += CARD.pitch * q;
    else {
      dy += m.fall * q;
      alpha *= 1 - q;
      scale = 1 - (1 - m.shrink) * q;
    }
  }
  return alpha > 0.001 ? { dy: dy || 0, alpha, scale } : null;
}

/** A notify sticker's pose among the edit's notify stickers, ordered by start (then by list order). */
export function notifyPose(list: Overlay[], o: Overlay, t: number): CardPose | null {
  const cards = list.filter((x) => x.kind === "notify").map((x, n) => ({ x, n })).sort((a, b) => a.x.from - b.x.from || a.n - b.n);
  const i = cards.findIndex((c) => c.x.id === o.id);
  return i < 0 ? null : cardPose(cards.map((c) => c.x.from), i, t);
}

/** Where the top card and the word sit, as shares of a 1920-high frame: the stack's slots over the word, centred a little above the middle. */
export function stackPlace(n: number, wordPx: number): { cardY: number; wordY: number } {
  const slots = Math.min(STACK_SHOW, Math.max(1, n));
  const stackH = (slots - 1) * CARD.pitch + CARD.h;
  const wordH = wordPx * 1.3;
  const top = 0.44 * 1920 - (stackH + WORD_GAP + wordH) / 2;
  return { cardY: r4((top + CARD.h / 2) / 1920), wordY: r4((top + stackH + WORD_GAP + wordH / 2) / 1920) };
}

/** The word's size as a words block (52 px times it), stepped down from 2.5 until it fits across the block. */
export function wordSize(word: string, measure: Measure): number {
  for (const size of WORD_SIZES) {
    if (measure(word, FONTS.serif.css.replace("{px}", (52 * size).toFixed(2))) <= BLOCK_W * 1080) return size;
  }
  return WORD_SIZES[WORD_SIZES.length - 1];
}

/** The editor's settings for a stack: one notify sticker per line and the word as a serif words block, over a muted 9:16 clip. */
export function stackSettings(a: { lines: string[]; word: string; label: string }, measure: Measure): Partial<EditSettings> {
  const lines = stackLines(a.lines);
  const word = a.word.trim().slice(0, WORD_MAX);
  const label = a.label.trim().slice(0, NOTIFY_LABEL_MAX);
  const t = stackTimes(lines.length);
  const size = wordSize(word, measure);
  const place = stackPlace(lines.length, 52 * size);
  const base = wallSettings(word, t.total, { size, font: "serif", box: "none" });
  // ids unique within the stack: newOverlay's random part can repeat within one millisecond
  const cards = lines.map((text, i): Overlay => ({ ...newOverlay("notify", t.cards[i], ICON_COLOR), id: `n${i}${Date.now().toString(36)}`, text, label, y: place.cardY, from: t.cards[i], to: t.total }));
  return { ...base, overlays: [...cards, { ...base.overlays![0], from: t.word, y: place.wordY }] };
}

// ---------- drawing (browser only) ----------

const SANS = (weight: number, px: number) => `${weight} ${px.toFixed(2)}px "DM Sans", Inter, system-ui, sans-serif`;

/** One card at its pose: a light rounded card with a soft shadow, the icon circle, the label and "now", then the message. */
export function drawNotify(g: CanvasRenderingContext2D, o: Overlay, p: CardPose) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const u = (Math.min(W, H) / 1080) * o.size;
  const w = CARD.w * u;
  const h = CARD.h * u;
  const label = (o.label ?? "").trim().toUpperCase();
  const text = o.text.trim();
  g.save();
  g.globalAlpha *= p.alpha;
  g.translate(o.x * W, o.y * H + p.dy * u);
  g.scale(p.scale, p.scale);
  g.shadowColor = "rgba(0,0,0,0.25)";
  g.shadowBlur = 40 * u;
  g.shadowOffsetY = 16 * u;
  g.fillStyle = "rgba(246,246,246,0.95)";
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, CARD.r * u);
  g.fill();
  g.shadowColor = "transparent";
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  const cx = -w / 2 + 62 * u;
  g.fillStyle = o.color;
  g.beginPath();
  g.arc(cx, 0, 38 * u, 0, Math.PI * 2);
  g.fill();
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillStyle = readableOn(o.color);
  g.font = SANS(700, 44 * u);
  g.fillText(([...(label || text)][0] ?? "").toUpperCase(), cx, 2 * u);
  const x0 = -w / 2 + 124 * u;
  const x1 = w / 2 - 30 * u;
  if (label) {
    g.font = SANS(600, 22 * u);
    g.fillStyle = "#6E6E73";
    g.textAlign = "left";
    g.fillText(label, x0, -26 * u);
    g.textAlign = "right";
    g.fillText("NOW", x1, -26 * u);
  }
  // one line: a long message shrinks to fit, down to 26 px
  let px = 36 * u;
  g.font = SANS(600, px);
  const tw = g.measureText(text).width;
  if (tw > x1 - x0) {
    px = Math.max(26 * u, (px * (x1 - x0)) / tw);
    g.font = SANS(600, px);
  }
  g.textAlign = "left";
  g.fillStyle = "#111111";
  g.fillText(text, x0, label ? 14 * u : 0, x1 - x0);
  g.restore();
}
