// Saved skills (/skills and the agent chat, Leo only; docs/north-star/items/agent-skills.md): the four ready-made
// skills, the brand's own (a saved instruction that runs in Write) and the last 30 results. runSkill runs outside React,
// so leaving /skills keeps a run going and its result still lands; the agent (agentRun.ts) and /skills both call it.
//   content-studio-chatskills-<scoped uid>: MySkill[], 12 at most, written whole (an edit overwrites, a delete rewrites the list)
//   content-studio-skillruns-<scoped uid>: SkillRun[], the newest 30
// Scheduled runs and their skillrunin- inbox rows wait for agent-autonomy's cron (phase 6 Q4), so `by` is "you" today.

import { withReal } from "@/lib/analytics";
import { planContextFor } from "@/lib/angleSuggest";
import { logActivity } from "@/lib/activity";
import { loadCompetitorAds } from "@/lib/competitorAds";
import { loadCompetitors } from "@/lib/competitors";
import { scanCompliance } from "@/lib/compliance";
import { draftStatus, loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { addDays, localDateKey } from "@/lib/dueDates";
import { callFn } from "@/lib/edgeFn";
import { loadFollowing } from "@/lib/following";
import { loadGoals, sgDay } from "@/lib/goals";
import { composeChecks, judgeHuman, measure, mostlyEnglish } from "@/lib/humanCheck";
import { links } from "@/lib/links";
import { plainQuote } from "@/lib/agentThreads";
import { scorePost } from "@/lib/postScore";
import { scoped } from "@/lib/profiles";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import { VOICE_MIN_CHARS, isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";
import { factLines } from "@/lib/writingJudge";
import type { AnswerAd } from "../../supabase/functions/idea-dump/logic.ts";
import { reportFacts, weekMoves, weekReport, type MoveId } from "../../supabase/functions/notify/logic.ts";

export type BuiltInId = "check" | "retro" | "check-week" | "answer";
export const BUILT_IN_SKILLS: { id: BuiltInId; name: string; slash: string; description: string; needs: "post" | "none" }[] = [
  { id: "check", name: "Check before posting", slash: "check", description: "Compliance, facts, AI tells and a predicted score for one post.", needs: "post" },
  { id: "retro", name: "Weekly retro", slash: "retro", description: "Last 7 days against the 7 before, and the one move to make.", needs: "none" },
  { id: "check-week", name: "Check this week's posts", slash: "check-week", description: "Compliance flags on every post scheduled in the next 7 days.", needs: "none" },
  { id: "answer", name: "Answer a competitor's new ad", slash: "answer", description: "Three posts that answer a competitor's newest ad.", needs: "none" },
];

/** One of yours: a saved instruction run in Write, on one of your posts or as a new post's topic. */
export interface MySkill {
  /** "s" + base 36, never uuid-shaped. */
  id: string;
  name: string;
  /** No leading "/": slashOf(name). */
  slash: string;
  instruction: string;
  works: "post" | "new";
  updatedAt: string;
}

export interface SkillRun {
  /** "r" + base 36; "" when nothing ran and nothing was saved (`step`, or a run that failed as a whole). */
  id: string;
  /** A built-in id, or one of yours by its slash. */
  skill: string;
  name: string;
  at: string;
  by: "you" | "schedule";
  /** The post's title for a skill that works on a post, else "". */
  title: string;
  lines: string[];
  links: { label: string; path: string }[];
  failed?: string;
  postId?: string;
  seen?: boolean;
  /** The server calls the run made: the agent's meta line. */
  calls?: number;
  /**
   * Nothing ran: "pick-post" (lines ask which post, links are the choices to /skills?skill=&post=), "unknown" (no such
   * skill: the list and Open skills) or "open" (one of yours: links[0] is the Write page that runs it, a priced rewrite
   * when it works on a post).
   */
  step?: "pick-post" | "unknown" | "open";
}

export const MAX_SKILLS = 12;
export const MAX_RUNS = 30;
export const NAME_CHARS = 40;
/** Write's ?ask= limit. */
export const INSTRUCTION_CHARS = 300;
export const FULL_LINE = `You can keep ${MAX_SKILLS} skills. Delete one to add another.`;
export const PICK_LINE = "Which post? Pick one.";
/** Built-in skills whose run spends a priced use, so a link never starts them (contracts, wave 1). */
export const PRICED: readonly string[] = ["answer"];
/**
 * Built-in skills whose lines quote words the app did not write (an ad, a post, an account you follow): their messages,
 * the agent's and Ask about this's, are never sent to the feedback service. Read from the run's skill, so runs saved
 * before the flag count too.
 */
export const QUOTING: readonly string[] = ["check", "retro", "check-week", "answer"];

const SKILLS = "content-studio-chatskills-";
const RUNS = "content-studio-skillruns-";
const SKILLS_CHANGED = "content-studio-chatskills-changed";
const RUNS_CHANGED = "content-studio-skillruns-changed";
const DAY = 86_400_000;

export const skillsKey = (userId: string) => SKILLS + scoped(userId);
export const runsKey = (userId: string) => RUNS + scoped(userId);
const id36 = (prefix: "s" | "r", now: Date) => `${prefix}${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
export const newSkillId = (now = new Date()) => id36("s", now);

function read<T>(key: string, ok: (v: T) => boolean): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}
function write(key: string, value: unknown, event: string): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(event));
  return true;
}

/** "Tighten for LinkedIn!" is tighten-for-linkedin: lowercase, spaces to hyphens, other characters dropped. */
export const slashOf = (name: string): string =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

const isSkill = (s: MySkill) => !!s && typeof s.id === "string" && typeof s.slash === "string" && typeof s.instruction === "string";
export const loadMySkills = (userId: string): MySkill[] => read<MySkill>(skillsKey(userId), isSkill).slice(0, MAX_SKILLS);

/** Adds one, or overwrites the one with its id. The error line, or null when saved. */
export function saveMySkill(userId: string, s: Pick<MySkill, "name" | "instruction" | "works"> & { id?: string }): string | null {
  const name = s.name.replace(/\s+/g, " ").trim().slice(0, NAME_CHARS);
  const slash = slashOf(name);
  if (!slash) return "Give it a name.";
  const instruction = s.instruction.trim().slice(0, INSTRUCTION_CHARS);
  if (!instruction) return "Say what it should do.";
  const list = loadMySkills(userId);
  const old = s.id ? list.find((x) => x.id === s.id) : undefined;
  if (BUILT_IN_SKILLS.some((b) => b.slash === slash) || list.some((x) => x.slash === slash && x.id !== old?.id)) return `You already have /${slash}. Pick another name.`;
  if (!old && list.length >= MAX_SKILLS) return FULL_LINE;
  const item: MySkill = { id: old?.id ?? s.id ?? newSkillId(), name, slash, instruction, works: s.works === "new" ? "new" : "post", updatedAt: new Date().toISOString() };
  return write(skillsKey(userId), old ? list.map((x) => (x.id === old.id ? item : x)) : [...list, item], SKILLS_CHANGED) ? null : SAVE_FAILED;
}

/** Rewrites the list without it (no tombstone); returns it for Undo, or null when it wasn't there or couldn't save. */
export function removeMySkill(userId: string, id: string): MySkill | null {
  const list = loadMySkills(userId);
  const gone = list.find((x) => x.id === id);
  return gone && write(skillsKey(userId), list.filter((x) => x.id !== id), SKILLS_CHANGED) ? gone : null;
}

/** Undo for removeMySkill: the error line (its slash taken, or 12 kept since), or null when it is back. */
export function restoreMySkill(userId: string, s: MySkill): string | null {
  const list = loadMySkills(userId);
  if (list.some((x) => x.id === s.id)) return null;
  if (list.some((x) => x.slash === s.slash)) return `You already have /${s.slash}. Pick another name.`;
  if (list.length >= MAX_SKILLS) return FULL_LINE;
  return write(skillsKey(userId), [...list, s], SKILLS_CHANGED) ? null : SAVE_FAILED;
}

/** "/check CPF post" is { skill: "check", rest: "CPF post" }. Null unless the text starts with "/" and a word; any word, so runSkill answers an unknown one. */
export function matchSlash(text: string, mine: MySkill[]): { skill: string; rest: string } | null {
  const m = /^\/([^\s/]+)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  const word = slashOf(m[1]);
  if (!word) return null;
  const skill = BUILT_IN_SKILLS.find((b) => b.slash === word)?.id ?? mine.find((s) => s.slash === word)?.slash ?? word;
  return { skill, rest: m[2].trim() };
}

/** Answer a competitor's new ad shows once competitor ads are stored for this brand. */
export const answerShown = (userId: string): boolean => Object.values(loadCompetitorAds(userId)).some((e) => e.ads.length > 0);

// ---- Results ---------------------------------------------------------------------------------------------------

const isRun = (r: SkillRun) => !!r && typeof r.id === "string" && !!r.id && typeof r.at === "string" && Array.isArray(r.lines) && Array.isArray(r.links);
export const loadSkillRuns = (userId: string): SkillRun[] => read<SkillRun>(runsKey(userId), isRun).slice(0, MAX_RUNS);

/** The newest 30, newest first; half of them when storage is full, else nothing (the run still shows where it ran). */
function saveRun(userId: string, run: SkillRun): void {
  const list = [run, ...loadSkillRuns(userId).filter((r) => r.id !== run.id)].sort((a, b) => b.at.localeCompare(a.at));
  if (!write(runsKey(userId), list.slice(0, MAX_RUNS), RUNS_CHANGED)) write(runsKey(userId), list.slice(0, MAX_RUNS / 2), RUNS_CHANGED);
}

export function markSeen(userId: string, id: string): void {
  const list = loadSkillRuns(userId);
  if (list.some((r) => r.id === id && !r.seen)) write(runsKey(userId), list.map((r) => (r.id === id ? { ...r, seen: true } : r)), RUNS_CHANGED);
}

export function onSkillsChanged(cb: () => void): () => void {
  window.addEventListener(SKILLS_CHANGED, cb);
  window.addEventListener(RUNS_CHANGED, cb);
  return () => {
    window.removeEventListener(SKILLS_CHANGED, cb);
    window.removeEventListener(RUNS_CHANGED, cb);
  };
}

/** A result as one message: the heading line, then its lines (the agent's text and Ask about this). */
export const skillRunText = (r: SkillRun): string => [`${r.name}${r.title ? ` on "${r.title}"` : ""}:`, ...r.lines].join("\n");

// ---- Running ---------------------------------------------------------------------------------------------------

const running = new Set<string>();
/** True while a run of this skill is going in this tab (the card's Running...). */
export const isRunning = (skill: string) => running.has(skill);

export const postTitle = (d: Pick<DraftEntry, "hook" | "draft" | "pillarDetail">) =>
  (d.hook || d.pillarDetail || d.draft.split("\n").find((l) => l.trim()) || "Untitled post").trim().slice(0, 80);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
/** "a"; "a" and "b"; "a", "b" and "c". */
const quoted = (words: string[]) => {
  const q = words.map((w) => `"${w}"`);
  return q.length < 2 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
};
const reasonOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "Try again in a minute.");
const textOf = (d: DraftEntry) => d.draft.trim() || d.hook.trim();

/** The posts a skill can run on, in the chooser's order: the next scheduled ones, then the newest drafts. */
export function postChoices(userId: string, now = new Date(), max = 5): DraftEntry[] {
  const today = localDateKey(now);
  const live = loadDrafts(userId).filter((d) => textOf(d) && draftStatus(d) !== "posted");
  const next = live.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) >= today).sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  const drafts = live.filter((d) => draftStatus(d) === "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...next, ...drafts].slice(0, max);
}

/** The ads that started in the last 7 days (Singapore days), longest-running first, 10 at most. */
export function newAds(userId: string, now = new Date()): AnswerAd[] {
  const names = new Map(loadCompetitors(userId).list.map((c) => [c.id, c.name]));
  const today = Date.parse(sgDay(now));
  const out: AnswerAd[] = [];
  for (const [id, e] of Object.entries(loadCompetitorAds(userId))) {
    for (const ad of e.ads) {
      // an ad with no start date counts from the check that first found it
      const first = ad.start ?? (e.fresh.includes(ad.id) ? sgDay(e.checkedAt) : null);
      const days = first ? Math.round((today - Date.parse(first)) / DAY) : -1;
      const text = [ad.headline, ad.body].filter(Boolean).join("\n").trim();
      if (days < 0 || days >= 7 || !text) continue;
      out.push({ id: ad.id, advertiser: e.pageName || names.get(id) || "A competitor", text, days, format: ad.format });
    }
  }
  return out.sort((a, b) => b.days - a.days).slice(0, 10);
}

type Part = Pick<SkillRun, "lines" | "links" | "calls">;

async function runCheck(userId: string, d: DraftEntry): Promise<Part> {
  const text = textOf(d);
  const flags = [...new Map(scanCompliance(text).map((f) => [f.match.toLowerCase(), f.match])).values()];
  const profile = loadVoiceProfile(userId);
  const samples = isVoiceProfileUsable(profile) ? (profile?.posts ?? []).filter((p) => p.trim().length >= VOICE_MIN_CHARS).slice(0, 3) : [];
  const english = mostlyEnglish(text);
  // each part can fail alone without stopping the others
  const [facts, human, score] = await Promise.allSettled([factLines(text), english ? judgeHuman(text, samples) : null, scorePost(text, d.platform)]);
  const lines = [flags.length ? `Compliance: ${plural(flags.length, "flag")}, ${quoted(flags)}.` : "Compliance: no flags."];
  if (facts.status === "rejected") lines.push(`Facts to check: couldn't check this. ${reasonOf(facts.reason)}`);
  else lines.push(facts.value.length ? `Facts to check: ${facts.value.length}.` : "Facts to check: none.", ...facts.value.map((l) => `- ${l}`));
  if (human.status === "rejected") lines.push(`Sounds human: couldn't check this. ${reasonOf(human.reason)}`);
  else {
    const r = composeChecks(measure(text), human.value);
    const fix = r.checks.find((c) => c.id === r.fixFirst);
    lines.push(fix ? `Sounds human: ${r.passed} of ${r.counted} pass. Fix first: ${fix.label}.` : `Sounds human: ${r.passed} of ${r.counted} checks pass.`);
  }
  lines.push(score.status === "rejected" ? `Predicted: couldn't check this. ${reasonOf(score.reason)}` : `Predicted: ${Math.round(score.value.score * 10) / 10} of 10.`);
  const go = [{ label: "Open in Write", path: links.generate({ draft: d.id }) }];
  if (flags.length) go.push({ label: "Fix the flags", path: links.generate({ draft: d.id, ask: `Rewrite without these words: ${flags.join(", ")}. Keep everything else.` }) });
  return { lines, links: go, calls: english ? 3 : 2 };
}

async function runRetro(userId: string, now: Date): Promise<Part> {
  // Analytics' This week card: the same report, and Jev's one move through week-pick
  const goal = Object.values(loadGoals(userId)).reduce((s, n) => s + (n ?? 0), 0);
  const report = weekReport(loadDrafts(userId).map(withReal), loadFollowing(userId), sgDay(now), goal);
  const go = [{ label: "Open Analytics", path: links.analytics() }];
  if (!report.posts && !report.prevPosts) return { lines: ["No posts marked posted in the last 14 days."], links: go, calls: 0 };
  const facts = reportFacts(report);
  const lines = facts.split("\n");
  const moves = weekMoves(report);
  if (moves.length < 2) return { lines, links: go, calls: 0 };
  // without a Jev answer the move line is left out
  const pick = await callFn<{ pick: MoveId | null }>("week-pick", { facts, moves }).then((r) => r?.pick ?? null, () => null);
  const move = moves.find((m) => m.id === pick);
  return { lines: move ? [...lines, `This week's move: ${move.text}`] : lines, links: go, calls: 1 };
}

function runCheckWeek(userId: string, now: Date): Part {
  const today = localDateKey(now);
  const end = addDays(today, 7);
  const posts = loadDrafts(userId)
    .filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) >= today && (d.scheduledFor ?? "").slice(0, 10) < end)
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  if (!posts.length) return { lines: ["Nothing is scheduled in the next 7 days."], links: [], calls: 0 };
  const flagged = posts.flatMap((d) => {
    const words = [...new Map(scanCompliance(textOf(d)).map((f) => [f.match.toLowerCase(), f.match])).values()];
    return words.length ? [{ d, words }] : [];
  });
  const head = `${plural(posts.length, "post")} scheduled in the next 7 days.`;
  if (!flagged.length) return { lines: [`${head} None has a flag.`], links: [], calls: 0 };
  return {
    lines: [`${head} ${flagged.length} ${flagged.length === 1 ? "has" : "have"} flags:`, ...flagged.map(({ d, words }) => `"${postTitle(d)}": ${words.map((w) => `"${w}"`).join(", ")}`)],
    // one Open per flagged post, named so the chips tell apart
    links: flagged.map(({ d }) => ({ label: `Open "${short(postTitle(d), 40)}"`, path: links.calendar({ post: d.id }) })),
    calls: 0,
  };
}

async function runAnswer(userId: string, now: Date): Promise<Part> {
  const ads = newAds(userId, now);
  if (!ads.length) return { lines: ["No new competitor ads this week."], links: [], calls: 0 };
  // throws the function's own words (the daily limit, not switched on, try again): the run fails as a whole
  const res = await callFn<{ ad: string; angles: { title: string; line: string }[] }>("idea-dump", { mode: "answer", ads, context: planContextFor(userId) });
  const ad = ads.find((a) => a.id === res?.ad) ?? ads[0];
  // angles are written from the ad's words: plain quotes in the chips and Write's topic too (runSkill does the lines)
  const angles = (Array.isArray(res?.angles) ? res.angles : []).map((a) => ({ title: plainQuote(a.title), line: plainQuote(a.line) }));
  const first = short(plainQuote(ad.text.split("\n").find((l) => l.trim()) ?? ""), 80);
  // the post never sees the ad's words: Write gets the angle and one line on the ad
  const ctx = `A reply to a competitor's ${ad.format} ad that has run ${plural(ad.days, "day")}.`;
  return {
    lines: [`${ad.advertiser} started "${first}" ${ad.days ? `${plural(ad.days, "day")} ago` : "today"} (${ad.format}).`, ...angles.map((a, i) => `${i + 1}. ${a.title}: ${a.line}`)],
    links: angles.map((a) => ({ label: `Write this: ${a.title}`, path: links.generate({ pillar: "topic", detail: `${a.title}: ${a.line}`, ctx }) })),
    calls: 1,
  };
}

/**
 * Runs one skill (a built-in id, or one of yours by its slash) and saves its result to the newest 30, logging "Ran
 * <name>". A skill that needs a post and has none (or one that is gone) answers with the post choices; one of yours
 * answers with the Write page that runs it; neither is saved. Priced runs (answer) spend at once: the card or the button
 * showing the price is the caller's.
 */
export async function runSkill(userId: string, skill: string, input: { postId?: string; rest?: string } = {}, now = new Date()): Promise<SkillRun> {
  const mine = loadMySkills(userId);
  const built = BUILT_IN_SKILLS.find((b) => b.id === skill);
  const own = built ? undefined : mine.find((s) => s.slash === skill);
  const base = { id: "", skill, name: built?.name ?? own?.name ?? `/${skill}`, at: now.toISOString(), by: "you" as const, title: "", lines: [] as string[], links: [] as SkillRun["links"] };
  if (!built && !own) {
    const yours = [...BUILT_IN_SKILLS.filter((b) => b.id !== "answer" || answerShown(userId)).map((b) => b.slash), ...mine.map((s) => s.slash)].map((s) => `/${s}`);
    return { ...base, step: "unknown", lines: [`No skill called /${skill}. Yours are ${yours.join(", ")}.`], links: [{ label: "Open skills", path: links.skills() }] };
  }
  const needsPost = built ? built.needs === "post" : own!.works === "post";
  const post = needsPost && input.postId ? loadDrafts(userId).find((d) => d.id === input.postId && textOf(d) && draftStatus(d) !== "posted") : undefined;
  if (needsPost && !post) {
    const choices = postChoices(userId, now);
    if (!choices.length) return { ...base, step: "pick-post", lines: ["No drafts to check yet."], links: [{ label: "Open Write", path: links.generate() }] };
    return { ...base, step: "pick-post", lines: [PICK_LINE], links: choices.map((d) => ({ label: short(postTitle(d), 40), path: links.skills({ skill, post: d.id }) })) };
  }
  if (own) {
    const path = post ? links.generate({ draft: post.id, ask: own.instruction }) : links.generate({ pillar: "topic", detail: own.instruction });
    const line = post ? `Open "${postTitle(post)}" in Write and rewrite it: "${short(own.instruction, 160)}"` : `Open Write with "${short(own.instruction, 160)}" as the topic.`;
    return { ...base, step: "open", title: post ? postTitle(post) : "", postId: post?.id, lines: [line], links: [{ label: "Open in Write", path }] };
  }
  running.add(skill);
  window.dispatchEvent(new Event(RUNS_CHANGED));
  try {
    const part =
      skill === "check" ? await runCheck(userId, post!)
      : skill === "retro" ? await runRetro(userId, now)
      : skill === "check-week" ? runCheckWeek(userId, now)
      : await runAnswer(userId, now);
    // every line may quote words the app did not write (an ad, a post, an account you follow): plain quotes, one per line
    const run: SkillRun = { ...base, ...part, lines: part.lines.map(plainQuote), id: id36("r", now), title: post ? postTitle(post) : "", ...(post ? { postId: post.id } : {}) };
    saveRun(userId, run);
    logActivity(userId, {
      who: "you", kind: "run", title: `Ran ${run.name}${run.title ? ` on "${run.title}"` : ""}`, link: links.skills({ run: run.id }),
      ...(skill === "answer" && run.calls ? { uses: { feature: "skill-answer" as const, n: 1 } } : {}),
    }, now);
    return run;
  } catch (e) {
    return { ...base, failed: reasonOf(e), lines: [reasonOf(e)] };
  } finally {
    running.delete(skill);
    window.dispatchEvent(new Event(RUNS_CHANGED));
  }
}
