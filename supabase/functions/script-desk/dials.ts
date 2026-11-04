// The script desk's lengths and dials: labels, defaults and levels only, with no imports and no prompt text, so the
// app can draw the Scriptwriter's panel from the same numbers the server files (src/lib/scriptDesk.ts). What each
// level says to the model is in the worker's private templates on Leo's Mac, never in this repo.

/** The system prompt's words at about 170 a minute. */
export const WORDS: Record<number, [number, number]> = { 30: [80, 90], 45: [120, 130], 60: [160, 175], 75: [200, 215], 90: [240, 260] };
export const SECONDS = [30, 45, 60, 75, 90] as const;

/** Research's length chips: a band of two lengths (60 to 75 s is the default, 160 to 215 words). */
export type Band = readonly [number, number];
export const DEFAULT_BAND: Band = [60, 75];
export const BANDS: readonly Band[] = [[30, 45], [45, 60], [60, 75], [75, 90]];
export const cleanBand = (raw: unknown): Band => BANDS.find((b) => Array.isArray(raw) && b[0] === raw[0] && b[1] === raw[1]) ?? DEFAULT_BAND;

export type DialId = "avatar" | "template" | "hook" | "contrarian" | "story" | "tactics" | "proof" | "personal" | "product" | "humor" | "cta";
export type Level = "Off" | "Light" | "Medium" | "Strong" | "Max";

/** The dial's word label under the gauge. Captured at 0 (Off), 20 (Light), 40 and 50 (Medium), 60 and 70 (Strong). */
export function levelOf(v: number): Level {
  if (v <= 0) return "Off";
  if (v <= 30) return "Light";
  if (v <= 55) return "Medium";
  if (v <= 85) return "Strong";
  return "Max";
}

/** The 11 dials after Script length, in order, with their defaults. */
export const DIAL_META: { id: DialId; label: string; value: number }[] = [
  { id: "avatar", label: "Avatar use", value: 70 },
  { id: "template", label: "Template match", value: 60 },
  { id: "hook", label: "Hook strength", value: 70 },
  { id: "contrarian", label: "Contrarian", value: 50 },
  { id: "story", label: "Story", value: 40 },
  { id: "tactics", label: "Tactics", value: 60 },
  { id: "proof", label: "Proof & numbers", value: 50 },
  { id: "personal", label: "Personal", value: 40 },
  { id: "product", label: "Product", value: 20 },
  { id: "humor", label: "Humor", value: 20 },
  { id: "cta", label: "Call to action", value: 0 },
];

export const DEFAULT_LENGTH = 60;
export type Dials = Record<DialId, number>;
export const DEFAULT_DIALS = Object.fromEntries(DIAL_META.map((d) => [d.id, d.value])) as Dials;

/** Each dial a whole number from 0 to 100 (a missing or broken one is its default); the length one of SECONDS. */
export function cleanDials(raw: unknown): { dials: Dials; length: number } {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dials = { ...DEFAULT_DIALS };
  for (const d of DIAL_META) {
    const v = r[d.id];
    if (typeof v === "number" && Number.isFinite(v)) dials[d.id] = Math.max(0, Math.min(100, Math.round(v)));
  }
  const length = SECONDS.find((x) => x === r.length) ?? DEFAULT_LENGTH;
  return { dials, length };
}
