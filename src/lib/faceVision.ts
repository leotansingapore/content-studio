// Face effects in the video editor, worked out on this device by MediaPipe
// (@mediapipe/tasks-vision, Apache-2.0). Its code is imported only when an effect
// is first used, so it never lands in the main bundle; its wasm comes from
// jsDelivr at the same version and its models from Google's model bucket.

import type { FaceDetector, FaceLandmarker, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { gradeOf, type Backdrop, type EditSettings, type FaceTrack } from "@/lib/videoEdit";
import { pickFace, smoothTrack, trackStep } from "@/lib/faceFollow";
import { seek } from "@/lib/videoMedia";
import { medianBox, type FaceBox } from "@/lib/videoMotion";

/** Must match package.json (a test checks), so the wasm fits the library's code. */
export const MP_VERSION = "1.1.0";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";

const lib = () => import("@mediapipe/tasks-vision");
// a failed load is forgotten, so the next try starts again
let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const files = () => (fileset ??= lib().then((m) => m.FilesetResolver.forVisionTasks(WASM)).catch((e) => { fileset = null; throw e; }));

let detector: Promise<FaceDetector> | null = null;
// The full-range model finds faces down to about 4% of a landscape frame's width (two people
// on a sofa); the short-range one found none there. CPU: faster than the GPU path in testing.
const faceDetector = () =>
  (detector ??= Promise.all([lib(), files()])
    .then(([m, fs]) => m.FaceDetector.createFromOptions(fs, {
      baseOptions: { modelAssetPath: `${MODELS}/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite`, delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    }))
    .catch((e) => { detector = null; throw e; }));

/**
 * Finds the face across a video and returns the crop's path: the video plays through muted at up
 * to 16x (seeking instead took 200 ms a look on a phone video with keyframes 8 s apart), a 640 px
 * copy of the frame is looked at every trackStep seconds, the face to follow is picked and the
 * path smoothed (faceFollow.ts). `v` is a <video> of its own, not the preview's; `hold` is how far
 * the face may sway before the crop moves. Null when no face shows up at all.
 */
export async function findFaceTrack(v: HTMLVideoElement, duration: number, hold: number, onProgress?: (share: number) => void): Promise<FaceTrack | null> {
  const det = await faceDetector();
  const step = trackStep(duration);
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = Math.max(1, Math.round((640 * v.videoHeight) / v.videoWidth));
  const g = c.getContext("2d")!;
  const n = Math.max(1, Math.floor(duration / step) + 1);
  const raw: (number | null)[] = [];
  let prev: number | null = null;
  v.muted = true;
  try {
    v.playbackRate = 16;
  } catch {
    v.playbackRate = 4; // a browser that caps the rate lower
  }
  await new Promise<void>((resolve, reject) => {
    const look = (_: number, frame: { mediaTime: number }) => {
      // a dropped frame can skip a look or two: they take this frame's answer
      if (frame.mediaTime >= raw.length * step - 0.03) {
        g.drawImage(v, 0, 0, c.width, c.height);
        const faces = det.detect(c).detections.flatMap((d) => {
          const b = d.boundingBox;
          return b ? [{ x: (b.originX + b.width / 2) / c.width, w: b.width / c.width }] : [];
        });
        const x = pickFace(faces, prev);
        if (x !== null) prev = x;
        while (raw.length < n && raw.length * step <= frame.mediaTime + 0.03) raw.push(x);
        onProgress?.(raw.length / n);
      }
      if (raw.length >= n || v.ended) resolve();
      else v.requestVideoFrameCallback(look);
    };
    v.addEventListener("ended", () => resolve(), { once: true });
    v.addEventListener("error", () => reject(new Error("This browser couldn't play the video through.")), { once: true });
    v.requestVideoFrameCallback(look);
    v.play().catch(reject);
  });
  v.pause();
  const x = smoothTrack(raw, step, hold);
  return x ? { step, x } : null;
}

/**
 * Where the face sits across the video (shares of the picture), so cards and
 * the hook can keep clear of it: the biggest face at 7 moments, the middle of
 * those boxes. `v` is a <video> of its own. Null when no face shows.
 */
export async function findFaceBox(v: HTMLVideoElement, duration: number): Promise<FaceBox | null> {
  const det = await faceDetector();
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = Math.max(1, Math.round((640 * v.videoHeight) / v.videoWidth));
  const g = c.getContext("2d")!;
  const boxes: FaceBox[] = [];
  for (const at of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
    await seek(v, Math.max(0, Math.min(duration - 0.05, duration * at)));
    g.drawImage(v, 0, 0, c.width, c.height);
    const b = det.detect(c).detections.flatMap((d) => (d.boundingBox ? [d.boundingBox] : [])).sort((x, y) => y.width - x.width)[0];
    if (b) boxes.push({ x0: b.originX / c.width, y0: b.originY / c.height, x1: (b.originX + b.width) / c.width, y1: (b.originY + b.height) / c.height });
  }
  return medianBox(boxes);
}

// ---------- what is behind you (background blur or replace) ----------

/** A stored backdrop, kept only when well formed. */
export function sanitizeBackdrop(raw: unknown): Backdrop | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (r.kind === "blur") return { kind: "blur", amount: typeof r.amount === "number" && Number.isFinite(r.amount) ? Math.min(1, Math.max(0, r.amount)) : 0.6 };
  if (r.kind === "colour" && typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color)) return { kind: "colour", color: r.color.toUpperCase() };
  if (r.kind === "picture" && typeof r.key === "string" && /^bd-[a-z0-9-]{4,60}$/i.test(r.key)) return { kind: "picture", key: r.key };
  return undefined;
}

/** The person's opacity from the model's confidence: none under 0.4, all over 0.8, so the edge is soft but not see-through. */
export const maskAlpha = (c: number) => Math.round(Math.min(1, Math.max(0, (c - 0.4) / 0.4)) * 255);

/** Blur in px for a picture this size: 1.2% (amount 0) to 5% (amount 1) of its short side, so preview and export match. */
export const blurPx = (amount: number, w: number, h: number) => Math.max(1, Math.round(Math.min(w, h) * (0.012 + 0.038 * amount)));

let segmenterP: Promise<ImageSegmenter> | null = null;
// set once loaded: drawing a frame can't wait
let segmenter: ImageSegmenter | null = null;
// selfie_segmenter: 250 KB, about 7 ms a frame on the CPU at 256 px
const personFinder = () =>
  (segmenterP ??= Promise.all([lib(), files()])
    .then(([m, fs]) => m.ImageSegmenter.createFromOptions(fs, {
      baseOptions: { modelAssetPath: `${MODELS}/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`, delegate: "CPU" },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }))
    .then((x) => (segmenter = x))
    .catch((e) => { segmenterP = null; throw e; }));

// ---------- touch-up (skin and eyes) ----------

/** How strong each part of the touch-up is at strength t (0-1): the share of softened skin laid
 * over the face, and the lift in the eyes' brightness and contrast. Kept light on purpose. */
export function touchAmounts(t: number): { skin: number; bright: number; contrast: number } {
  const k = Math.min(1, Math.max(0, t || 0));
  return { skin: 0.45 * k, bright: 1 + 0.15 * k, contrast: 1 + 0.08 * k };
}

/** A landmark outline (the model's list of edges, a ring) as point numbers in order round it. */
export function ringOf(edges: { start: number; end: number }[]): number[] {
  if (!edges.length) return [];
  const next = new Map(edges.map((e) => [e.start, e.end]));
  const ring = [edges[0].start];
  for (let at = next.get(ring[0]); at !== undefined && at !== ring[0] && ring.length <= edges.length; at = next.get(at)) ring.push(at);
  return ring;
}

let landmarkerP: Promise<FaceLandmarker> | null = null;
let landmarker: FaceLandmarker | null = null;
// the outlines touch-up uses, as rings of point numbers, read from the library once it loads
let rings: { oval: number[]; holes: number[][]; eyes: number[][] } | null = null;
// face_landmarker: 3.7 MB, about 12 ms a frame on the CPU; up to two faces (an interview)
const faceFinder = () =>
  (landmarkerP ??= Promise.all([lib(), files()])
    .then(([m, fs]) => {
      const L = m.FaceLandmarker;
      rings = {
        oval: ringOf(L.FACE_LANDMARKS_FACE_OVAL),
        holes: [L.FACE_LANDMARKS_LEFT_EYE, L.FACE_LANDMARKS_RIGHT_EYE, L.FACE_LANDMARKS_LEFT_EYEBROW, L.FACE_LANDMARKS_RIGHT_EYEBROW, L.FACE_LANDMARKS_LIPS].map(ringOf),
        eyes: [L.FACE_LANDMARKS_LEFT_EYE, L.FACE_LANDMARKS_RIGHT_EYE].map(ringOf),
      };
      return L.createFromOptions(fs, {
        baseOptions: { modelAssetPath: `${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 2,
      });
    })
    .then((x) => (landmarker = x))
    .catch((e) => { landmarkerP = null; throw e; }));

/** Loads what the edit's effects need (the first time downloads a few MB, then the browser keeps it). */
export async function loadEffects(s: Pick<EditSettings, "backdrop" | "touchUp">): Promise<void> {
  await Promise.all([s.backdrop ? personFinder() : null, s.touchUp ? faceFinder() : null]);
}

/** Every effect the edit uses is loaded. */
export const effectsReady = (s: Pick<EditSettings, "backdrop" | "touchUp">) => (!s.backdrop || !!segmenter) && (!s.touchUp || !!landmarker);

// scratch canvases, kept between frames (resizing clears one, so only when the size changes)
const pads = new Map<string, HTMLCanvasElement>();
function pad(name: string, w: number, h: number): HTMLCanvasElement {
  let c = pads.get(name);
  if (!c) pads.set(name, (c = document.createElement("canvas")));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}
let maskData: ImageData | null = null;

/**
 * Paints the edit's face and background effects over the picture drawFrame has just drawn in r
 * (drawFrame's fx). The models read the picture as it is on the canvas, so every fit, crop and
 * look lines up; an effect whose model hasn't loaded yet is left out.
 */
export function paintEffects(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, s: EditSettings, picture?: HTMLImageElement | null) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  if (w < 16 || h < 16) return;
  // the touch-up first, so the person the backdrop cuts out is the touched-up one
  if (s.touchUp && landmarker && rings) paintTouchUp(g, x, y, w, h, s.touchUp);
  if (s.backdrop && segmenter) paintBackdrop(g, x, y, w, h, s, s.backdrop, picture);
}

const trace = (g: CanvasRenderingContext2D, pts: [number, number][], ring: number[]) => {
  ring.forEach((i, j) => (j ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1])));
  g.closePath();
};

/**
 * Light skin smoothing and eye brightening on each face in the picture. Nothing moves: the
 * skin gets a share of a softened copy of itself inside the face outline (pulled in 6% and
 * feathered, so the jaw and hairline stay sharp), with eyes, brows and lips left out, and the
 * eyes get a small lift in brightness and contrast.
 */
function paintTouchUp(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const k = Math.min(1, 960 / Math.max(w, h));
  const lw = Math.max(1, Math.round(w * k)), lh = Math.max(1, Math.round(h * k));
  const look = pad("look", lw, lh);
  look.getContext("2d")!.drawImage(g.canvas, x, y, w, h, 0, 0, lw, lh);
  const faces = landmarker!.detect(look).faceLandmarks;
  const a = touchAmounts(t);
  const r = rings!;
  for (const lm of faces) {
    const pts = lm.map((p): [number, number] => [x + p.x * w, y + p.y * h]);
    const ox = r.oval.map((i) => pts[i][0]), oy = r.oval.map((i) => pts[i][1]);
    const fw = Math.max(...ox) - Math.min(...ox);
    if (fw < 24) continue; // too small to see a difference
    const bx = Math.max(x, Math.floor(Math.min(...ox) - fw * 0.06)), by = Math.max(y, Math.floor(Math.min(...oy) - fw * 0.06));
    const bw = Math.min(x + w, Math.ceil(Math.max(...ox) + fw * 0.06)) - bx, bh = Math.min(y + h, Math.ceil(Math.max(...oy) + fw * 0.06)) - by;
    if (bw < 8 || bh < 8) continue;
    // where the skin is: the outline pulled 6% towards its middle, less the eyes, brows and lips, feathered
    const cx = ox.reduce((s, v) => s + v, 0) / ox.length, cy = oy.reduce((s, v) => s + v, 0) / oy.length;
    const inner = pts.map(([px, py]): [number, number] => [cx + (px - cx) * 0.94, cy + (py - cy) * 0.94]);
    const shape = pad("skin-shape", bw, bh);
    const sg = shape.getContext("2d")!;
    sg.setTransform(1, 0, 0, 1, -bx, -by);
    sg.clearRect(bx, by, bw, bh);
    sg.fillStyle = "#fff";
    sg.beginPath();
    trace(sg, inner, r.oval);
    sg.fill();
    sg.globalCompositeOperation = "destination-out";
    for (const hole of r.holes) {
      sg.beginPath();
      trace(sg, pts, hole);
      sg.fill();
    }
    sg.globalCompositeOperation = "source-over";
    sg.setTransform(1, 0, 0, 1, 0, 0);
    const skin = pad("skin", bw, bh);
    const kg = skin.getContext("2d")!;
    kg.clearRect(0, 0, bw, bh);
    kg.filter = `blur(${Math.max(1, fw * 0.025)}px)`;
    kg.drawImage(shape, 0, 0);
    kg.filter = "none";
    // the softened face, kept only on the skin
    const soft = pad("skin-soft", bw, bh);
    const fg = soft.getContext("2d")!;
    fg.globalCompositeOperation = "copy";
    fg.filter = `blur(${Math.max(1, fw * 0.01)}px)`;
    fg.drawImage(g.canvas, bx, by, bw, bh, 0, 0, bw, bh);
    fg.filter = "none";
    fg.globalCompositeOperation = "destination-in";
    fg.drawImage(skin, 0, 0);
    fg.globalCompositeOperation = "source-over";
    g.save();
    g.globalAlpha = a.skin;
    g.drawImage(soft, bx, by);
    g.restore();
    // the eyes, a touch brighter
    for (const eye of r.eyes) {
      const ex = eye.map((i) => pts[i][0]), ey = eye.map((i) => pts[i][1]);
      const pad8 = fw * 0.03;
      const x0 = Math.max(x, Math.floor(Math.min(...ex) - pad8)), y0 = Math.max(y, Math.floor(Math.min(...ey) - pad8));
      const ew = Math.min(x + w, Math.ceil(Math.max(...ex) + pad8)) - x0, eh = Math.min(y + h, Math.ceil(Math.max(...ey) + pad8)) - y0;
      if (ew < 4 || eh < 4) continue;
      const em = pad("eye-shape", ew, eh);
      const mg = em.getContext("2d")!;
      mg.setTransform(1, 0, 0, 1, -x0, -y0);
      mg.clearRect(x0, y0, ew, eh);
      mg.fillStyle = "#fff";
      mg.beginPath();
      trace(mg, pts, eye);
      mg.fill();
      mg.setTransform(1, 0, 0, 1, 0, 0);
      const lit = pad("eye", ew, eh);
      const lg = lit.getContext("2d")!;
      lg.globalCompositeOperation = "copy";
      lg.filter = `brightness(${a.bright}) contrast(${a.contrast})`;
      lg.drawImage(g.canvas, x0, y0, ew, eh, 0, 0, ew, eh);
      lg.filter = `blur(${Math.max(0.5, fw * 0.004)}px)`;
      lg.globalCompositeOperation = "destination-in";
      lg.drawImage(em, 0, 0);
      lg.filter = "none";
      lg.globalCompositeOperation = "source-over";
      g.drawImage(lit, x0, y0);
    }
  }
}

function paintBackdrop(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: EditSettings, b: Backdrop, picture?: HTMLImageElement | null) {
  if (b.kind === "picture" && !picture?.naturalWidth) return; // the picture is on another device
  // who is in front: the model reads a 256 px wide copy of the picture
  const sw = 256, sh = Math.max(1, Math.round((256 * h) / w));
  const small = pad("small", sw, sh);
  const sg = small.getContext("2d", { willReadFrequently: true })!;
  sg.drawImage(g.canvas, x, y, w, h, 0, 0, sw, sh);
  const res = segmenter!.segment(small);
  try {
    const conf = res.confidenceMasks?.[0]?.getAsFloat32Array();
    if (!conf || conf.length !== sw * sh) return;
    const mask = pad("mask", sw, sh);
    const mg = mask.getContext("2d")!;
    if (maskData?.width !== sw || maskData.height !== sh) maskData = mg.createImageData(sw, sh);
    for (let i = 0; i < conf.length; i++) maskData.data[i * 4 + 3] = maskAlpha(conf[i]);
    mg.putImageData(maskData, 0, 0);
  } finally {
    res.close();
  }
  // the picture as drawn, before anything goes behind it
  const front = pad("front", w, h);
  const fg = front.getContext("2d")!;
  fg.globalCompositeOperation = "copy";
  fg.drawImage(g.canvas, x, y, w, h, 0, 0, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  if (b.kind === "blur") {
    // Blur the background with the person cut out, so they don't smear into a dark halo round
    // themselves. The hole (and the frame's edge) blurs to part see-through, so the blurred layer
    // goes on four times: its colour stays the background's and what shows through drops to 6%.
    const hole = pad("hole", w, h);
    const hg = hole.getContext("2d")!;
    hg.globalCompositeOperation = "copy";
    hg.drawImage(front, 0, 0);
    hg.globalCompositeOperation = "destination-out";
    hg.drawImage(pad("mask", sw, sh), 0, 0, w, h);
    hg.globalCompositeOperation = "source-over";
    const soft = pad("soft", w, h);
    const og = soft.getContext("2d")!;
    og.clearRect(0, 0, w, h);
    og.filter = `blur(${blurPx(b.amount, w, h)}px)`;
    og.drawImage(hole, 0, 0);
    og.filter = "none";
    for (let i = 0; i < 4; i++) g.drawImage(soft, x, y);
  } else if (b.kind === "colour") {
    g.fillStyle = b.color;
    g.fillRect(x, y, w, h);
  } else if (picture) {
    // the picture covers the space, in the edit's colour look like the video
    const k = Math.max(w / picture.naturalWidth, h / picture.naturalHeight);
    g.filter = gradeOf(s);
    g.drawImage(picture, x + (w - picture.naturalWidth * k) / 2, y + (h - picture.naturalHeight * k) / 2, picture.naturalWidth * k, picture.naturalHeight * k);
  }
  g.restore();
  // in front: the person, cut out by the mask, which smooths as it is scaled up
  fg.globalCompositeOperation = "destination-in";
  fg.drawImage(pad("mask", sw, sh), 0, 0, w, h);
  fg.globalCompositeOperation = "source-over";
  g.drawImage(front, x, y);
}

