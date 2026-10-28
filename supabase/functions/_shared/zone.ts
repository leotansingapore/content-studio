// Wall-clock time in an IANA zone, DST-safe: what Post it for me sends Zernio (src/lib/autoPost.ts zernioTime) and when
// notify's due alert fires (notify/logic.ts dueAt), so both read a post's day and time the same way.
// No Deno or npm imports: the app imports this too.

const HOUR_PARTS = { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" } as const;

// a formatter costs far more to make than to use, and the calendar asks for one per card
const formatters = new Map<string, Intl.DateTimeFormat>();
export const formatter = (key: string, make: () => Intl.DateTimeFormat) => formatters.get(key) ?? formatters.set(key, make()).get(key)!;

/** "YYYY-MM-DDTHH:MM" on the clock in `tz` at an instant. */
export function clockIn(tz: string, at: number): { wall: string; utc: number } {
  const f = formatter(`clock ${tz}`, () => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...HOUR_PARTS }));
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { wall: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, utc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) };
}

/** Minutes `tz` is ahead of UTC at an instant. */
export const offsetAt = (tz: string, at: number) => Math.round((clockIn(tz, at).utc - Math.floor(at / 1000) * 1000) / 60_000);

/**
 * The instant a wall-clock day and time names in `tz`, DST-safe. A time the clocks skip (2:30 as they go forward) is
 * the same hour later; a time that happens twice (as they go back) is the first.
 */
export function instantIn(day: string, time: string, tz: string): number {
  const wall = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5));
  const before = offsetAt(tz, wall - 86_400_000);
  const after = offsetAt(tz, wall + 86_400_000);
  const fits = [before, after].map((o) => wall - o * 60_000).filter((t) => offsetAt(tz, t) * 60_000 === wall - t);
  return fits.length ? Math.min(...fits) : wall - before * 60_000;
}
