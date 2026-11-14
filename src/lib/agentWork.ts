// "Your work" beside the agent's chat (Fastlane's chat page, 11 Nov walk): what waits on a yes, what is being made
// and what was made, read from the thread messages (agentThreads.ts), so it is the same on every device.

import type { AgentCard } from "@/lib/agentCards";
import { fieldsOf } from "@/lib/agentPlans";
import type { AgentMsg, AgentThread, JobKind } from "@/lib/agentThreads";

const FORMAT: Record<string, string> = { post: "Post", carousel: "Carousel", script: "Script", slideshow: "Slideshow", wall: "Wall of text", speaking: "Talking video", explainer: "Explainer video", image: "Picture" };
const KIND: Record<AgentCard["kind"], string> = { video: "Talking video", explainer: "Explainer video", image: "Picture", competitor: "Competitor", move: "Calendar", learning: "Note", make: "Post", campaign: "Campaign", edit: "Edit" };
const JOB: Record<JobKind, string> = { remix: "Post", slideshow: "Slideshow", wall: "Wall of text", talk: "Talking video", video: "Explainer video", image: "Picture", campaign: "Campaign" };

/** What a card makes or changes, in a word or two: the tag on the card and the row's type in Your work. */
export function cardType(card: AgentCard): string {
  if (fieldsOf(card).plan === "layout") return "Static ad";
  const f = card.kind === "make" ? fieldsOf(card).format : undefined;
  return (f && FORMAT[f]) || KIND[card.kind];
}

export interface WorkItem {
  thread: string;
  msg: string;
  title: string;
  type: string;
  /** When it was proposed, started or finished. */
  at: string;
}

const item = (t: AgentThread, m: AgentMsg, at: string): WorkItem => ({
  thread: t.id,
  msg: m.id,
  title: m.card?.title ?? m.job?.title ?? t.title,
  type: m.card ? cardType(m.card) : JOB[m.job!.kind],
  at,
});

/**
 * Being made now: a running job, or a pressed card whose result has not landed (the engine writes most makes' job
 * row only when done, so the card's own state says it; agentRun's resumeAgent reads a reload the same way).
 */
export function inFlight(m: AgentMsg): boolean {
  if (m.job) return m.job.state === "running";
  const c = m.card;
  return !!c && (c.status === "starting" || (c.status === "approved" && !m.receipt && fieldsOf(c).plan !== "write"));
}

/** Waiting on your yes (proposed cards), making (inFlight) and made, each newest first. */
export function workOf(threads: AgentThread[]): { waiting: WorkItem[]; making: WorkItem[]; made: WorkItem[] } {
  const waiting: WorkItem[] = [];
  const making: WorkItem[] = [];
  const made: WorkItem[] = [];
  for (const t of threads)
    for (const m of t.messages) {
      if (m.card?.status === "proposed") waiting.push(item(t, m, m.card.proposedAt));
      else if (inFlight(m)) making.push(item(t, m, m.job?.startedAt ?? m.card?.decidedAt ?? m.at));
      else if (m.job?.state === "done") made.push(item(t, m, m.job.endedAt ?? m.job.startedAt));
    }
  const newest = (a: WorkItem, b: WorkItem) => b.at.localeCompare(a.at);
  return { waiting: waiting.sort(newest), making: making.sort(newest), made: made.sort(newest) };
}

const n = (count: number, one: string, many = one) => `${count} ${count === 1 ? one : many}`;
/** "2 need you", "1 needs you", "Nothing needs you": the first counter, and the count on the button Your work hides behind. */
export const needsYou = (count: number) => (count ? n(count, "needs you", "need you") : "Nothing needs you");
/** The three counters: "2 need you", "Nothing in flight", "20 made". */
export const workCounters = (w: ReturnType<typeof workOf>): [string, string, string] => [
  needsYou(w.waiting.length),
  w.making.length ? `${w.making.length} in flight` : "Nothing in flight",
  w.made.length ? `${w.made.length} made` : "Nothing made yet",
];

const MAKES: ReadonlySet<AgentCard["kind"]> = new Set(["make", "video", "explainer", "image"]);
/**
 * The rules every priced card states under Details (Fastlane's Format, Cost and Changes rows): what it is, that the
 * press is what spends, what a failure costs, and that nothing is posted. A card with no price changes a saved thing
 * and has none.
 */
export function ruleRows(card: AgentCard): { label: string; value: string }[] {
  if (!card.price) return [];
  return [
    { label: "Format", value: cardType(card) },
    { label: "Cost", value: "Nothing is spent until you approve." },
    { label: "If it fails", value: "When the maker never answers, the use comes back and the card says so. Making it again spends again." },
    ...(MAKES.has(card.kind) ? [{ label: "Posting", value: "Nothing is posted. It lands in this chat for you to open, change or schedule." }] : []),
  ];
}
