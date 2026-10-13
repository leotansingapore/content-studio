// What the calendar tells a planner at a glance: which business runs out of planned posts soon,
// how this week looks, and which hand-posted reels are due. Pure, so the rules are tested
// (calendarCoverage.test.ts); CalendarPage feeds it whatever is visible under its filters.
import { addDays } from "@/lib/dueDates";

/** One thing on the calendar, reduced to what coverage needs. */
export interface DatedItem {
  business: string;
  date: string; // YYYY-MM-DD
  done: boolean; // already posted
}

/** How far ahead a business counts as covered. Two weeks matches the team-post and feed planning rhythm. */
export const COVER_DAYS = 14;

export interface RunOut {
  business: string;
  /** The last day something is planned, or null when nothing is planned from today on. */
  last: string | null;
}

/**
 * Businesses whose planned posts stop inside the next COVER_DAYS days (or never start), in the order given.
 * A business with something planned on or after today + COVER_DAYS is covered and left out.
 */
export function runsOut(items: DatedItem[], businesses: string[], today: string, days = COVER_DAYS): RunOut[] {
  const horizon = addDays(today, days);
  const last = new Map<string, string>();
  for (const it of items) {
    if (it.done || it.date < today) continue;
    const cur = last.get(it.business);
    if (!cur || it.date > cur) last.set(it.business, it.date);
  }
  const out: RunOut[] = [];
  for (const b of businesses) {
    const l = last.get(b) ?? null;
    if (l === null || l < horizon) out.push({ business: b, last: l });
  }
  return out;
}

export interface WeekGlance {
  /** Planned for today or later this week. */
  going: number;
  /** Already posted this week. */
  posted: number;
  /** Days from today to the end of the week with nothing on them. */
  emptyDays: string[];
}

/** The Mon-Sun week holding `today`, given as its 7 day keys. */
export function weekGlance(items: DatedItem[], week: string[], today: string): WeekGlance {
  const inWeek = items.filter((i) => i.date >= week[0] && i.date <= week[6]);
  const busy = new Set(inWeek.map((i) => i.date));
  return {
    going: inWeek.filter((i) => !i.done && i.date >= today).length,
    posted: inWeek.filter((i) => i.done).length,
    emptyDays: week.filter((d) => d >= today && !busy.has(d)),
  };
}

export interface HandReel {
  id: string;
  title: string;
  date: string;
  posted: boolean;
  auto: boolean; // its brand posts to Instagram by itself
}

/** Reels that nobody will post unless Leo does: brand not connected, day today or past, not posted yet. */
export function dueByHand<T extends HandReel>(reels: T[], today: string): T[] {
  return reels.filter((r) => !r.auto && !r.posted && r.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}
