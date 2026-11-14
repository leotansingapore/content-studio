// Answers the agent draws as a card with no Jev call (Fastlane's "What is trending in my niche?", "Which post did
// best?" and "Find new angles" starters, read 14 Nov): the starter sent unchanged, or its "/" command. Each card's
// data is a snapshot kept in the message (AgentMsg.answer), so a reload or another device shows what was answered.
// Angles (Fastlane's "Find new angles", read 14 Nov): the up to 2 audiences with the fewest saved angles, written only
// on the card's one press, through the campaign wizard's own suggestion job (angleSuggest.ts), then saved to each
// audience on its Add (confirmAngles). No line says adviser or client: any brand gets the same words.

import { getTrackedPosts } from "@/lib/analytics";
import { MAX_PER_AUDIENCE, anglesFor, confirmAngles } from "@/lib/angles";
import { addSuggested, jobKey, loadWork, saveWork, startSuggest, suggestJob, type StepRow } from "@/lib/angleSuggest";
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
export interface AngleIdea {
  /** Set once saved to the audience (Add). */
  id?: string;
  title: string;
  line: string;
}
export interface AngleGroup {
  id: string;
  name: string;
  /** Its saved angles when asked, for the line saying why it was picked; -1 on an answer from before 14 Nov. */
  saved: number;
  /** The press's suggestions for it. */
  angles?: AngleIdea[];
  /** What Add saved to it. */
  added?: AngleIdea[];
  error?: string;
}
export type Answer =
  /** rows: the brand's niche; formats: the template drop, under its own heading (answers before 14 Nov mixed both in rows). */
  | { kind: "trending"; rows: TrendRow[]; formats?: TrendRow[]; niche: boolean }
  | { kind: "best"; post: BestPost | null; posted: boolean }
  | {
      kind: "angles";
      groups?: AngleGroup[];
      /** Audiences skipped for being at MAX_PER_AUDIENCE. */
      full?: string[];
      error?: string;
      /** Answers before 14 Nov: one audience, its angles left in the wizard's rows (groupsOf reads them). */
      audience?: { id: string; name: string } | null;
      angles?: AngleIdea[];
    };

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

const ANGLE_GROUPS = 2;

/**
 * The up to 2 audiences with the fewest saved angles (the main one first on a tie), to write angles for. One that
 * would be picked but is at MAX_PER_AUDIENCE is skipped and named in `full`.
 */
export function anglesAnswer(userId: string): Answer {
  const top = loadAudiences(userId)
    .filter((x) => x.name.trim())
    .map((x) => ({ id: x.id, name: x.name.trim(), saved: anglesFor(userId, x.id).length }))
    .sort((a, b) => a.saved - b.saved)
    .slice(0, ANGLE_GROUPS);
  return { kind: "angles", groups: top.filter((g) => g.saved < MAX_PER_AUDIENCE), full: top.filter((g) => g.saved >= MAX_PER_AUDIENCE).map((g) => g.name) };
}

/** An angles answer's audiences, an answer from before 14 Nov read as one. */
export const groupsOf = (a: Extract<Answer, { kind: "angles" }>): AngleGroup[] =>
  a.groups ?? (a.audience ? [{ id: a.audience.id, name: a.audience.name, saved: -1, ...(a.angles ? { angles: a.angles } : {}) }] : []);

/** "Office admins and HR has none yet. First-time parents has 3." (an answer from before 14 Nov never said) */
export const pickedLine = (groups: AngleGroup[]) =>
  groups.filter((g) => g.saved >= 0).map((g) => `${g.name} has ${g.saved ? g.saved : "none yet"}.`).join(" ");

/** How many more angles this audience keeps. */
export const roomFor = (userId: string, audienceId: string) => Math.max(0, MAX_PER_AUDIENCE - anglesFor(userId, audienceId).length);
export const fullLine = (name: string, room: number) =>
  room ? `${name} keeps ${MAX_PER_AUDIENCE} angles at most, so ${room} more fit. Untick some.` : `${name} already has ${MAX_PER_AUDIENCE} angles, the most it keeps.`;

export const answerFor = (userId: string, kind: AnswerKind): Answer =>
  kind === "trending" ? trendingAnswer(userId) : kind === "best" ? bestAnswer(userId) : anglesAnswer(userId);

/** "Make another like it": a new chat with the post attached and the words in the box, so the agent's priced card comes first. */
export const anotherLikeIt = (draftId: string) => links.agent({ remix: sourceKey.own(draftId), ask: "Make another like it" });

export const BUSY_LINE = "Angles are being written for another audience. Try again when they land.";
export const GONE_AUDIENCE = "That audience was removed. Ask for new angles again.";
/** The wizard's lines end by pointing at its own rows ("Write your own below"), which the chat doesn't have. */
const chatLine = (wizard: string) => wizard.replace(/ Write your own(,| below)[^.]*\./, "").trim();

type AnglesAnswer = Extract<Answer, { kind: "angles" }>;
const anglesIn = (userId: string, threadId: string, msgId: string): AnglesAnswer | null => {
  const a = loadThreads(userId).find((t) => t.id === threadId)?.messages.find((m) => m.id === msgId)?.answer;
  return a?.kind === "angles" ? a : null;
};
/** Writes one audience's part of the message as it is now, so a press and an Add never overwrite each other. */
function putGroup(userId: string, threadId: string, msgId: string, id: string, patch: Partial<AngleGroup>): void {
  const a = anglesIn(userId, threadId, msgId);
  if (!a) return;
  const groups = groupsOf(a).map((g) => (g.id === id ? { ...g, ...patch } : g));
  void patchMsg(userId, threadId, msgId, { answer: { kind: "angles", groups, full: a.full ?? [], ...(a.error ? { error: a.error } : {}) } });
}

/**
 * The angles card's one press: the wizard's suggestion job for each audience in turn (each spends one campaign-angles
 * use, or up to 3 when Jev keeps fewer than 5), its angles or why none came written into the message as each lands.
 * Runs outside React, so leaving the chat still lands them.
 */
export async function suggestAngles(userId: string, threadId: string, msgId: string): Promise<void> {
  const a = anglesIn(userId, threadId, msgId);
  if (!a) return;
  const todo = groupsOf(a).filter((g) => !g.angles?.length && !g.added);
  if (!todo.length) return;
  if (suggestJob().state === "suggesting") return void patchMsg(userId, threadId, msgId, { answer: { ...a, error: BUSY_LINE } });
  if (a.error) void patchMsg(userId, threadId, msgId, { answer: { ...a, error: undefined } });
  for (const g of todo) {
    const audience = loadAudiences(userId).find((x) => x.id === g.id);
    if (!audience) {
      putGroup(userId, threadId, msgId, g.id, { error: GONE_AUDIENCE });
      continue;
    }
    const before = new Set((loadWork(userId, audience.id) ?? []).map((r) => r.id));
    await startSuggest(userId, audience);
    const fresh = (loadWork(userId, audience.id) ?? []).filter((r) => !before.has(r.id) && !r.used && r.origin === "suggested");
    const job = suggestJob();
    putGroup(userId, threadId, msgId, g.id, fresh.length
      ? { angles: fresh.map(({ title, line }) => ({ title, line })), error: undefined }
      : { error: chatLine(job.state === "failed" && job.key === jobKey(userId, audience.id) ? job.error : "Couldn't suggest angles right now. Try again.") });
  }
}

/**
 * "Add to <audience>": the ticked angles saved to it (confirmAngles), and its rows in the wizard's step dropped, since
 * they are saved now. Refused, with the line saying so, when they would take it past MAX_PER_AUDIENCE.
 */
export function addAngles(userId: string, threadId: string, msgId: string, audienceId: string, picked: AngleIdea[]): string | null {
  const g = (() => {
    const a = anglesIn(userId, threadId, msgId);
    return a ? groupsOf(a).find((x) => x.id === audienceId) : undefined;
  })();
  if (!g || !picked.length) return null;
  const room = roomFor(userId, audienceId);
  if (picked.length > room) {
    const error = fullLine(g.name, room);
    putGroup(userId, threadId, msgId, audienceId, { error });
    return error;
  }
  const { angles, error } = confirmAngles(userId, audienceId, picked.map(({ title, line }) => ({ title, line, origin: "suggested" as const })));
  const titles = new Set((g.angles ?? []).map((x) => x.title.trim().toLowerCase()));
  const rows = (loadWork(userId, audienceId) ?? []).filter((r) => r.used || !titles.has(r.title.trim().toLowerCase()));
  saveWork(userId, audienceId, rows.length ? rows : null);
  // not kept on this device: the wizard gets them as new rows instead of saved ones
  putGroup(userId, threadId, msgId, audienceId, { added: angles.map(({ id, title, line }) => (error ? { title, line } : { id, title, line })), error: error ?? undefined });
  return error;
}

/**
 * "Plan a campaign with these": the angles ticked in the wizard's step for this audience (this tab's rows). Saved
 * ones (with an id) are ticked where the step lists them; others go in as new rows.
 */
export function seedWizard(userId: string, audienceId: string, angles: AngleIdea[]): void {
  const saved = angles.filter((a) => a.id);
  const ids = new Set(saved.map((a) => a.id));
  const rows = (loadWork(userId, audienceId) ?? []).filter((r) => !ids.has(r.id));
  const ticked: StepRow[] = saved.map((a) => ({ id: a.id!, title: a.title, line: a.line, origin: "suggested", used: true, picked: true }));
  saveWork(userId, audienceId, addSuggested([...ticked, ...rows], angles.filter((a) => !a.id)));
}
