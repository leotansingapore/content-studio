// The talking head page's rules (/make/talking-head, docs/north-star/items/formats-talking-head.md), pure so they are
// tested on their own: the word target per length and its line, when a press writes the script first, the price of a
// press and the caps it spends, the price check after the voiceover, a Clone a reel result's own script, and the
// device key that keeps what was typed.
//   device: cs-make-talking-head-<scoped uid>: { script, look, filled? } (the typed script and presenter look; filled
//   is the source key the script was last filled from, so a reload never fills over an edit). Cleared after a make.
// Who speaks (people-in-videos, Leo only, shared with the editor's You speaking): your saved face (myFace.ts) or one of
// the brand's saved presenters (presenters.ts), the brand's "Who appears" preselected, and the AI mark each make carries.

import { useEffect, useState } from "react";
import { links } from "@/lib/links";
import { loadFace, onFaceChanged, type MyFace } from "@/lib/myFace";
import { loadPresenters, onPresenters, onPresentersChanged, type Presenter } from "@/lib/presenters";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { sourceKey, type RemixSource } from "@/lib/remixSource";
import type { SavedClone } from "@/lib/reelClone";
import type { VoiceId } from "@/lib/textVoice";
import type { AiMark } from "@/lib/videoProjects";
import { CUT_WINDOW, MAX_AVATAR_SECONDS, MAX_SLICE, type SettingId } from "../../supabase/functions/ai-video/logic.ts";
import { MAX_TOPIC, SPEAKING_SECONDS, scriptWords, speakingWords, type SpeakingSeconds } from "../../supabase/functions/remix/logic.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export type TalkLength = SpeakingSeconds;
export const TALK_LENGTHS = SPEAKING_SECONDS;
export const DEFAULT_LENGTH: TalkLength = 15;
/** A photo picked for this one video, a new AI presenter, your saved face, or a saved presenter's id. */
export type TalkWho = "photo" | "presenter" | "mine" | `pr-${string}`;
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

/**
 * The words a script aims for at a length: the length rule's 2.4 to 3.2 words a second, or, given the picked voice (Leo's
 * sign-ins), the range the writer is asked for (remix's scriptWords) up to the words that voice reads in the length
 * (live-p7a-fix, 27 Oct: "Aim for 36 to 48" for 15 s, and Alice read the 48 words in 20.0 s).
 */
export const talkWords = (s: TalkLength, voice?: VoiceId) =>
  voice ? scriptWords({ seconds: s, words: Math.floor(s * readWps(voice) + 1e-9) }) : speakingWords(s);

/** Under the script box: the words against the length's target (talkWords); nothing while it is empty. */
export function wordLine(n: number, s: TalkLength, voice?: VoiceId): string {
  if (n <= 0) return "";
  const { low, high } = talkWords(s, voice);
  if (n < low) return `${n} words may be too short for ${s} seconds.`;
  // nothing cuts a voiceover at the length: longer runs longer and costs more (the price check), and past 30 s it can't be made
  if (n > high) return s >= MAX_AVATAR_SECONDS ? `${n} words. Over ${s} seconds, so shorten it.` : `${n} words. Over ${s} seconds, so it runs longer.`;
  return `${n} words. Aim for ${low} to ${high} for ${s} seconds.`;
}

/** Text short of the length's words (talkWords) and short enough to send as a topic is a topic to write from, not the script. */
export const asTopic = (text: string, s: TalkLength, voice?: VoiceId) => wordCount(text) < talkWords(s, voice).low && text.trim().length <= MAX_TOPIC;

/**
 * What a press writes before the voiceover: from the post (the box is empty or a short steer), from the box as a
 * topic, or nothing (the box is the script). A Clone a reel result keeps its own script and never writes.
 */
export function writePlan(text: string, s: TalkLength, source: Pick<RemixSource, "kind"> | null, voice?: VoiceId): "source" | "topic" | null {
  if (source?.kind === "clone") return null;
  const t = text.trim();
  if (source) return asTopic(t, s, voice) ? "source" : null;
  return t && asTopic(t, s, voice) ? "topic" : null;
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

/**
 * Words a second each voice reads a plain script at: its slowest voiceover at Make so far, rounded down (live-p5dog,
 * Alice 2.56 to 2.79, Eric 2.48 to 2.84; live-p7a-fix 27 Oct, Alice 48 words in 20.0 s on a Write it for me script); a
 * voice not yet measured reads at the length rule's slow end (speakingWords' 2.4).
 */
const READ_WPS: Partial<Record<VoiceId, number>> = { alice: 2.4, eric: 2.48 };
export const readWps = (voice: VoiceId) => READ_WPS[voice] ?? 2.4;
/** How long a script's voiceover runs in a voice, before it exists: at most MAX_AVATAR_SECONDS. */
export const scriptSeconds = (words: number, voice: VoiceId) => Math.min(MAX_AVATAR_SECONDS, Math.max(1, words) / readWps(voice));

/**
 * The video's estimate from its script, before the voiceover exists: the voiceover's seconds in that voice, cut into
 * parts the way planSlices can cut speech at the earliest (each part CUT_WINDOW short of MAX_SLICE), priced as the
 * real parts are (videoPrice), so it is never under what Make's price check charges for the same voiceover.
 */
export function scriptEstimate(words: number, voice: VoiceId): Price {
  const parts: number[] = [];
  let rest = scriptSeconds(words, voice);
  for (; rest > MAX_SLICE; rest -= MAX_SLICE - CUT_WINDOW) parts.push(MAX_SLICE - CUT_WINDOW);
  return videoPrice([...parts, rest]);
}

/** What one press spends: a script write, a presenter picture, the voiceover and the video, as it stands now. */
export interface TalkSpend {
  length: TalkLength;
  /** The press writes the script first (writePlan). */
  write: boolean;
  /** The press makes a presenter picture (an AI presenter with none made for this look and setting). */
  presenter: boolean;
  /** The script it speaks and in which voice, when the card has it: the video is priced from it, not the length. */
  script?: { words: number; voice: VoiceId };
}

export const talkPrice = (o: TalkSpend) =>
  sumPrices(
    o.write ? priceOf("remix-make") : null,
    o.script ? scriptEstimate(o.script.words, o.script.voice) : videoEstimate(o.length),
    priceOf("ai-voice"),
    o.presenter ? priceOf("ai-image") : null,
  );

/** The caps beside ai-video (FormatShell's main cap) that the press spends, so the button is off when any is used up. */
export const talkCaps = (o: TalkSpend): UsageFeature[] => [...(o.write ? ["remix-make" as const] : []), "ai-voice", ...(o.presenter ? ["ai-image" as const] : [])];

/** The page's params for a run, defaults left out: the library row reopens what ran. */
export function talkParams(a: { source?: string; who: TalkWho; setting: TalkSetting; length: TalkLength; voice: string }): Record<string, string | undefined> {
  return {
    source: a.source,
    who: a.who === "photo" ? undefined : a.who,
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

// ---- who speaks: your saved face or a saved presenter (Leo only) ----

export interface Speakers {
  /** Your verified face, when it is on. */
  face: MyFace | null;
  /** This brand's presenters that are on, oldest first. */
  presenters: Presenter[];
  /** The brand's "Who appears": "me", "ask" or a presenter id. */
  who: string;
}

export const speakers = (userId: string): Speakers => {
  const p = loadPresenters(userId);
  return { face: loadFace(userId), presenters: onPresenters(p), who: p.who };
};

/** Re-reads on a face or presenter saved here, in another tab or from sync. */
export function onSpeakersChanged(fn: () => void): () => void {
  const a = onFaceChanged(fn);
  const b = onPresentersChanged(fn);
  return () => {
    a();
    b();
  };
}

/** This brand's speakers in Leo's session (none for anyone else), read again whenever a face or presenter changes. */
export function useSpeakers(userId: string | undefined): Speakers | null {
  const [s, setS] = useState(() => (userId ? speakers(userId) : null));
  useEffect(() => {
    if (!userId) return setS(null);
    const read = () => setS(speakers(userId));
    read();
    return onSpeakersChanged(read);
  }, [userId]);
  return s;
}

/** The brand's "Who appears" as the pick: me is your face, a presenter its id, and Ask each time picks none (""). */
export const defaultWho = (s: Speakers) => (s.who === "me" ? "mine" : s.who === "ask" ? "" : s.who);

/** The picks a ?face= or ?who= link may hold: your face, a new presenter, or a saved one. */
export const whoChoices = (s: Speakers) => ["mine", "presenter", ...s.presenters.map((p) => p.id)];

export type Speaker = { person: "mine"; face: MyFace } | { person: "presenter"; p: Presenter };

/** The pick read: your face (only while it is on), a saved presenter that is on, or null for anything else. */
export function speakerOf(s: Speakers, who: string): Speaker | null {
  if (who === "mine") return s.face ? { person: "mine", face: s.face } : null;
  const p = s.presenters.find((x) => x.id === who);
  return p ? { person: "presenter", p } : null;
}

/** A saved data URL (a face or a presenter's copy) as a file: its bytes, the data-URL prefix gone. */
export function dataBlob(url: string): Blob {
  const comma = url.indexOf(",");
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /^data:([^;,]+)/.exec(url)?.[1] ?? "image/jpeg" });
}

type Get = (url: string) => Promise<Response>;
const fetched = (url: string, get: Get) => get(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);

/** What Speak starts from: your face; a presenter's link while it still answers (a GET), else its saved copy (decision 10). */
export async function speakerFace(sp: Speaker, get: Get = (u) => fetch(u)): Promise<Blob | string> {
  if (sp.person === "mine") return dataBlob(sp.face.photo);
  return (await fetched(sp.p.url, get)) ? sp.p.url : dataBlob(sp.p.photo);
}

/** The same person as a picture file, for a template clip's first frame: the link's own picture, else the copy. */
export async function speakerFile(sp: Speaker, get: Get = (u) => fetch(u)): Promise<Blob> {
  if (sp.person === "mine") return dataBlob(sp.face.photo);
  return (await fetched(sp.p.url, get)) ?? dataBlob(sp.p.photo);
}

/**
 * The AI mark a make hands the editor (JoinExtra.ai): your face or a presenter by id, "generated" for a person with no
 * saved likeness (a new presenter, a one-off photo, a template's person), none when no person is in it. A premade
 * voice is named; your own recording is not an AI voice, so it leaves `voice` unset.
 */
export function aiMark(kind: AiMark["kind"], person: Speaker | "generated" | null, voice: VoiceId | "mine" | null, now = new Date()): AiMark {
  return {
    kind,
    madeAt: now.toISOString(),
    ...(person === "generated" ? { person } : person ? { person: person.person, who: person.person === "mine" ? person.face.id : person.p.id } : {}),
    ...(voice && voice !== "mine" ? { voice: "premade" as const, voiceId: voice } : {}),
  };
}
