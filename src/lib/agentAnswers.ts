// Answers the agent draws as a card with no Jev call (Fastlane's "What is trending in my niche?", "Which post did
// best?" and "Find new angles" starters, read 14 Nov): the starter sent unchanged, or its "/" command. Each card's
// data is a snapshot kept in the message (AgentMsg.answer), so a reload or another device shows what was answered.
// Angles are written only on the card's press, through the campaign wizard's own suggestion job (angleSuggest.ts),
// so they land in that audience's wizard step too. No line says adviser or client: any brand gets the same words.

import { getTrackedPosts } from "@/lib/analytics";
import { addSuggested, jobKey, loadWork, saveWork, startSuggest, suggestJob } from "@/lib/angleSuggest";
import { loadAudiences } from "@/lib/audiences";
import { AGENT_ANSWERS, postTitle } from "@/lib/chatSkills";
import { draftStatus, loadDrafts } from "@/lib/draftHistory";
import { formatRemixUrl } from "@/lib/formatTrends";
import { links } from "@/lib/links";
import { formatItemId, formatTrendsFor, nichePosts } from "@/lib/nicheFeed";
import { sourceKey } from "@/lib/remixSource";
import { compactNum } from "@/lib/topPosts";
import { loadThreads, patchMsg } from "@/lib/agentThreads";
import { times } from "../../supabase/functions/_shared/outlier.ts";

export type AnswerKind = (typeof AGENT_ANSWERS)[number]["id"];

export interface TrendRow {
  /** Its id in the brand's hidden list (nicheFeed hideItem); answers before 14 Nov have none. */
  id?: string;
  title: string;
  who: string;
  /** Why it is trending: its jump on the account's usual and its views, or its views alone. */
  why: string;
  /** An app path or https; none draws the format's tile. */
  cover?: string;
  /** The remix or format flow for it: a new chat with the post attached, or the format's page. */
  remix: string;
}
export interface BestPost {
  id: string;
  title: string;
  platform: string;
  at: string;
  numbers: string;
}
export type Answer =
  /** rows: the brand's niche; formats: the template drop, under its own heading (answers before 14 Nov mixed both in rows). */
  | { kind: "trending"; rows: TrendRow[]; formats?: TrendRow[]; niche: boolean }
  | { kind: "best"; post: BestPost | null; posted: boolean }
  | { kind: "angles"; audience: { id: string; name: string } | null; angles?: { title: string; line: string }[]; error?: string };

/** The answer a message asks for: one of the starters exactly, or its "/" command with anything after it. */
export function answerOf(text: string): AnswerKind | null {
  const t = text.trim();
  const word = /^\/(\S+)/.exec(t)?.[1].toLowerCase();
  return AGENT_ANSWERS.find((a) => t === a.starter || word === a.slash)?.id ?? null;
}

const NICHE_ROWS = 5;
const FORMAT_ROWS = 3;
const firstLine = (s: string) => s.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? "";

/** Studio's Trending posts (the brand's niche, up to 5), then Formats taking off (the template drop for this brand, up to 3). */
export function trendingAnswer(userId: string): Answer {
  const posts = nichePosts(userId, NICHE_ROWS);
  const rows: TrendRow[] = posts.map((p) => {
    const ratio = p.outlier?.ratio;
    return {
      id: p.id,
      title: firstLine(p.text) || "No caption",
      who: p.who,
      why: [ratio != null ? `${times(ratio)} their usual` : "", p.views ? `${compactNum(p.views)} views` : ""].filter(Boolean).join(", "),
      ...(p.source.cover ? { cover: p.source.cover } : {}),
      remix: links.agent({ remix: p.source.key }),
    };
  });
  const formats: TrendRow[] = formatTrendsFor(userId).slice(0, FORMAT_ROWS).map((t) => ({
    id: formatItemId(t.id),
    title: t.hook,
    who: `@${t.author}`,
    why: `${compactNum(t.views)} views, TikTok`,
    cover: t.cover,
    remix: formatRemixUrl(t),
  }));
  return { kind: "trending", rows, formats, niche: posts.length > 0 };
}

const n = (count: number, one: string) => `${compactNum(count)} ${one}${count === 1 ? "" : "s"}`;

/** The posted post with the most engagement (reactions, comments and shares, real numbers first), impressions breaking a tie. */
export function bestAnswer(userId: string): Answer {
  const best = getTrackedPosts(userId).sort((a, b) => b.engagementTotal - a.engagementTotal || b.impressions - a.impressions)[0];
  if (!best) return { kind: "best", post: null, posted: loadDrafts(userId).some((d) => draftStatus(d) === "posted") };
  const m = best.metrics ?? {};
  const numbers = [m.impressions ? n(m.impressions, "impression") : "", n(m.reactions ?? 0, "reaction"), n(m.comments ?? 0, "comment"), m.shares ? n(m.shares, "share") : ""].filter(Boolean).join(", ");
  return { kind: "best", post: { id: best.id, title: postTitle(best), platform: best.platform, at: best.postedAt ?? best.createdAt, numbers }, posted: true };
}

/** The brand's first audience (its main one leads), to write angles for; null with none. */
export function anglesAnswer(userId: string): Answer {
  const a = loadAudiences(userId).find((x) => x.name.trim());
  return { kind: "angles", audience: a ? { id: a.id, name: a.name.trim() } : null };
}

export const answerFor = (userId: string, kind: AnswerKind): Answer =>
  kind === "trending" ? trendingAnswer(userId) : kind === "best" ? bestAnswer(userId) : anglesAnswer(userId);

/** "Make another like it": a new chat with the post attached and the words in the box, so the agent's priced card comes first. */
export const anotherLikeIt = (draftId: string) => links.agent({ remix: sourceKey.own(draftId), ask: "Make another like it" });

export const BUSY_LINE = "Angles are being written for another audience. Try again when they land.";
export const GONE_AUDIENCE = "That audience was removed. Ask for new angles again.";
/** The wizard's lines end by pointing at its own rows ("Write your own below"), which the chat doesn't have. */
const chatLine = (wizard: string) => wizard.replace(/ Write your own(,| below)[^.]*\./, "").trim();

/**
 * The angles card's press: the wizard's suggestion job for this audience (one press spends one campaign-angles use,
 * or up to 3 when Jev keeps fewer than 5), then the angles it added, or why none came, written into the message.
 * Runs outside React, so leaving the chat still lands them.
 */
export async function suggestAngles(userId: string, threadId: string, msgId: string): Promise<void> {
  const a = loadThreads(userId).find((t) => t.id === threadId)?.messages.find((m) => m.id === msgId)?.answer;
  if (a?.kind !== "angles" || !a.audience) return;
  const put = (patch: Partial<Extract<Answer, { kind: "angles" }>>) => void patchMsg(userId, threadId, msgId, { answer: { ...a, ...patch } });
  const audience = loadAudiences(userId).find((x) => x.id === a.audience!.id);
  if (!audience) return put({ error: GONE_AUDIENCE });
  if (suggestJob().state === "suggesting") return put({ error: BUSY_LINE });
  const before = new Set((loadWork(userId, audience.id) ?? []).map((r) => r.id));
  await startSuggest(userId, audience);
  const fresh = (loadWork(userId, audience.id) ?? []).filter((r) => !before.has(r.id) && !r.used && r.origin === "suggested");
  if (fresh.length) return put({ angles: fresh.map(({ title, line }) => ({ title, line })), error: undefined });
  const job = suggestJob();
  put({ error: chatLine(job.state === "failed" && job.key === jobKey(userId, audience.id) ? job.error : "Couldn't suggest angles right now. Try again.") });
}

/** "Plan a campaign with these": the angles go into the wizard's step for this audience (this tab's rows), ticked. */
export function seedWizard(userId: string, audienceId: string, angles: { title: string; line: string }[]): void {
  saveWork(userId, audienceId, addSuggested(loadWork(userId, audienceId) ?? [], angles));
}
