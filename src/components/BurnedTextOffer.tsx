// Text already burned into the bottom of the video (someone else's subtitles): looked for once per
// video on this device, from 12 small frames across the kept parts, and when it is there the editor
// offers to crop it off so only the new captions show (burnedText.ts).

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { bandTop, cutLine, greyOf } from "@/lib/burnedText";
import type { EditSettings, Segment } from "@/lib/videoEdit";
import { loadVideo, seek } from "@/lib/videoMedia";

/** Where to cut burned-in text off, from 12 frames spread over the kept parts (a 320 px wide grey copy of each), or null. */
async function findTextBand(v: HTMLVideoElement, segs: Segment[]): Promise<number | null> {
  const total = segs.reduce((t, g) => t + g.end - g.start, 0);
  if (!v.videoWidth || total <= 0) return null;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = Math.max(1, Math.round((320 * v.videoHeight) / v.videoWidth));
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const tops: (number | null)[] = [];
  for (let k = 0; k < 12; k++) {
    // the moment (k + 0.5) / 12 of the way through the kept parts
    let at = ((k + 0.5) / 12) * total;
    const seg = segs.find((s) => (at -= s.end - s.start) <= 0) ?? segs[segs.length - 1];
    await seek(v, Math.min(seg.end - 0.05, seg.end + at));
    g.drawImage(v, 0, 0, c.width, c.height);
    tops.push(bandTop(greyOf(g.getImageData(0, 0, c.width, c.height).data), c.width, c.height));
  }
  return cutLine(tops);
}

export default function BurnedTextOffer({ settings, segs, file, apply, note }: {
  settings: EditSettings;
  segs: Segment[];
  /** The video on this device, once loaded. */
  file: Blob | null | undefined;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  /** Merges a measured fact into the latest settings, without an Undo step. */
  note: (p: Partial<EditSettings>) => void;
}) {
  const look = settings.textBand === undefined && !!file && !file.type.startsWith("audio/") && segs.length > 0;
  useEffect(() => {
    if (!look || !file) return;
    let live = true;
    let v: HTMLVideoElement | null = null;
    void loadVideo(file)
      .then((el) => findTextBand((v = el), segs))
      .then((band) => live && note({ textBand: band }))
      .catch(() => {}) // a video this browser can't seek: no offer, and it looks again next time
      .finally(() => v && URL.revokeObjectURL(v.src));
    return () => { live = false; };
  }, [look, file]); // eslint-disable-line react-hooks/exhaustive-deps

  const band = settings.textBand;
  if (typeof band !== "number" || settings.cropBottom === 1) return null;
  const cropped = settings.cropBottom !== undefined;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm" role="status">
      <span className="mr-auto">{cropped ? "Text at the bottom cropped off" : "This video has text burned in at the bottom"}</span>
      {cropped ? (
        <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => apply({ cropBottom: undefined })}>Put it back</Button>
      ) : (
        <>
          <Button size="sm" className="h-11 text-xs sm:h-8" onClick={() => apply({ cropBottom: band })}>Crop it off</Button>
          <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => apply({ cropBottom: 1 })}>Keep it</Button>
        </>
      )}
    </div>
  );
}
