// Face effects in the video editor, worked out on this device by MediaPipe
// (@mediapipe/tasks-vision, Apache-2.0). Its code is imported only when an effect
// is first used, so it never lands in the main bundle; its wasm comes from
// jsDelivr at the same version and its models from Google's model bucket.

import type { FaceDetector, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { gradeOf, type Backdrop, type EditSettings, type FaceTrack } from "@/lib/videoEdit";
import { pickFace, smoothTrack, trackStep } from "@/lib/faceFollow";

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

/** Loads what the edit's effects need (the first time downloads about 4 MB, then the browser keeps it). */
export async function loadEffects(s: Pick<EditSettings, "backdrop">): Promise<void> {
  if (s.backdrop) await personFinder();
}

/** Every effect the edit uses is loaded. */
export const effectsReady = (s: Pick<EditSettings, "backdrop">) => !s.backdrop || !!segmenter;

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
  if (s.backdrop && segmenter) paintBackdrop(g, x, y, w, h, s, s.backdrop, picture);
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

