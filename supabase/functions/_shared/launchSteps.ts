// Launch plan (/launch, Strategy): a month of posts counting back from a launch date, each one opening the maker
// that makes it, with what to say already filled in. BuilderCult's Launch plan ("your month as a calendar, every post
// linked to its maker", folded in with its owner's agreement, Leo 6 Nov 2026); the order follows north-star card
// plan-launch-countdown: why you are making it, the problem, a first look, the list hears first, launch day.
// No AI here: the sequence is fixed and the makers write the posts. Pure (no imports, no Deno globals), so the app
// (src/lib/launchPlan.ts, which keeps the plan per brand) and Claude's get_launch_plan (content-studio-mcp) share it.

export type Maker = "write" | "hooks" | "slideshow" | "video";
export type WriteFormat = "short-video" | "carousel" | "text-post" | "story";
export type Funnel = "attraction" | "trust" | "conversion";

export interface LaunchStep {
  id: string;
  /** Days from the launch date: negative before it, 0 on the day. */
  offset: number;
  stage: string;
  /** What the post is about; {thing} is what launches. */
  brief: string;
  maker: Maker;
  format?: WriteFormat;
  funnel: Funnel;
  /** Ends by sending people to the plan's link, when there is one. */
  withLink?: boolean;
}

export const STEPS: LaunchStep[] = [
  { id: "why", offset: -27, stage: "Why you're making it", brief: "why I'm making {thing}, and the moment that started it", maker: "write", format: "short-video", funnel: "attraction" },
  { id: "problem", offset: -24, stage: "The problem it fixes", brief: "the problem {thing} fixes, in the words people use for it", maker: "hooks", funnel: "attraction" },
  { id: "today", offset: -20, stage: "What people try today", brief: "what people try today instead of {thing}, and where it falls short", maker: "write", format: "carousel", funnel: "trust" },
  { id: "day", offset: -17, stage: "A day with the problem", brief: "a day with the problem {thing} fixes", maker: "slideshow", funnel: "attraction" },
  { id: "first-look", offset: -13, stage: "First look", brief: "a first look at {thing}: one screen or one result", maker: "video", funnel: "trust" },
  { id: "build", offset: -10, stage: "Behind the build", brief: "what changed in {thing} after the first people tried it", maker: "write", format: "text-post", funnel: "trust" },
  { id: "list", offset: -6, stage: "The list hears first", brief: "the people on the early list hear first when {thing} opens", maker: "write", format: "short-video", funnel: "conversion", withLink: true },
  { id: "three-days", offset: -3, stage: "Three days to go", brief: "what you get on day one of {thing}", maker: "slideshow", funnel: "conversion" },
  { id: "tomorrow", offset: -1, stage: "Tomorrow", brief: "{thing} opens tomorrow", maker: "write", format: "story", funnel: "conversion", withLink: true },
  { id: "live", offset: 0, stage: "Launch day", brief: "{thing} is live today", maker: "write", format: "short-video", funnel: "conversion", withLink: true },
  { id: "reactions", offset: 2, stage: "First reactions", brief: "what the first people said and asked about {thing}", maker: "write", format: "text-post", funnel: "trust" },
  { id: "start", offset: 5, stage: "How to start", brief: "how to get started with {thing}, step by step", maker: "write", format: "carousel", funnel: "conversion", withLink: true },
];

export const MAKER_LABEL: Record<Maker, string> = { write: "Write", hooks: "Hooks", slideshow: "Slideshow", video: "Hook plus demo" };
const FORMAT_LABEL: Record<WriteFormat, string> = { "short-video": "short video", carousel: "carousel", "text-post": "post", story: "story" };
export const makerLabel = (s: LaunchStep) => (s.maker === "write" && s.format ? `Write a ${FORMAT_LABEL[s.format]}` : MAKER_LABEL[s.maker]);

export interface LaunchPlan {
  /** What launches, at most MAX_THING. */
  thing: string;
  /** The launch date, YYYY-MM-DD. */
  date: string;
  /** Where the launch posts send people: an http(s) address, or "". */
  link: string;
  /** Step ids marked made. */
  done: string[];
}
export const MAX_THING = 80;
const MAX_LINK = 500;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isDay = (d: unknown): d is string => typeof d === "string" && ISO_DAY.test(d) && !Number.isNaN(dayMs(d));
/** YYYY-MM-DD in the person's own time zone. */
export const localDay = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export const addDays = (d: string, n: number) => new Date(dayMs(d) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / 86_400_000);

/** An http(s) address as typed, or "" for anything else (a bare domain gets https://). */
export function cleanLink(raw: string): string {
  const s = raw.trim().slice(0, MAX_LINK);
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.toString() : "";
  } catch {
    return "";
  }
}

export const stepDate = (plan: Pick<LaunchPlan, "date">, s: LaunchStep) => addDays(plan.date, s.offset);

/** The post's brief with what launches filled in, and the link to send people to when the step ends on it. */
export function briefFor(plan: LaunchPlan, s: LaunchStep): string {
  const text = s.brief.replace("{thing}", plan.thing.trim() || "it");
  const said = text[0].toUpperCase() + text.slice(1);
  return s.withLink && plan.link ? `${said}. End by sending people to ${plan.link}` : said;
}

/** The maker that makes the step, opened with its words: Write (topic, format, funnel), Hooks, Slideshow, or hook plus demo. */
export function makerUrl(plan: LaunchPlan, s: LaunchStep): string {
  const brief = briefFor(plan, s);
  if (s.maker === "hooks") return `/hooks?${new URLSearchParams({ topic: brief.slice(0, 300) })}`;
  if (s.maker === "slideshow") return `/make/slideshow?${new URLSearchParams({ from: "topic", topic: brief.slice(0, 200) })}`;
  // the first look: a hook, then the demo (hook plus demo's topic= is "what it shows")
  if (s.maker === "video") return `/make/hook-demo?${new URLSearchParams({ topic: brief.slice(0, 200) })}`;
  return `/generate?${new URLSearchParams({ ctx: brief, format: s.format ?? "text-post", funnel: s.funnel })}`;
}

export type StepState = "done" | "past" | "today" | "next" | "later";
/** Done, missed (its day has gone), due today, the next one to make, or later. */
export function stepStates(plan: LaunchPlan, today: string): Record<string, StepState> {
  const out: Record<string, StepState> = {};
  let nextSet = false;
  for (const s of STEPS) {
    const d = stepDate(plan, s);
    if (plan.done.includes(s.id)) out[s.id] = "done";
    else if (d < today) out[s.id] = "past";
    else if (!nextSet) {
      out[s.id] = d === today ? "today" : "next";
      nextSet = true;
    } else out[s.id] = d === today ? "today" : "later";
  }
  return out;
}

/** The weeks the plan shows its posts under. */
export function groupOf(s: LaunchStep): string {
  if (s.offset > 0) return "After launch";
  if (s.offset === 0) return "Launch day";
  if (s.offset > -7) return "Launch week";
  return `${Math.ceil(-s.offset / 7)} weeks out`;
}

