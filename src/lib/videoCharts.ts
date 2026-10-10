// Chart cards in the video editor: a few bars, or two numbers side by side,
// typed by the adviser (or started from a figure said in the video), that
// animate in as the line is said and are burned into the export. Every value
// is shown exactly as typed; the number in it only sets how long its bar is.
// The model, value scaling, animation timing, size and the wide-frame spot are
// pure and tested (videoCharts.test.ts); drawing is at the bottom. Where a
// chart lands on the edit, and clear of the face, is worked out in
// videoMotion.ts with the number cards.

import { readableOn } from "@/lib/carouselLayout";

export interface ChartRow {
  label: string;
  value: string;
}

export interface Chart {
  id: string;
  /** Bars (2 to 5 rows), or two numbers side by side. */
  kind: "bars" | "compare";
  title: string;
  rows: ChartRow[];
  /** Where it is said on the source timeline, so later cuts keep it on its line. */
  s: number;
  e: number;
}

export const MAX_CHARTS = 10;
export const MAX_ROWS = 5;
export const MAX_LABEL = 24;
export const MAX_VALUE = 14;
export const MAX_TITLE = 40;

/** On screen 4 s from a beat before the line; in like a number card, then each bar grows in turn. */
export const CHART = { seconds: 4, min: 2, lead: 0.3, arrive: 0.25, grow: 0.6, stagger: 0.15, leave: 0.25 };

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** The number in a typed value ("0.05%", "$1,200", "S$1.2 million", "500k"), for its bar's length only; null when it has none. */
export function chartValue(text: string): number | null {
  const m = /(-?)(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(thousand|million|billion|mil|bn|k|m|b)?(?![a-z])/i.exec(text);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, "")) * (m[3] ? MULT[m[3].toLowerCase()] : 1);
  return Number.isFinite(v) ? (m[1] ? -v : v) : null;
}

/** The rows that show: any with a label or a value. */
export const shownRows = (c: Pick<Chart, "rows">): ChartRow[] => c.rows.filter((r) => r.label.trim() || r.value.trim());

/** Two numbers side by side only with exactly two rows to show; else bars. */
export const isCompare = (c: Pick<Chart, "kind" | "rows">) => c.kind === "compare" && shownRows(c).length === 2;

/** Each bar's length as a share of the longest: its value over the biggest. No number, zero or below = no bar. */
export function barShares(rows: ChartRow[]): number[] {
  const vals = rows.map((r) => chartValue(r.value) ?? 0);
  const max = Math.max(0, ...vals);
  return vals.map((v) => (v > 0 && max > 0 ? v / max : 0));
}

export function newChart(s: number, e: number, first?: ChartRow): Chart {
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    kind: first ? "compare" : "bars",
    title: "",
    rows: [first ?? { label: "", value: "" }, { label: "", value: "" }],
    s: Math.max(0, Math.round(s * 100) / 100),
    e: Math.round(Math.max(s + 0.1, e) * 100) / 100,
  };
}

/** Charts from storage, kept only when well formed; text is cut to its limits. */
export function sanitizeCharts(raw: unknown): Chart[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return raw.slice(0, MAX_CHARTS).flatMap((x): Chart[] => {
    const r = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    if (!r || typeof r.id !== "string" || !Array.isArray(r.rows)) return [];
    const s = typeof r.s === "number" && Number.isFinite(r.s) ? r.s : NaN;
    const e = typeof r.e === "number" && Number.isFinite(r.e) ? r.e : NaN;
    if (!(s >= 0 && e > s)) return [];
    const rows = r.rows.slice(0, MAX_ROWS).map((row) => {
      const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return { label: str(o.label, MAX_LABEL), value: str(o.value, MAX_VALUE) };
    });
    return [{ id: r.id.slice(0, 24), kind: r.kind === "compare" ? "compare" : "bars", title: str(r.title, MAX_TITLE), rows, s, e }];
  });
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * How far in the chart is at `out`: its fade (in over 0.25 s, out over its last
 * 0.25 s), its rise, and each bar's growth, one after the other, 0.15 s apart.
 */
export function chartAnim(from: number, to: number, out: number, n: number): { alpha: number; rise: number; bars: number[] } {
  const t = out - from;
  const rise = ease(t / CHART.arrive);
  const alpha = Math.min(rise, Math.min(1, Math.max(0, (to - out) / CHART.leave)));
  const bars = Array.from({ length: n }, (_, i) => ease((t - CHART.arrive - i * CHART.stagger) / CHART.grow));
  return { alpha, rise, bars };
}

// sizes at a 1080 frame: padding, title, rows, bar, value text, two-number columns
const L = { pad: 44, title: 44, gap: 16, row: 64, rowGap: 18, lab: 44, val: 48, bar: 40, big: 84, tall: 160, barW: 120, radius: 36 };

/**
 * The card's size in px, u = the frame's short side / 1080. On a wide frame the card is no wider than a
 * comparison (760), so it still fits beside a face at the smallest size it may shrink to (WIDE_MIN).
 */
export function chartSize(c: Chart, u: number, wide = false): { w: number; h: number } {
  const head = c.title.trim() ? L.title * 1.3 + L.gap : 0;
  if (isCompare(c)) return { w: 760 * u, h: (2 * L.pad + head + L.big * 1.2 + L.gap + L.tall + L.gap + L.lab * 1.4) * u };
  const n = Math.max(1, shownRows(c).length);
  return { w: (wide ? 760 : 900) * u, h: (2 * L.pad + head + n * L.row + (n - 1) * L.rowGap) * u };
}

/**
 * The smallest a card gets on a wide frame (16:9). Row text is then about 1.8% of the frame's width, close to a
 * 4:5 or square at half size (2%), so it still reads on a phone; half size there was under a 1.1%.
 */
export const WIDE_MIN = 0.8;

/**
 * Where a card w x h (px) goes on a wide frame: beside the face, on the side
 * with more room, level with the space the captions leave, as big as fits
 * there (never under `min`, half size unless the caller asks for more; `fits`
 * says whether `min` fits). Without a face it goes on the right.
 */
export function sideSpot(W: number, H: number, w: number, h: number, face: [number, number] | null, capBand: [number, number] | null, min = 0.5): { x: number; top: number; scale: number; fits: boolean } {
  const m = W * 0.04;
  const [f0, f1] = face ? [face[0] * W - m / 2, face[1] * W + m / 2] : [W / 2, W / 2];
  const left = f0 - m;
  const right = W - m - f1;
  const room = Math.max(left, right);
  let lo = H * 0.08;
  let hi = H * 0.92;
  if (capBand && (capBand[0] + capBand[1]) / 2 >= 0.5) hi = Math.min(hi, (capBand[0] - 0.02) * H);
  else if (capBand) lo = Math.max(lo, (capBand[1] + 0.02) * H);
  const room1 = Math.min(1, room / w, (hi - lo) / h);
  const scale = Math.max(min, room1);
  const x = right >= left ? W - m - (w * scale) / 2 : m + (w * scale) / 2;
  return { x, top: lo + Math.max(0, hi - lo - h * scale) / 2, scale, fits: room1 >= min };
}

// ---------- drawing (browser only) ----------

const numFont = (px: number) => `900 ${Math.round(px)}px "Archivo Black", "Arial Black", Impact, system-ui, sans-serif`;
const labFont = (px: number) => `700 ${Math.round(px)}px "DM Sans", Inter, system-ui, sans-serif`;

/**
 * The card, centred on the origin, in `bg` (the brand colour) with text and bars
 * in the colour readable on it. Values are written as typed.
 */
export function paintChart(g: CanvasRenderingContext2D, c: Chart, a: { alpha: number; bars: number[] }, u: number, bg: string, wide = false) {
  const rows = shownRows(c);
  const shares = barShares(rows);
  const { w, h } = chartSize(c, u, wide);
  const ink = readableOn(bg);
  const p = L.pad * u;
  g.save();
  g.globalAlpha = a.alpha;
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 30 * u;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, L.radius * u);
  g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = ink;
  g.textBaseline = "middle";
  let y = -h / 2 + p;
  if (c.title.trim()) {
    g.font = labFont(L.title * u);
    g.textAlign = "center";
    g.fillText(c.title.trim(), 0, y + L.title * u * 0.62, w - 2 * p);
    y += (L.title * 1.3 + L.gap) * u;
  }
  if (isCompare(c)) {
    const base = y + (L.big * 1.2 + L.gap + L.tall) * u;
    rows.forEach((r, i) => {
      const x = (i ? 1 : -1) * (w / 4);
      const grow = a.bars[i] ?? 0;
      // a hairline even for the smallest share, so the bar is seen to be there
      const bh = (shares[i] ? Math.max(6 * u, shares[i] * L.tall * u) : 0) * grow;
      g.globalAlpha = a.alpha;
      g.beginPath();
      g.roundRect(x - (L.barW * u) / 2, base - bh, L.barW * u, bh, [Math.min(14 * u, bh / 2), Math.min(14 * u, bh / 2), 0, 0]);
      g.fill();
      g.textAlign = "center";
      g.globalAlpha = a.alpha * grow;
      g.font = numFont(L.big * u);
      g.fillText(r.value.trim(), x, base - bh - (L.gap + L.big * 0.55) * u, w / 2 - p);
      g.globalAlpha = a.alpha * 0.85;
      g.font = labFont(L.lab * u);
      g.fillText(r.label.trim(), x, base + (L.gap + L.lab * 0.7) * u, w / 2 - p);
    });
  } else {
    const inner = w - 2 * p;
    g.font = labFont(L.lab * u);
    const labW = Math.min(inner * 0.32, Math.max(0, ...rows.map((r) => g.measureText(r.label.trim()).width)));
    g.font = numFont(L.val * u);
    const valW = Math.min(inner * 0.34, Math.max(0, ...rows.map((r) => g.measureText(r.value.trim()).width)));
    const x0 = -w / 2 + p + (labW ? labW + 18 * u : 0);
    const room = Math.max(0, w / 2 - p - x0 - (valW ? valW + 14 * u : 0));
    const bar = L.bar * u;
    rows.forEach((r, i) => {
      const cy = y + (i * (L.row + L.rowGap) + L.row / 2) * u;
      const grow = a.bars[i] ?? 0;
      g.globalAlpha = a.alpha * 0.85;
      g.font = labFont(L.lab * u);
      g.textAlign = "left";
      if (labW) g.fillText(r.label.trim(), -w / 2 + p, cy, labW);
      const len = (shares[i] ? Math.max(12 * u, shares[i] * room) : 0) * grow;
      g.globalAlpha = a.alpha;
      if (len) {
        g.beginPath();
        g.roundRect(x0, cy - bar / 2, len, bar, Math.min(bar / 2, len / 2));
        g.fill();
      }
      g.globalAlpha = a.alpha * grow;
      g.font = numFont(L.val * u);
      if (valW) g.fillText(r.value.trim(), x0 + len + 14 * u, cy, valW);
    });
  }
  g.restore();
}
