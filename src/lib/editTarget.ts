// What is open on screen for the agent to change (docs/north-star/items/edit-by-chat.md, "1. The page tells the dock
// what is open"): a module-level registry, in memory only. The carousel, slideshow and video editor pages register
// while an item is open (edit-targets, wave 3); the agent reads `currentEditTarget()` when it sends `open`.

export interface EditTarget {
  kind: "carousel" | "slideshow" | "video";
  title: string;
  /** First 80 characters of each slide, for carousel and slideshow. */
  slides?: string[];
  /** The slide shown or picked, 1-based. */
  onScreen?: number;
  /** Calls the writer and changes nothing. */
  propose(ask: string, slide: number | null): Promise<Proposal>;
}

export interface Proposal {
  reply: string;
  preview: string;
  flags: string[];
  apply(): { done: string; undo: () => void };
}

let current: EditTarget | null = null;

/** The page's item is now the one open; the returned unregister clears it only while it is still that item. */
export function registerEditTarget(t: EditTarget): () => void {
  current = t;
  return () => {
    if (current === t) current = null;
  };
}

export const currentEditTarget = (): EditTarget | null => current;

// ---------- a video edit's preview, in words ----------

const COLOURS: [string, number, number, number][] = [
  ["white", 255, 255, 255], ["black", 0, 0, 0], ["grey", 128, 128, 128], ["red", 220, 38, 38], ["orange", 249, 115, 22], ["yellow", 255, 214, 0],
  ["green", 34, 197, 94], ["teal", 20, 184, 166], ["blue", 37, 99, 235], ["purple", 147, 51, 234], ["pink", 236, 72, 153],
];
/** "#FFD92B" as the nearest plain colour name, "yellow". */
export function colourName(hex: unknown): string {
  const m = typeof hex === "string" ? /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) : null;
  if (!m) return "a new colour";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return COLOURS.reduce((best, c) => ((c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2 < (best[1] - r) ** 2 + (best[2] - g) ** 2 + (best[3] - b) ** 2 ? c : best))[0];
}
const SAID: Record<string, (v: unknown) => string> = {
  style: (v) => `${v} caption style`,
  position: (v) => (v === "middle" ? "captions in the middle" : `captions at the ${v}`),
  size: (v) => `captions ${v} times the usual size`,
  wordsPerCaption: (v) => `${v} ${v === 1 ? "word" : "words"} at a time`,
  baseColor: (v) => `${colourName(v)} captions`,
  activeColor: (v) => `the spoken word in ${colourName(v)}`,
  uppercase: (v) => (v ? "captions in capitals" : "captions not in capitals"),
  captions: (v) => (v ? "captions on" : "captions off"),
  hook: (v) => (v ? `the hook "${v}"` : "no hook"),
  hookSeconds: (v) => `the hook for ${v} seconds`,
  removeFillers: (v) => (v ? "ums and uhs cut" : "ums and uhs kept"),
  maxPause: (v) => (v ? `pauses cut to ${v} seconds` : "every pause kept"),
  trimStart: (v) => `${v} seconds cut from the start`,
  trimEnd: (v) => `${v} seconds cut from the end`,
  aspect: (v) => (v === "original" ? "the video's own shape" : `a ${v} frame`),
  fit: (v) => (v === "blur" ? "the whole video over a blurred copy" : v === "framed" ? "the video in a frame" : "cropped to fill the frame"),
  focusX: () => "the crop moved",
  nameTag: (v) => (v ? `the name tag "${v}"` : "no name tag"),
  roleTag: (v) => (v ? `the role line "${v}"` : "no role line"),
};
/**
 * A video edit's changed settings in words for the agent's card (replay D14: it showed "position: top, size: 1.3, base
 * color: #FFD92B"): "Captions at the top, captions 1.3 times the usual size, yellow captions".
 */
export function settingWords(keys: string[], settings: Record<string, unknown>): string {
  const line = keys
    .map((k) => {
      const v = settings[k];
      if (SAID[k]) return SAID[k](v);
      const name = k.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
      return `${name} ${v === true ? "on" : v === false ? "off" : typeof v === "object" ? "changed" : String(v)}`;
    })
    .join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
