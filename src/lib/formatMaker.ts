// What a video format's page makes in place (/make/<slug>, src/components/make/MakeHere.tsx), read from the entry's
// `opens` link in src/data/formats.ts: a presenter talk (kind=avatar&talk=) or an editor template (kind=template&
// template=). A row added there, or a template added to ai-video's TEMPLATES, gets the page with no page change; any
// other `opens` keeps today's page with Use this format. Pure, so it is tested on its own.
//   device: cs-make-<slug>-<scoped uid>: { script?, headline?, look?, fields? } what was typed on that format's page
//   (a new presenter's look too), so a reload or another visit keeps it (device only, like the talking head's).

import { scoped } from "@/lib/profiles";
import { priceOf, type Price } from "@/lib/prices";
import { TALK_LENGTHS, talkCaps, talkPrice, talkWords, wordLine, type TalkLength } from "@/lib/talkingHead";
import { CLIP_SECONDS, TALKS, type ClipQuality, type Talk } from "../../supabase/functions/ai-video/logic.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { templateById, type FieldKey, type VideoTemplate } from "../../supabase/functions/ai-video/templates.ts";
import { speakingWords } from "../../supabase/functions/remix/logic.ts";

export type Maker = { kind: "talk"; talk: Talk } | { kind: "template"; template: VideoTemplate };

/** The maker an `opens` link names, or null when the page can't make it in place (a narrated video, a montage, your own footage). */
export function makerOf(opens: string | undefined): Maker | null {
  if (!opens) return null;
  const [path, search = ""] = opens.split("?");
  const q = new URLSearchParams(search);
  if (path !== "/edit" || !(q.get("panel") ?? "").split(",").includes("ai")) return null;
  const talk = TALKS.find((t) => t === q.get("talk"));
  if (q.get("kind") === "avatar") return talk ? { kind: "talk", talk } : null;
  const template = q.get("kind") === "template" ? templateById(q.get("template")) : undefined;
  return template ? { kind: "template", template } : null;
}

/** The lengths its maker takes: a talk's voiceover runs to 30 s (the talking head's lengths), a clip is 4 or 8 s. */
export const lengthsOf = (m: Maker): readonly number[] => (m.kind === "talk" ? TALK_LENGTHS : CLIP_SECONDS);
/** A talk's script is aimed at 20 s, where its writer lands (50 to 75 words); a clip starts at 8 s, as the editor does. */
export const startLength = (m: Maker): number => (m.kind === "talk" ? 20 : 8);

/**
 * What one Make press costs, from the price table: a talk's voiceover and video at the length, plus a new presenter's
 * picture when one has to be made (the script is its own press); a clip at its length and quality.
 */
export function makePrice(m: Maker, o: { length: number; quality: ClipQuality; presenter: boolean }): Price | "pick" | null {
  return m.kind === "talk" ? talkPrice({ length: o.length as TalkLength, write: false, presenter: o.presenter }) : priceOf("ai-clip", { seconds: o.length, quality: o.quality });
}

/** The caps a press spends beside the format's own (FormatShell's main cap): a talk's voiceover and any presenter picture. */
export const makeCaps = (m: Maker, presenter: boolean): UsageFeature[] => (m.kind === "talk" ? talkCaps({ length: 20, write: false, presenter }) : []);

/** The template's blanks that someone says out loud: none in a silent scene. */
const SPOKEN: FieldKey[] = ["line", "question", "answer"];
export const spokenKeys = (t: VideoTemplate): FieldKey[] => (t.silent ? [] : t.fields.filter((f) => SPOKEN.includes(f.key)).map((f) => f.key));

export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Under a clip's spoken blanks: the words said against the most that fit the length (speakingWords), or that most while empty. */
export function clipWordLine(n: number, seconds: number): string {
  const { high } = speakingWords(seconds);
  if (n <= 0) return `Up to ${high} spoken words fit ${seconds} seconds.`;
  return n > high ? `${n} words. Over ${seconds} seconds, so cut some.` : `${n} words. Up to ${high} fit ${seconds} seconds.`;
}

/** Under a talk's script: the words against the length's target (the talking head's wordLine), or the target while empty. */
export const talkLine = (n: number, s: TalkLength): string => wordLine(n, s) || `Aim for ${talkWords(s).low} to ${talkWords(s).high} words for ${s} seconds.`;

/** More settings' folded line: the picks in order, the first one capitalised ("No product, 720p, captions Bold"). */
export const pickLine = (picks: (string | null | undefined | false)[]): string[] => {
  const kept = picks.filter((x): x is string => !!x);
  return kept.map((x, i) => (i ? x : x[0].toUpperCase() + x.slice(1)));
};

// ---- what was typed, kept on this device ----

export interface Typed {
  script?: string;
  headline?: string;
  /** A new AI presenter's look. */
  look?: string;
  fields?: Partial<Record<FieldKey, string>>;
}

const typedKey = (slug: string, userId: string) => `cs-make-${slug}-${scoped(userId)}`;
const text = (v: unknown) => (typeof v === "string" ? v : undefined);

export function loadTyped(slug: string, userId: string): Typed {
  try {
    const t = JSON.parse(localStorage.getItem(typedKey(slug, userId)) ?? "{}") ?? {};
    const fields = Object.fromEntries(Object.entries(t.fields ?? {}).filter(([k, v]) => SPOKEN.concat(["product", "person", "scene"]).includes(k as FieldKey) && typeof v === "string"));
    return { script: text(t.script), headline: text(t.headline), look: text(t.look), fields };
  } catch {
    return {};
  }
}

export function saveTyped(slug: string, userId: string, t: Typed): void {
  try {
    localStorage.setItem(typedKey(slug, userId), JSON.stringify(t));
  } catch {
    // the boxes still hold it for this visit
  }
}
