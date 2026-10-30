// A remix source key back to its record, from data already on this device (remixSource.ts has the key shapes).
// It imports the data drops (top posts, advisors, ads, trends, format trends, inspiration), so Write loads it only through a
// dynamic import() and only for Leo. Synchronous: nothing here calls the network.

import advisorsData from "@/data/advisors.json";
import inspirationData from "@/data/inspiration.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import type { InspirationEntry } from "@/components/Inspiration";
import { loadSpaceAds } from "@/lib/adLibrary";
import { ADS, type AdLike } from "@/lib/adsSwipe";
import { loadCompetitorAds, toAdLike } from "@/lib/competitorAds";
import { loadCompetitorPosts } from "@/lib/competitorPosts";
import { loadCompetitors } from "@/lib/competitors";
import { getDraftById } from "@/lib/draftHistory";
import { loadFollowing } from "@/lib/following";
import { scoped } from "@/lib/profiles";
import { loadSavedClones } from "@/lib/reelClone";
import { FORMAT_TRENDS } from "@/lib/formatTrends";
import { fromAd, fromClone, fromDraft, fromFollowPost, fromFormatTrend, fromInspiration, fromTopPost, fromTrend, seenSources, type RemixSource } from "@/lib/remixSource";
import { getTopPostsForAdvisor } from "@/lib/topPosts";
import { TRENDS } from "@/lib/trends";

/** A pasted link or an upload read by remix-any-link, with the words it read. */
export interface LinkedSource extends RemixSource {
  /** At most 2000 characters: the caption or transcript. */
  text: string;
}

/** Synced, newest 20, written by remix-any-link: content-studio-remix-links-<scoped uid>. */
export const REMIX_LINKS_PREFIX = "content-studio-remix-links-";

export function loadLinkedSources(userId: string): LinkedSource[] {
  try {
    const list = JSON.parse(globalThis.window?.localStorage?.getItem(REMIX_LINKS_PREFIX + scoped(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter((s) => s && typeof s.key === "string" && typeof s.kind === "string") : [];
  } catch {
    return [];
  }
}

const ADVISORS = (advisorsData as AdvisorEntry[]).filter((a) => a.platform === "instagram");
const INSPIRATION = inspirationData as InspirationEntry[];

/** The ad behind an ad: key, from whichever store holds it: the swipe drop, a competitor's ads, then your space. */
export function adFor(adId: string, userId: string): AdLike | null {
  const ad = ADS.find((a) => a.adId === adId);
  if (ad) return ad;
  // a competitor's ad (Their ads), named after the competitor as the list knows it
  for (const [id, e] of Object.entries(loadCompetitorAds(userId))) {
    const found = e.ads.find((a) => a.id === adId);
    if (found) return toAdLike(found, loadCompetitors(userId).list.find((c) => c.id === id)?.name ?? e.pageName ?? "a competitor");
  }
  // an ad in your space (the ad library), named after the page that runs it
  const spaced = loadSpaceAds(userId).ads.find((a) => a.id === adId);
  return spaced ? toAdLike(spaced, spaced.advertiser) : null;
}

/** The record for a key, or null when it is unknown, rotated out of its drop, or a pattern: key. */
export function resolveSource(key: string, userId: string): RemixSource | null {
  const [prefix] = key.split(":", 1);
  const rest = key.slice(prefix.length + 1);
  switch (prefix) {
    case "top": {
      // advisor ids and short codes both carry dashes: try each advisor whose id the key starts with
      for (const a of ADVISORS) {
        if (!rest.startsWith(`${a.id}-`)) continue;
        const post = getTopPostsForAdvisor(a).find((p) => p.shortCode === rest.slice(a.id.length + 1));
        if (post) return fromTopPost(post, a);
      }
      return null;
    }
    case "ad": {
      const ad = adFor(rest, userId);
      return ad ? fromAd(ad) : null;
    }
    case "follow": {
      const [platform, ...id] = rest.split(":");
      const postId = id.join(":");
      // Following first, then a competitor's posts (Their posts): the same follow:<platform>:<post id> keys
      for (const a of [...loadFollowing(userId), ...Object.values(loadCompetitorPosts(userId))]) {
        if (a.platform !== platform) continue;
        const post = a.posts.find((p) => p.id === postId);
        if (post) return fromFollowPost(a, post);
      }
      return null;
    }
    case "clone": {
      const clone = loadSavedClones(userId).find((c) => c.id === rest);
      return clone ? fromClone(clone) : null;
    }
    case "own": {
      const d = getDraftById(userId, rest);
      return d ? fromDraft(d) : null;
    }
    case "trend": {
      const t = TRENDS.find((x) => x.id === rest);
      return t ? fromTrend(t) : null;
    }
    case "format": {
      // every item in the file, a stale drop too: a link to one keeps working until the scout drops it
      const t = FORMAT_TRENDS.items.find((x) => x.id === rest);
      return t ? fromFormatTrend(t) : null;
    }
    case "insp": {
      const item = INSPIRATION.find((x) => x.id === rest);
      return item ? fromInspiration(item) : null;
    }
    case "link":
    case "upload": {
      const found = loadLinkedSources(userId).find((s) => s.key === key);
      if (!found) return null;
      // the read text stays in the store; a draft keeps only the small snapshot
      const { text, ...s } = found;
      return { ...s, remixedAt: "" };
    }
    case "audit":
    case "hubtrend":
    case "carousel": {
      // server rows the device doesn't keep: only this tab's registry, for this brand, has them
      const seen = seenSources(userId).find((s) => s.key === key);
      return seen ? { ...seen, remixedAt: "" } : null;
    }
    default:
      return null;
  }
}
