// Three versions of one post, outside React (remix-variations, remix-own-winners): the remix job's versions run
// on a source with the sheet's defaults (keep the structure, balanced, its own format, the brand's remembered
// mention and offer). A winner's versions carry remix-own-winners' note. Only ever called from a press.

import { defaultOutput } from "@/lib/remix";
import { loadRemixPrefs, ownBrandName, speakerFor } from "@/lib/remixBrand";
import { startRemix } from "@/lib/remixJob";
import { sourceKey } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";

export const WINNER_NOTE = "A fresh version of my own post that did well. Keep the topic and what made it work; use a new hook and a new example.";

/** "gone": the post is no longer on this device, so nothing started. */
export function makeVersions(userId: string, from: { source: string } | { draftId: string }, n: 3 = 3): "started" | "busy" | "gone" {
  const own = "draftId" in from;
  const s = resolveSource(own ? sourceKey.own(from.draftId) : from.source, userId);
  if (!s) return "gone";
  const prefs = loadRemixPrefs(userId);
  const mention = ownBrandName(userId) !== "" && prefs.mention;
  return startRemix(userId, {
    source: { ...s, remixedAt: "" },
    keep: "structure",
    close: "balanced",
    as: [defaultOutput(s)],
    ...(own ? { note: WINNER_NOTE } : {}),
    mention,
    offer: mention ? prefs.offer : null,
    speaker: prefs.speaker ?? speakerFor(userId),
    versions: n,
  });
}
