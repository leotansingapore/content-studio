// The cover frame: of the frames around the line picked for the cover, the one
// where the face is biggest and sharpest, measured on this device (MediaPipe's
// face finder, faceVision.ts, and the spread of the edges as sharpness), so a
// blink of motion blur or a cutaway never becomes the cover.

import { biggestFaces } from "@/lib/faceVision";
import { loadVideo, seek } from "@/lib/videoMedia";
import type { FaceBox } from "@/lib/videoMotion";

/** Edges in a greyscale picture: the variance of its Laplacian inside the box (shares), higher = sharper. */
export function sharpness(px: ArrayLike<number>, w: number, h: number, box: FaceBox = { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 }): number {
  const xa = Math.max(1, Math.floor(box.x0 * w));
  const xb = Math.min(w - 1, Math.ceil(box.x1 * w));
  const ya = Math.max(1, Math.floor(box.y0 * h));
  const yb = Math.min(h - 1, Math.ceil(box.y1 * h));
  let s = 0, ss = 0, n = 0;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = y * w + x;
      const l = 4 * px[i] - px[i - 1] - px[i + 1] - px[i - w] - px[i + w];
      s += l; ss += l * l; n++;
    }
  }
  return n ? ss / n - (s / n) ** 2 : 0;
}

export interface CoverLook {
  /** Seconds into the edit. */
  t: number;
  face: FaceBox | null;
  sharp: number;
}

const area = (b: FaceBox | null) => (b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0);

/** The look to use: sharpness against the sharpest, weighted by face size against the biggest; a frame with no face counts a fifth. Ties go to the one nearest `near`. */
export function bestCover(looks: CoverLook[], near: number): CoverLook | null {
  if (!looks.length) return null;
  const top = Math.max(...looks.map((l) => l.sharp)) || 1;
  const big = Math.max(...looks.map((l) => area(l.face))) || 1;
  const score = (l: CoverLook) => (l.sharp / top) * (l.face ? 0.4 + 0.6 * (area(l.face) / big) : 0.2);
  return looks.reduce((a, b) => {
    const d = score(b) - score(a);
    return d > 1e-9 || (Math.abs(d) <= 1e-9 && Math.abs(b.t - near) < Math.abs(a.t - near)) ? b : a;
  });
}

/** Where to look: from half a second before the line to 2.5 s into it, every 0.2 s, inside the edit. */
export function coverTimes(at: number, total: number): number[] {
  const out: number[] = [];
  for (let t = Math.max(0, at - 0.5); t <= Math.min(total - 0.05, at + 2.5) + 1e-9; t += 0.2) out.push(Math.round(t * 100) / 100);
  return out;
}

/** Looks at each moment (seconds into the edit; toSource maps them to the file) on a video of its own and returns the best, or null. */
export async function findCoverFrame(file: Blob, times: number[], toSource: (t: number) => number): Promise<CoverLook | null> {
  const v = await loadVideo(file);
  try {
    if (!v.videoWidth) return null;
    const pics: HTMLCanvasElement[] = [];
    for (const t of times) {
      // never 0: there a seek resolves before a frame is decoded
      await seek(v, Math.max(0.05, toSource(t)));
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = Math.max(1, Math.round((640 * v.videoHeight) / v.videoWidth));
      c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
      pics.push(c);
    }
    const faces = await biggestFaces(pics).catch(() => pics.map(() => null));
    const looks = pics.map((c, i) => {
      const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
      const grey = new Float32Array(c.width * c.height);
      for (let k = 0; k < grey.length; k++) grey[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114;
      return { t: times[i], face: faces[i], sharp: sharpness(grey, c.width, c.height, faces[i] ?? undefined) };
    });
    return bestCover(looks, times[0] + 0.5);
  } finally {
    URL.revokeObjectURL(v.src);
  }
}
