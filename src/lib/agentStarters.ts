// The empty chat's starters (docs/north-star/items/agent-chat.md, "Empty thread"), Fastlane's eight built from the
// brand's own facts (read 14 Nov): an image for the first audience, a 15s question-hook video, a script for an angle
// (else a topic), a campaign for an audience with no open campaign, new angles, last week, what is trending and the
// best post, with the Swipe file's remix and What can you make? beside them. Each shows only when what it needs
// exists on this brand, 8 at most: the least useful go first when there are more. A starter fills the composer and
// does not send; the three ready answers (agentAnswers.ts) sent unchanged draw their card with no Jev call. None says
// adviser, client or MAS, so a business brand gets the same words as a person's.

import { staticFormatBySlug } from "@/data/staticFormats";
import { getTrackedPosts } from "@/lib/analytics";
import { anglesFor } from "@/lib/angles";
import { loadAudiences } from "@/lib/audiences";
import { campaignStatus, loadCampaigns } from "@/lib/campaigns";
import { localDateKey } from "@/lib/dueDates";
import { FORMAT_TRENDS } from "@/lib/formatTrends";
import { isStatic, type StaticLayoutId } from "@/lib/imageLayout";
import { loadPositioning } from "@/lib/positioning";
import { loadSaved } from "@/lib/savedItems";
import { MAX_TOPIC } from "../../supabase/functions/remix/logic.ts";

export const MAX_STARTERS = 8;

export function starterChips(userId: string, today = localDateKey()): string[] {
  const audiences = loadAudiences(userId).filter((a) => a.name.trim());
  const first = audiences[0]?.name.trim();
  const campaigns = loadCampaigns(userId);
  const open = new Set(campaigns.filter((c) => campaignStatus(c, today) !== "done").map((c) => c.audience));
  const free = audiences.find((a) => !open.has(a.id))?.name.trim();
  const angle = [...campaigns.flatMap((c) => c.angles), ...audiences.flatMap((a) => anglesFor(userId, a.id))].map((a) => a.title.trim()).find(Boolean);
  const topic = (loadPositioning(userId)?.topics ?? []).map((t) => t.trim()).find(Boolean);
  const saved = loadSaved(userId);
  // in Fastlane's order; the number is the order they go in when there are more than 8 (the highest first, 0 never)
  const all: [string | false | undefined, number][] = [
    [saved.topPosts.length + saved.inspiration.length > 0 && "Remix a post from my Swipe file", 4],
    [first && `Make an image for ${first}`, 1],
    ["Make a 15s video with a question hook", 8],
    [angle ? `Write a script for ${angle}` : topic && `Write a script about ${topic}`, 2],
    [free && `Plan a campaign for ${free}`, 3],
    [first && "Find new angles", 5],
    ["How did last week go?", 9],
    [FORMAT_TRENDS.items.length > 0 && "What is trending in my niche?", 6],
    [getTrackedPosts(userId).length > 0 && "Which post did best?", 7],
    ["What can you make?", 0],
  ];
  const shown = all.filter((x): x is [string, number] => !!x[0]);
  const cut = shown.map(([, r]) => r).sort((a, b) => b - a).slice(0, Math.max(0, shown.length - MAX_STARTERS));
  return shown.filter(([, r]) => !cut.includes(r)).map(([s]) => s);
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
