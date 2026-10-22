// Hook plus demo's rules (/make/hook-demo, docs/north-star/items/formats-hook-demo.md), pure so they are tested
// without a browser: which demo and hook clips are taken, and the order the hook and the demo are joined in. The run
// is src/lib/hookDemoJob.ts; the page is src/components/make/HookDemo.tsx.

import { priceOf, sumPrices, type Price, type PriceOpts } from "@/lib/prices";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { SPOKEN_HOOK_WORDS } from "../../supabase/functions/remix/logic.ts";

export type HookPlay = "stock" | "mine" | "crumple" | "spoken";
/**
 * Words on a stock clip (no face, the default), the adviser's own clip, the adviser's own frame moved by AI (they
 * crumple a notification card with the hook on it), then an AI person: the faces rule's order.
 */
export const HOOK_PLAYS: HookPlay[] = ["stock", "mine", "crumple", "spoken"];
export const PLAY_LABELS: Record<HookPlay, string> = { stock: "Words on a stock clip", mine: "I say it", crumple: "I crumple a notification", spoken: "Someone says it" };
/** The two that order a paid AI clip, with the demo joined after it from this device. */
export const paidPlay = (p: HookPlay): boolean => p === "crumple" || p === "spoken";

export const DEMO_MAX_MB = 100;
export const DEMO_MAX_SECONDS = 30;
/** A stock hook runs 3 s; findClip only offers clips that long. */
export const STOCK_HOOK_SECONDS = 3;
/** ai-video's spoken-hook template is a 4 s clip (CLIP_SECONDS) and takes 8 words, the limit remix writes a spoken hook to. */
export const SPOKEN_HOOK_SECONDS = 4;
export { SPOKEN_HOOK_WORDS };
/**
 * ai-video's crumple-hook template: 4 s at 720p, the size Leo's 21 Oct test kept the card's words sharp at (the join
 * takes its frame size from the hook, so 480p would also shrink the demo after it).
 */
export const CRUMPLE_SECONDS = 4;
export const CRUMPLE_QUALITY = "720p" as const;
/** Two lines on the card, read in the 2 s before the hand reaches it. */
export const CARD_MAX = 45;
/** The adviser's own hook clip: long enough to say a line, short enough to stay a hook. */
export const MINE_MIN_SECONDS = 2;
export const MINE_MAX_SECONDS = 5;
/** A typed hook, as long as a written one can be (12 words) with room to spare. */
export const MAX_HOOK_CHARS = 100;

export const DEMO_BAD = "Use an MP4 or MOV under 100 MB and 30 seconds.";
export const SIDEWAYS = "Use an upright clip for the hook, so the video stays vertical.";
export const HOOK_CLIP_LENGTH = "Use a hook clip of 2 to 5 seconds.";
export const SPOKEN_TOO_LONG = "Keep it to 8 words, so it fits in 4 seconds.";
export const CARD_TOO_LONG = `Keep it to ${CARD_MAX} characters, so it reads before the crumple.`;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Why a demo is refused before anything runs: not MP4 or MOV, over 100 MB, or over 30 s (a header rounding to 30.4 still counts as 30). */
export function demoIssue(file: { type: string; name: string; size: number }, seconds: number): string | null {
  const type = file.type.toLowerCase();
  const mp4OrMov = type === "video/mp4" || type === "video/quicktime" || (!type && /\.(mp4|mov)$/i.test(file.name));
  if (!mp4OrMov || file.size > DEMO_MAX_MB * 1024 * 1024) return DEMO_BAD;
  if (!(seconds > 0) || seconds > DEMO_MAX_SECONDS + 0.5) return DEMO_BAD;
  return null;
}

/** Why the adviser's own hook clip is refused: sideways (the join takes its frame from the first take), or not 2 to 5 s. */
export function hookClipIssue(w: number, h: number, seconds: number): string | null {
  if (!(w > 0 && h > 0) || w > h) return SIDEWAYS;
  if (!(seconds >= MINE_MIN_SECONDS - 0.2 && seconds <= MINE_MAX_SECONDS + 0.2)) return HOOK_CLIP_LENGTH;
  return null;
}

/** Why a hook can't be made as it stands: none picked or typed, too long for someone to say in 4 s, or for the card. */
export function hookIssue(text: string, play: HookPlay): string | null {
  if (!text.trim()) return "Pick a hook or type your own.";
  if (play === "crumple") return text.trim().length > CARD_MAX ? CARD_TOO_LONG : null;
  return play === "spoken" && words(text) > SPOKEN_HOOK_WORDS ? SPOKEN_TOO_LONG : null;
}

/**
 * What one press of Make the video spends, for its footer: one remix use only when it writes the hooks (none picked
 * or typed), the AI clip only for a spoken hook. A stock clip (Pexels and Jev) or your own clip spends no paid AI: cap
 * null, "No AI cost" (wave 2 live check, 21 Oct: written hooks still read "About US$0.02 | Last one today").
 */
export function pressSpend(play: HookPlay, writes: boolean): { cap: UsageFeature | null; price: Price | "pick" | null; caps?: UsageFeature[] } {
  const remix = writes ? priceOf("remix-make") : null;
  const clip: PriceOpts | null = play === "spoken" ? { seconds: SPOKEN_HOOK_SECONDS, quality: "480p" } : play === "crumple" ? { seconds: CRUMPLE_SECONDS, quality: CRUMPLE_QUALITY } : null;
  if (clip) return { cap: "ai-clip", price: sumPrices(remix, priceOf("ai-clip", clip)), ...(writes ? { caps: ["remix-make"] } : {}) };
  return writes ? { cap: "remix-make", price: remix } : { cap: null, price: null };
}

const FIXED_END: Record<HookPlay, number> = { stock: STOCK_HOOK_SECONDS, mine: MINE_MAX_SECONDS + 0.2, crumple: CRUMPLE_SECONDS, spoken: SPOKEN_HOOK_SECONDS };

/** A stock, crumpled or spoken hook is cut to its fixed length; the adviser's own runs whole. */
export const hookEnd = (play: HookPlay, hookSeconds: number): number => Math.round(Math.min(FIXED_END[play], hookSeconds) * 100) / 100;

/** Where the crumpled card's frame is taken: 0.3 s into the demo's window (a video's very first frame can be blank). */
export const cardFrameAt = (start: number, seconds: number): number => Math.round((Math.max(0, start) + Math.min(0.3, seconds / 2)) * 100) / 100;

export interface JoinPlan {
  /** In order: the hook first, so the video takes its vertical frame; the demo after, shown whole inside it. */
  takes: { take: "hook" | "demo"; start: number; end: number }[];
  /** The hook's words on screen, from 0 to the hook's end. */
  overlay: { from: number; to: number };
}

/** `demoStart`: where a saved demo's window starts in its file (0 for a demo picked for this video), `demoSeconds` its length. */
export function joinPlan(play: HookPlay, hookSeconds: number, demoSeconds: number, demoStart = 0): JoinPlan {
  const hook = hookEnd(play, hookSeconds);
  const start = Math.round(Math.max(0, demoStart) * 100) / 100;
  const demo = Math.round((start + Math.min(DEMO_MAX_SECONDS, demoSeconds)) * 100) / 100;
  return { takes: [{ take: "hook", start: 0, end: hook }, { take: "demo", start, end: demo }], overlay: { from: 0, to: hook } };
}

/** "0:24" for the demo card. */
export function clock(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}
