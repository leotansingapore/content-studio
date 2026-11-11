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

/** Waiting on your yes (proposed cards), making (a pressed card or a running job) and made, each newest first. */
export function workOf(threads: AgentThread[]): { waiting: WorkItem[]; making: WorkItem[]; made: WorkItem[] } {
  const waiting: WorkItem[] = [];
  const making: WorkItem[] = [];
  const made: WorkItem[] = [];
  for (const t of threads)
    for (const m of t.messages) {
      if (m.card?.status === "proposed") waiting.push(item(t, m, m.card.proposedAt));
      else if (m.card?.status === "starting" || m.job?.state === "running") making.push(item(t, m, m.job?.startedAt ?? m.card?.decidedAt ?? m.at));
      else if (m.job?.state === "done") made.push(item(t, m, m.job.endedAt ?? m.job.startedAt));
    }
  const newest = (a: WorkItem, b: WorkItem) => b.at.localeCompare(a.at);
  return { waiting: waiting.sort(newest), making: making.sort(newest), made: made.sort(newest) };
}

const n = (count: number, one: string, many = one) => `${count} ${count === 1 ? one : many}`;
/** The three counters: "2 need you", "Nothing in flight", "20 made". */
export const workCounters = (w: ReturnType<typeof workOf>): [string, string, string] => [
  w.waiting.length ? n(w.waiting.length, "needs you", "need you") : "Nothing needs you",
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
