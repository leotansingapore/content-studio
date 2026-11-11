// Settings > Post choices (/settings/post-choices): five per-brand choices the makers start from. Synced per brand:
//   content-studio-post-choices-<scoped uid>: { who, mention, influencers, captions, textStyles }
// Every default is what the makers did before the page existed, so nothing changes until a choice does. A pick on a
// maker's own page (its URL) wins for that post; Never, Sometimes and a ticked text style win over what a maker
// only remembers from last time.
import { useState } from "react";
import { scoped } from "@/lib/profiles";
import type { BoxStyle } from "@/lib/slideshow";
import type { BlockBox, FontId, StyleId } from "@/lib/videoEdit";

/** The on-post text looks a slideshow's boxes and a wall of text's block can both wear. */
export const TEXT_STYLES = {
  clean: { label: "Clean", font: "clean", box: "none" },
  heavy: { label: "Heavy", font: "heavy", box: "none" },
  serif: { label: "Serif", font: "serif", box: "none" },
  box: { label: "White box", font: "clean", box: "white" },
  bar: { label: "Dark bar", font: "clean", box: "bar" },
} as const satisfies Record<string, { label: string; font: FontId; box: BlockBox }>;
export type TextStyleId = keyof typeof TEXT_STYLES;
export const TEXT_STYLE_IDS = Object.keys(TEXT_STYLES) as TextStyleId[];

/** The editor's six styles as a caption look, then no captions; bold is what a new video starts with today. */
export const CAPTION_CHOICES = ["bold", "native", "minimal", "cutout", "editorial", "documentary", "off"] as const satisfies readonly (StyleId | "off")[];

const OPTIONS = {
  who: ["anyone", "women", "men"],
  mention: ["always", "sometimes", "never"],
  influencers: ["always", "sometimes", "never"],
  captions: CAPTION_CHOICES,
} as const;

export interface PostChoices {
  who: (typeof OPTIONS.who)[number];
  mention: (typeof OPTIONS.mention)[number];
  influencers: (typeof OPTIONS.influencers)[number];
  captions: (typeof CAPTION_CHOICES)[number];
  /** Ticked styles are mixed across new posts; none ticked leaves each format its own. */
  textStyles: TextStyleId[];
}

export const DEFAULT_CHOICES: PostChoices = { who: "anyone", mention: "always", influencers: "always", captions: "bold", textStyles: [] };
const KEY = "content-studio-post-choices-";

/** This brand's choices; anything missing or unreadable is the default. */
export function loadPostChoices(userId: string | null | undefined): PostChoices {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(globalThis.localStorage.getItem(KEY + scoped(userId)) ?? "{}") ?? {};
  } catch {
    raw = {};
  }
  const one = <K extends keyof typeof OPTIONS>(k: K) => ((OPTIONS[k] as readonly unknown[]).includes(raw[k]) ? raw[k] : DEFAULT_CHOICES[k]) as PostChoices[K];
  return {
    who: one("who"),
    mention: one("mention"),
    influencers: one("influencers"),
    captions: one("captions"),
    textStyles: TEXT_STYLE_IDS.filter((id) => Array.isArray(raw.textStyles) && raw.textStyles.includes(id)),
  };
}

/** False when the browser refused the write, so the page can say so instead of "Saved". */
export function savePostChoices(userId: string, c: PostChoices): boolean {
  try {
    globalThis.localStorage.setItem(KEY + scoped(userId), JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

/** Sometimes is about half: one flip per make. */
export const coin = () => Math.random() < 0.5;
/** One flip kept for a page visit, so the starting pick does not change under the person. */
export const useCoin = () => useState(coin)[0];

// ---------- name your business ----------

/** Whether a make names the business: yes or no on the URL wins, then Never or Sometimes (this make's flip), then what the maker remembers. */
export function mentionFor(userId: string, param: string | null = null, remembered = true, flip = coin()): boolean {
  if (param === "no") return false;
  if (param === "yes" || param === "inside") return true;
  const c = loadPostChoices(userId).mention;
  return c === "never" ? false : c === "sometimes" ? flip : remembered;
}

/** A mention pick as its URL value: on is left out only while Always makes on the start. */
export const mentionParam = (userId: string, on: boolean): "yes" | "no" | null => (!on ? "no" : loadPostChoices(userId).mention === "always" ? null : "yes");

/** The mention a make page starts on, kept for the visit. */
export const useMentionStart = (userId: string): "yes" | "no" => useState<"yes" | "no">(() => (mentionFor(userId) ? "yes" : "no"))[0];

// ---------- who appears ----------

const OTHER = { women: /\bman\b/i, men: /\bwoman\b/i } as const;
const fits = (who: PostChoices["who"], look: string) => who === "anyone" || !OTHER[who].test(look);

/** The presenter looks Who appears allows; every look when it would leave none. */
export function looksFor(userId: string | null | undefined, looks: readonly string[]): string[] {
  const { who } = loadPostChoices(userId);
  const kept = looks.filter((l) => fits(who, l));
  return kept.length ? kept : [...looks];
}
/** A new presenter's starting look. */
export const pickLook = (userId: string | null | undefined, looks: readonly string[]): string => {
  const l = looksFor(userId, looks);
  return l[Math.floor(Math.random() * l.length)];
};
/** "Another look": the next allowed one after `now`. */
export const nextLook = (userId: string | null | undefined, looks: readonly string[], now: string): string => {
  const l = looksFor(userId, looks);
  return l[(l.indexOf(now) + 1) % l.length];
};

// ---------- your influencers ----------

/** Whether the brand's saved presenter starts picked: Never no, Sometimes this make's flip, and never one Who appears leaves out. */
export function presenterStarts(userId: string, look: string, flip = coin()): boolean {
  const c = loadPostChoices(userId);
  return fits(c.who, look) && (c.influencers === "always" || (c.influencers === "sometimes" && flip));
}

// ---------- post text style ----------

/** One of the ticked styles for this make; null when none is ticked (the format keeps its own). */
export function textStyleFor(userId: string, rand = Math.random): (typeof TEXT_STYLES)[TextStyleId] | null {
  const ids = loadPostChoices(userId).textStyles;
  return ids.length ? TEXT_STYLES[ids[Math.floor(rand() * ids.length)]] : null;
}

/** A text style as a slideshow box's look: dark words on the white box, white words with a soft shadow otherwise. */
export const boxStyleOf = (t: { font: FontId; box: BlockBox }): Partial<BoxStyle> =>
  t.box === "white" ? { font: t.font, bg: "white", color: "#111111", stroke: 0, shadow: false } : { font: t.font, bg: t.box, color: "#FFFFFF", stroke: 0, shadow: t.box === "none" };
