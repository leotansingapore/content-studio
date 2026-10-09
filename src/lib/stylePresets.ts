// Ready-made styles for the video editor: one tap sets the look (captions,
// grade, frame) AND the pace (pause limit, speed, punch-ins, zooms, cards,
// pop-ups, sound effects, hook seconds). Modelled on the signatures in Leo's
// talking-head-reel skill (signatures/*/signature.json: the six caption styles
// he picked on 2026-10-04 and the cutout and window explainers of 2026-10-05;
// yt-card left out, he does not like it), with the 1.05-1.1x speed his finals
// play at, and one numbers-first style for finance explainers.
// A copied reel's style (reelStyle.ts) is a recipe too.

import { withStyle, type EditSettings, type StyleId } from "@/lib/videoEdit";

/** Set by every recipe. */
const ALWAYS = ["style", "wordsPerCaption", "uppercase", "highlightNumbers", "progressBar", "punchIn", "keyZooms", "numberCards", "popups", "sfx", "maxPause", "speed", "hookSeconds", "fit"] as const;
/** Left out of a recipe = cleared to the style's own (no box, font, animation, colour look or transition of its own). */
const CLEARED = ["captionBox", "font", "captionAnim", "filter", "transition", "brollLayout"] as const;
export const RECIPE_KEYS = [...ALWAYS, ...CLEARED] as const;

type RecipeKey = (typeof RECIPE_KEYS)[number];
export type Recipe = Pick<EditSettings, (typeof ALWAYS)[number]> & Partial<Pick<EditSettings, (typeof CLEARED)[number]>> & { style: StyleId };

export interface Preset {
  id: string;
  label: string;
  /** Which signature it follows, for the chip's tooltip. */
  about: string;
  recipe: Recipe;
}

const base = { highlightNumbers: false, progressBar: false, punchIn: false, keyZooms: false, numberCards: false, popups: false, sfx: false, maxPause: 0.45, speed: 1.05, hookSeconds: 3, fit: "fill" } as const;

export const PRESETS: Preset[] = [
  {
    id: "punchy",
    label: "Punchy talking head",
    about: "Huge 3-word captions, numbers lit, punch-ins, zooms and whooshes, tight cuts",
    recipe: { ...base, style: "bold", wordsPerCaption: 3, uppercase: true, highlightNumbers: true, progressBar: true, punchIn: true, keyZooms: true, numberCards: true, sfx: true, maxPause: 0.3, speed: 1.1, captionAnim: "pop" },
  },
  {
    id: "golden",
    label: "Golden explainer",
    about: "Gold 2-word captions, pop-ups on key lines, B-roll on top with you below",
    recipe: { ...base, style: "cutout", wordsPerCaption: 2, uppercase: false, punchIn: true, keyZooms: true, numberCards: true, popups: true, sfx: true, maxPause: 0.3, speed: 1.1, brollLayout: "top" },
  },
  {
    id: "calm",
    label: "Calm explainer",
    about: "Sentence captions in a dark box, figures as cards, gentle zooms",
    recipe: { ...base, style: "minimal", wordsPerCaption: 3, uppercase: false, keyZooms: true, numberCards: true, captionAnim: "slide" },
  },
  {
    id: "numbers",
    label: "Numbers explainer",
    about: "4 words at a time with the spoken word highlighted, every figure on a card",
    recipe: { ...base, style: "bold", wordsPerCaption: 4, uppercase: false, highlightNumbers: true, progressBar: true, keyZooms: true, numberCards: true, sfx: true, maxPause: 0.4, captionBox: "word", font: "clean" },
  },
  {
    id: "native",
    label: "TikTok native",
    about: "Plain outlined captions, pop-up text, quick punch-ins",
    recipe: { ...base, style: "native", wordsPerCaption: 3, uppercase: false, punchIn: true, popups: true, sfx: true, maxPause: 0.35, speed: 1.1, captionAnim: "pop" },
  },
  {
    id: "magazine",
    label: "Magazine",
    about: "Warm film look, serif captions, soft dips at the cuts",
    recipe: { ...base, style: "editorial", wordsPerCaption: 3, uppercase: false, punchIn: true, numberCards: true, captionAnim: "slide", transition: "soft" },
  },
  {
    id: "window",
    label: "Window",
    about: "Your video in a rounded window, the hook on screen the whole time",
    recipe: { ...base, style: "editorial", wordsPerCaption: 3, uppercase: false, numberCards: true, maxPause: 0.4, hookSeconds: 10, fit: "framed" },
  },
  {
    id: "podcast",
    label: "Podcast clip",
    about: "Film bars, plain subtitles, natural pauses at normal speed",
    recipe: { ...base, style: "documentary", wordsPerCaption: 3, uppercase: false, maxPause: 0.6, speed: 1, hookSeconds: 4, captionAnim: "none" },
  },
];

/** The settings with a recipe laid over them: the style's own looks first, then every recipe key (one it leaves out is cleared). */
export function applyRecipe(s: EditSettings, r: Recipe): EditSettings {
  const next: EditSettings = r.style === s.style ? { ...s } : withStyle(s, r.style);
  const out = next as unknown as Record<RecipeKey, unknown>;
  for (const k of RECIPE_KEYS) out[k] = r[k];
  return next;
}

/** True when the settings already are this recipe. */
export function isRecipe(s: EditSettings, r: Recipe): boolean {
  return RECIPE_KEYS.every((k) => s[k] === r[k]);
}

/** Whether the recipe needs key lines picked (zooms or pop-ups) that this edit doesn't have yet. */
export function needsKeyLines(s: EditSettings, r: Recipe): boolean {
  const lines = s.motion?.lines ?? [];
  return (r.keyZooms && !lines.length) || (!!r.popups && !lines.some((l) => l.pop));
}
