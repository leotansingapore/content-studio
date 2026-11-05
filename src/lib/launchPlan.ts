// Launch plan (/launch, Strategy): the steps, dates and maker links live in supabase/functions/_shared/launchSteps.ts
// (shared with Claude's get_launch_plan); this keeps one plan a brand under content-studio-launchplan- (cloudSync
// mirrors it).

import { scoped } from "@/lib/profiles";
import { cleanLink, isDay, MAX_THING, STEPS, type LaunchPlan } from "../../supabase/functions/_shared/launchSteps.ts";

export * from "../../supabase/functions/_shared/launchSteps.ts";

const key = (userId: string) => `content-studio-launchplan-${scoped(userId)}`;

export function loadLaunch(userId: string): LaunchPlan | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Partial<LaunchPlan> | null;
    if (!raw || typeof raw !== "object" || !isDay(raw.date) || typeof raw.thing !== "string") return null;
    const ids = new Set(STEPS.map((s) => s.id));
    return {
      thing: raw.thing.trim().slice(0, MAX_THING),
      date: raw.date,
      link: typeof raw.link === "string" ? cleanLink(raw.link) : "",
      done: Array.isArray(raw.done) ? [...new Set(raw.done.filter((d): d is string => typeof d === "string" && ids.has(d)))] : [],
    };
  } catch {
    return null;
  }
}

export function saveLaunch(userId: string, plan: LaunchPlan | null): void {
  try {
    if (plan) localStorage.setItem(key(userId), JSON.stringify(plan));
    else localStorage.removeItem(key(userId));
  } catch {
    // storage full or blocked: kept while the page stays open
  }
}
