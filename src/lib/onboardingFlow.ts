import type { SlideFont } from "@/lib/carouselLayout";
import type { GoalKind, PlanAudience, PlanPlatform } from "@/lib/positioning";

export type Step = "site" | "work" | "reading" | "review";
export const STEPS: readonly Step[] = ["site", "work", "reading", "review"];

export type Section = "identity" | "look" | "voice" | "social" | "proof" | "pains";
export const SITE_SECTIONS: readonly Section[] = ["identity", "look", "voice", "social"];
export const APP_SECTIONS: readonly Section[] = [...SITE_SECTIONS, "proof", "pains"];

export const ADDRESS_ERROR = "Enter a web address like acme.sg, or an App Store link.";

export function webAddress(raw: string): URL | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.port || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63)) return null;
  if (!/^([a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(tld)) return null;
  if (!labels.slice(0, -1).every((l) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$|^xn--[a-z0-9-]+$/.test(l))) return null;
  return u;
}

export const hostOf = (raw: string): string => {
  const u = webAddress(raw);
  return u ? u.hostname.replace(/^www\./, "") : raw.trim();
};

export function progressOf(step: Step, done: number, total: number): number {
  if (step === "site") return 25;
  if (step === "work") return 50;
  if (step === "reading") return 62;
  return Math.round(75 + (25 * Math.min(done, total)) / Math.max(1, total));
}

export const scoreOf = (done: number, total: number): number => Math.round((100 * Math.min(done, total)) / Math.max(1, total));

export function nextSection(done: ReadonlySet<Section>, list: readonly Section[]): Section | null {
  return list.find((s) => !done.has(s)) ?? null;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function hexOf(raw: string | null | undefined): string | null {
  const m = (raw ?? "").trim().match(HEX);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function colourGap(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

export function distinctColours(list: readonly (string | null | undefined)[], max: number, gap = 60): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const h = hexOf(raw);
    if (!h || out.some((o) => colourGap(o, h) < gap)) continue;
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

export function readableInk(hex: string): "#FFFFFF" | "#111827" {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#FFFFFF";
}

const SERIF =
  /serif|playfair|merriweather|lora|garamond|baskerville|cormorant|fraunces|crimson|bodoni|didot|georgia|times|tiempos|canela|recoleta|larken|caslon|domine|spectral|literata|bitter|zilla|newsreader|prata|cardo|gelasio|marcellus|cinzel|abhaya|libre bask|freight|self modern|gt super|ogg|editorial/i;
export const isSerif = (family: string): boolean => SERIF.test(family) && !/sans/i.test(family);

export function slideFontFor(fonts: readonly string[] | undefined): SlideFont {
  const [first, second] = fonts ?? [];
  if (!first) return "modern";
  if (isSerif(first) && second && isSerif(second)) return "serif";
  return isSerif(first) || (second && isSerif(second)) ? "classic" : "modern";
}

export interface Answers {
  platform?: PlanPlatform;
  cadence?: number;
  goal?: GoalKind;
  audience?: PlanAudience;
}
type Option<T> = { label: string; value: T };
export type Question =
  | { key: "platform"; ask: string; options: Option<PlanPlatform>[] }
  | { key: "cadence"; ask: string; options: Option<number>[] }
  | { key: "goal"; ask: string; options: Option<GoalKind>[] }
  | { key: "audience"; ask: string; options: Option<PlanAudience>[] };

export const QUESTIONS: readonly Question[] = [
  {
    key: "platform",
    ask: "Where do you post most?",
    options: [
      { label: "Instagram", value: "instagram" },
      { label: "LinkedIn", value: "linkedin" },
      { label: "Facebook", value: "facebook" },
      { label: "TikTok", value: "tiktok" },
    ],
  },
  {
    key: "cadence",
    ask: "How often do you want to post?",
    options: [
      { label: "Once a week", value: 1 },
      { label: "3 times a week", value: 3 },
      { label: "5 times a week", value: 5 },
      { label: "Every day", value: 7 },
    ],
  },
  {
    key: "goal",
    ask: "What should your posts do for you?",
    options: [
      { label: "Bring in enquiries", value: "clients" },
      { label: "Grow an audience", value: "audience" },
      { label: "Keep customers coming back", value: "trust" },
      { label: "Find people to hire", value: "recruit" },
      { label: "Save me time", value: "time" },
    ],
  },
  {
    key: "audience",
    ask: "Who do you help most?",
    options: [
      { label: "Young adults", value: "young-adult" },
      { label: "Working adults", value: "working-adult" },
      { label: "Parents", value: "parent" },
      { label: "Pre-retirees", value: "pre-retiree" },
      { label: "Everyone", value: "general" },
    ],
  },
];

export function keptAnswers(raw: unknown): Answers {
  if (!raw || typeof raw !== "object") return {};
  const x = raw as Record<string, unknown>;
  const out: Answers = {};
  for (const q of QUESTIONS) {
    const v = x[q.key];
    const hit = (q.options as Option<unknown>[]).find((o) => o.value === v);
    if (hit) (out as Record<string, unknown>)[q.key] = hit.value;
  }
  return out;
}

export const firstOpenQuestion = (a: Answers): number => {
  const i = QUESTIONS.findIndex((q) => a[q.key] === undefined);
  return i < 0 ? QUESTIONS.length : i;
};

export const READ_STEPS = ["Opening your site", "Finding your logo", "Picking up your colours", "Learning how you sound", "Working out who you help", "Spotting your social accounts"] as const;

export function shownStep(elapsedMs: number, done: boolean, count: number, every = 2200): number {
  if (done) return count;
  return Math.min(count - 1, Math.floor(elapsedMs / every));
}

export const WORK_LINES: Record<string, string> = {
  "Financial adviser": "Protection, savings and retirement plans",
  Coach: "Programs that help people change",
  Consultant: "Advice and projects for businesses",
  "Real estate agent": "Homes to buy, sell and rent",
  Freelancer: "Your own services, client by client",
  Lawyer: "Legal advice and cases",
};

export function sectionTitle(s: Section, leo: boolean): string {
  switch (s) {
    case "identity":
      return "Name and logo";
    case "look":
      return leo ? "Colours and font" : "Brand colour";
    case "voice":
      return "Voice and audience";
    case "social":
      return "Social accounts";
    case "proof":
      return "From the App Store";
    case "pains":
      return "What users of apps like it complain about";
  }
}

export function confirmLabel(s: Section, last: boolean, name: string, leo = false): string {
  if (last) return `Create ${name.trim() || "brand"}`;
  switch (s) {
    case "identity":
      return "Confirm name and logo";
    case "look":
      return leo ? "Confirm colours and font" : "Confirm colour";
    case "voice":
      return "Confirm voice";
    case "social":
      return "Confirm accounts";
    default:
      return "Confirm";
  }
}

export function nextLine(next: Section | null, done: number, total: number, leo: boolean): string {
  if (!next) return "All set. Create your brand when you're ready.";
  return `Confirm ${sectionTitle(next, leo).toLowerCase()} to reach ${scoreOf(done + 1, total)}%`;
}
