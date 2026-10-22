// The agent's cards and receipts (docs/north-star/items/agent-approvals.md; phase6-build-brief.md, "Pure libraries"):
// the server's pick shapes, when a pick needs a card, a card's price line and states, a talking video's estimate from
// its script, and Undo from a receipt's stored payload, so it still works after a reload and on the other device.
// Cards and receipts live inside the thread messages (agentThreads.ts); nothing here keeps a store of its own.

import { leftUnit, limitOf, type Need } from "@/lib/agentBudget";
import { AUTO_ACT_MIN, AUTO_PICK_MIN } from "@/lib/autonomy";
import { deleteCampaign, loadCampaigns } from "@/lib/campaigns";
import { loadCarousels, removeCarousel } from "@/lib/carousel";
import { removeCompetitor } from "@/lib/competitors";
import { draftStatus, draftsChanged, loadDrafts, restoreDraft, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { priceText, type Price } from "@/lib/prices";
import { talkPrice, videoEstimate, type TalkLength } from "@/lib/talkingHead";
import { isOn, loadLearnings, undoLearning, type LearningScope } from "@/lib/voiceMemory";
import { CREDIT_USD, MAX_AVATAR_SECONDS } from "../../supabase/functions/ai-video/logic.ts";

/** The agent's ids: threads t, messages m, cards k, then base 36. Never uuid-shaped, which cloudSync reads as a user id. */
export const newId = (prefix: "t" | "m" | "k", now = new Date()) =>
  `${prefix}${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
export const newCardId = (now = new Date()) => newId("k", now);

/** assistant-act's acts in agent mode (agent-mode, wave 1). */
export type AgentAct =
  | "move" | "write" | "week" | "engage_replies" | "engage_dms" | "engage_thread" | "engage_comment" | "remember"
  | "remix" | "make" | "competitor" | "campaign" | "capabilities" | "refuse" | "budget" | "forget" | "memory" | "check"
  | "approve" | "decline" | "edit" | "answer";
export type AgentFormat = "post" | "carousel" | "script" | "slideshow" | "wall" | "speaking" | "explainer" | "image";

/** One Jev pick in agent mode (the server's shape; a W2 type test keeps them equal). Each slot is null when unsure or not asked. */
export interface AgentPick {
  act: AgentAct;
  format: AgentFormat | null;
  length: TalkLength | null;
  /** "mine", "new" or a kept presenter's "pr-<id>". */
  who: string | null;
  /** A saved audience's id. */
  audience: string | null;
  weeks: 1 | 2 | 4 | null;
  pace: 2 | 3 | 5 | 7 | null;
  /** The open item's slide, 1-based; null is the whole item. */
  slide: number | null;
  /** "l1" to "l10", or "last". */
  which: string | null;
  /** A skill's slash. */
  skill: string | null;
  /** Index into the posts sent, for move and write. */
  post: number | null;
  /** "YYYY-MM-DD". */
  day: string | null;
  /** "HH:MM". */
  time: string | null;
  scope: LearningScope | null;
}
/** Jev's probability for each question asked, null when it gave none. */
export type AgentP = Record<string, number | null>;

export type CardKind = "video" | "explainer" | "image" | "competitor" | "move" | "learning" | "make" | "campaign" | "edit";
export type CardStatus = "proposed" | "starting" | "approved" | "declined" | "failed";
/** Which press of a two-press plan: a talking video's script then its video, an edit's writing then its apply. */
export type CardStep = "script" | "video" | "write" | "apply";

export interface AgentCard {
  id: string;
  kind: CardKind;
  step?: CardStep;
  title: string;
  line: string;
  script?: string[];
  prompt?: string;
  /** An edit's proposed words, shown before Use this. */
  preview?: string;
  /** Warnings that never block: Jev's MAS flag, or scanCompliance's matches. */
  flags?: string[];
  details?: { label: string; value: string }[];
  /** What Approve spends (PriceChip), the Higgsfield credits beside a video's price, and the uses it needs today. */
  price?: Price;
  credits?: number;
  needs: Need[];
  /** What the run needs: draft id, format, voice, look, competitor fields. */
  plan: Record<string, unknown>;
  status: CardStatus;
  proposedAt: string;
  decidedAt?: string;
  error?: string;
}

export type Undo =
  | { kind: "delete-drafts"; ids: string[] }
  /** `draft` as it was before; `was` the scheduledFor the change wrote, which must still be there to undo. */
  | { kind: "restore-draft"; draft: DraftEntry; was: string }
  | { kind: "remove-competitor"; id: string }
  | { kind: "learning-off"; id: string }
  | { kind: "delete-campaign"; id: string }
  /** The page's own undo, held in memory by the run; `page` names it in the line ("the carousel"). */
  | { kind: "page"; page: string };

export interface Receipt {
  title: string;
  line: string;
  button?: { label: string; path: string };
  undo?: Undo;
  /** The "can't be undone" or "change it on" line. */
  undoText?: string;
  /** ISO time of the Undo. */
  undone?: string;
}

// Acts that answer or act on a card already shown: no card of their own. Every other act gets one, because it spends
// from a priced cap or changes something saved (phase6-build-brief.md decision 3: every priced run is a one-tap card).
const NO_CARD: ReadonlySet<AgentAct> = new Set(["week", "capabilities", "refuse", "budget", "memory", "check", "forget", "approve", "decline"]);

/** False for answers, forget and undo, a typed approve or decline, and, in auto mode only, a move Jev is sure of with a day. */
export function needsCard(pick: AgentPick, p: AgentP, changes: "ask" | "auto"): boolean {
  if (NO_CARD.has(pick.act)) return false;
  const sure = (q: string, min: number) => (p[q] ?? 0) >= min;
  const sureMove =
    pick.act === "move" && pick.post !== null && !!pick.day && sure("act", AUTO_ACT_MIN) && sure("post", AUTO_PICK_MIN) && sure("day", AUTO_PICK_MIN);
  return !(changes === "auto" && sureMove);
}

/** "About US$2.77 | about 44 Higgsfield credits | 1 of 2 videos left today"; `left` counts the card's first need. */
export function priceLine(card: Pick<AgentCard, "price" | "credits" | "needs">, left: number | null): string | null {
  const main = card.needs[0]?.feature;
  const credits = card.credits == null ? null : `${card.price?.kind === "upTo" ? "" : "about "}${card.credits} Higgsfield credits`;
  const uses = left !== null && main && leftUnit(main) ? `${left} of ${limitOf(main)} ${leftUnit(main)} left today` : null;
  return [card.price && priceText(card.price), credits, uses].filter(Boolean).join(" | ") || null;
}

/** Only a proposed card's script, prompt, voice or format can change; after the press its buttons stay disabled. */
export const canEdit = (card: Pick<AgentCard, "status">) => card.status === "proposed";

export type CardEvent =
  | { type: "approve" } // the press, or a typed yes
  | { type: "started" } // the run got going
  | { type: "decline" }
  | { type: "fail"; error: string }
  | { type: "retry" }
  /** The second press of the same card: an edit's preview after its writer ran. */
  | { type: "next"; step: CardStep; patch?: Partial<AgentCard> };

/** The card after `e`, or null when `e` can't happen in its state. */
export function nextCard(card: AgentCard, e: CardEvent, now = new Date()): AgentCard | null {
  const s = card.status;
  switch (e.type) {
    case "approve":
      return s === "proposed" ? { ...card, status: "starting", decidedAt: now.toISOString() } : null;
    case "started":
      return s === "starting" ? { ...card, status: "approved" } : null;
    case "decline":
      return s === "proposed" ? { ...card, status: "declined", decidedAt: now.toISOString() } : null;
    case "fail":
      return s === "starting" || s === "approved" ? { ...card, status: "failed", error: e.error } : null;
    case "retry":
      return s === "failed" ? { ...card, status: "proposed", decidedAt: undefined, error: undefined } : null;
    case "next":
      return s === "starting" || s === "approved" ? { ...card, ...e.patch, step: e.step, status: "proposed", decidedAt: undefined } : null;
  }
}

export const WORDS_PER_SECOND = 2.5;

/**
 * A talking video's estimate from its script's words: seconds at 2.5 a second (30 at most), the Higgsfield credits of
 * its slices (at most 9.5 s each), and talkPrice for the press: the video and its voiceover, plus a new presenter's picture.
 */
export function estimateScript(words: number, o: { presenter?: boolean } = {}): { seconds: number; credits: number; price: Price } {
  const seconds = Math.min(MAX_AVATAR_SECONDS, Math.max(1, words) / WORDS_PER_SECOND);
  // talkPrice types its length as the picker's four, but prices any seconds by the table's slice rule
  const length = seconds as TalkLength;
  return {
    seconds,
    credits: Math.round(videoEstimate(length).usd / CREDIT_USD),
    price: talkPrice({ length, write: false, presenter: !!o.presenter }) as Price,
  };
}

export const UNDONE = "Undone.";
const changedLine = (page: string) => `It changed since. Change it on ${page}.`;
const failedLine = (page: string) => `Couldn't undo that. Change it back on ${page}.`;
const PAGE: Record<Exclude<Undo["kind"], "page">, string> = {
  "delete-drafts": "My posts",
  "restore-draft": "Calendar",
  "remove-competitor": "Competitors",
  "learning-off": "Your voice",
  "delete-campaign": "Campaigns",
};
/** Posted, or handed to Post it for me: Undo leaves it alone. */
const sentOut = (d: DraftEntry) => draftStatus(d) === "posted" || (!!d.zernio?.postId && !["cancelled", "failed"].includes(d.zernio.status ?? ""));

/**
 * Undo from a receipt's stored payload: "Undone.", "It changed since. Change it on <page>." when the thing moved on,
 * or "Couldn't undo that..." when the write failed. A page's undo runs from memory in the agent run; this is its line
 * once that is gone (a reload).
 */
export function runUndo(userId: string, undo: Undo): string {
  const page = undo.kind === "page" ? undo.page : PAGE[undo.kind];
  try {
    switch (undo.kind) {
      case "delete-drafts": {
        const drafts = loadDrafts(userId);
        const mine = drafts.filter((d) => undo.ids.includes(d.id));
        if (!mine.length || mine.some(sentOut)) return changedLine(page);
        saveDrafts(userId, drafts.filter((d) => !undo.ids.includes(d.id)));
        for (const c of loadCarousels(userId)) if (c.draftId && undo.ids.includes(c.draftId)) removeCarousel(userId, c.id);
        draftsChanged();
        return UNDONE;
      }
      case "restore-draft": {
        const now = loadDrafts(userId).find((d) => d.id === undo.draft.id);
        if (!now || now.scheduledFor !== undo.was || sentOut(now)) return changedLine(page);
        restoreDraft(userId, undo.draft);
        draftsChanged();
        return UNDONE;
      }
      case "remove-competitor":
        return removeCompetitor(userId, undo.id) ? UNDONE : changedLine(page);
      case "learning-off": {
        const row = loadLearnings(userId).find((r) => r.id === undo.id);
        if (!row || !isOn(row)) return changedLine(page);
        return undoLearning(userId, undo.id) ? UNDONE : failedLine(page);
      }
      case "delete-campaign":
        if (!loadCampaigns(userId).some((c) => c.id === undo.id)) return changedLine(page);
        return deleteCampaign(userId, undo.id) ? UNDONE : failedLine(page);
      case "page":
        return failedLine(page);
    }
  } catch {
    return failedLine(page);
  }
}
