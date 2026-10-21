// Hook plus demo's rules (/make/hook-demo, docs/north-star/items/formats-hook-demo.md), pure so they are tested
// without a browser: which demo and hook clips are taken, and the order the hook and the demo are joined in. The run
// is src/lib/hookDemoJob.ts; the page is src/components/make/HookDemo.tsx.

export type HookPlay = "stock" | "mine" | "spoken";
/** Words on a stock clip (no face, the default), the adviser's own clip, then an AI person: the faces rule's order. */
export const HOOK_PLAYS: HookPlay[] = ["stock", "mine", "spoken"];
export const PLAY_LABELS: Record<HookPlay, string> = { stock: "Words on a stock clip", mine: "I say it", spoken: "Someone says it" };

export const DEMO_MAX_MB = 100;
export const DEMO_MAX_SECONDS = 30;
/** A stock hook runs 3 s; findClip only offers clips that long. */
export const STOCK_HOOK_SECONDS = 3;
/** ai-video's spoken-hook template is a 4 s clip (CLIP_SECONDS) and takes 8 words. */
export const SPOKEN_HOOK_SECONDS = 4;
export const SPOKEN_HOOK_WORDS = 8;
/** The adviser's own hook clip: long enough to say a line, short enough to stay a hook. */
export const MINE_MIN_SECONDS = 2;
export const MINE_MAX_SECONDS = 5;
/** A typed hook, as long as a written one can be (12 words) with room to spare. */
export const MAX_HOOK_CHARS = 100;

export const DEMO_BAD = "Use an MP4 or MOV under 100 MB and 30 seconds.";
export const SIDEWAYS = "Use an upright clip for the hook, so the video stays vertical.";
export const HOOK_CLIP_LENGTH = "Use a hook clip of 2 to 5 seconds.";
export const SPOKEN_TOO_LONG = "Keep it to 8 words, so it fits in 4 seconds.";

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

/** Why a hook can't be made as it stands: none picked or typed, or too long for someone to say in 4 s. */
export function hookIssue(text: string, play: HookPlay): string | null {
  if (!text.trim()) return "Pick a hook or type your own.";
  return play === "spoken" && words(text) > SPOKEN_HOOK_WORDS ? SPOKEN_TOO_LONG : null;
}

/** A stock or spoken hook is cut to its fixed length; the adviser's own runs whole. */
export const hookEnd = (play: HookPlay, hookSeconds: number): number =>
  Math.round(Math.min(play === "stock" ? STOCK_HOOK_SECONDS : play === "spoken" ? SPOKEN_HOOK_SECONDS : MINE_MAX_SECONDS + 0.2, hookSeconds) * 100) / 100;

export interface JoinPlan {
  /** In order: the hook first, so the video takes its vertical frame; the demo after, shown whole inside it. */
  takes: { take: "hook" | "demo"; start: number; end: number }[];
  /** The hook's words on screen, from 0 to the hook's end. */
  overlay: { from: number; to: number };
}

export function joinPlan(play: HookPlay, hookSeconds: number, demoSeconds: number): JoinPlan {
  const hook = hookEnd(play, hookSeconds);
  const demo = Math.round(Math.min(DEMO_MAX_SECONDS, demoSeconds) * 100) / 100;
  return { takes: [{ take: "hook", start: 0, end: hook }, { take: "demo", start: 0, end: demo }], overlay: { from: 0, to: hook } };
}

/** "0:24" for the demo card. */
export function clock(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}
