// What a video format's page makes in place (/make/<slug>, src/components/make/MakeHere.tsx), read from the entry's
// `opens` link in src/data/formats.ts: a presenter talk (kind=avatar&talk=) or an editor template (kind=template&
// template=). A row added there, or a template added to ai-video's TEMPLATES, gets the page with no page change; any
// other `opens` keeps today's page with Use this format. Pure, so it is tested on its own.
//   device: cs-make-<slug>-<scoped uid>: { script?, headline?, fields? } what was typed on that format's page, so a
//   reload or another visit keeps it (device only, like the talking head's).

import { scoped } from "@/lib/profiles";
import { talkWords, wordLine, type TalkLength } from "@/lib/talkingHead";
import { CLIP_SECONDS, TALKS, type Talk } from "../../supabase/functions/ai-video/logic.ts";
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

/** A talk's script is aimed at 20 s, where its writer lands (50 to 75 words); a clip starts at 8 s, as the editor does. */
export const startLength = (m: Maker): number => (m.kind === "talk" ? 20 : 8);
/** A clip's lengths, as the editor offers them. */
export const CLIP_LENGTHS: readonly number[] = CLIP_SECONDS;

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

// ---- what was typed, kept on this device ----

export interface Typed {
  script?: string;
  headline?: string;
  fields?: Partial<Record<FieldKey, string>>;
}

const typedKey = (slug: string, userId: string) => `cs-make-${slug}-${scoped(userId)}`;
const text = (v: unknown) => (typeof v === "string" ? v : undefined);

export function loadTyped(slug: string, userId: string): Typed {
  try {
    const t = JSON.parse(localStorage.getItem(typedKey(slug, userId)) ?? "{}") ?? {};
    const fields = Object.fromEntries(Object.entries(t.fields ?? {}).filter(([k, v]) => SPOKEN.concat(["product", "person", "scene"]).includes(k as FieldKey) && typeof v === "string"));
    return { script: text(t.script), headline: text(t.headline), fields };
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
