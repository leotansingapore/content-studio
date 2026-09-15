// Calendar-day helpers for scheduled posts. scheduledFor comes from a date
// picker, so it is the consultant's local day ("YYYY-MM-DD"), not a UTC
// instant: compare it with the local date, or posts due today in Singapore
// don't show as due until 8am.

export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
