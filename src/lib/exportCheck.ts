// More of the check on an exported file: sound that clips (sits at full scale)
// and a black picture. Both are measured from the file itself after the export.

import { fmtTime, type ExportIssue, type Segment } from "@/lib/videoEdit";

/** A sample this close to full scale counts as clipped. */
export const CLIP_LEVEL = 0.99;
/** Fewer clipped places than this is a stray click, not clipping. */
export const CLIP_MIN = 3;

/** The places the sound sits at full scale for 2 or more samples in a row, and when the first one is. */
export function clipStats(samples: Float32Array, rate: number): { count: number; at: number | null } {
  let count = 0;
  let at: number | null = null;
  let run = 0;
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length && Math.abs(samples[i]) >= CLIP_LEVEL) {
      run++;
      continue;
    }
    if (run >= 2) {
      count++;
      at ??= (i - run) / rate;
    }
    run = 0;
  }
  return { count, at };
}

/** Black: 90% of pixels darker than a tenth of full brightness (ffmpeg blackdetect's pixel level; captions and the hook card still sit on top of a missing picture). */
export function isBlack(rgba: Uint8ClampedArray): boolean {
  let dark = 0;
  for (let i = 0; i < rgba.length; i += 4) if (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2] < 25.5) dark++;
  return dark >= 0.9 * (rgba.length / 4);
}

/** Every half second of the edit (at most 240 looks, spread out beyond 2 minutes), not within 0.08 s of a cut that dips through black on purpose. */
export function frameTimes(total: number, dips: number[] = []): number[] {
  const n = Math.min(240, Math.max(1, Math.floor(total / 0.5)));
  const step = total / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(total - 0.05, 0.05 + i * step);
    if (!dips.some((d) => Math.abs(t - d) < 0.08)) out.push(t);
  }
  return out;
}

/** Where the edit cuts from one kept part to the next, in seconds of the finished video. */
export function joinTimes(segs: Segment[], speed = 1): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const g of segs.slice(0, -1)) out.push((acc += g.end - g.start) / speed);
  return out;
}

/** Black looks in a row as stretches: where each starts and about how long it lasts. */
export function blackStretches(looks: { t: number; black: boolean }[]): { at: number; length: number }[] {
  const out: { at: number; length: number }[] = [];
  const step = looks.length > 1 ? looks[1].t - looks[0].t : 0.5;
  for (let i = 0; i < looks.length; i++) {
    if (!looks[i].black) continue;
    let j = i;
    while (j + 1 < looks.length && looks[j + 1].black) j++;
    out.push({ at: looks[i].t, length: looks[j].t - looks[i].t + step });
    i = j;
  }
  return out;
}

/** What the clipping and the black looks come to, as issues for the check. */
export function pictureAndClipIssues(clip: { count: number; at: number | null } | null, black: { at: number; length: number }[]): ExportIssue[] {
  const out: ExportIssue[] = [];
  if (clip && clip.count >= CLIP_MIN && clip.at !== null)
    out.push({ id: "clipped", text: `The sound clips (hits full scale) at ${fmtTime(clip.at)} and in ${clip.count - 1} more places, which crackles.`, at: clip.at });
  if (black.length)
    out.push({ id: "black", text: `The picture is black at ${fmtTime(black[0].at)} for about ${black[0].length.toFixed(1)}s${black.length > 1 ? `, and in ${black.length - 1} more ${black.length === 2 ? "place" : "places"}` : ""}.`, at: black[0].at });
  return out;
}

/** Looks at the exported video at these times; null when it can't be read back (the check then says nothing about the picture). */
export async function lookAtFrames(url: string, times: number[]): Promise<{ t: number; black: boolean }[] | null> {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  const wait = (ev: "loadeddata" | "seeked") =>
    new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), 5000);
      v.addEventListener(ev, () => { window.clearTimeout(timer); resolve(true); }, { once: true });
      v.addEventListener("error", () => { window.clearTimeout(timer); resolve(false); }, { once: true });
    });
  try {
    const loaded = wait("loadeddata");
    v.src = url;
    if (!(await loaded) || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = Math.max(1, Math.round((64 * v.videoHeight) / v.videoWidth));
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const out: { t: number; black: boolean }[] = [];
    for (const t of times) {
      const seeked = wait("seeked");
      v.currentTime = t;
      if (!(await seeked)) return null;
      g.drawImage(v, 0, 0, c.width, c.height);
      out.push({ t, black: isBlack(g.getImageData(0, 0, c.width, c.height).data) });
    }
    return out;
  } catch {
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}
