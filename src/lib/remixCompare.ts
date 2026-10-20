// Original beside your version (docs/north-star/items/remix-compare.md): what a remix changed from its source and
// more posts like it, all from data on this device (no call, no cap). It reads the top posts, advisors and ads
// drops, so only the lazy RemixCompare imports it.

import { ADS, daysRunning } from "@/lib/adsSwipe";
import type { DraftEntry } from "@/lib/draftHistory";
import { loadFollowing, reach } from "@/lib/following";
import { buildCreatorAverages, enrich, similarPosts, type ScoredPost } from "@/lib/postInsights";
import { CLOSE_LABELS, KEEP_LABELS } from "@/lib/remix";
import { fromAd, fromFollowPost, fromTopPost, sourceKey, type RemixSource } from "@/lib/remixSource";
import type { Teardown } from "@/lib/remixTeardown";
import { getAllTopPosts } from "@/lib/topPosts";
import { reusedItems, sharedRuns } from "../../supabase/functions/remix/overlap.ts";

export const MORE_MAX = 4;

/** A label for a stored value, or undefined when the value isn't one of the map's own keys. */
const labelOf = (map: Record<string, string>, v: unknown) =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : undefined;

export interface WhatChanged {
  /** "Keep the structure, Balanced"; null for a draft not made in the Remix sheet. */
  madeWith: string | null;
  /** Only from the full teardown's hook.pattern: the inline source.teardown.hook is a hook line, not a shape. */
  hookShape: string | null;
  copied: string[];
  claim: boolean;
}

/**
 * What the remix kept and what it shares with the original. Copied lines are counted again on every call, so edits
 * count: runs of 6+ words shared with the saved caption, plus the lines flagged when it was made (they may come from
 * past the 400-character excerpt) while the text still has them. No repeats, case ignored.
 */
export function whatChanged(draft: Pick<DraftEntry, "source" | "remix">, text: string, teardown: Teardown | null): WhatChanged {
  const r = draft.remix;
  const madeWith = r ? [labelOf(KEEP_LABELS, r.keep), labelOf(CLOSE_LABELS, r.close)].filter(Boolean).join(", ") || null : null;
  const live = sharedRuns(draft.source?.caption ?? "", text);
  const stored = (r?.flags?.copied ?? []).filter(
    (l) => typeof l === "string" && l.trim() && (reusedItems(text, [l]).length > 0 || sharedRuns(text, l).length > 0),
  );
  const seen = new Set<string>();
  const copied = [...live, ...stored].filter((l) => {
    const k = l.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { madeWith, hookShape: teardown?.hook?.pattern?.trim() || null, copied, claim: r?.flags?.claim === true };
}

// ---- more like this -------------------------------------------------------------------------

let scored: ScoredPost[] | null = null;
/** The swipe file's ranked list (SwipeFilePage builds the same one), made once on first use. */
function topScored(): ScoredPost[] {
  if (!scored) {
    const all = getAllTopPosts();
    const averages = buildCreatorAverages(all);
    scored = all.map((post) => ({ post, insight: enrich(post, averages) }));
  }
  return scored;
}

function candidates(source: RemixSource, userId: string): RemixSource[] {
  if (source.kind === "top-post") {
    const all = topScored();
    const target = all.find((x) => sourceKey.top(x.post.advisorId, x.post.shortCode) === source.key);
    return target
      ? similarPosts(target, all, MORE_MAX + 1).map((x) => fromTopPost(x.post, { id: x.post.advisorId, name: x.post.advisorName, handle: x.post.handle }))
      : [];
  }
  if (source.kind === "follow") {
    // the account holding that post: its other posts, best first by the measure followStats uses
    const account = loadFollowing(userId).find((a) => a.posts.some((p) => sourceKey.follow(a.platform, p.id) === source.key));
    return account ? [...account.posts].sort((p, q) => reach(q) - reach(p)).map((p) => fromFollowPost(account, p)) : [];
  }
  if (source.kind === "ad") {
    const ad = ADS.find((a) => sourceKey.ad(a.adId) === source.key);
    return ad
      ? ADS.filter((a) => a.industry === ad.industry)
          .sort((a, b) => (daysRunning(b) ?? -1) - (daysRunning(a) ?? -1))
          .map((a) => fromAd(a))
      : [];
  }
  // own posts, pasted links, uploads, trends, clones, patterns and inspiration have no list to rank
  return [];
}

/** Up to 4 posts like the source, never the source itself; empty when there is nothing to rank it against. */
export function moreLikeThis(source: RemixSource, userId: string): RemixSource[] {
  return candidates(source, userId)
    .filter((s) => s.key !== source.key)
    .slice(0, MORE_MAX);
}
