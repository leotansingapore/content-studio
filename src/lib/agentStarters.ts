// The empty chat's starters (docs/north-star/items/agent-chat.md, "Empty thread"; agent-skills adds /check and
// /retro): at most 6, each shown only when what it needs exists on this brand, ending with the two that always work.
// A starter fills the composer and does not send. None says adviser, client or MAS, so a business brand gets the
// same words as a person's.

import { staticFormatBySlug } from "@/data/staticFormats";
import { draftStatus, loadDrafts } from "@/lib/draftHistory";
import { isStatic, type StaticLayoutId } from "@/lib/imageLayout";
import { loadPositioning } from "@/lib/positioning";
import { loadSaved } from "@/lib/savedItems";
import { MAX_TOPIC } from "../../supabase/functions/remix/logic.ts";

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

/** The page a chat was started from: the "From ..." chip above it, back to that page. */
export interface ArrivedFrom {
  label: string;
  path: string;
}
/**
 * A page handing the agent a request (Fastlane's "Make an ad in this format", 11 Nov walk): it links to
 * links.agent({ ask }) with navigation state { send: true, from: { label, path } }, and the new chat sends the words
 * on arrival. Never a URL param, so a pasted or shared link only fills the composer and spends nothing. `from` is
 * kept only when it is the app's own path and has a label.
 */
export function handoff(state: unknown, ask: string | null): { send: boolean; from: ArrivedFrom | null; layout: { layout: StaticLayoutId; topic: string } | null } {
  const s = (state ?? {}) as { send?: unknown; from?: { label?: unknown; path?: unknown }; layout?: unknown; topic?: unknown };
  const f = s.from;
  const from = f && typeof f.label === "string" && f.label.trim() && typeof f.path === "string" && /^\/(?![/\\])[^\s\x00-\x1f\x7f]*$/.test(f.path) ? { label: f.label.trim().slice(0, 80), path: f.path } : null;
  const topic = typeof s.topic === "string" ? s.topic.trim().slice(0, MAX_TOPIC) : "";
  const layout = typeof s.layout === "string" && isStatic(s.layout) && staticFormatBySlug(s.layout) && topic ? { layout: s.layout, topic } : null;
  return { send: s.send === true && !!ask?.trim(), from, layout };
}
