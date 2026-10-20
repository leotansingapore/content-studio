// The ad drawer's facts (docs/north-star/items/find-ad-detail.md): run length, rank among the advertiser's ads,
// placements and a proof line, read off the Ad Library's dates and platforms. Pure, no AI call, nothing stored.

import { buildAdWriteUrl, type AdLike, type SwipeAd } from "@/lib/adsSwipe";
import { adDays, hookName, type AdFormat, type LibraryAd } from "@/lib/adLibrary";

/** One shape for a drop ad and a library ad (which covers competitor and space ads), so the drawer never asks where it came from. */
export interface DetailAd {
  id: string;
  advertiser: string;
  format: AdFormat;
  headline: string | null;
  body: string;
  start: string | null;
  end: string | null;
  active: boolean;
  platforms: string[];
  image: string | null;
  video: string | null;
  libraryUrl: string;
  /** The family's name ("Problem"), for "Problem hook". */
  hookFamily: string | null;
  emotion: string | null;
  audience: string | null;
  // what Remix and Save need on top of the spec's shape
  cta: string | null;
  link: string | null;
  industry: string | null;
  /** Every ad Meta lists for this advertiser there was read (a competitor check that came back short of its cap). */
  complete: boolean;
}

const FORMATS: AdFormat[] = ["image", "video", "carousel", "text"];

export function toDetailAd(ad: SwipeAd | LibraryAd): DetailAd {
  if ("adId" in ad) {
    return {
      id: ad.adId, advertiser: ad.advertiser, format: FORMATS.includes(ad.format as AdFormat) ? (ad.format as AdFormat) : "image", headline: ad.headline,
      body: ad.body, start: ad.start, end: null, active: true, platforms: ad.platforms.map((p) => p.toLowerCase()), image: ad.image || null, video: null, libraryUrl: ad.libraryUrl,
      hookFamily: ad.hookFamily || null, emotion: null, audience: null, cta: ad.cta, link: ad.link, industry: ad.industry || null,
      // the drop keeps 3 ads an advertiser
      complete: false,
    };
  }
  return {
    id: ad.id, advertiser: ad.advertiser, format: ad.format, headline: ad.headline, body: ad.body, start: ad.start, end: ad.end, active: ad.active,
    platforms: ad.platforms, image: ad.image, video: ad.video, libraryUrl: ad.libraryUrl, hookFamily: hookName(ad.hook), emotion: ad.emotion,
    audience: ad.audience, cta: ad.cta, link: ad.link, industry: ad.industry, complete: ad.complete === true,
  };
}

export interface Stat {
  big: string;
  small: string;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "45 days" under 60 days, whole months (days / 30) to 364, whole years from 365; "running" or "ran". */
export function runLength(ad: Pick<DetailAd, "start" | "end" | "active">, now = Date.now()): Stat | null {
  const d = adDays(ad, now);
  if (d === null) return null;
  const big = d >= 365 ? plural(Math.floor(d / 365), "year") : d >= 60 ? plural(Math.floor(d / 30), "month") : plural(Math.max(1, d), "day");
  return { big, small: ad.active ? "running" : "ran" };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const theirAds = (ad: DetailAd, list: DetailAd[]) => [ad, ...list.filter((x) => x.id !== ad.id && same(x.advertiser, ad.advertiser))];
/** Whether those ads are all the advertiser runs there; a capped check, the drop's 3 or a space search are not. */
const wholeRead = (theirs: DetailAd[]) => theirs.every((x) => x.complete);

/**
 * Rank by days among the same advertiser's ads in the list the drawer was opened from; a tie shares the rank. "of
 * their N ads" only when every ad they run there was read, else "of the N we read" (Sunsama, dogfood 21 Oct).
 */
export function rankAmong(ad: DetailAd, list: DetailAd[], now = Date.now()): Stat {
  const theirs = theirAds(ad, list);
  if (theirs.length < 2) return { big: "Only ad", small: "of theirs here" };
  const days = (x: DetailAd) => adDays(x, now) ?? -1;
  const mine = days(ad);
  const rank = 1 + theirs.filter((x) => days(x) > mine).length;
  const joint = theirs.some((x) => x.id !== ad.id && days(x) === mine);
  const small = wholeRead(theirs) ? `of their ${theirs.length} ads` : `of the ${theirs.length} we read`;
  if (rank === 1) return { big: joint ? "Joint longest" : "Longest", small };
  return { big: rank === 2 ? "2nd longest" : `#${rank}`, small };
}

const PLACES: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", whatsapp: "WhatsApp", messenger: "Messenger", audience_network: "Audience Network",
};

/** "Facebook, Instagram and Threads": the drop's FACEBOOK and the scraper's facebook alike; unknown values dropped. */
export function placementLabel(platforms: string[]): string {
  const names = [...new Set(platforms.map((p) => PLACES[p.trim().toLowerCase()]).filter(Boolean))];
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The first fact that holds; it matches the library's "Proven ad" rule, so a stopped ad under 90 days never reads
 * proven. "Their longest running ad right now" only when every ad they run there was read.
 */
export function proofLine(ad: DetailAd, list: DetailAd[], now = Date.now()): string | null {
  const d = adDays(ad, now);
  if (d === null) return null;
  if (!ad.active) return d >= 90 ? "Ran for 3+ months before it stopped." : `Stopped after ${plural(d, "day")}.`;
  const r = rankAmong(ad, list, now);
  if (d >= 30 && (r.big === "Longest" || r.big === "Joint longest") && wholeRead(theirAds(ad, list))) return "Their longest running ad right now.";
  if (d >= 90) return "Running for 3+ months. Advertisers switch off ads that lose money.";
  if (d >= 30) return "Running for a month or more.";
  if (d < 14) return "New. Too early to call it proven.";
  return "Running for 2 weeks or more.";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10 Sep" in the current year, "10 Sep 2025" otherwise. */
export function startedLabel(start: string | null, now = Date.now()): string | null {
  const m = start?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return Number(m[1]) === new Date(now).getFullYear() ? day : `${day} ${m[1]}`;
}

/** The headline, or the body's first line cut to 80. */
export const titleOf = (ad: Pick<DetailAd, "headline" | "body">) => ad.headline || (ad.body.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 80);

export const likeOfDetail = (ad: DetailAd): AdLike => ({
  adId: ad.id, advertiser: ad.advertiser, format: ad.format, headline: ad.headline, body: ad.body, cta: ad.cta, link: ad.link, start: ad.start,
  platforms: ad.platforms, image: ad.image ?? "", libraryUrl: ad.libraryUrl, industry: ad.industry, hookFamily: ad.hookFamily,
});

/** "Remix this" for a sign-in without the sheet: Write with the ad's structure, asking for a script when it's a video. */
export function remixWriteUrl(ad: DetailAd): string {
  const url = buildAdWriteUrl(likeOfDetail(ad));
  return ad.format === "video" ? `${url}&format=short-video` : url;
}
