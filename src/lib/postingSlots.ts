// The adviser's weekly posting times (Brand kit slots, "<day 0 = Mon>T<HH:MM>") laid onto real days:
// which slots are still open, and a starting set of slots from a posts-per-week goal. Pure, so the
// calendar, Upcoming and the goal picker share one tested rule (postingSlots.test.ts).
import { addDays, keyToDate, localDateKey } from "@/lib/dueDates";

const SLOT_RE = /^([0-6])T(([01]\d|2[0-3]):[0-5]\d)$/;

/** Monday-first weekday of a day key: 0 = Mon ... 6 = Sun (the slot format's numbering). */
export const monFirst = (day: string) => (keyToDate(day).getDay() + 6) % 7;

/** The slot times ("HH:MM") that fall on this day, earliest first. */
export function slotsOn(slots: string[], day: string): string[] {
  const wd = monFirst(day);
  return slots
    .map((s) => SLOT_RE.exec(s))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) === wd)
    .map((m) => m[2])
    .sort();
}

export interface OpenSlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

/**
 * Slots from `now` for `days` days that no scheduled post holds. A post at a slot's exact day and time
 * takes it; a post scheduled for a day with no time takes that day's earliest open slot. Slots already
 * past (today, earlier than now) are left out.
 */
export function openSlots(slots: string[], scheduledFor: string[], now: Date, days: number): OpenSlot[] {
  if (!slots.length) return [];
  const today = localDateKey(now);
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const exact = new Set(scheduledFor.filter((s) => s.length > 10));
  const dayOnly = new Map<string, number>();
  for (const s of scheduledFor) if (s.length === 10) dayOnly.set(s, (dayOnly.get(s) ?? 0) + 1);
  const out: OpenSlot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    let free = slotsOn(slots, date).filter((t) => !exact.has(`${date}T${t}`));
    free = free.slice(dayOnly.get(date) ?? 0);
    for (const time of free) if (date > today || time > nowHm) out.push({ date, time });
  }
  return out;
}

/** Weekdays (0 = Mon) for 1 to 7 posts a week, spread so posts never bunch up. */
export const GOAL_DAYS: Record<number, number[]> = {
  1: [1],
  2: [1, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/** Slots for a weekly goal: the goal's spread of weekdays, each at `timeFor(weekday)` ("HH:MM"). */
export function slotsForGoal(goal: number, timeFor: (weekday: number) => string): string[] {
  const days = GOAL_DAYS[Math.min(7, Math.max(1, Math.round(goal)))];
  return days.map((d) => `${d}T${timeFor(d)}`).filter((s) => SLOT_RE.test(s));
}

/** "Mon, Wed, Fri" for a set of slots, in week order, each weekday once. */
export function slotDaysLabel(slots: string[]): string {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...new Set(slots.map((s) => SLOT_RE.exec(s)?.[1]).filter(Boolean).map(Number))].sort();
  return days.map((d) => names[d]).join(", ");
}
