// Slideshow campaigns (Volume's, folded in): the post formula a campaign keeps, when it next posts, which hook and
// pictures a run takes, and the writer's prompt and answer. Pure: the slide-campaigns function does the I/O.

import { CAMPAIGN_FONTS, DEFAULT_STYLE, LOOK_MIX, type Overlay, type SlideFormat, type TextStyle } from "./slideStyle.ts";

export type Role = "hook" | "content" | "cta";
export interface CampaignSpec {
  format: SlideFormat;
  topic: string;
  /** One is picked at random each run, so a few weeks show which angle lands. */
  hooks: string[];
  content: { slides: number; style: "plain" | "numbered" | "steps"; length: "short" | "medium" | "long"; tone: "plain" | "punchy" | "expert" | "warm" };
  cta: { text: string; badge: boolean; placement: "end" | "none" };
  /** A library id per slide role; a run draws a fresh picture from it. */
  images: Record<Role, string | null> & { per_slide: boolean };
  text_style: Record<Role, TextStyle>;
  look: string;
  look_strength: number;
  overlay: Overlay;
}
export interface Schedule {
  /** IANA zone the times are in. */
  tz: string;
  /** "HH:MM" and the weekdays (0 Sunday to 6 Saturday) it posts at that time. */
  times: { at: string; days: number[] }[];
}
export interface Publish {
  /** direct: straight to the profile; inbox: to the account's TikTok drafts to finish in the app. */
  mode: "direct" | "inbox";
  auto_music: boolean;
  ai_label: boolean;
}

export const MAX_HOOKS = 30;
export const MAX_SLIDES = 10;
export const MAX_TIMES = 6;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeStyle(raw: unknown): TextStyle {
  const r = obj(raw) ? raw : {};
  return {
    v: pick(r.v, ["top", "middle", "bottom"] as const, DEFAULT_STYLE.v),
    h: pick(r.h, ["left", "center", "right"] as const, DEFAULT_STYLE.h),
    size: pick(r.size, ["sm", "md", "lg"] as const, DEFAULT_STYLE.size),
    font: pick(r.font, CAMPAIGN_FONTS, DEFAULT_STYLE.font),
    italic: r.italic === true,
    caps: r.caps === true,
    bg: pick(r.bg, ["none", "bar", "soft", "outline", "snap"] as const, DEFAULT_STYLE.bg),
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : DEFAULT_STYLE.color,
  };
}

export function sanitizeSpec(raw: unknown): CampaignSpec {
  const r = obj(raw) ? raw : {};
  const c = obj(r.content) ? r.content : {};
  const cta = obj(r.cta) ? r.cta : {};
  const im = obj(r.images) ? r.images : {};
  const ts = obj(r.text_style) ? r.text_style : {};
  const ov = obj(r.overlay) ? r.overlay : {};
  const lib = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  const hooks = (Array.isArray(r.hooks) ? r.hooks : []).map((h) => str(h, 200)).filter(Boolean);
  return {
    format: pick(r.format, ["tiktok", "instagram"] as const, "tiktok"),
    topic: str(r.topic, 1200),
    hooks: [...new Set(hooks)].slice(0, MAX_HOOKS),
    content: {
      slides: num(c.slides, 5, 1, MAX_SLIDES),
      style: pick(c.style, ["plain", "numbered", "steps"] as const, "plain"),
      length: pick(c.length, ["short", "medium", "long"] as const, "medium"),
      tone: pick(c.tone, ["plain", "punchy", "expert", "warm"] as const, "plain"),
    },
    cta: { text: str(cta.text, 200), badge: cta.badge === true, placement: pick(cta.placement, ["end", "none"] as const, "end") },
    images: { hook: lib(im.hook), content: lib(im.content), cta: lib(im.cta), per_slide: im.per_slide !== false },
    text_style: { hook: sanitizeStyle(ts.hook), content: sanitizeStyle(ts.content), cta: sanitizeStyle(ts.cta) },
    look: typeof r.look === "string" && r.look in LOOK_MIX ? r.look : "none",
    look_strength: num(r.look_strength, 50, 0, 100),
    overlay: { kind: pick(ov.kind, ["none", "dim", "bottom", "top"] as const, "dim"), strength: num(ov.strength, 35, 0, 100) },
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function sanitizeSchedule(raw: unknown): Schedule {
  const r = obj(raw) ? raw : {};
  let tz = typeof r.tz === "string" ? r.tz : "Asia/Singapore";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "Asia/Singapore";
  }
  const times = (Array.isArray(r.times) ? r.times : [])
    .filter(obj)
    .map((t) => ({ at: typeof t.at === "string" && HHMM.test(t.at) ? t.at : "", days: [...new Set((Array.isArray(t.days) ? t.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() as number[] }))
    .filter((t) => t.at && t.days.length)
    .slice(0, MAX_TIMES);
  return { tz, times };
}
export const sanitizePublish = (raw: unknown): Publish => {
  const r = obj(raw) ? raw : {};
  return { mode: pick(r.mode, ["direct", "inbox"] as const, "inbox"), auto_music: r.auto_music !== false, ai_label: r.ai_label === true };
};

/** The wall-clock parts of an instant in a zone. */
function partsIn(t: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
/** The instant a wall-clock time in a zone falls on (DST-safe to the minute by correcting the offset twice). */
function instantOf(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(t), tz);
    t -= Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Date.UTC(y, m - 1, d, hh, mm);
  }
  return new Date(t);
}
/** The first posting time strictly after `after`, or null when the schedule has none. */
export function nextRunAt(s: Schedule, after: Date): Date | null {
  if (!s.times.length) return null;
  const today = partsIn(after, s.tz);
  let best: Date | null = null;
  for (let add = 0; add <= 7; add++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + add));
    const wd = day.getUTCDay();
    for (const t of s.times) {
      if (!t.days.includes(wd)) continue;
      const [hh, mm] = t.at.split(":").map(Number);
      const at = instantOf(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, s.tz);
      if (at > after && (!best || at < best)) best = at;
    }
    if (best) return best;
  }
  return best;
}
/** How many posts a schedule makes in a week, for the "N / week" line. */
export const postsPerWeek = (s: Schedule) => s.times.reduce((n, t) => n + t.days.length, 0);

/** A hook at random, avoiding the one used last time when there is a choice. */
export function pickHook(hooks: string[], last: string | null, rand = Math.random): string | null {
  const pool = hooks.length > 1 ? hooks.filter((h) => h !== last) : hooks;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
}
/** `n` pictures from a library, all different while it has enough, else repeating; one picture n times when !perSlide. */
export function pickImages(pool: string[], n: number, perSlide: boolean, rand = Math.random): string[] {
  if (!pool.length || n <= 0) return [];
  if (!perSlide) return Array(n).fill(pool[Math.floor(rand() * pool.length)]);
  const out: string[] = [];
  let bag: string[] = [];
  while (out.length < n) {
    if (!bag.length) bag = [...pool].sort(() => rand() - 0.5);
    out.push(bag.pop()!);
  }
  return out;
}

const LENGTH: Record<CampaignSpec["content"]["length"], string> = { short: "5 to 7 words", medium: "10 to 12 words", long: "15 to 20 words" };
const TONE: Record<CampaignSpec["content"]["tone"], string> = {
  plain: "plain and clear",
  punchy: "punchy, short sentences, strong verbs",
  expert: "expert and specific, like someone who does this every day",
  warm: "warm and encouraging",
};
const STYLE: Record<CampaignSpec["content"]["style"], string> = {
  plain: "Each slide is one point, with no numbering.",
  numbered: "Number the points 1, 2, 3 at the start of each slide.",
  steps: "Write them as steps in order, starting each with 'Step 1:', 'Step 2:' and so on.",
};

/** The writer's instructions for one run. `brief` is what the brand does and for whom; `honest` the house honesty rule. */
export function writerPrompt(spec: CampaignSpec, hook: string, brief: string, honest: string): { system: string; user: string } {
  const n = spec.content.slides;
  const system = [
    "You write TikTok and Instagram photo slideshows. The first slide (the hook) is given. You write the slides after it, then the caption.",
    `Write exactly ${n} content slides. ${STYLE[spec.content.style]} Each slide is ${LENGTH[spec.content.length]}. Tone: ${TONE[spec.content.tone]}.`,
    "Deliver what the hook promises: if it names a number, the slides are those items, in that count when it matches.",
    "Use real, checkable specifics and numbers where they help; no filler, no hashtags or emoji on slides.",
    honest,
    spec.cta.placement === "end"
      ? spec.cta.text
        ? `The last slide is the call to action, given as: ${JSON.stringify(spec.cta.text)}. Return it as cta, tightened only if it runs over 14 words.`
        : "Then write a short call to action for the last slide, pointing to the brand naturally (no hard sell), under 12 words, as cta."
      : 'There is no call-to-action slide: return cta as "".',
    "The caption is 1 to 3 short sentences that add to the slides, then 3 to 5 relevant hashtags.",
    'Answer as JSON only: {"slides": string[], "cta": string, "caption": string}.',
  ].join("\n");
  const user = [`About the brand: ${brief || "a solo professional"}`, `What the posts are about: ${spec.topic || "useful, practical advice for the brand's audience"}`, `Hook (slide 1): ${hook}`].join("\n");
  return { system, user };
}

/** The writer's answer, checked: the right number of non-empty slides, or null to try again. */
export function parseWriter(raw: string, spec: CampaignSpec): { slides: string[]; cta: string; caption: string } | null {
  let j: unknown;
  try {
    j = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    return null;
  }
  if (!obj(j) || !Array.isArray(j.slides)) return null;
  const slides = j.slides.map((s) => (typeof s === "string" ? s.trim().slice(0, 300) : "")).filter(Boolean);
  if (slides.length < spec.content.slides) return null;
  const cta = spec.cta.placement === "end" ? str(j.cta, 200) || spec.cta.text : "";
  return { slides: slides.slice(0, spec.content.slides), cta, caption: str(j.caption, 2200) };
}

/** The slides of a run in order, each with its role and the library its picture comes from. */
export function runPlan(spec: CampaignSpec, hook: string, w: { slides: string[]; cta: string }): { role: Role; text: string }[] {
  return [{ role: "hook" as const, text: hook }, ...w.slides.map((text) => ({ role: "content" as const, text })), ...(spec.cta.placement === "end" && w.cta ? [{ role: "cta" as const, text: w.cta }] : [])];
}
