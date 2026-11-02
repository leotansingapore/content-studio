// Cut-out pictures (/slideshow, healthyyinspoo's product cut-outs in the 30 Oct teardowns): tap the thing to keep and
// MediaPipe's Magic Touch model cuts it out on this device, free (Apache-2.0, the tasks-vision faceVision.ts loads; the
// model is about 6 MB, fetched on the first cut). The result is a transparent PNG trimmed to the thing, kept under a
// cimg- device key like a slide's own picture, so it shows on the device that made it.

import type { InteractiveSegmenterLegacy } from "@mediapipe/tasks-vision";
import { putFile } from "@/lib/deviceFiles";
import { files, lib } from "@/lib/faceVision";

const MODEL = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
/** The longest side a photo is cut at: a slide shows a cut-out at most 1080 wide. */
const MAX_SIDE = 1080;
/** A cut smaller than this share of the photo is a missed tap, not a thing. */
const MIN_SHARE = 0.002;

let toucher: Promise<InteractiveSegmenterLegacy> | null = null;
// a failed load is forgotten, so the next tap tries again
const magicTouch = () =>
  (toucher ??= Promise.all([lib(), files()])
    .then(([m, fs]) =>
      m.InteractiveSegmenterLegacy.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    )
    .catch((e) => {
      toucher = null;
      throw e;
    }));

type Box = { x: number; y: number; w: number; h: number };

/** Alpha 0-255 from the model's confidence, soft from 0.3 to 0.7 so the edge isn't jagged, and the box it covers. */
export function maskAlpha(conf: Float32Array, w: number, h: number): { alpha: Uint8ClampedArray; box: Box | null } {
  const alpha = new Uint8ClampedArray(w * h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < w * h; i++) {
    alpha[i] = Math.round(((conf[i] - 0.3) / 0.4) * 255);
    if (!alpha[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { alpha, box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/** Cuts out what's at (x, y), shares of the photo's width and height: a transparent PNG and its height over its width. */
export async function cutOut(file: Blob, x: number, y: number): Promise<{ blob: Blob; ar: number }> {
  const img = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't a picture this browser can read.");
  });
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("This browser can't cut pictures.");
  g.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  const seg = await magicTouch().catch(() => {
    throw new Error("The cutting tool didn't load. Check your connection and try again.");
  });
  const res = seg.segment(c, { keypoint: { x, y } });
  const mask = res.confidenceMasks?.[0];
  const conf = mask?.getAsFloat32Array();
  const [mw, mh] = [mask?.width ?? 0, mask?.height ?? 0];
  res.confidenceMasks?.forEach((m) => m.close());
  if (!conf || mw !== c.width || mh !== c.height) throw new Error("That picture couldn't be cut out. Try another one.");
  const { alpha, box } = maskAlpha(conf, mw, mh);
  if (!box || box.w * box.h < MIN_SHARE * mw * mh) throw new Error("Nothing was found there. Tap the middle of the thing you want to keep.");
  const px = g.getImageData(0, 0, mw, mh);
  for (let i = 0; i < alpha.length; i++) px.data[i * 4 + 3] = alpha[i];
  g.putImageData(px, 0, 0);
  const out = document.createElement("canvas");
  out.width = box.w;
  out.height = box.h;
  out.getContext("2d")?.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("The cut-out couldn't be saved."))), "image/png"));
  return { blob, ar: box.h / box.w };
}

/** Keeps a cut-out on this device under a new cimg- key, the way a slide's own picture is kept. */
export async function keepCutout(blob: Blob): Promise<string> {
  const key = `cimg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await putFile(key, blob);
  return key;
}
