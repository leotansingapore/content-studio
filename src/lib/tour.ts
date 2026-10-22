// The tour the agent leads (north star agent-tour, Leo only): six pages, one popover. Its state lives on this device
// (cs-tour-<uid>), outside React, so it survives page changes, remounts, reloads and brand switches. Nothing here is
// synced, sent or paid. A later page that joins the tour edits TOUR_STEPS in the same commit; keep it at six or fewer.

import { markOnboarded } from "@/lib/onboarding";

export type TourStepId = "home" | "competitors" | "formats" | "campaigns" | "brand" | "agent";

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

export type TourStateName = "running" | "paused" | "done" | "skipped";
export interface TourRecord {
  step: TourStepId;
  state: TourStateName;
  at: string;
}

const STATES: readonly TourStateName[] = ["running", "paused", "done", "skipped"];
const isStep = (v: unknown): v is TourStepId => TOUR_STEPS.some((s) => s.id === v);

export const tourKey = (userId: string) => `cs-tour-${userId}`;

/** The step and its place, 1 to 6. */
export function stepOf(id: TourStepId): { step: TourStep; n: number } {
  const i = TOUR_STEPS.findIndex((s) => s.id === id);
  return { step: TOUR_STEPS[i], n: i + 1 };
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
export function startTour(userId: string, stepId?: string | null): TourStep {
  const step = isStep(stepId) ? stepOf(stepId).step : TOUR_STEPS[0];
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
export function nextStep(userId: string): TourStep | null {
  const rec = tourState(userId);
  if (!rec) return null;
  const next = TOUR_STEPS[stepOf(rec.step).n];
  if (!next) {
    finishTour(userId);
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
export function resumeTour(userId: string): TourStep | null {
  const rec = tourState(userId);
  if (!rec || (rec.state !== "running" && rec.state !== "paused")) return null;
  focusNext = true;
  write(userId, rec.step, "running");
  return stepOf(rec.step).step;
}

export function skipTour(userId: string): void {
  write(userId, tourState(userId)?.step ?? TOUR_STEPS[0].id, "skipped");
}

export function finishTour(userId: string): void {
  write(userId, tourState(userId)?.step ?? TOUR_STEPS[TOUR_STEPS.length - 1].id, "done");
}

/** The step whose page this is: exact paths (so /make/<format> and /campaigns/<id> are not), and /agent/<thread>. */
export function stepForPath(pathname: string): TourStepId | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (/^\/agent\/[^/]+$/.test(p)) return "agent";
  return TOUR_STEPS.find((s) => s.path === p)?.id ?? null;
}

/** A ?tour= in the address: the step it starts (unknown values and "1" start at step 1) and the search without it. */
export function tourParam(search: string): { step: TourStepId; search: string } | null {
  const q = new URLSearchParams(search);
  if (!q.has("tour")) return null;
  const v = q.get("tour");
  q.delete("tour");
  const rest = q.toString();
  return { step: isStep(v) ? v : TOUR_STEPS[0].id, search: rest ? `?${rest}` : "" };
}
