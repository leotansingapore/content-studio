// How many things wait on the user, for the count on the Pipeline rail icon and the phone Calendar tab:
// scheduled posts whose day has passed, and team posts waiting for approval. The calendar's Needs you
// strip and Overdue block list them; this only counts, from what the device already holds (no network).
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { statusOf, type TeamPost, type TeamReviews } from "@/lib/teamPosts";

export function countNeedsYou(drafts: DraftEntry[], teamPosts: TeamPost[], reviews: TeamReviews, today: string): number {
  const overdue = drafts.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) < today && !!d.scheduledFor).length;
  const toApprove = teamPosts.filter((p) => statusOf(p, reviews[p.id]) === "waiting").length;
  return overdue + toApprove;
}

/** "9+" past nine, so the badge stays one small circle. */
export const badgeText = (n: number) => (n > 9 ? "9+" : String(n));
