// The tour the agent leads (north star agent-tour, Leo only) and the studio tour everyone else gets: six pages, one
// popover. Its state lives on this device (cs-tour-<uid>), outside React, so it survives page changes, remounts, reloads
// and brand switches. Nothing here is synced, sent or paid. A later page that joins a tour edits its list in the same
// commit; keep each at six or fewer.

import { markOnboarded } from "@/lib/onboarding";

export type TourStepId = "home" | "competitors" | "formats" | "campaigns" | "brand" | "agent" | "write" | "calendar" | "swipe" | "analytics";

export interface TourStep {
  id: TourStepId;
  path: string;
  page: string;
  text: string;
  /** a data-tour value on the page that gets a ring while the step shows */
  target?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "home", path: "/home", page: "Home", text: "Home shows what's coming up, where you left off, and your goal for the week." },
  {
    id: "competitors",
    path: "/competitors",
    page: "Competitors",
    text: "Competitors are the accounts you watch. Their ads and best posts arrive here every week, ready to remix.",
  },
  { id: "formats", path: "/make", page: "Formats", text: "Formats is every kind of post the AI can make, each with a preview and its price." },
  { id: "campaigns", path: "/campaigns", page: "Campaigns", text: "Campaigns turn a goal into a month of posts you review one at a time." },
  {
    id: "brand",
    path: "/brand",
    page: "Brand kit",
    text: "Brand kit is your name, colours, logo and sign-off. Every carousel, video and caption uses it.",
  },
  {
    id: "agent",
    path: "/agent",
    page: "Agent",
    text: "Last one: ask me here for a post, a remix or a video. Anything paid shows its price first, and nothing posts without you.",
    target: "agent-composer",
  },
];

/** Everyone else's tour: the pages a new sign-in uses first, all in their nav, none of them Leo-only. */
export const STUDIO_TOUR: readonly TourStep[] = [
  { id: "home", path: "/home", page: "Home", text: "Home is where each day starts: what's posting today, what's coming up and the set-up steps left." },
  {
    id: "write",
    path: "/generate",
    page: "Write a post",
    text: "Write a post in four steps: topic, funnel, idea and format. Every step has a default, so change only what matters to you.",
  },
  { id: "calendar", path: "/calendar", page: "Calendar", text: "Calendar shows what goes out and when. Pick 3, 5 or 7 posts a week to get your posting times." },
  {
    id: "swipe",
    path: "/swipe",
    page: "Top posts",
    text: "Top posts are real posts from Singapore finance creators that are working now. Remix any of them into your own.",
  },
  {
    id: "brand",
    path: "/brand",
    page: "Brand kit",
    text: "Brand kit is your name, colours, logo and sign-off. Every carousel, video and caption uses it.",
  },
  {
    id: "analytics",
    path: "/analytics",
    page: "Analytics",
    text: "Last one: Analytics audits your public Instagram or TikTok. LinkedIn and Facebook numbers you add by hand.",
  },
];

type Steps = readonly TourStep[];

export type TourStateName = "running" | "paused" | "done" | "skipped";
export interface TourRecord {
  step: TourStepId;
  state: TourStateName;
  at: string;
}

const STATES: readonly TourStateName[] = ["running", "paused", "done", "skipped"];
// a stored step from either tour reads back; which list it walks is the caller's
const isStep = (v: unknown, steps: Steps = [...TOUR_STEPS, ...STUDIO_TOUR]): v is TourStepId => steps.some((s) => s.id === v);

export const tourKey = (userId: string) => `cs-tour-${userId}`;

/** The step and its place, 1 to 6; no step and 0 for an id the list doesn't have. */
export function stepOf(id: TourStepId, steps: Steps = TOUR_STEPS): { step: TourStep; n: number } {
  const i = steps.findIndex((s) => s.id === id);
  return { step: steps[i], n: i + 1 };
}

// Storage that refuses a write (a full disk, a locked-down browser) keeps the tour for this visit.
const mem = new Map<string, TourRecord>();
const listeners = new Set<() => void>();
let focusNext = false;

function parse(raw: string): TourRecord | null {
  try {
    const r = JSON.parse(raw) as Partial<TourRecord> | null;
    return r && isStep(r.step) && STATES.includes(r.state as TourStateName) && typeof r.at === "string"
      ? { step: r.step, state: r.state as TourStateName, at: r.at }
      : null;
  } catch {
    return null;
  }
}

/** The tour on this device for this account, or null for none (a malformed value reads as none). */
export function tourState(userId: string): TourRecord | null {
  try {
    const raw = globalThis.localStorage?.getItem(tourKey(userId));
    if (raw != null) return parse(raw);
  } catch {
    // unreadable storage: the copy kept in memory
  }
  return mem.get(userId) ?? null;
}

function write(userId: string, step: TourStepId, state: TourStateName): TourRecord {
  const rec = { step, state, at: new Date().toISOString() };
  mem.set(userId, rec);
  try {
    globalThis.localStorage?.setItem(tourKey(userId), JSON.stringify(rec));
  } catch {
    // kept in memory above
  }
  listeners.forEach((fn) => fn());
  return rec;
}

export function onTour(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** True once after a press that shows the popover (start, Next, Resume): it then takes focus, never from typing. */
export function takeFocus(): boolean {
  const f = focusNext;
  focusNext = false;
  return f;
}

/** Starts at the named step whatever the state was; no id, "1" or an unknown one starts at step 1. */
export function startTour(userId: string, stepId?: string | null, steps: Steps = TOUR_STEPS): TourStep {
  const step = isStep(stepId, steps) ? stepOf(stepId, steps).step : steps[0];
  // a first-run account would otherwise be sent from /home back to /welcome; storage that refuses it still tours
  try {
    markOnboarded(userId);
  } catch {
    // the tour runs anyway
  }
  focusNext = true;
  write(userId, step.id, "running");
  return step;
}

/** The next step, now running; null when the step was the last, which finishes the tour. */
export function nextStep(userId: string, steps: Steps = TOUR_STEPS): TourStep | null {
  const rec = tourState(userId);
  if (!rec) return null;
  const next = steps[stepOf(rec.step, steps).n];
  if (!next) {
    finishTour(userId, steps);
    return null;
  }
  focusNext = true;
  write(userId, next.id, "running");
  return next;
}

export function pauseTour(userId: string): void {
  const rec = tourState(userId);
  if (rec && rec.state === "running") write(userId, rec.step, "paused");
}

/** Back to running at the same step; the caller goes to its page. */
export function resumeTour(userId: string, steps: Steps = TOUR_STEPS): TourStep | null {
  const rec = tourState(userId);
  if (!rec || (rec.state !== "running" && rec.state !== "paused")) return null;
  focusNext = true;
  write(userId, rec.step, "running");
  return stepOf(rec.step, steps).step ?? null;
}

export function skipTour(userId: string, steps: Steps = TOUR_STEPS): void {
  write(userId, tourState(userId)?.step ?? steps[0].id, "skipped");
}

export function finishTour(userId: string, steps: Steps = TOUR_STEPS): void {
  write(userId, tourState(userId)?.step ?? steps[steps.length - 1].id, "done");
}

/** The step whose page this is: exact paths (so /make/<format> and /campaigns/<id> are not), and /agent/<thread>. */
export function stepForPath(pathname: string, steps: Steps = TOUR_STEPS): TourStepId | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (/^\/agent\/[^/]+$/.test(p) && steps.some((s) => s.id === "agent")) return "agent";
  return steps.find((s) => s.path === p)?.id ?? null;
}

/** A ?tour= in the address: the step it starts (unknown values and "1" start at step 1) and the search without it. */
export function tourParam(search: string, steps: Steps = TOUR_STEPS): { step: TourStepId; search: string } | null {
  const q = new URLSearchParams(search);
  if (!q.has("tour")) return null;
  const v = q.get("tour");
  q.delete("tour");
  const rest = q.toString();
  return { step: isStep(v, steps) ? v : steps[0].id, search: rest ? `?${rest}` : "" };
}
