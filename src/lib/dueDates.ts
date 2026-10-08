// Calendar-day helpers for scheduled posts. scheduledFor comes from a date
// picker, so it is the consultant's local day ("YYYY-MM-DD"), not a UTC
// instant: compare it with the local date, or posts due today in Singapore
// don't show as due until 8am.

export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local Date for a "YYYY-MM-DD" key (midnight, not UTC). */
export function keyToDate(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

/** The day `n` days after a "YYYY-MM-DD" key; negative goes back. */
export function addDays(key: string, n: number): string {
  const d = keyToDate(key);
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** The seven day keys, Monday first, of the week that holds `key`. */
export function weekOf(key: string): string[] {
  const monday = addDays(key, -((keyToDate(key).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The 42 day keys (six Monday-first weeks) of a month grid; month is 0-based. */
export function monthGrid(year: number, month: number): string[] {
  const start = weekOf(localDateKey(new Date(year, month, 1)))[0];
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Whole days from a scheduled day to today: 0 is due today, negative is still ahead. */
export function daysOverdue(scheduledFor: string, today: string): number {
  const toDay = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((toDay(today) - toDay(scheduledFor.slice(0, 10))) / 86_400_000);
}

/** "Due today", "3 days overdue", "7 weeks overdue", "2 months overdue". */
export function overdueLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} overdue`;
  if (days < 63) return `${Math.floor(days / 7)} weeks overdue`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} overdue`;
}

/** Heading for Home's reminder about scheduled posts that are due or late. */
export function dueHeading(total: number, overdue: number): string {
  const posts = `${total} post${total === 1 ? "" : "s"}`;
  const verb = total === 1 ? "is" : "are";
  if (overdue === 0) return `${posts} ${verb} due today`;
  if (overdue === total) return `${posts} ${verb} overdue`;
  return `${posts} are due or overdue`;
}
