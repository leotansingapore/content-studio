// How many things wait on the user, for the count on the Pipeline rail icon and the phone Calendar tab:
// scheduled posts whose day has passed, and team posts waiting for approval. The calendar's Needs you
// strip and Overdue block list them; this only counts, from what the device already holds (no network). Leo's
// autopilot posts waiting for an OK are added by the caller (north star phase 5).
import type { Campaign } from "@/lib/campaigns";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { statusOf, type TeamPost, type TeamReviews } from "@/lib/teamPosts";
import { brandOf, feedCards, type Board, type Me, type ReelCard } from "@/lib/reelsBoard";

export function countNeedsYou(drafts: DraftEntry[], teamPosts: TeamPost[], reviews: TeamReviews, today: string, autopilotWaiting = 0): number {
  const overdue = drafts.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) < today && !!d.scheduledFor).length;
  const toApprove = teamPosts.filter((p) => statusOf(p, reviews[p.id]) === "waiting").length;
  return overdue + toApprove + autopilotWaiting;
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

/** Board brands with posts carrying open notes from others, as the posts board's Notes chip lists them. */
export const notesByBrand = (board: Board, me: Me | null) =>
  board.brands.map((b) => ({ id: b.id, name: b.name, n: feedCards(board.cards, "notes", b.id, me).length })).filter((b) => b.n > 0);

/** Posts going out today: board posts approved or scheduled for today, and scheduled drafts. */
// shortcut: leaves out Telegram team posts and channel feeds, which only the Calendar loads; Home links to its week for those.
export const countPostingToday = (cards: ReelCard[], drafts: DraftEntry[], today: string) =>
  cards.filter((c) => (c.stage === "approved" || c.stage === "scheduled") && c.schedule?.slice(0, 10) === today).length +
  drafts.filter((d) => draftStatus(d) === "scheduled" && d.scheduledFor?.slice(0, 10) === today).length;

/** Leo's plan counts on the open brand (north star phase 5): autopilot posts waiting for an OK, written campaign
 * posts per campaign, and today's ideas still in the Inbox. */
export interface PlanCounts {
  autopilot: number;
  campaigns: { id: string; n: number }[];
  ideas: number;
}

/** Campaigns with written posts not yet made or skipped (the queue's "ready"), newest first as stored. */
export const campaignsToReview = (list: Pick<Campaign, "id" | "posts">[]) =>
  list.map((c) => ({ id: c.id, n: c.posts.filter((p) => p.state === "ready").length })).filter((c) => c.n > 0);

/** Home's Today rows. Posts board users who act on the board get To review per brand; Leo also gets what posts today,
 * team notes per brand and Your market, and with `plan` (passed for Leo only) the posts and ideas waiting on him, each
 * only above 0. Plain URLs as links.reels, links.plan, links.campaign and links.ideas build them: links.ts stays out of
 * the main chunk. */
export function homeToday(me: Me | null, board: Board | null, drafts: DraftEntry[], today: string, market: boolean, plan?: PlanCounts) {
  const rows: { label: string; n?: number; to: string }[] = (board ? waitingByBrand(board, "") : []).map((b) => ({
    label: `To review: ${b.name}`,
    n: b.n,
    to: `/reels?brand=${encodeURIComponent(b.id)}${b.changes ? "&stage=all" : ""}`,
  }));
  if (plan) {
    if (plan.autopilot > 0) rows.push({ label: "Posts for your OK", n: plan.autopilot, to: "/plan#autopilot" });
    const written = plan.campaigns.reduce((n, c) => n + c.n, 0);
    // one campaign: straight to its queue; several: the list, which shows each
    const one = plan.campaigns.length === 1 ? plan.campaigns[0].id : null;
    if (written > 0) rows.push({ label: "Campaign posts to review", n: written, to: one ? `/campaigns/${encodeURIComponent(one)}#queue` : "/campaigns" });
    if (plan.ideas > 0) rows.push({ label: "Today's ideas", n: plan.ideas, to: "/ideas" });
  }
  if (!me?.owner) return rows;
  rows.push({ label: "Posting today", n: countPostingToday(board?.cards ?? [], drafts, today), to: "/calendar?view=week" });
  // per brand, since /reels shows Leo one brand at a time; view=feed beats a remembered Board or Grid, which ignore stage
  for (const b of board ? notesByBrand(board, me) : [])
    rows.push({ label: `Team notes: ${b.name}`, n: b.n, to: `/reels?brand=${encodeURIComponent(b.id)}&view=feed&stage=notes` });
  if (market) rows.push({ label: "Your market", to: "/market" });
  return rows;
}

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
