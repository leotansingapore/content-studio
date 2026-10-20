// Every saved post broken down (docs/north-star/items/find-ai-tagging.md), the pure half: the tag lists and their
// labels, the tags copied off a teardown onto a saved item, the text the chain sends, the chips and the /saved
// filters. The chain itself runs in boards.ts beside the read it follows (runTags), outside React.

import type { BoardItem } from "@/lib/boards";
import { HOOK_FORMULAS, hookFormula } from "@/lib/hookFormulas";
import { slug } from "@/lib/links";
import { ANGLES, TOPICS } from "@/lib/postLabels";
import { AUDIENCE_TAGS, FEELINGS } from "../../supabase/functions/_shared/tags.ts";
import { MAX_SOURCE_TEXT, sureTag, type PostTags, type Teardown } from "../../supabase/functions/remix/teardown.ts";

export { sureTag };

export type TagFormat = "reel" | "carousel" | "picture" | "video" | "text" | "link";
export type TagState = "pending" | "done" | "failed" | "capped" | "none";

/** On each saved item, copied from the teardown so it outlives the teardown store (40 kept). */
export interface ItemTags extends PostTags {
  format: TagFormat;
  seconds: number | null;
  slides: number | null;
  /** The opening line, at most 100 characters. */
  opening: string;
  beats: string[];
  /** Words in the transcript; 0 when it was read (or is a picture) and nobody speaks; null when never read. */
  words: number | null;
  at: string;
}

export const FORMAT_LABEL: Record<TagFormat, string> = { reel: "Reel", carousel: "Carousel", picture: "Picture", video: "Video", text: "Text", link: "Link" };

export const TAG_COPY = {
  running: "Breaking it down",
  failed: "Couldn't break it down",
  capped: "Breakdowns used up today. Try again after 8am.",
  nothing: "Nothing to read on this link. Add a note, then tap Break it down.",
  noSpeech: "No speech in this post.",
  noJev: "Tagged without Jev",
} as const;

/** A /saved filter: its URL param, the label on the page, and its options as URL value and label. */
export interface TagFilter {
  param: "hook" | "angle" | "topic" | "emotion" | "audience" | "format";
  label: string;
  options: { value: string; label: string }[];
}

export const TAG_FILTERS: TagFilter[] = [
  { param: "hook", label: "Hook", options: HOOK_FORMULAS.map((f) => ({ value: f.id, label: f.name })) },
  { param: "angle", label: "Angle", options: ANGLES.map((a) => ({ value: slug(a), label: a })) },
  { param: "topic", label: "Topic", options: TOPICS.map((t) => ({ value: slug(t), label: t })) },
  { param: "emotion", label: "Feeling", options: FEELINGS.map((f) => ({ value: f.id, label: f.label })) },
  { param: "audience", label: "For", options: AUDIENCE_TAGS.map((a) => ({ value: a.id, label: a.label })) },
  { param: "format", label: "Format", options: (Object.keys(FORMAT_LABEL) as TagFormat[]).map((f) => ({ value: f, label: FORMAT_LABEL[f] })) },
];

const optionLabel = (param: TagFilter["param"], value: string | null) =>
  value ? (TAG_FILTERS.find((f) => f.param === param)?.options.find((o) => o.value === value)?.label ?? null) : null;

/** The item's value for a filter as the URL carries it, or null when it has none or Jev was unsure. */
export function tagValue(i: Pick<BoardItem, "tags">, param: TagFilter["param"]): string | null {
  const t = i.tags;
  if (!t) return null;
  if (param === "format") return t.format;
  if (param === "hook") return sureTag(t, "formula");
  const v = sureTag(t, param);
  return v && (param === "angle" || param === "topic") ? slug(v) : v;
}

/** The label a sure tag shows with ("Myth bust", "Contrarian", "Worry", "Young adults"), or null. */
export const tagLabel = (i: Pick<BoardItem, "tags">, param: TagFilter["param"]) => optionLabel(param, tagValue(i, param));

/** Up to three chips under a card's caption: hook name, angle, feeling; unsure tags left off. */
export const chipsFor = (i: Pick<BoardItem, "tags">): string[] =>
  (["hook", "angle", "emotion"] as const).map((p) => tagLabel(i, p)).filter((l): l is string => l !== null);

/** Keeps the items whose sure tags match every filter that isn't "all". */
export function filterByTags<T extends Pick<BoardItem, "tags">>(items: T[], f: Partial<Record<TagFilter["param"], string>>): T[] {
  const on = TAG_FILTERS.filter((x) => f[x.param] && f[x.param] !== "all");
  return items.filter((i) => on.every((x) => tagValue(i, x.param) === f[x.param]));
}

/** How many items carry each value of each filter. */
export function tagCounts(items: Pick<BoardItem, "tags">[]): Record<TagFilter["param"], Record<string, number>> {
  const out = Object.fromEntries(TAG_FILTERS.map((f) => [f.param, {} as Record<string, number>])) as Record<TagFilter["param"], Record<string, number>>;
  for (const i of items) {
    for (const f of TAG_FILTERS) {
      const v = tagValue(i, f.param);
      if (v) out[f.param][v] = (out[f.param][v] ?? 0) + 1;
    }
  }
  return out;
}

// ---- from a teardown -------------------------------------------------------------------------------------------

/** What the post is, from the item and the read, never from a model. */
export function formatOf(i: Pick<BoardItem, "format" | "kind" | "platform" | "url">, seconds: number | null): TagFormat {
  if (i.format === "carousel") return "carousel";
  if (i.format === "image") return "picture";
  if (i.format === "text") return "text";
  if (i.format === "video") return (i.platform === "youtube" && !i.url.includes("/shorts/")) || (seconds ?? 0) > 180 ? "video" : "reel";
  return i.kind === "link" ? "link" : "text";
}

/** "Reel, 42 s", "Carousel, 8 slides", "Picture", "Video, 3 min", "Text" or "Link". */
export function formatLine(t: Pick<ItemTags, "format" | "seconds" | "slides">): string {
  const s = t.seconds && t.seconds > 0 ? Math.round(t.seconds) : null;
  if ((t.format === "reel" || t.format === "video") && s) return `${FORMAT_LABEL[t.format]}, ${s >= 60 && t.format === "video" ? `${Math.round(s / 60)} min` : `${s} s`}`;
  if (t.format === "carousel" && t.slides) return `Carousel, ${t.slides} slides`;
  return FORMAT_LABEL[t.format];
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 3).replace(/\s+\S*$/, "")}...`);
export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The teardown's tags and beats onto the saved item; seconds and the transcript come from the read on this device. */
export function tagsFromTeardown(t: Teardown, i: BoardItem, transcript: string, seconds: number | null): ItemTags {
  const tags = t.tags ?? { formula: t.hook.formula, angle: null, topic: null, emotion: null, audience: null, p: {}, by: "jev" as const };
  const format = formatOf(i, seconds);
  const read = i.kind === "link" && i.read === "done";
  return {
    ...tags,
    format,
    seconds: seconds && seconds > 0 ? Math.round(seconds) : null,
    slides: null,
    opening: cut(t.hook.line, 100),
    beats: t.beats,
    words: transcript.trim() ? wordCount(transcript) : read || format === "picture" || format === "carousel" ? 0 : null,
    at: t.at,
  };
}

/** Breaks down on its own after a save: there are post words to read (a caption or a transcript). */
export const autoTags = (i: Pick<BoardItem, "caption">, transcript = "") => Boolean(i.caption.trim() || transcript.trim());

/**
 * The words the chain sends as the teardown's text (no url, so the server never reads the post again): the caption
 * and what is said in the video, or, with neither, the title and the note.
 */
export function tagText(i: Pick<BoardItem, "title" | "caption" | "note">, transcript = ""): string {
  const said = transcript.trim();
  const caption = i.caption ? [i.title !== i.caption ? i.title : "", i.caption].filter(Boolean).join("\n") : "";
  const text =
    caption || said
      ? [said && caption ? `Caption: ${caption}` : caption, said && `Said in the video: ${said}`].filter(Boolean).join("\n\n")
      : [i.title, i.note].filter(Boolean).join("\n\n");
  return text.trim().slice(0, MAX_SOURCE_TEXT);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const id = (v: unknown, max = 40) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** A stored item's tags checked field by field (the key syncs between devices), or undefined. */
export function cleanTags(raw: unknown): ItemTags | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.at !== "string") return undefined;
  const p = Object.fromEntries(Object.entries((r.p ?? {}) as Record<string, unknown>).filter(([, v]) => num(v) !== null)) as Record<string, number>;
  return {
    formula: id(r.formula),
    angle: id(r.angle),
    topic: id(r.topic),
    emotion: id(r.emotion),
    audience: id(r.audience),
    p,
    by: r.by === "llm" ? "llm" : "jev",
    format: typeof r.format === "string" && r.format in FORMAT_LABEL ? (r.format as TagFormat) : "text",
    seconds: num(r.seconds),
    slides: num(r.slides),
    opening: typeof r.opening === "string" ? r.opening.slice(0, 100) : "",
    beats: (Array.isArray(r.beats) ? r.beats : []).filter((b): b is string => typeof b === "string").slice(0, 8).map((b) => b.slice(0, 300)),
    words: num(r.words),
    at: r.at.slice(0, 40),
  };
}

/** The Hook row: the formula's name when Jev is sure, beside the opening line in quotes. */
export function hookRow(t: ItemTags): { name: string | null; line: string } {
  return { name: hookFormula(sureTag(t, "formula") ?? undefined)?.name ?? null, line: t.opening };
}
