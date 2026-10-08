// Face effects in the video editor, worked out on this device by MediaPipe
// (@mediapipe/tasks-vision, Apache-2.0). Its code is imported only when an effect
// is first used, so it never lands in the main bundle; its wasm comes from
// jsDelivr at the same version and its models from Google's model bucket.

import type { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { FaceTrack } from "@/lib/videoEdit";
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
