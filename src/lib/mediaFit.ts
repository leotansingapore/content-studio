// Will the attached media go on this network? Checked while writing and in the schedule steps, so a post isn't
// refused by the network after it is sent. Video lengths are each network's page on docs.zernio.com/platforms
// (read 2026-10-28), the path every post goes through; picture shapes are Meta's Instagram publishing rules.
import { useEffect, useState } from "react";
import { clock } from "@/lib/hookDemo";
import { platformName } from "@/lib/socialConnect";

type Caps = { feed: number; reel?: number; story?: number; min?: number; more?: [number, string] };

/** The longest video in seconds, per placement; `more` is the cap a bigger account gets, and the words for it. */
export const VIDEO_MAX: Record<string, Caps> = {
  instagram: { feed: 900, reel: 900, story: 60 },
  facebook: { feed: 14400, reel: 60, story: 120 },
  linkedin: { feed: 600, more: [1800, "from a profile, 30 minutes from a page"] },
  tiktok: { feed: 600, min: 3 },
  threads: { feed: 300 },
  youtube: { feed: 900, more: [43200, "unless the channel is verified"] },
};

const where = (platform: string, placement?: string | null) => {
  const name = platformName(platform);
  if (placement !== "reel" && placement !== "story") return name;
  return `${/^[AEIOU]/.test(name) ? "An" : "A"} ${name} ${placement === "reel" ? "Reel" : "Story"}`;
};

/**
 * Why this video is too long or too short for the network, or null. `hard` is false while a bigger account could
 * still take it (a LinkedIn page, a verified YouTube channel), so the steps warn but let it go. `tiktokMax` is the
 * cap TikTok reports for this creator.
 */
export function videoFit(
  platform: string,
  seconds: number,
  o: { placement?: string | null; tiktokMax?: number | null } = {},
): { line: string; hard: boolean } | null {
  const caps = VIDEO_MAX[platform];
  if (!caps || !Number.isFinite(seconds)) return null;
  const runs = `This one runs ${clock(seconds)}.`;
  if (caps.min && seconds < caps.min) return { line: `${platformName(platform)} takes videos of ${caps.min} seconds or more. ${runs}`, hard: true };
  const placed = o.placement === "reel" || o.placement === "story" ? caps[o.placement] : undefined;
  const max = (platform === "tiktok" && o.tiktokMax) || placed || caps.feed;
  if (Math.round(seconds) <= max) return null;
  if (platform === "tiktok" && o.tiktokMax) return { line: `This TikTok account takes videos up to ${clock(max)}. ${runs}`, hard: true };
  const more = placed ? undefined : caps.more;
  return {
    line: `${where(platform, o.placement)} takes videos up to ${clock(max)}${more ? ` ${more[1]}` : ""}. ${runs}`,
    hard: !more || Math.round(seconds) > more[0],
  };
}

/** Meta's Instagram feed takes pictures from 4:5 (tall) to 1.91:1 (wide); Stories and the other networks take any. */
export const IG_TALLEST = 4 / 5;
export const IG_WIDEST = 1.91;

/** Which way a picture breaks Instagram's feed shape, or null when it fits. */
export function pictureFit(width: number, height: number): "taller" | "wider" | null {
  if (!width || !height) return null;
  const r = width / height;
  return r < IG_TALLEST - 0.005 ? "taller" : r > IG_WIDEST + 0.005 ? "wider" : null;
}

/** The line for pictures (in attached order) that break Instagram's feed shape, or null. */
export function pictureLine(fits: ("taller" | "wider" | null)[]): string | null {
  const bad = fits.flatMap((f, i) => (f ? [i + 1] : []));
  if (!bad.length) return null;
  const which = fits.length === 1 ? "This picture is" : bad.length === 1 ? `Picture ${bad[0]} is` : `Pictures ${bad.join(", ")} are`;
  const ways = new Set(bad.map((i) => fits[i - 1]));
  return `Instagram's feed takes pictures from 4:5 tall to 1.91:1 wide. ${which} ${ways.size > 1 ? "outside that" : [...ways][0]}.`;
}

/** The nearest shape Instagram's feed takes, to crop to. */
export const cropRatio = (fit: "taller" | "wider") => (fit === "taller" ? IG_TALLEST : IG_WIDEST);

type Facts = { seconds: number | null; sizes: ({ width: number; height: number } | null)[] };

/** A video's length and each picture's size, read on this device for the checks above; empty until read. */
export function useMediaFacts(list: { file: Blob; type: string }[]): Facts {
  const [facts, setFacts] = useState<Facts>({ seconds: null, sizes: [] });
  useEffect(() => {
    setFacts({ seconds: null, sizes: [] });
    if (!list.length) return;
    let live = true;
    const read = async (f: { file: Blob; type: string }) => {
      if (f.type.startsWith("video/")) {
        const { loadVideo } = await import("@/lib/videoMedia");
        const v = await loadVideo(f.file);
        URL.revokeObjectURL(v.src);
        return v.duration;
      }
      const b = await createImageBitmap(f.file);
      const size = { width: b.width, height: b.height };
      b.close();
      return size;
    };
    void Promise.all(list.map((f) => read(f).catch(() => null))).then((got) => {
      if (!live) return;
      const seconds = got.find((g): g is number => typeof g === "number") ?? null;
      setFacts({ seconds, sizes: got.map((g) => (g && typeof g === "object" ? g : null)) });
    });
    return () => {
      live = false;
    };
  }, [list]);
  return facts;
}
