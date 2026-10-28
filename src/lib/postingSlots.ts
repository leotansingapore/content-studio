// The adviser's weekly posting times (Brand kit slots, "<day 0 = Mon>T<HH:MM>") laid onto real days:
// which slots are still open, and a starting set of slots from a posts-per-week goal. Pure, so the
// calendar, Upcoming and the goal picker share one tested rule (postingSlots.test.ts).
import { addDays, keyToDate, localDateKey, scheduleTime } from "@/lib/dueDates";
import type { DraftEntry } from "@/lib/draftHistory";

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
  const exact = new Set(scheduledFor.filter((s) => scheduleTime(s)));
  const dayOnly = new Map<string, number>();
  // the board's older full ISO timestamps count as the day alone, as everywhere else (scheduleTime)
  for (const s of scheduledFor) if (!scheduleTime(s)) dayOnly.set(s.slice(0, 10), (dayOnly.get(s.slice(0, 10)) ?? 0) + 1);
  const out: OpenSlot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    let free = slotsOn(slots, date).filter((t) => !exact.has(`${date}T${t}`));
    free = free.slice(dayOnly.get(date) ?? 0);
    for (const time of free) if (date > today || time > nowHm) out.push({ date, time });
  }
  return out;
}

/** A brand kit's posting times: shared, and per network once "Same times on every network" is unticked (publish-queue). */
export interface SlotBrand {
  slots?: string[];
  slotsBy?: Partial<Record<string, string[]>>;
}

type Held = Pick<DraftEntry, "platform" | "scheduledFor">;

const perNetwork = (b: SlotBrand | null | undefined) => !!b?.slotsBy && Object.keys(b.slotsBy).length > 0;

/** The times a network posts at: its own row with per-network times on, else the shared ones. */
export const slotTimesFor = (b: SlotBrand | null | undefined, platform: string): string[] => (perNetwork(b) && b!.slotsBy![platform]) || b?.slots || [];

/**
 * The open slots for a post on this network, each at least 2 hours away. With per-network times on only posts on
 * the same network hold a slot; with shared times every post does, so it is today's openSlots.
 */
export function nextOpenSlots(brand: SlotBrand | null | undefined, platform: string, scheduled: Held[], now: Date, days: number): OpenSlot[] {
  const held = scheduled.filter((s) => s.scheduledFor && (!perNetwork(brand) || s.platform === platform)).map((s) => s.scheduledFor!);
  const earliest = now.getTime() + 2 * 3_600_000;
  // "YYYY-MM-DDTHH:MM" with no offset reads as local time, as the slots are
  return openSlots(slotTimesFor(brand, platform), held, now, days).filter((o) => Date.parse(`${o.date}T${o.time}`) >= earliest);
}

/**
 * Unscheduled drafts into open slots: oldest first, each into its network's next open slot, never two in one.
 * `left` lists the drafts no slot in `days` took. It sets times only; nothing goes to Zernio.
 */
export function fillSlots(drafts: Pick<DraftEntry, "id" | "createdAt" | "platform">[], brand: SlotBrand | null | undefined, scheduled: Held[], now: Date, days = 14) {
  const held = [...scheduled];
  const placed: { draftId: string; at: string }[] = [];
  const left: { draftId: string; platform: string }[] = [];
  for (const d of [...drafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const slot = nextOpenSlots(brand, d.platform, held, now, days)[0];
    if (!slot) {
      left.push({ draftId: d.id, platform: d.platform });
      continue;
    }
    const at = `${slot.date}T${slot.time}`;
    placed.push({ draftId: d.id, at });
    held.push({ platform: d.platform, scheduledFor: at });
  }
  return { placed, left };
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

/** Weekdays (0 = Mon) for the Brand kit's one-step presets. */
export const DAY_SETS = { everyDay: [0, 1, 2, 3, 4, 5, 6], weekdays: [0, 1, 2, 3, 4], weekends: [5, 6] } as const;

/**
 * Adds `time` on each of `days` to the slots, without repeats, in week order, up to `max` (the Brand kit
 * keeps 14). `skipped` counts the times left out because the list was full.
 */
export function addSlots(existing: string[], days: readonly number[], time: string, max = 14): { slots: string[]; skipped: number } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { slots: existing, skipped: 0 };
  const set = new Set(existing);
  let skipped = 0;
  for (const d of days) {
    const s = `${d}T${time}`;
    if (set.has(s)) continue;
    if (set.size >= max) skipped++;
    else set.add(s);
  }
  return { slots: [...set].sort(), skipped };
}

// A brand with no posting times for the network posts a series on Tuesdays and Fridays at 09:00.
const SERIES_FALLBACK: SlotBrand = { slots: ["1T09:00", "4T09:00"] };

/**
 * A series (Starter Story: Jenni AI re-posted one winning video twice a week, only its opening changed): `n` posts on
 * this network, each in its next open slot and at least `gap` days after the day before it, so about twice a week.
 * Returns the "YYYY-MM-DDTHH:MM" times it found, fewer than `n` when 70 days run out. Times only; nothing goes to Zernio.
 */
export function seriesSlots(n: number, brand: SlotBrand | null | undefined, platform: string, scheduled: Held[], now: Date, gap = 3): string[] {
  const b = slotTimesFor(brand, platform).length ? brand : SERIES_FALLBACK;
  const held = [...scheduled];
  const out: string[] = [];
  let from = "";
  for (let i = 0; i < n; i++) {
    const slot = nextOpenSlots(b, platform, held, now, 70).find((o) => o.date >= from);
    if (!slot) break;
    const at = `${slot.date}T${slot.time}`;
    out.push(at);
    held.push({ platform, scheduledFor: at });
    from = addDays(slot.date, gap);
  }
  return out;
}
