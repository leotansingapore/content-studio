// Will the attached media go on this network? Checked while writing and in the schedule steps, so a post isn't
// refused by the network after it is sent. Video lengths are each network's page on docs.zernio.com/platforms
// (read 2026-10-28), the path every post goes through.
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
