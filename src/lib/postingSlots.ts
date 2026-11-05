// The adviser's weekly posting times (Brand kit slots, "<day 0 = Mon>T<HH:MM>") laid onto real days:
// which slots are still open, and a starting set of slots from a posts-per-week goal. Pure, so the
// calendar, Upcoming and the goal picker share one tested rule (postingSlots.test.ts).
import { addDays, keyToDate, localDateKey, scheduleTime } from "@/lib/dueDates";
import type { DraftEntry } from "@/lib/draftHistory";

const SLOT_RE = /^([0-6])T(([01]\d|2[0-3]):[0-5]\d)$/;

/** The most weekly posting times a brand keeps: 4 a day, every day. */
export const MAX_SLOTS = 28;

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
  const out: OpenSlot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    for (const time of openOn(slots, scheduledFor, date)) if (date > today || time > nowHm) out.push({ date, time });
  }
  return out;
}

/** One day of openSlots, past times included: the day's slot times, earliest first, that no scheduled post holds. */
export function openOn(slots: string[], scheduledFor: string[], date: string): string[] {
  const exact = new Set(scheduledFor.filter((s) => scheduleTime(s)));
  // the board's older full ISO timestamps count as the day alone, as everywhere else (scheduleTime)
  const dayOnly = scheduledFor.filter((s) => !scheduleTime(s) && s.slice(0, 10) === date).length;
  return slotsOn(slots, date).filter((t) => !exact.has(`${date}T${t}`)).slice(dayOnly);
}

/** A brand kit's posting times: shared, and per network once "Same times on every network" is unticked (publish-queue). */
export interface SlotBrand {
  slots?: string[];
  slotsBy?: Partial<Record<string, string[]>>;
}

export type Held = Pick<DraftEntry, "platform" | "scheduledFor">;

const perNetwork = (b: SlotBrand | null | undefined) => !!b?.slotsBy && Object.keys(b.slotsBy).length > 0;

/** The times a network posts at: its own row with per-network times on, else the shared ones. */
export const slotTimesFor = (b: SlotBrand | null | undefined, platform: string): string[] => (perNetwork(b) && b!.slotsBy![platform]) || b?.slots || [];

/** The times that hold this network's slots: with per-network times on only its own posts, else every post's. */
const heldFor = (brand: SlotBrand | null | undefined, platform: string, scheduled: Held[]) =>
  scheduled.filter((s) => s.scheduledFor && (!perNetwork(brand) || s.platform === platform)).map((s) => s.scheduledFor!);

/**
 * A post's time on `date` on this network: the day's first slot no held post takes (openOn, nextOpenSlots' held
 * posts), and with every slot that day held, `spread(n)` with n the posts already that day (postingTimeOn's nth).
 */
export function freeTimeOn(brand: SlotBrand | null | undefined, platform: string, scheduled: Held[], date: string, spread: (n: number) => string): string {
  const held = heldFor(brand, platform, scheduled);
  return openOn(slotTimesFor(brand, platform), held, date)[0] ?? spread(held.filter((s) => s.slice(0, 10) === date).length);
}

/**
 * The open slots for a post on this network, each at least 2 hours away. With per-network times on only posts on
 * the same network hold a slot; with shared times every post does, so it is today's openSlots.
 */
export function nextOpenSlots(brand: SlotBrand | null | undefined, platform: string, scheduled: Held[], now: Date, days: number): OpenSlot[] {
  const held = heldFor(brand, platform, scheduled);
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

/**
 * Slots for a weekly goal: the goal's spread of weekdays, each at `timeFor(weekday, nth)` ("HH:MM"). Past 7 a week
 * every day takes one, then the rest go round again as GOAL_DAYS spreads them, nth 1 (the day's second time), and so
 * on up to MAX_SLOTS. A time a day already has is kept once, in week order.
 */
export function slotsForGoal(goal: number, timeFor: (weekday: number, nth: number) => string): string[] {
  const total = Math.min(MAX_SLOTS, Math.max(1, Math.round(goal) || 1));
  const out: string[] = [];
  for (let nth = 0; nth * 7 < total; nth++) for (const d of GOAL_DAYS[Math.min(7, total - nth * 7)]) out.push(`${d}T${timeFor(d, nth)}`);
  return [...new Set(out.filter((s) => SLOT_RE.test(s)))].sort();
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
 * keeps MAX_SLOTS). `skipped` counts the times left out because the list was full.
 */
export function addSlots(existing: string[], days: readonly number[], time: string, max = MAX_SLOTS): { slots: string[]; skipped: number } {
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
