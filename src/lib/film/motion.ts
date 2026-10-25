// Eases, springs, steps and stagger for the launch film: every one a pure function from time to a value.
// Ported from huashu-motion v0.3.1 (MIT), see vendor/huashu/NOTICE.md:
//   runtime/clip/lib/motion.js with clamp and lerp from runtime/clip/lib/util.js,
//   Copyright (c) 2026 alchaincyf (花叔 · 花生), licence in vendor/huashu/LICENSE-clip;
//   OM.spring, OM.springValue and OM.random from runtime/om.js,
//   Copyright (c) 2026 Huashu, licence in vendor/huashu/LICENSE.
// Changes: ES module exports instead of window.MO, the stage-size hooks left out, types added.

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
type Ease = (p: number) => number;

// ---------- time slices ----------
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const at = (t: number, t0: number, dur: number) => clamp((t - t0) / dur);
export const anim = (lt: number, start: number, dur: number, ease: Ease = smooth) => ease(clamp((lt - start) / dur));
export const step = (t: number, fps = 12) => Math.floor(t * fps + 1e-6) / fps;

// ---------- manim rate functions ----------
export const smooth: Ease = (t) => { t = clamp(t); return t * t * t * (10 - 15 * t + 6 * t * t); };
const sig = (x: number) => 1 / (1 + Math.exp(-x));
export const smoothCE = (t: number, inflection = 10) => { const e = sig(-inflection / 2); return clamp((sig(inflection * (t - 0.5)) - e) / (1 - 2 * e)); };
export const thereAndBack: Ease = (t) => smooth(t < 0.5 ? 2 * t : 2 * (1 - t));
export const rushInto: Ease = (t) => 2 * smooth(t / 2);
export const rushFrom: Ease = (t) => 2 * smooth(t / 2 + 0.5) - 1;
export const doubleSmooth: Ease = (t) => (t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 * (1 + smooth(2 * t - 1)));
export const wiggle = (t: number, wiggles = 2) => thereAndBack(t) * Math.sin(wiggles * Math.PI * t);
// manim LaggedStart(lag_ratio = r): child i of n at overall progress p
export const lagged = (i: number, n: number, p: number, r = 0.05) => clamp(p * (1 + (n - 1) * r) - i * r);

// ---------- analytic eases (AE / CSS names) ----------
export const linear: Ease = (p) => p;
export const sineInOut: Ease = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
export const cubicIn: Ease = (p) => p * p * p;
export const cubicOut: Ease = (p) => 1 - Math.pow(1 - p, 3);
export const cubicInOut: Ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const quartOut: Ease = (p) => 1 - Math.pow(1 - p, 4);
export const quintOut: Ease = (p) => 1 - Math.pow(1 - p, 5);
export const quintInOut: Ease = (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2);
export const expoIn: Ease = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
export const expoOut: Ease = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
export const expoInOut: Ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2);
// overshoot: s 1.70158 about 10 %, 2.2 about 13 %, 2.6 about 17 %, 3.5 about 23 %
export const backOut = (p: number, s = 1.70158) => { const q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; };
export const elasticOut: Ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

// ---------- CSS cubic-bezier(x1, y1, x2, y2): Newton's method from x to the parameter, then y ----------
export const bezier = (x1: number, y1: number, x2: number, y2: number): Ease => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s, Y = (s: number) => ((ay * s + by) * s + cy) * s, dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let k = 0; k < 8; k++) { const e = X(s) - p, d = dX(s); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; s -= e / d; }
    s = clamp(s);
    return Y(s);
  };
};
export const appleOut = bezier(0.25, 0.1, 0.25, 1);
export const emphasized = bezier(0.2, 0, 0, 1);
export const k75 = bezier(0.75, 0, 0.25, 1);
export const easyEase = bezier(0.333, 0, 0.667, 1);
export const longTail = bezier(0.33, 0, 0.2, 1);

// ---------- springs ----------
// SwiftUI's parameters: zeta = 1 - bounce, omega = 2 pi / duration. 0 to 1, above 1 is overshoot; t in seconds.
export const spring = (t: number, { duration = 0.5, bounce = 0, v0 = 0 } = {}) => {
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / duration, z = 1 - bounce;
  let x: number;
  if (Math.abs(z - 1) < 1e-4) x = Math.exp(-w * t) * (1 + (w - v0) * t);
  else if (z < 1) { const wd = w * Math.sqrt(1 - z * z); x = Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w - v0) / wd) * Math.sin(wd * t)); }
  else { const r = Math.sqrt(z * z - 1), a = -w * (z - r), b = -w * (z + r); const A = (-v0 - b) / (a - b); x = A * Math.exp(a * t) + (1 - A) * Math.exp(b * t); }
  return 1 - x;
};
export const smoothSpring = (t: number) => spring(t, { duration: 0.5, bounce: 0 });
export const snappy = (t: number) => spring(t, { duration: 0.5, bounce: 0.15 });
export const bouncy = (t: number) => spring(t, { duration: 0.5, bounce: 0.3 });
// freq Hz and decay 1/s: 3 / 6 overshoots about 37 % (a slammed word), 2.5 / 9 about 16 %, 2.2 / 10 about 8 %
export const springHz = (t: number, freq = 2.5, decay = 9) => (t <= 0 ? 0 : 1 - Math.exp(-decay * t) * Math.cos(2 * Math.PI * freq * t));
export const settle = (t: number, amp: number, freq = 3, decay = 5) => (t <= 0 ? 0 : (amp * Math.sin(2 * Math.PI * freq * t)) / Math.exp(decay * t));
export const float = (t: number, amp = 6, period = 4, ph = 0) => amp * (0.75 * Math.sin((2 * Math.PI * t) / period + ph) + 0.25 * Math.sin((2 * Math.PI * t) / (period * 0.53) + ph * 1.7));

// ---------- inverse and beats ----------
export const invert = (ease: Ease, y: number, iters = 30) => { let a = 0, b = 1; for (let i = 0; i < iters; i++) { const m = (a + b) / 2; if (ease(m) < y) a = m; else b = m; } return (a + b) / 2; };
export const beat = (n: number, bpm = 120) => (n * 60) / bpm;
export const onBeat = (barTime: number, revealP: number, trDur: number) => barTime - revealP * trDur;

// ---------- from runtime/om.js ----------
// Springs as closed-form step responses over a tween's progress; `bounce` is the overshoot.
const zeta = (b: number) => (b <= 0 ? 1 : -Math.log(b) / Math.sqrt(Math.PI * Math.PI + Math.log(b) ** 2));
const stepResponse = (t: number, z: number, w: number) => {
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
};
export const omSpring = (bounce: number): Ease => {
  const z = zeta(Math.min(0.9, Math.max(0, Number(bounce) || 0)));
  const w = 6.9 / z;
  return (p) => (p >= 1 ? 1 : p <= 0 ? 0 : stepResponse(p, z, w));
};
// A value that changes target many times: one step per change. changes sorted by `at`.
export const springValue = (from: number, changes: { at: number; to: number }[], t: number, opts: { bounce?: number; settle?: number } = {}) => {
  const z = zeta(opts.bounce || 0), w = 6.9 / z / (opts.settle || 0.6);
  let v = from, prev = from;
  for (const c of changes) {
    if (t > c.at) v += (c.to - prev) * stepResponse(t - c.at, z, w);
    prev = c.to;
  }
  return v;
};
// Seeded randomness (mulberry32): same seed, same film.
export const random = (seed: number) => {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
