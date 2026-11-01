// Words for slideshow campaigns shared by the campaign pages and Home: status, cadence and a short date.

import { postsPerWeek, sanitizeSchedule } from "../../supabase/functions/_shared/slideCampaign.ts";

export const STATUS_LABEL = { draft: "Draft", live: "Live", paused: "Paused" } as const;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day at 9:00 AM", "Mon, Wed at 6:00 PM", or "3 times a day, 21 a week". */
export function cadence(raw: unknown): string {
  const s = sanitizeSchedule(raw);
  if (!s.times.length) return "No posting times";
  const t12 = (at: string) => new Date(`2000-01-01T${at}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (s.times.length === 1) {
    const t = s.times[0];
    return `${t.days.length === 7 ? "Every day" : t.days.map((d) => DAY[d]).join(", ")} at ${t12(t.at)}`;
  }
  return `${s.times.length} times a day, ${postsPerWeek(s)} a week`;
}
export const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
