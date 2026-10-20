// How many things wait on the user, for the count on the Pipeline rail icon and the phone Calendar tab:
// scheduled posts whose day has passed, and team posts waiting for approval. The calendar's Needs you
// strip and Overdue block list them; this only counts, from what the device already holds (no network).
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { statusOf, type TeamPost, type TeamReviews } from "@/lib/teamPosts";
import { brandOf, type Board, type ReelCard } from "@/lib/reelsBoard";

export function countNeedsYou(drafts: DraftEntry[], teamPosts: TeamPost[], reviews: TeamReviews, today: string): number {
  const overdue = drafts.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) < today && !!d.scheduledFor).length;
  const toApprove = teamPosts.filter((p) => statusOf(p, reviews[p.id]) === "waiting").length;
  return overdue + toApprove;
}

/** Posts on the posts board waiting on a decision (Review or Needs changes), for the count on its nav item. */
export const countBoardWaiting = (cards: ReelCard[]) => cards.filter((c) => c.stage === "review" || c.stage === "changes").length;

/** Board brands other than the open one with posts waiting, for links to them; changes: one of them needs changes. */
export const waitingByBrand = (board: Board, open: string) =>
  board.brands
    .filter((b) => b.id !== open)
    .map((b) => {
      const cards = board.cards.filter((c) => brandOf(c) === b.id);
      return { id: b.id, name: b.name, n: countBoardWaiting(cards), changes: cards.some((c) => c.stage === "changes") };
    })
    .filter((b) => b.n > 0);

// The posts board hands the shell its new count after every change, so the badge drops without another board call.
const BOARD_WAITING = "content-studio-board-waiting";
export const boardWaitingChanged = (n: number) => void globalThis.dispatchEvent?.(new CustomEvent(BOARD_WAITING, { detail: n }));
export function onBoardWaiting(cb: (n: number) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<number>).detail);
  window.addEventListener(BOARD_WAITING, h);
  return () => window.removeEventListener(BOARD_WAITING, h);
}

/** "9+" past nine, so the badge stays one small circle. */
export const badgeText = (n: number) => (n > 9 ? "9+" : String(n));
