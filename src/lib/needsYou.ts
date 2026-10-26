// How many things wait on the user, for the count on Home in the sidebar and the phone bar:
// scheduled posts whose day has passed, and team posts waiting for approval. The calendar's Needs you
// strip and Overdue block list them; this only counts, from what the device already holds (no network). Leo's
// autopilot posts waiting for an OK are added by the caller (north star phase 5). needsYouItems ranks the same things,
// and the agent's, for Leo's Next up on Home (agent-home).
import type { AgentCard } from "@/lib/agentCards";
import type { Campaign } from "@/lib/campaigns";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { daysOverdue, overdueLabel, scheduleTime, timeLabel } from "@/lib/dueDates";
import { statusOf, type TeamPost, type TeamReviews } from "@/lib/teamPosts";
import { brandOf, feedCards, type Board, type Me, type ReelCard } from "@/lib/reelsBoard";

export function countNeedsYou(drafts: DraftEntry[], teamPosts: TeamPost[], reviews: TeamReviews, today: string, autopilotWaiting = 0): number {
  const overdue = drafts.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) < today && !!d.scheduledFor).length;
  const toApprove = teamPosts.filter((p) => statusOf(p, reviews[p.id]) === "waiting").length;
  return overdue + toApprove + autopilotWaiting;
}

/** Posts on the posts board waiting on a decision (Review or Needs changes), for the count on its nav item. */
export const countBoardWaiting = (cards: ReelCard[]) => cards.filter((c) => c.stage === "review" || c.stage === "changes").length;

/** The badge on the posts board: Leo's open brand only (docs/brand-isolation.md); a teammate's covers every brand they have. */
export const boardWaitingHere = (cards: ReelCard[], owner: boolean, boardBrand: string | undefined) =>
  countBoardWaiting(owner ? cards.filter((c) => brandOf(c) === boardBrand) : cards);

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

/** One thing in Leo's Next up: its words, an optional count, and its buttons (a link, or Mark posted on a draft). */
export interface NextUpItem {
  /** Stable per thing, so hiding one never hides another. */
  id: string;
  kind: "card" | "failed" | "overdue" | "today" | "team" | "unscheduled" | "autopilot" | "campaign" | "ideas" | "market" | "setup";
  title: string;
  /** The post's or card's own words. */
  quote?: string;
  line?: string;
  n?: number;
  actions: { label: string; to?: string; markPosted?: string }[];
}

/** What Next up reads from the device; a source left out adds nothing. */
export interface NextUpInput {
  /** agentRun's waitingCards, each with its price line. */
  cards?: { thread: string; msg: string; card: Pick<AgentCard, "id" | "kind" | "title">; price?: string | null }[];
  /** The brand's agent chats, for asks that failed in the last 24 hours. */
  threads?: { id: string; messages: { id: string; card?: Pick<AgentCard, "status" | "title" | "decidedAt">; job?: { state: string; endedAt?: string; title?: string } }[] }[];
  /** The open brand's posts. */
  drafts: DraftEntry[];
  /** Posts board: To review per brand; for its owner also Team notes, Your market and the other brands' posts out today. */
  me?: Me | null;
  board?: Board | null;
  otherDrafts?: DraftEntry[];
  market?: boolean;
  teamPosts?: TeamPost[];
  reviews?: TeamReviews;
  autopilot?: number;
  campaigns?: Pick<Campaign, "id" | "name" | "audienceName" | "posts">[];
  ideas?: number;
  /** The first undone "Get set up" step. */
  setup?: { label: string; to: string } | null;
  /** Item ids hidden on this device, with the day each was hidden. */
  hidden?: Record<string, string>;
}

const CARD_NOUN: Partial<Record<AgentCard["kind"], string>> = {
  video: "A video", explainer: "A video", image: "A picture", edit: "A change", move: "A move",
  competitor: "A competitor", learning: "A note", campaign: "A campaign",
};
const DAY_MS = 86_400_000;
const hookOf = (d: DraftEntry) => d.hook || d.draft.slice(0, 60) || "Untitled";

/** Zernio holds it (scheduled, in the TikTok inbox or failed), it is linked to its live post or marked posted: it has a time already. */
export const heldOrLive = (d: Pick<DraftEntry, "zernio" | "live" | "status">) => !!d.zernio || !!d.live || d.status === "posted";

/**
 * Leo's Next up, in a fixed order (a product rule, so no Jev): agent cards waiting, failures, overdue, today, team
 * posts and the board's reviews and notes, unscheduled made posts, autopilot, campaigns, today's ideas, Your market,
 * then setup. Items hidden today drop out; a hide from another day counts for nothing. Plain URLs, as homeToday's.
 */
export function needsYouItems(input: NextUpInput, today: string, now = Date.now()): NextUpItem[] {
  const items: NextUpItem[] = [];
  const recent = (at: string | undefined, days: number) => !!at && now - Date.parse(at) < days * DAY_MS;
  const agentLink = (thread: string, msg: string) => `/agent/${encodeURIComponent(thread)}?m=${encodeURIComponent(msg)}`;
  const draftLink = (id: string, panel?: "post") => `/generate?draft=${encodeURIComponent(id)}${panel ? "&panel=post" : ""}`;
  const scheduled = (d: DraftEntry) => draftStatus(d) === "scheduled" && !!d.scheduledFor;

  for (const { thread, msg, card, price } of input.cards ?? [])
    items.push({
      id: `card:${card.id}`, kind: "card", title: `${CARD_NOUN[card.kind] ?? "A post"} is waiting for your yes`,
      quote: card.title, line: price ?? undefined, actions: [{ label: "Open", to: agentLink(thread, msg) }],
    });

  for (const d of input.drafts.filter((x) => x.zernio?.status === "failed"))
    items.push({ id: `failed:${d.id}`, kind: "failed", title: "A post didn't go out", quote: hookOf(d), line: "Try it again or post it yourself.", actions: [{ label: "Open", to: draftLink(d.id, "post") }] });
  for (const t of input.threads ?? [])
    for (const m of t.messages) {
      const failed = (m.card?.status === "failed" && recent(m.card.decidedAt, 1)) || (m.job?.state === "failed" && recent(m.job.endedAt, 1));
      if (failed)
        items.push({ id: `failed:${m.id}`, kind: "failed", title: "Something you asked for wasn't made", quote: m.card?.title ?? m.job?.title, line: "Nothing was used.", actions: [{ label: "Open", to: agentLink(t.id, m.id) }] });
    }

  const overdue = input.drafts
    .filter((d) => scheduled(d) && d.scheduledFor!.slice(0, 10) < today)
    .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? 1 : -1));
  if (overdue.length) {
    const d = overdue[0];
    items.push({
      id: "overdue", kind: "overdue", title: overdue.length === 1 ? "1 post is overdue" : `${overdue.length} posts are overdue`,
      quote: hookOf(d), line: overdueLabel(daysOverdue(d.scheduledFor!, today), scheduleTime(d.scheduledFor)),
      actions: [{ label: "Reschedule", to: "/calendar#overdue" }, { label: "Mark posted", markPosted: d.id }],
    });
  }

  const dueToday = input.drafts.filter((d) => scheduled(d) && d.scheduledFor!.slice(0, 10) === today).sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1));
  const elsewhere = input.me?.owner ? countPostingToday(input.board?.cards ?? [], input.otherDrafts ?? [], today) : 0;
  const goOut = dueToday.length + elsewhere;
  if (goOut) {
    const d = dueToday[0];
    const time = d && scheduleTime(d.scheduledFor);
    items.push({
      id: "today", kind: "today", title: goOut === 1 ? "1 post goes out today" : `${goOut} posts go out today`,
      quote: d && hookOf(d), line: time ? timeLabel(time) : undefined,
      actions: [{ label: "Open", to: d ? draftLink(d.id) : "/calendar?view=week" }],
    });
  }

  const waiting = (input.teamPosts ?? []).filter((p) => statusOf(p, input.reviews?.[p.id]) === "waiting").sort((a, b) => (`${a.day}T${a.time}` < `${b.day}T${b.time}` ? -1 : 1));
  if (waiting.length)
    items.push({
      id: "team", kind: "team", title: waiting.length === 1 ? "1 team post waits for you" : `${waiting.length} team posts wait for you`,
      line: "Approve or skip each one.", actions: [{ label: "Review", to: `/calendar?business=team-posts&teampost=${encodeURIComponent(waiting[0].id)}` }],
    });
  const board = input.board;
  for (const b of board ? waitingByBrand(board, "") : [])
    items.push({ id: `review:${b.id}`, kind: "team", title: `To review: ${b.name}`, n: b.n, actions: [{ label: "Review", to: `/reels?brand=${encodeURIComponent(b.id)}${b.changes ? "&stage=all" : ""}` }] });
  if (input.me?.owner)
    for (const b of board ? notesByBrand(board, input.me) : [])
      items.push({ id: `notes:${b.id}`, kind: "team", title: `Team notes: ${b.name}`, n: b.n, actions: [{ label: "Open", to: `/reels?brand=${encodeURIComponent(b.id)}&view=feed&stage=notes` }] });

  const made = input.drafts.filter((d) => (d.agent || d.remix) && draftStatus(d) === "draft" && !heldOrLive(d) && recent(d.createdAt, 7)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  // one row for them all, as overdue has, so a campaign's 24 made posts never bury what comes after (live-p6replay D15)
  if (made.length === 1)
    items.push({
      id: `draft:${made[0].id}`, kind: "unscheduled", title: "A post is made and not scheduled", quote: hookOf(made[0]), line: "Schedule it, or leave it in My posts.",
      // links.drafts({ schedule, step: "where" }): the schedule steps open on it, and only their last button posts (phase 7a)
      actions: [{ label: "Open", to: draftLink(made[0].id) }, { label: "Schedule it", to: `/drafts?${new URLSearchParams({ schedule: made[0].id, step: "where" })}` }],
    });
  else if (made.length)
    items.push({
      id: "unscheduled", kind: "unscheduled", title: `${made.length} posts are made and not scheduled`, quote: hookOf(made[0]), line: "Schedule them, or leave them in My posts.",
      actions: [{ label: "Open", to: "/drafts?status=draft" }],
    });

  if (input.autopilot) items.push({ id: "autopilot", kind: "autopilot", title: "Posts for your OK", n: input.autopilot, actions: [{ label: "Open", to: "/plan#autopilot" }] });
  for (const c of input.campaigns ?? []) {
    const ready = c.posts.filter((p) => p.state === "ready").length;
    if (!ready) continue;
    const done = c.posts.filter((p) => p.state === "made").length;
    items.push({
      id: `campaign:${c.id}`, kind: "campaign", title: "Keep making your campaign", quote: c.audienceName || c.name,
      line: `${done} of ${c.posts.length} made | ${ready} ${ready === 1 ? "draft" : "drafts"} waiting for you`,
      actions: [{ label: "Open", to: `/campaigns/${encodeURIComponent(c.id)}#queue` }],
    });
  }
  if (input.ideas) items.push({ id: "ideas", kind: "ideas", title: "Today's ideas", n: input.ideas, actions: [{ label: "Open", to: "/ideas" }] });
  if (input.market && input.me?.owner) items.push({ id: "market", kind: "market", title: "Your market", actions: [{ label: "Open", to: "/market" }] });
  if (input.setup) items.push({ id: "setup", kind: "setup", title: input.setup.label, actions: [{ label: "Open", to: input.setup.to }] });

  return items.filter((i) => input.hidden?.[i.id] !== today);
}

/** Next up's label: "NEXT UP" alone when empty. */
export const nextUpLabel = (n: number) => (n === 0 ? "NEXT UP" : n === 1 ? "NEXT UP | THE 1 THING THAT NEEDS YOU" : `NEXT UP | 1 OF ${n} THAT NEED YOU`);

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
