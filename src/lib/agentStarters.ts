// The empty chat's starters (docs/north-star/items/agent-chat.md, "Empty thread"; agent-skills adds /check and
// /retro): at most 6, each shown only when what it needs exists on this brand, ending with the two that always work.
// A starter fills the composer and does not send. None says adviser, client or MAS, so a business brand gets the
// same words as a person's.

import { draftStatus, loadDrafts } from "@/lib/draftHistory";
import { loadPositioning } from "@/lib/positioning";
import { loadSaved } from "@/lib/savedItems";

export const MAX_STARTERS = 6;
export const ALWAYS = ["How did last week go?", "What can you make?"];

export function starterChips(userId: string): string[] {
  const topics = (loadPositioning(userId)?.topics ?? []).map((t) => t.trim()).filter(Boolean);
  const saved = loadSaved(userId);
  const drafts = loadDrafts(userId);
  const fromData = [
    saved.topPosts.length + saved.inspiration.length > 0 && "Remix a post from my Swipe file",
    topics[0] && `Make a carousel about ${topics[0]}`,
    topics[1] && `Write a script about ${topics[1]}`,
    topics[0] && `Make a 20-second video about ${topics[0]}`,
    drafts.some((d) => draftStatus(d) !== "posted") && "/check",
    drafts.some((d) => draftStatus(d) === "posted") && "/retro",
  ].filter((x): x is string => !!x);
  return [...fromData.slice(0, MAX_STARTERS - ALWAYS.length), ...ALWAYS];
}
