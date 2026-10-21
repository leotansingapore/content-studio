// The talking head page's rules (/make/talking-head, docs/north-star/items/formats-talking-head.md), pure so they are
// tested on their own: the word target per length and its line, when a press writes the script first, the price of a
// press and the caps it spends, the price check after the voiceover, a Clone a reel result's own script, and the
// device key that keeps what was typed.
//   device: cs-make-talking-head-<scoped uid>: { script, look, filled? } (the typed script and presenter look; filled
//   is the source key the script was last filled from, so a reload never fills over an edit). Cleared after a make.

import { links } from "@/lib/links";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { sourceKey, type RemixSource } from "@/lib/remixSource";
import type { SavedClone } from "@/lib/reelClone";
import { MAX_AVATAR_SECONDS, type SettingId } from "../../supabase/functions/ai-video/logic.ts";
import { MAX_TOPIC, SPEAKING_SECONDS, speakingWords, type SpeakingSeconds } from "../../supabase/functions/remix/logic.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export type TalkLength = SpeakingSeconds;
export const TALK_LENGTHS = SPEAKING_SECONDS;
export const DEFAULT_LENGTH: TalkLength = 15;
export type TalkWho = "photo" | "presenter";
export type TalkSetting = Extract<SettingId, "office" | "car" | "kitchen" | "couch" | "cafe">;
export const TALK_SETTINGS: { id: TalkSetting; label: string }[] = [
  { id: "office", label: "Office desk" },
  { id: "car", label: "Parked car" },
  { id: "kitchen", label: "Kitchen counter" },
  { id: "couch", label: "On the couch" },
  { id: "cafe", label: "Cafe table" },
];

export const TALK_TOAST = "Your talking head video is ready. Export it when it looks right.";

export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Under the script box: the words against the length's target (2.4 to 3.2 words a second); nothing while it is empty. */
export function wordLine(n: number, s: TalkLength): string {
  if (n <= 0) return "";
  const { low, high } = speakingWords(s);
  if (n < low) return `${n} words may be too short for ${s} seconds.`;
  // nothing cuts a voiceover at the length: longer runs longer and costs more (the price check), and past 30 s it can't be made
  if (n > high) return s >= MAX_AVATAR_SECONDS ? `${n} words. Over ${s} seconds, so shorten it.` : `${n} words. Over ${s} seconds, so it runs longer.`;
  return `${n} words. Aim for ${low} to ${high} for ${s} seconds.`;
}

/** Text short of the length's words and short enough to send as a topic is a topic to write from, not the script. */
export const asTopic = (text: string, s: TalkLength) => wordCount(text) < speakingWords(s).low && text.trim().length <= MAX_TOPIC;

/**
 * What a press writes before the voiceover: from the post (the box is empty or a short steer), from the box as a
 * topic, or nothing (the box is the script). A Clone a reel result keeps its own script and never writes.
 */
export function writePlan(text: string, s: TalkLength, source: Pick<RemixSource, "kind"> | null): "source" | "topic" | null {
  if (source?.kind === "clone") return null;
  const t = text.trim();
  if (source) return asTopic(t, s) ? "source" : null;
  return t && asTopic(t, s) ? "topic" : null;
}

/** "Write it for me": from the post, or from the box as a topic (3 to 200 characters); never over a clone's script. */
export const canWrite = (text: string, source: Pick<RemixSource, "kind"> | null) =>
  source ? source.kind !== "clone" : text.trim().length >= 3 && text.trim().length <= MAX_TOPIC;

/** The video's estimate for a length: the price table's seconds rule (whole 9.5 s slices, then the rest). */
export const videoEstimate = (s: TalkLength) => priceOf("ai-video", { seconds: s }) as Price;
/** The video's price once the voiceover is cut into its real slices. */
export const videoPrice = (slices: number[]) => priceOf("ai-video", { slices }) as Price;

/** The price check after the voiceover: true only when the real slices cost more than the chip said. */
export const needsPriceCheck = (estimate: number, real: number) => real > estimate + 1e-9;

/** What one press spends: a script write, a presenter picture, the voiceover and the video, as it stands now. */
export interface TalkSpend {
  length: TalkLength;
  /** The press writes the script first (writePlan). */
  write: boolean;
  /** The press makes a presenter picture (an AI presenter with none made for this look and setting). */
  presenter: boolean;
}

export const talkPrice = (o: TalkSpend) =>
  sumPrices(o.write ? priceOf("remix-make") : null, videoEstimate(o.length), priceOf("ai-voice"), o.presenter ? priceOf("ai-image") : null);

/** The caps beside ai-video (FormatShell's main cap) that the press spends, so the button is off when any is used up. */
export const talkCaps = (o: TalkSpend): UsageFeature[] => [...(o.write ? ["remix-make" as const] : []), "ai-voice", ...(o.presenter ? ["ai-image" as const] : [])];

/** The page's params for a run, defaults left out: the library row reopens what ran. */
export function talkParams(a: { source?: string; who: TalkWho; setting: TalkSetting; length: TalkLength; voice: string }): Record<string, string | undefined> {
  return {
    source: a.source,
    who: a.who === "presenter" ? "presenter" : undefined,
    setting: a.who === "presenter" && a.setting !== "office" ? a.setting : undefined,
    length: a.length === DEFAULT_LENGTH ? undefined : String(a.length),
    voice: a.voice === "alice" ? undefined : a.voice,
  };
}

/** A Clone a reel result's own words (its version's script and caption), or null when it isn't on this device. */
export function cloneWords(clones: SavedClone[], key: string): { script: string; caption: string } | null {
  const v = clones.find((c) => sourceKey.clone(c.result.source.platform, c.result.source.postId) === key)?.result.myVersion;
  return v && v.script.trim() ? { script: v.script.trim(), caption: v.caption.trim() } : null;
}

/** "Make it as a talking head" on a Clone a reel result: Leo's sessions only, everyone else gets nothing. */
export const cloneTalkHref = (leo: boolean, s: { platform: string; postId: string }) =>
  leo ? links.makeFormat("talking-head", { source: sourceKey.clone(s.platform, s.postId) }) : null;

// ---- what was typed, kept on this device ----

export interface Typed {
  script: string;
  look: string;
  /** The source key the script was filled from. */
  filled?: string;
}

const typedKey = (userId: string) => `cs-make-talking-head-${scoped(userId)}`;

export function loadTyped(userId: string): Typed {
  try {
    const t = JSON.parse(localStorage.getItem(typedKey(userId)) ?? "{}");
    return {
      script: typeof t?.script === "string" ? t.script : "",
      look: typeof t?.look === "string" ? t.look : "",
      ...(typeof t?.filled === "string" ? { filled: t.filled } : {}),
    };
  } catch {
    return { script: "", look: "" };
  }
}

export function saveTyped(userId: string, t: Typed): void {
  try {
    localStorage.setItem(typedKey(userId), JSON.stringify(t));
  } catch {
    // the box still holds it for this visit
  }
}

/** After a make: the script goes (a source fills it again next time), the presenter look stays for the next one. */
export function clearScript(userId: string): void {
  saveTyped(userId, { script: "", look: loadTyped(userId).look });
}
