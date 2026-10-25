// One frame of a launch film: drawFilm(g, film, assets, t, { w, h }) paints the frame at t on a 2D
// canvas and returns a box for every element it drew, so a tap in the player finds what it hit.
// A pure function of t: no clock, no unseeded random, nothing async, so the preview and the export
// draw the same frame, and the export can step frames at i / 30.
import { INK, PAPER, contrastRatio, readableOn } from "@/lib/carouselLayout";
import { drawIcon } from "./icons.ts";
import { layoutScene, type Rect } from "./layout.ts";
import { clamp, emphasized, expoOut, lerp, spring, springHz } from "./motion.ts";
import { beatSeconds, countBeats, landsAt, moveBeats, sceneBeats, sceneSpans, type Film, type FilmScene, type ShareBox } from "./timeline.ts";

type G = CanvasRenderingContext2D;

/** A picture the canvas can draw, with its size: an image, a canvas, or a demo video's frame at this time. */
export interface Picture {
  source: CanvasImageSource;
  width: number;
  height: number;
}
export interface FilmAssets {
  /** The kit's colours: the brand colour and the palette's named colours. */
  colors: { brand: string; palette?: Record<string, string> };
  /** The brand name, drawn when there is no logo. */
  name: string;
  logo?: Picture;
  /** The brand font's family once registered (brandFont.ts); unset draws the Google fonts. */
  font?: string;
  /** Media keys to their pictures; a key missing here draws the screen-gone card. */
  screens: Record<string, Picture | undefined>;
}
export interface FilmMark extends Rect {
  /** <scene>.<part>, such as features.card2.title. */
  id: string;
  /** What the player calls it: "Card 2 title". */
  label: string;
  scene: string;
}
export interface DrawOptions {
  w: number;
  h: number;
  /** The spoken line at t, drawn as a caption in the bottom safe area. */
  caption?: string;
}

// ---------- colour and type ----------

const hex = (c: string) => {
  const n = parseInt(String(c).replace(/^#/, "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a: string, b: string, p: number) => `#${hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], p)).toString(16).padStart(2, "0")).join("")}`;

/** The film's colour roles from the kit: a poor brand ground falls back to ink, a faint accent to the text colour. */
export function filmColors(film: Pick<Film, "ground" | "accent">, colors: FilmAssets["colors"]) {
  const brand = colors.brand;
  let ground = film.ground === "brand" ? brand : film.ground === "paper" ? PAPER : INK;
  if (film.ground === "brand" && contrastRatio(readableOn(brand), brand) < 4.5) ground = INK;
  const text = readableOn(ground);
  const named = film.accent?.startsWith("palette:") ? colors.palette?.[film.accent.slice(8)] : undefined;
  let accent = named ?? brand;
  if (contrastRatio(accent, ground) < 3) accent = text;
  return { ground, text, accent, onAccent: readableOn(accent), surface: mixHex(ground, text, 0.08), muted: mixHex(ground, text, 0.7), brand };
}
type Colors = ReturnType<typeof filmColors>;

const FAMILY: Record<string, string> = { archivo: '"Archivo Black"', "dm-sans": '"DM Sans"', fraunces: "Fraunces" };
const WEIGHT: Record<string, number> = { '"Archivo Black"': 900, '"DM Sans"': 700, Fraunces: 600 };

/** The display and body faces for a scene: the brand font when it is loaded, else Archivo Black for type and DM Sans for the rest. */
function faces(film: Film, assets: FilmAssets, scene: FilmScene) {
  if (film.font === "brand" && assets.font) {
    const f = `"${assets.font}"`;
    return { display: f, dw: 700, body: f, bw: 500 };
  }
  const display = film.font === "brand" ? (scene.kind === "type" ? '"Archivo Black"' : '"DM Sans"') : FAMILY[film.font] ?? '"DM Sans"';
  return { display, dw: WEIGHT[display] ?? 700, body: '"DM Sans"', bw: 600 };
}
const font = (weight: number, size: number, family: string) => `${weight} ${Math.max(1, Math.round(size))}px ${family}, sans-serif`;

/** The size at which one line fills the box's height (80 %) without passing its width. */
function fitSize(g: G, text: string, box: Rect, weight: number, family: string, max = box.h * 0.8): number {
  let size = Math.min(max, box.h * 0.8);
  g.font = font(weight, size, family);
  const w = g.measureText(text).width;
  if (w > box.w) size *= box.w / w;
  return size;
}

/** Greedy lines for the text at this size. */
function wrap(g: G, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The largest size, up to max, at which the text wraps inside the box. */
function wrapSize(g: G, text: string, box: Rect, weight: number, family: string, max: number): number {
  let size = Math.min(max, box.h / 1.25);
  for (let k = 0; k < 14; k++, size *= 0.88) {
    g.font = font(weight, size, family);
    const lines = wrap(g, text, box.w);
    if (lines.length * size * 1.25 <= box.h && lines.every((l) => g.measureText(l).width <= box.w)) break;
  }
  return size;
}

/** Text wrapped into the box at the largest size that fits (up to max); returns the box it filled. */
function drawWrapped(g: G, text: string, box: Rect, weight: number, family: string, color: string, align: "center" | "left", max: number): Rect {
  const size = wrapSize(g, text, box, weight, family, max);
  g.font = font(weight, size, family);
  const lines = wrap(g, text, box.w);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "middle";
  const lh = size * 1.25, top = box.y + (box.h - lh * lines.length) / 2;
  let widest = 0;
  lines.forEach((l, i) => {
    widest = Math.max(widest, g.measureText(l).width);
    g.fillText(l, align === "center" ? box.x + box.w / 2 : box.x, top + lh * (i + 0.5));
  });
  const x = align === "center" ? box.x + (box.w - widest) / 2 : box.x;
  return { x, y: top, w: widest, h: lh * lines.length };
}

/** One line centred in the box, scaled about its centre; returns the box the text covers. */
function drawLine(g: G, text: string, box: Rect, weight: number, family: string, color: string, scale = 1, max?: number): Rect {
  const size = fitSize(g, text, box, weight, family, max);
  g.font = font(weight, size, family);
  const w = g.measureText(text).width;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  g.save();
  g.translate(cx, cy);
  if (scale !== 1) g.scale(scale, scale);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 0, 0);
  g.restore();
  return { x: cx - (w * scale) / 2, y: cy - (size * scale) / 2, w: w * scale, h: size * scale };
}

const containIn = (box: Rect, w: number, h: number): Rect => {
  const s = Math.min(box.w / Math.max(1, w), box.h / Math.max(1, h));
  return { x: box.x + (box.w - w * s) / 2, y: box.y + (box.h - h * s) / 2, w: w * s, h: h * s };
};

const labelOf = (part: string) => {
  const named: Record<string, string> = { value: "Number", cta: "Link" };
  const words = (named[part] ?? part.replace(/([a-z])(\d+)/g, "$1 $2").replace(/\./g, " ")).trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// ---------- the device ----------

interface Device {
  outline: Rect;
  screen: Rect;
}
function device(box: Rect, frame: "phone" | "browser"): Device {
  if (frame === "browser") {
    const bar = box.h * 0.08, b = box.w * 0.012;
    return { outline: box, screen: { x: box.x + b, y: box.y + bar, w: box.w - 2 * b, h: box.h - bar - b } };
  }
  const b = box.w * 0.035;
  return { outline: box, screen: { x: box.x + b, y: box.y + b, w: box.w - 2 * b, h: box.h - 2 * b } };
}
function drawDeviceFrame(g: G, d: Device, frame: "phone" | "browser") {
  const o = d.outline;
  g.fillStyle = "#0B0B0F";
  g.beginPath();
  g.roundRect(o.x, o.y, o.w, o.h, frame === "phone" ? o.w * 0.13 : o.w * 0.02);
  g.fill();
  if (frame === "browser") {
    g.fillStyle = "#3A3A40";
    const r = d.screen.y - o.y;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(o.x + r * (0.6 + i * 0.45), o.y + r / 2, r * 0.14, 0, Math.PI * 2);
      g.fill();
    }
  }
}
/** The screen's picture at `at` (by default fitted inside, never cropped), clipped to the screen; the brand colour when the file isn't on this device. */
function drawPicture(g: G, d: Device, pic: Picture | undefined, c: Colors, frame: "phone" | "browser", at?: Rect) {
  const s = d.screen;
  g.save();
  g.beginPath();
  g.roundRect(s.x, s.y, s.w, s.h, frame === "phone" ? s.w * 0.1 : s.w * 0.01);
  g.clip();
  g.fillStyle = pic ? "#000000" : c.brand;
  g.fillRect(s.x, s.y, s.w, s.h);
  if (pic) {
    const p = at ?? containIn(s, pic.width, pic.height);
    g.drawImage(pic.source, p.x, p.y, p.w, p.h);
  }
  g.restore();
}
const scaleAbout = (r: Rect, z: number): Rect => ({ x: r.x + (r.w * (1 - z)) / 2, y: r.y + (r.h * (1 - z)) / 2, w: r.w * z, h: r.h * z });

// ---------- the scenes ----------

interface Ctx {
  g: G;
  film: Film;
  assets: FilmAssets;
  c: Colors;
  w: number;
  h: number;
  /** Seconds a beat lasts. */
  b: number;
  /** True only for the film's first frame onward in its first scene: what lands at 0 is already there. */
  opening: boolean;
  /** The scene's slide while it enters, added to every mark. */
  dx: number;
  marks: FilmMark[];
}

const mark = (x: Ctx, scene: FilmScene, part: string, r: Rect) => x.marks.push({ id: `${scene.id}.${part}`, label: labelOf(part), scene: scene.id, x: r.x + x.dx, y: r.y, w: r.w, h: r.h });
/** Seconds since `part` landed; Infinity for what the opening frame already holds; null before it lands. */
function since(x: Ctx, scene: FilmScene, part: string, local: number): number | null {
  const at = landsAt(x.film, scene, part);
  if (at == null || local < at - 1e-9) return null;
  return x.opening && at === 0 ? Infinity : local - at;
}
const fade = (dt: number, len = 0.15) => (dt === Infinity ? 1 : clamp(dt / len));

/** Where the camera looks: zoom and the picture point at the screen's centre, as shares of the picture. */
function cameraAt(x: Ctx, scene: Extract<FilmScene, { kind: "screen" }>, local: number, pic: Rect, screen: Rect) {
  const target = (to: "whole" | ShareBox) => {
    if (to === "whole" || !Array.isArray(to)) return { z: 1, fx: 0.5, fy: 0.5 };
    const [bx, by, bw, bh] = to;
    const need = Math.max((bw * pic.w) / screen.w, (bh * pic.h) / screen.h, 1e-3);
    return { z: clamp(0.85 / need, 1, 4), fx: bx + bw / 2, fy: by + bh / 2 };
  };
  const keys = [...(scene.camera ?? [])].sort((a, b) => a.beat - b.beat);
  let cur = keys[0] && keys[0].beat <= 0 ? target(keys[0].to) : target("whole");
  const move = moveBeats(x.film.energy) * x.b;
  for (const k of keys) {
    if (k.beat <= 0) continue;
    const start = k.beat * x.b;
    if (local < start) break;
    const next = target(k.to), p = emphasized(clamp((local - start) / move));
    cur = { z: Math.exp(lerp(Math.log(cur.z), Math.log(next.z), p)), fx: lerp(cur.fx, next.fx, p), fy: lerp(cur.fy, next.fy, p) };
  }
  return cur;
}

function drawScreen(x: Ctx, scene: Extract<FilmScene, { kind: "screen" }>, local: number) {
  const { g, c, h } = x;
  const frame = scene.frame === "browser" ? "browser" : "phone";
  const lay = layoutScene(scene, x.w, h);
  const dt = since(x, scene, "screen", local);
  const rise = scene.cut === "carry" || dt === Infinity ? 0 : (1 - spring(dt ?? 0, { duration: 0.6, bounce: 0.12 })) * h * 0.12;
  const d = device({ ...lay.device!, y: lay.device!.y + rise }, frame);
  drawDeviceFrame(g, d, frame);
  const pic = scene.media ? x.assets.screens[scene.media] : undefined;
  // the camera puts its look point (shares of the picture) at the screen's centre, zoomed by z
  const s = d.screen;
  const fitted = pic ? containIn(s, pic.width, pic.height) : s;
  const cam = cameraAt(x, scene, local, fitted, s);
  const toFrame = (u: number, v: number) => ({ x: s.x + s.w / 2 + (u - cam.fx) * fitted.w * cam.z, y: s.y + s.h / 2 + (v - cam.fy) * fitted.h * cam.z });
  const tl = toFrame(0, 0);
  drawPicture(g, d, pic, c, frame, { ...tl, w: fitted.w * cam.z, h: fitted.h * cam.z });
  const br = toFrame(1, 1);
  const shown = { x: Math.max(s.x, tl.x), y: Math.max(s.y, tl.y), w: 0, h: 0 };
  shown.w = Math.min(s.x + s.w, br.x) - shown.x;
  shown.h = Math.min(s.y + s.h, br.y) - shown.y;
  mark(x, scene, "screen", shown);
  for (const tp of scene.tap ?? []) {
    const p = (local - tp.beat * x.b) / (x.b * 1.2);
    if (p < 0 || p > 1) continue;
    const at = toFrame(tp.at[0], tp.at[1]);
    g.save();
    g.globalAlpha = 1 - p;
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.strokeStyle = "#FFFFFF";
    g.lineWidth = Math.max(2, s.w * 0.008);
    g.beginPath();
    g.arc(at.x, at.y, s.w * lerp(0.03, 0.09, expoOut(p)), 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  }
  const hl = scene.highlight;
  const hdt = hl ? since(x, scene, "highlight", local) : null;
  if (hl && hdt != null) {
    const [bx, by, bw, bh] = hl.box;
    const a = toFrame(bx, by), z = toFrame(bx + bw, by + bh);
    const grow = lerp(1.15, 1, expoOut(fade(hdt, 0.35)));
    const cx = (a.x + z.x) / 2, cy = (a.y + z.y) / 2, ww = (z.x - a.x) * grow, hh = (z.y - a.y) * grow;
    g.save();
    g.globalAlpha = fade(hdt, 0.2);
    g.strokeStyle = c.accent;
    g.lineWidth = Math.max(3, x.w * 0.006);
    g.beginPath();
    g.roundRect(cx - ww / 2, cy - hh / 2, ww, hh, Math.min(ww, hh) * 0.18);
    g.stroke();
    g.restore();
    mark(x, scene, "highlight", { x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh });
    if (hl.label) {
      const f = faces(x.film, x.assets, scene);
      g.save();
      g.globalAlpha = fade(hdt);
      mark(x, scene, "highlight.label", drawLine(g, hl.label, lay.words[0], f.dw, f.display, c.text));
      g.restore();
    }
  }
}

function drawType(x: Ctx, scene: Extract<FilmScene, { kind: "type" }>, local: number) {
  const { g, c } = x;
  const f = faces(x.film, x.assets, scene);
  const lay = layoutScene(scene, x.w, x.h);
  // one size for every line, the size the longest needs, so the block reads as one
  const size = Math.min(...scene.words.map((word, i) => fitSize(g, word, lay.words[i], f.dw, f.display)));
  scene.words.forEach((word, i) => {
    const dt = since(x, scene, `word${i + 1}`, local);
    if (dt == null) return;
    const key = i === scene.key;
    const scale = dt === Infinity ? 1 : key ? lerp(1.7, 1, springHz(dt, 3, 6)) : lerp(0.82, 1, springHz(dt, 2.5, 9));
    g.save();
    g.globalAlpha = fade(dt, key ? 0.06 : 0.12);
    mark(x, scene, `word${i + 1}`, drawLine(g, word, lay.words[i], f.dw, f.display, key ? c.accent : c.text, scale, size));
    g.restore();
  });
}

function drawCards(x: Ctx, scene: Extract<FilmScene, { kind: "cards" }>, local: number) {
  const { g, c } = x;
  const f = faces(x.film, x.assets, scene);
  const lay = layoutScene(scene, x.w, x.h);
  const cards = scene.cards.slice(0, 3);
  // one title size and one line size for the set, so the cards read as a row of equals
  const titleSize = Math.min(...cards.map((card, i) => fitSize(g, card.title, lay.cards![i].title, f.dw, f.display)));
  const lineSize = Math.min(...cards.map((card, i) => (card.line ? wrapSize(g, card.line, lay.cards![i].line, f.bw, f.body, lay.cards![i].title.h * 0.6) : Infinity)));
  cards.forEach((card, i) => {
    const n = i + 1;
    const dt = since(x, scene, `card${n}`, local);
    if (dt == null) return;
    const box = lay.cards![i];
    const dy = dt === Infinity ? 0 : (1 - spring(dt, { duration: 0.5, bounce: 0.2 })) * x.h * 0.06;
    const at = (r: Rect): Rect => ({ ...r, y: r.y + dy });
    g.save();
    g.globalAlpha = fade(dt);
    const b = at(box.box);
    g.fillStyle = c.surface;
    g.beginPath();
    g.roundRect(b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.08);
    g.fill();
    mark(x, scene, `card${n}`, b);
    const ib = at(box.icon);
    if (!card.icon || !drawIcon(g, card.icon, ib.x + ib.w / 2, ib.y + ib.h / 2, ib.w * 0.8, c.accent, local)) {
      drawLine(g, String(n).padStart(2, "0"), ib, f.dw, f.display, c.accent);
    }
    mark(x, scene, `card${n}.icon`, ib);
    mark(x, scene, `card${n}.title`, drawLine(g, card.title, at(box.title), f.dw, f.display, c.text, 1, titleSize));
    if (card.line) mark(x, scene, `card${n}.line`, drawWrapped(g, card.line, at(box.line), f.bw, f.body, c.muted, box.box.w > box.box.h * 1.3 ? "left" : "center", lineSize));
    g.restore();
  });
}

const numberText = (s: Extract<FilmScene, { kind: "number" }>, share: number) => {
  const v = Number(s.value) || 0, decimals = Number.isInteger(v) ? 0 : 1;
  return `${(v * share).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${s.suffix ?? ""}`;
};

function drawNumber(x: Ctx, scene: Extract<FilmScene, { kind: "number" }>, local: number) {
  const { g, c } = x;
  const f = faces(x.film, x.assets, scene);
  const lay = layoutScene(scene, x.w, x.h);
  const share = x.opening ? 1 : expoOut(clamp(local / (countBeats(scene) * x.b)));
  // sized for the final figure, so the count doesn't shrink as it grows
  const size = fitSize(g, numberText(scene, 1), lay.value!, f.dw, f.display);
  mark(x, scene, "value", drawLine(g, numberText(scene, share), lay.value!, f.dw, f.display, c.accent, 1, size));
  if (scene.label) mark(x, scene, "label", drawLine(g, scene.label, lay.label!, f.bw, f.body, c.text));
}

function drawMontage(x: Ctx, scene: Extract<FilmScene, { kind: "montage" }>, local: number) {
  const { g, c } = x;
  const f = faces(x.film, x.assets, scene);
  const lay = layoutScene(scene, x.w, x.h);
  const beats = sceneBeats(scene, x.film.energy).filter((e) => e.kind === "shot");
  let i = -1;
  beats.forEach((e, k) => { if (local >= e.at * x.b - 1e-9) i = k; });
  if (i < 0) return;
  const shot = scene.shots[i], n = i + 1;
  const dt = since(x, scene, `shot${n}`, local) ?? 0;
  const d = device(lay.device!, "phone");
  drawDeviceFrame(g, d, "phone");
  // every shot enters already moving: a small push that settles inside the beat
  const z = dt === Infinity ? 1 : lerp(1.08, 1, expoOut(clamp(dt / x.b)));
  const s = d.screen;
  const pic = shot.media ? x.assets.screens[shot.media] : undefined;
  drawPicture(g, d, pic, c, "phone", pic ? scaleAbout(containIn(s, pic.width, pic.height), z) : undefined);
  mark(x, scene, `shot${n}`, s);
  if (shot.word) {
    const pop = dt === Infinity ? 1 : lerp(0.9, 1, springHz(dt, 3, 8));
    mark(x, scene, `word${n}`, drawLine(g, shot.word, lay.words[0], f.dw, f.display, c.text, pop));
  }
}

function drawLogo(x: Ctx, scene: Extract<FilmScene, { kind: "logo" }>, local: number) {
  const { g, c, assets } = x;
  const f = faces(x.film, assets, scene);
  const lay = layoutScene(scene, x.w, x.h);
  const dt = since(x, scene, "logo", local);
  if (dt != null) {
    const s = dt === Infinity ? 1 : lerp(0.86, 1, spring(dt, { duration: 0.7, bounce: 0.15 }));
    g.save();
    g.globalAlpha = fade(dt, 0.2);
    const box = lay.logo!;
    if (assets.logo) {
      // the real file, never redrawn
      const r = containIn(box, assets.logo.width, assets.logo.height);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const drawn = { x: cx - (r.w * s) / 2, y: cy - (r.h * s) / 2, w: r.w * s, h: r.h * s };
      g.drawImage(assets.logo.source, drawn.x, drawn.y, drawn.w, drawn.h);
      mark(x, scene, "logo", drawn);
    } else {
      const family = assets.font ? `"${assets.font}"` : f.display;
      mark(x, scene, "logo", drawLine(g, assets.name || " ", box, assets.font ? 700 : f.dw, family, c.text, s));
    }
    g.restore();
  }
  const ldt = scene.line ? since(x, scene, "line", local) : null;
  if (scene.line && ldt != null) {
    g.save();
    g.globalAlpha = fade(ldt, 0.25);
    mark(x, scene, "line", drawWrapped(g, scene.line, lay.line!, f.dw, f.display, c.text, "center", lay.line!.h * 0.8));
    g.restore();
  }
  const cdt = scene.cta ? since(x, scene, "cta", local) : null;
  if (scene.cta && cdt != null) {
    g.save();
    g.globalAlpha = fade(cdt, 0.25);
    mark(x, scene, "cta", drawLine(g, scene.cta, lay.cta!, f.bw, f.body, c.accent));
    g.restore();
  }
}

function drawCaption(x: Ctx, text: string) {
  const { g } = x;
  const box = layoutScene({ id: "", kind: "logo", beats: 1, line: "" }, x.w, x.h).caption;
  g.save();
  g.font = font(700, box.h * 0.42, '"DM Sans"');
  const lines = wrap(g, text, box.w * 0.9).slice(0, 2);
  const lh = box.h * 0.5, top = box.y + box.h - lh * lines.length;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.beginPath();
  g.roundRect(box.x + (box.w - widest) / 2 - lh * 0.4, top - lh * 0.1, widest + lh * 0.8, lh * (lines.length + 0.2), lh * 0.3);
  g.fill();
  g.fillStyle = "#FFFFFF";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, box.x + box.w / 2, top + lh * (i + 0.5)));
  g.restore();
}

/** Draws the film at t seconds and returns the boxes of what it drew. */
export function drawFilm(g: G, film: Film, assets: FilmAssets, t: number, opts: DrawOptions): FilmMark[] {
  const { w, h } = opts;
  const c = filmColors(film, assets.colors);
  const b = beatSeconds(film);
  const spans = sceneSpans(film);
  const x: Ctx = { g, film, assets, c, w, h, b, opening: false, dx: 0, marks: [] };
  g.save();
  g.fillStyle = c.ground;
  g.fillRect(0, 0, w, h);
  // a soft light that drifts with time, so a held frame never looks frozen
  const glow = g.createRadialGradient(w * (0.5 + 0.12 * Math.sin(t * 0.4)), h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.75);
  glow.addColorStop(0, mixHex(c.ground, c.accent, 0.16));
  glow.addColorStop(1, c.ground);
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  const span = spans.find((s) => t < s.end) ?? spans[spans.length - 1];
  if (span) {
    const scene = span.scene, local = t - span.start;
    x.opening = span.index === 0;
    // a whip slides the new scene in from the right over a third of a second
    x.dx = scene.cut === "whip" && !x.opening ? (1 - expoOut(clamp(local / 0.33))) * w * 0.35 : 0;
    g.save();
    if (x.dx) g.translate(x.dx, 0);
    if (scene.kind === "type") drawType(x, scene, local);
    else if (scene.kind === "screen") drawScreen(x, scene, local);
    else if (scene.kind === "cards") drawCards(x, scene, local);
    else if (scene.kind === "number") drawNumber(x, scene, local);
    else if (scene.kind === "montage") drawMontage(x, scene, local);
    else if (scene.kind === "logo") drawLogo(x, scene, local);
    g.restore();
  }
  // a flood: the brand colour sweeps across in the half beat before the cut and off in the half beat after
  for (const s of spans) {
    if (s.index === 0 || s.scene.cut !== "flood") continue;
    const p = (t - (s.start - b / 2)) / b;
    if (p < 0 || p >= 1) continue;
    const a = p < 0.5 ? 0 : emphasized((p - 0.5) * 2), z = p < 0.5 ? emphasized(p * 2) : 1;
    g.fillStyle = c.brand;
    g.fillRect(a * w, 0, (z - a) * w, h);
  }
  if (opts.caption) drawCaption(x, opts.caption);
  g.restore();
  return x.marks;
}
