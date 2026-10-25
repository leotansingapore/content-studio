// The card icons: line drawings in a unit box of +-0.5, round caps, one stroke width.
// Ported from huashu-motion v0.3.1 (MIT), see vendor/huashu/NOTICE.md: the ICON table in
// runtime/clip/grammars/t2_keynote_ui.js and UI.icon in runtime/clip/lib/ui.js,
// Copyright (c) 2026 alchaincyf (花叔 · 花生), licence in vendor/huashu/LICENSE-clip.
// Changes: one table, typed, drawing on any 2D context; wave, memory and agent take t for their motion.

type G = CanvasRenderingContext2D;

const ICON: Record<string, (c: G, t: number) => void> = {
  clock: (c) => { c.beginPath(); c.arc(0, 0, 0.42, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -0.24); c.lineTo(0, 0); c.lineTo(0.18, 0.1); c.stroke(); },
  phone: (c) => { c.beginPath(); c.roundRect(-0.25, -0.45, 0.5, 0.9, 0.1); c.stroke(); c.beginPath(); c.moveTo(-0.08, 0.32); c.lineTo(0.08, 0.32); c.stroke(); },
  layers: (c) => { for (let k = 0; k < 3; k++) { const y = -0.22 + k * 0.22; c.globalAlpha = k ? 0.6 : 1; c.beginPath(); c.moveTo(-0.45, y); c.lineTo(0, y - 0.18); c.lineTo(0.45, y); c.lineTo(0, y + 0.18); c.closePath(); c.stroke(); } c.globalAlpha = 1; },
  chart: (c) => { c.beginPath(); c.moveTo(-0.42, -0.42); c.lineTo(-0.42, 0.4); c.lineTo(0.44, 0.4); c.stroke(); c.beginPath(); c.moveTo(-0.28, 0.18); c.lineTo(-0.06, -0.04); c.lineTo(0.1, 0.06); c.lineTo(0.36, -0.26); c.stroke(); },
  code: (c) => { c.beginPath(); c.moveTo(-0.18, -0.28); c.lineTo(-0.42, 0); c.lineTo(-0.18, 0.28); c.moveTo(0.18, -0.28); c.lineTo(0.42, 0); c.lineTo(0.18, 0.28); c.moveTo(0.08, -0.38); c.lineTo(-0.08, 0.38); c.stroke(); },
  check: (c) => { c.beginPath(); c.arc(0, 0, 0.42, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-0.2, 0); c.lineTo(-0.05, 0.16); c.lineTo(0.22, -0.16); c.stroke(); },
  play: (c) => { c.beginPath(); c.moveTo(-0.22, -0.34); c.lineTo(0.34, 0); c.lineTo(-0.22, 0.34); c.closePath(); c.fill(); },
  bolt: (c) => { c.beginPath(); c.moveTo(0.08, -0.46); c.lineTo(-0.28, 0.06); c.lineTo(0, 0.06); c.lineTo(-0.08, 0.46); c.lineTo(0.28, -0.06); c.lineTo(0, -0.06); c.closePath(); c.fill(); },
  lock: (c) => { c.beginPath(); c.roundRect(-0.32, -0.04, 0.64, 0.46, 0.08); c.stroke(); c.beginPath(); c.arc(0, -0.04, 0.2, Math.PI, 0); c.stroke(); },
  wave: (c, t) => {
    [0.35, 0.7, 1, 0.6, 0.3].forEach((h0, i) => { const h = h0 * (0.75 + 0.25 * Math.sin(t * 7 + i * 1.3)); const x = -0.4 + i * 0.2; c.beginPath(); c.moveTo(x, -h * 0.45); c.lineTo(x, h * 0.45); c.stroke(); });
  },
  memory: (c, t) => {
    for (let k = 0; k < 3; k++) { const y = -0.28 + k * 0.24 + 0.02 * Math.sin(t * 2 + k); c.beginPath(); c.moveTo(-0.45, y); c.lineTo(0, y - 0.18); c.lineTo(0.45, y); c.lineTo(0, y + 0.18); c.closePath(); c.globalAlpha = k === 0 ? 1 : 0.6; c.stroke(); }
    c.globalAlpha = 1;
  },
  agent: (c, t) => {
    const star = (r: number) => { c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(0, 0, r, 0); c.quadraticCurveTo(0, 0, 0, r); c.quadraticCurveTo(0, 0, -r, 0); c.quadraticCurveTo(0, 0, 0, -r); c.fill(); };
    star(0.42 * (1 + 0.05 * Math.sin(t * 3)));
    c.translate(0.36, -0.36);
    c.globalAlpha = 0.7;
    star(0.16);
  },
};

export const ICONS = Object.keys(ICON);

/** Draws icon `kind` centred on x, y at size s; false when there is no such icon. */
export function drawIcon(c: G, kind: string, x: number, y: number, s: number, col: string, t = 0): boolean {
  const f = ICON[kind];
  if (!f) return false;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 0.075;
  c.lineCap = "round";
  c.lineJoin = "round";
  f(c, t);
  c.restore();
  return true;
}
