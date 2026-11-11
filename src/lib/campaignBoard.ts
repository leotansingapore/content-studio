// The campaign page's All posts view (?view=grid, src/components/campaign/AllPosts.tsx): the posts by week with what
// each week still costs to make, the made, making and draft counts, and each post as storyboard frames, so every post
// and every slide or script beat can be read on one screen. Pure: nothing here reads storage.

import { postSlides, postText } from "@/lib/campaignActions";
import type { Campaign, CampaignPost } from "@/lib/campaigns";
import { addDays, keyToDate } from "@/lib/dueDates";

export interface BoardWeek {
  /** 1-based, counted from the campaign's start day. */
  week: number;
  /** The week's first and last day (YYYY-MM-DD). */
  from: string;
  to: string;
  posts: CampaignPost[];
  /** What its posts still to make come to, in US$ to the cent. */
  usd: number;
}

const DAY = 86_400_000;
const toMake = (p: CampaignPost) => p.state !== "made" && p.state !== "skipped" && p.state !== "making";

/** The posts grouped by week of the campaign, in post order; a week with no post (in this filter) is left out. */
export function boardWeeks(c: Pick<Campaign, "startDay">, posts: CampaignPost[], usdOf: (p: CampaignPost) => number): BoardWeek[] {
  const start = keyToDate(c.startDay).getTime();
  const weeks = new Map<number, CampaignPost[]>();
  for (const p of [...posts].sort((a, b) => a.n - b.n)) {
    const w = Math.max(0, Math.floor(Math.round((keyToDate(p.day).getTime() - start) / DAY) / 7));
    weeks.set(w, [...(weeks.get(w) ?? []), p]);
  }
  return [...weeks].sort((a, b) => a[0] - b[0]).map(([w, list]) => ({
    week: w + 1,
    from: addDays(c.startDay, w * 7),
    to: addDays(c.startDay, w * 7 + 6),
    posts: list,
    usd: Math.round(list.filter(toMake).reduce((n, p) => n + usdOf(p), 0) * 100) / 100,
  }));
}

/** Made, being made, and drafts (everything else not skipped: written, waiting or failed). */
export function boardCounts(posts: CampaignPost[]): { made: number; making: number; drafts: number } {
  const made = posts.filter((p) => p.state === "made").length;
  const making = posts.filter((p) => p.state === "making").length;
  return { made, making, drafts: posts.filter((p) => p.state !== "skipped").length - made - making };
}

/** "4 made, 2 making, 22 drafts"; making is left out at 0. */
export const countsText = (k: { made: number; making: number; drafts: number }) =>
  [`${k.made} made`, k.making ? `${k.making} making` : "", `${k.drafts} ${k.drafts === 1 ? "draft" : "drafts"}`].filter(Boolean).join(", ");

export const STATE_CHIP: Record<CampaignPost["state"], string> = {
  waiting: "Waiting", drafting: "Writing", ready: "Draft", failed: "Not written", making: "Making", made: "Made", skipped: "Skipped",
};

export interface Frame { label: string; text: string }

/** A short video script's HOOK, BODY and CTA lines as blocks; one block when it has no labels. */
export const scriptBlocks = (script: string): Frame[] => {
  const blocks = script.split("\n").map((l) => /^(HOOK|BODY|CTA)\s*:\s*(.*)$/i.exec(l.trim())).filter((m): m is RegExpExecArray => !!m && !!m[2]);
  return blocks.length ? blocks.map((m) => ({ label: m[1].toUpperCase(), text: m[2] })) : [{ label: "SCRIPT", text: script }];
};

/**
 * A post as storyboard frames, in the order they are seen: a carousel's slides, a video's script beats, a slideshow's
 * or wall's hook and brief lines (its slides are written at Make), a text post's words. None before it is written.
 */
export function frames(p: CampaignPost): Frame[] {
  if (!p.hook) return [];
  if (p.format === "carousel") return postSlides(p).map((s, i) => ({ label: `Slide ${i + 1}`, text: [s.title, s.body].filter(Boolean).join("\n") }));
  if (p.format === "short-video" || p.format === "ai-video") return p.script?.trim() ? scriptBlocks(p.script) : [{ label: "HOOK", text: p.hook }];
  if (p.format === "slideshow" || p.format === "wall") {
    return [{ label: "Hook", text: p.hook }, ...(p.brief ?? "").split("\n").filter((l) => l.trim()).map((l, i) => ({ label: `Beat ${i + 1}`, text: l.trim() }))];
  }
  return [{ label: "Post", text: postText(p) }];
}
