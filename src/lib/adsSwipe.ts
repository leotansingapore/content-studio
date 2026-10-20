// Real Singapore ads from the Meta Ad Library, copied weekly by scripts/ads-swipe.mjs
// from Leo's Mac (api-anything, ~/.local/bin/ads-swipe-collect). Static, like trends
// and industry news: content-studio users never call Meta.

import adsData from "@/data/adsSwipe.json";
import { sourceKey } from "@/lib/remixSource";

export interface SwipeAd {
  adId: string;
  advertiser: string;
  industry: string;
  /** image | video | carousel */
  format: string;
  headline: string | null;
  body: string;
  cta: string | null;
  link: string | null;
  /** YYYY-MM-DD the ad started running, from the Ad Library. */
  start: string | null;
  platforms: string[];
  /** Our committed copy of the picture, e.g. "/ads/123.jpg". */
  image: string;
  libraryUrl: string;
  /** One of AdLauncher's seven hook families, picked by Jev. */
  hookFamily: string;
}

/** What a remix needs from an ad: a drop ad, or a competitor's (toAdLike in competitorAds.ts), whose industry and hook may be unknown. */
export type AdLike = Pick<SwipeAd, "adId" | "advertiser" | "format" | "headline" | "body" | "cta" | "link" | "start" | "platforms" | "image" | "libraryUrl"> & {
  industry: string | null;
  hookFamily: string | null;
};

export const ADS_FETCHED: string | null = (adsData as { fetched?: string }).fetched ?? null;
export const ADS: SwipeAd[] = ((adsData as { ads?: SwipeAd[] }).ads ?? []);

/** Whole days between the ad's start and `now`, or null when unknown or in the future. */
export function daysRunning(ad: SwipeAd, now = Date.now()): number | null {
  if (!ad.start) return null;
  const d = Math.floor((now - Date.parse(ad.start)) / 86_400_000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** Ads matching every word of the query, in advertiser, industry, hook, headline or body. */
export function searchAds(list: SwipeAd[], query: string): SwipeAd[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((a) => {
    const hay = `${a.advertiser} ${a.industry} ${a.hookFamily} ${a.headline ?? ""} ${a.body}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Values of one field that have ads, most ads first. */
export function facetCounts(list: SwipeAd[], of: "industry" | "hookFamily"): { value: string; n: number }[] {
  const m = new Map<string, number>();
  for (const a of list) m.set(a[of], (m.get(a[of]) ?? 0) + 1);
  return [...m].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

/**
 * Open Write with the ad's STRUCTURE as the brief: its hook family and shape, never its words or claims. An unknown
 * industry or hook family leaves its words out (a competitor's ad has neither until it is labelled).
 */
export function buildAdWriteUrl(ad: AdLike): string {
  const headline = ad.headline ? `Its headline: "${ad.headline}".` : "";
  const opening = ad.body.split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 280);
  const ctx = [
    `Borrow the structure of a paid ad by ${ad.advertiser}${ad.industry ? ` (${ad.industry})` : ""}, running since ${ad.start ?? "recently"}.`,
    ad.hookFamily ? `It opens with a ${ad.hookFamily} hook.${headline ? ` ${headline}` : ""}` : headline,
    opening ? `Its opening lines: "${opening}"` : "",
    `Write an organic post for my audience that opens the same KIND of way. Do not reuse its wording, brand or claims, and do not recommend a product.`,
  ].filter(Boolean).join("\n");
  const detail = ad.hookFamily ? `${ad.hookFamily} hook, like ${ad.advertiser}'s ad` : `Like ${ad.advertiser}'s ad`;
  const params = new URLSearchParams({ pillar: "topic", detail, ctx, source: sourceKey.ad(ad.adId) });
  return `/generate?${params.toString()}`;
}
