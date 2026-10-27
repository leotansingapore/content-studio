// The agent (docs/north-star/items/agent-chat.md; phase6-build-brief.md, "Agent engine API"): one turn at a time per
// thread, run outside React like the makers' jobs, so leaving /agent loses nothing. A message goes to assistant-act
// once (Jev picks the act and fills its slots; a "/" message never asks Jev), and the agent answers with a fixed line,
// a card, or the feedback service's words. A card's press runs its plan (agentPlans.ts): every priced step waits for a
// press on a card that shows its price, and a typed yes approves only the one proposed card, only under US$1.
// Stop aborts the Jev call only; after a press the make finishes. Turns, cards and receipts live in the thread
// messages (agentThreads.ts), so a reload shows them and resumeAgent picks up what was running.

import { budgetAnswer } from "@/lib/agentBudget";
import { needsCard, nextCard, runUndo, UNDONE, type AgentCard, type AgentFormat, type AgentPick, type Receipt } from "@/lib/agentCards";
import { forgetPick, lastUndoable, learningLines, LEARNING_REMOVED, memoryAnswer, SEE_LEARNED, undidLine, UNDO_LINE, dismissNudge, noteCorrection } from "@/lib/agentMemory";
import {
  answerCard, approveLabel, blockedReason, campaignReply, changeCard, chipFormat, competitorCard, dockCard, dropPageUndo, fieldsOf, formatFor, holdTarget,
  lastMake, learningCard, LINES, linkIn, makeCard, makeCheck, MAX_SCRIPT_WORDS, MIN_SCRIPT_WORDS, offerChips, OPEN_ANALYTICS, OPEN_SWIPE, OPEN_VOICE, pageUndo, planOf,
  reformat, resumePress, runPress, setNavigate, subjectOf, topicOf, usageNow, withInput, withScript, withWho, type Chip as GoChip, type Live, type Reply,
} from "@/lib/agentPlans";
import { appendMsg, loadThreads, newMsg, newThread, patchMsg, type AgentMsg, type AgentThread, type TurnState } from "@/lib/agentThreads";
import { logActivity } from "@/lib/activity";
import { LOOKS } from "@/lib/aiVideo";
import { askAgent, conflictFor, type AgentAsk } from "@/lib/assistantActs";
import { loadAudiences } from "@/lib/audiences";
import { loadAutonomy, recordShadow } from "@/lib/autonomy";
import { loadCompetitorAds } from "@/lib/competitorAds";
import { loadDrafts } from "@/lib/draftHistory";
import { EdgeError } from "@/lib/edgeFn";
import { currentEditTarget } from "@/lib/editTarget";
import { links } from "@/lib/links";
import { priceText } from "@/lib/prices";
import { speakerFor } from "@/lib/remixBrand";
import { resolveSource } from "@/lib/resolveSource";
import { speakers } from "@/lib/talkingHead";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { activeLearnings, addLearning, loadLearnings, setLearningOff } from "@/lib/voiceMemory";
import type { AgentP as ServerP, AgentPick as ServerPick } from "../../supabase/functions/assistant-act/logic.ts";
import { MAX_PROMPT } from "../../supabase/functions/ai-image/logic.ts";
import { mostlyEnglish } from "../../supabase/functions/post-score/logic.ts";
import * as chatSkills from "@/lib/chatSkills";

export { approveLabel, blockedReason, setNavigate };

export type Chip = "post" | "carousel" | "video" | "campaign";
export interface Turn {
  thread: string;
  msg: string;
  state: "starting" | "thinking" | "writing" | "making" | "done" | "stopped" | "failed";
  startedAt: number;
  steps: number;
  line?: string;
}

// ---------- fixed lines (agent-chat's copy) ----------

export const STOPPED = "Stopped. Nothing was made.";
export const STILL_MAKING = "It's already being made, so it will finish. It shows here when it's ready.";
export const FAILED_LINE = "That didn't go through. Nothing was used.";
export const INTERRUPTED = "This was interrupted.";
export const CAP_LINE = "I've acted on 100 messages today. Until 8am Singapore time I can answer questions, but I can't make or change anything.";
export const NO_FEEDBACK = "I can't answer that here. Ask me to make, move or check something.";
export const CAPABILITIES =
  "I make posts, carousels, scripts you film, talking videos, explainer videos and pictures, from a topic or from a post you want remixed. I can also move a post on your calendar, rewrite one in Write, add a competitor, show last week's numbers and paste comments or DMs into Reply drafts. Anything paid shows its price first, and nothing gets posted without you.";
export const REFUSE = {
  person: "I can't make that. Posts can't promise returns or name an insurer's products, and a remix copies the structure, never the words or another person's face.",
  business: "I can't make that. A remix copies the structure, never the words or another person's face or voice.",
} as const;
const OPEN_MY_POSTS = { path: "/drafts", label: "Open My posts" };
export const NOT_MADE = "Nothing was made or charged.";
const OVER_A_DOLLAR = 1;

// ---------- hooks the pages register ----------

/** The feedback service's answer for a message no act fits (agent-page's dockActions.ts): its words and chips. */
export type Feedback = (userId: string, threadId: string, text: string) => Promise<{ text: string; go?: GoChip[] }>;
let feedback: Feedback | null = null;
export const setFeedback = (fn: Feedback | null) => void (feedback = fn);

/** One of the person's own skills, as far as the engine reads it. */
export interface MySkillLike {
  id: string;
  name: string;
  slash: string;
  instruction: string;
}
/** What a skill run answers (chatSkills.ts SkillRun, as far as the engine reads it). */
export interface SkillRunLike {
  id: string;
  name: string;
  title: string;
  lines: string[];
  links: { label: string; path: string }[];
  failed?: string;
  postId?: string;
  calls?: number;
  step?: "pick-post" | "unknown" | "open";
}
/** chatSkills.ts's API as merged in wave 2 (chat-skills): slashes are ids with no "/", runSkill never asks Jev. */
export interface SkillsApi {
  PRICED: readonly string[];
  QUOTING: readonly string[];
  loadMySkills(userId: string): MySkillLike[];
  matchSlash(text: string, mine: MySkillLike[]): { skill: string; rest: string } | null;
  runSkill(userId: string, skill: string, input: { postId?: string; rest?: string }): Promise<SkillRunLike>;
  skillRunText(r: SkillRunLike): string;
}
const SKILLS: SkillsApi = chatSkills;
let skillsOverride: SkillsApi | null | undefined;
/** The skills module the engine runs: chatSkills.ts, or the one passed here (tests). */
export const setSkills = (api: SkillsApi | null | undefined) => void (skillsOverride = api);
const skillsApi = (): SkillsApi | null => (skillsOverride !== undefined ? skillsOverride : SKILLS);

// ---------- the store ----------

let clock: () => number = () => Date.now();
const turns = new Map<string, Turn>();
const aborts = new Map<string, AbortController>();
const following = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const RUNNING: Turn["state"][] = ["starting", "thinking", "writing", "making"];
const running = (t: Turn | undefined) => !!t && RUNNING.includes(t.state);

export const turnOf = (threadId: string): Turn | null => turns.get(threadId) ?? null;
export function onAgent(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function setTurn(thread: string, msg: string, patch: Partial<Turn>) {
  const t = turns.get(thread);
  if (t && t.msg !== msg) return; // a newer turn owns the thread
  turns.set(thread, { ...(t ?? { thread, msg, state: "starting", startedAt: clock(), steps: 0 }), ...patch });
  emit();
}

const threadOf = (userId: string, id: string): AgentThread | undefined => loadThreads(userId).find((t) => t.id === id);
const msgOf = (userId: string, thread: string, id: string): AgentMsg | undefined => threadOf(userId, thread)?.messages.find((m) => m.id === id);
const put = (userId: string, thread: string, msg: string, patch: Partial<Omit<AgentMsg, "id">>) => void patchMsg(userId, thread, msg, patch, new Date(clock()));

/** The one proposed card in a thread, or null with none or several (a typed yes then is a new request). */
function onlyProposed(messages: AgentMsg[]): { msg: string; card: AgentCard } | null {
  const list = messages.filter((m) => m.card?.status === "proposed");
  return list.length === 1 ? { msg: list[0].id, card: list[0].card! } : null;
}

function liveFor(thread: string, msg: string): Live & { steps: () => number } {
  let n = 0;
  return {
    step: (line, state) => setTurn(thread, msg, { line, state }),
    call: () => setTurn(thread, msg, { steps: ++n }),
    steps: () => n,
  };
}

// ---------- send ----------

/** Sends a message: the user row and the agent's Starting row are written before this returns the thread id. */
export function send(userId: string, threadId: string | null, text: string, o: { chip?: Chip; source?: string } = {}): string {
  const said = text.trim();
  if (threadId && running(turns.get(threadId)) && turns.get(threadId)!.state !== "making") return threadId;
  const at = new Date(clock());
  const user = newMsg("user", { text: said, ...(o.source ? { source: o.source } : {}) }, at);
  const agent = newMsg("agent", { turn: "starting" }, at);
  let id = threadId ?? "";
  const saved = threadId ? appendMsg(userId, threadId, user, at) : newThread(userId, [user, agent], at);
  if (saved.ok === false) {
    turns.set(id, { thread: id, msg: "", state: "failed", startedAt: at.getTime(), steps: 0, line: saved.error });
    emit();
    return id;
  }
  if (threadId) {
    const b = appendMsg(userId, threadId, agent, at);
    if (b.ok === false) {
      turns.set(id, { thread: id, msg: "", state: "failed", startedAt: at.getTime(), steps: 0, line: b.error });
      emit();
      return id;
    }
  } else id = saved.item.id;
  turns.set(id, { thread: id, msg: agent.id, state: "starting", startedAt: at.getTime(), steps: 0 });
  emit();
  void runTurn(userId, id, agent.id, said, o);
  return id;
}

async function runTurn(userId: string, thread: string, msg: string, text: string, o: { chip?: Chip; source?: string }) {
  const ctl = new AbortController();
  aborts.set(thread, ctl);
  const live = liveFor(thread, msg);
  const t0 = clock();
  setTurn(thread, msg, { state: "thinking" });
  put(userId, thread, msg, { turn: "thinking" });
  let reply: Reply & { turn?: TurnState };
  try {
    reply = await decide(userId, thread, msg, text, o, ctl.signal, live);
  } catch {
    reply = ctl.signal.aborted ? { text: STOPPED, turn: "stopped" } : { text: FAILED_LINE, turn: "failed" };
  }
  if (ctl.signal.aborted && reply.turn !== "stopped") reply = { text: STOPPED, turn: "stopped" };
  aborts.delete(thread);
  const state = reply.turn ?? "done";
  const { turn: _t, ...rest } = reply;
  put(userId, thread, msg, { ...rest, turn: state, meta: { steps: live.steps(), ms: clock() - t0 }, ...(state === "failed" ? { error: true } : {}) });
  if (turns.get(thread)?.msg === msg) {
    turns.set(thread, { ...turns.get(thread)!, state, line: undefined });
    emit();
  }
}

/** Stops a thinking turn (the Jev call is aborted, nothing after it runs); a running make finishes and says so. */
export function stop(threadId: string): void {
  const t = turns.get(threadId);
  if (!running(t)) return;
  const ctl = aborts.get(threadId);
  if (ctl) return ctl.abort();
  setTurn(threadId, t!.msg, { line: STILL_MAKING });
}

// ---------- deciding ----------

interface Sent {
  speakers: { id: string; look: string }[];
  audiences: { id: string; name: string }[];
  skills: { id: string; slash: string; name: string; instruction: string }[];
  learnings: string[];
}

function sentLists(userId: string, api: SkillsApi | null): Sent {
  const s = speakers(userId);
  return {
    speakers: [
      ...(s.face ? [{ id: "mine", look: "The person themselves, from their own saved face." }] : []),
      ...s.presenters.map((p) => ({ id: p.id, look: (p.look.trim() || p.name || "A saved presenter").slice(0, 160) })),
      ...LOOKS.map((look) => ({ id: "new", look })),
    ].slice(0, 7),
    audiences: loadAudiences(userId).filter((a) => a.name.trim()).slice(0, 6).map((a) => ({ id: a.id, name: a.name.slice(0, 60) })),
    skills: (api?.loadMySkills(userId) ?? []).filter((x) => x.name.trim() && x.instruction.trim()).slice(0, 12),
    learnings: learningLines(loadLearnings(userId)),
  };
}

/** The server's pick in agentCards' shape: indexes into what was sent read as their ids, slides 1-based. */
export function clientPick(pick: ServerPick, sent: Pick<Sent, "speakers" | "audiences" | "skills">): AgentPick | null {
  if (!pick.act) return null;
  const at = <T>(list: T[], i: number | null) => (i === null ? undefined : list[i]);
  return {
    act: pick.act,
    format: pick.format,
    length: pick.length as AgentPick["length"],
    who: at(sent.speakers, pick.who)?.id ?? null,
    audience: at(sent.audiences, pick.audience)?.id ?? null,
    weeks: pick.weeks as AgentPick["weeks"],
    pace: pick.pace as AgentPick["pace"],
    slide: pick.slide === null ? null : pick.slide + 1,
    which: pick.which === "last" ? "last" : pick.which === null ? null : `l${pick.which + 1}`,
    skill: at(sent.skills, pick.skill)?.slash ?? null,
    post: pick.post,
    day: pick.day,
    time: pick.time,
    scope: pick.scope,
    subject: pick.subject,
    name: pick.name,
  };
}

const hasAds = (userId: string) => Object.values(loadCompetitorAds(userId)).some((e) => e.ads.length > 0);
/** The draft Write has open, when the agent is asked from the dock on Write. */
const writeDraft = () => (typeof location !== "undefined" && location.pathname === "/generate" ? (new URLSearchParams(location.search).get("draft") ?? undefined) : undefined);

type Out = Reply & { turn?: TurnState };

async function decide(userId: string, thread: string, msg: string, text: string, o: { chip?: Chip; source?: string }, signal: AbortSignal, live: ReturnType<typeof liveFor>): Promise<Out> {
  const messages = (threadOf(userId, thread)?.messages ?? []).filter((m) => m.id !== msg);
  const api = skillsApi();
  if (text.startsWith("/")) return slash(userId, text, api, live);
  const src = o.source ? resolveSource(o.source, userId) : null;
  const sent = sentLists(userId, api);
  const pending = onlyProposed(messages);
  const target = currentEditTarget();
  const made = lastMake(messages);
  const fields: AgentAsk = {
    ...(o.chip ? { chip: o.chip } : {}),
    speaker: speakerFor(userId),
    ...(src ? { source: { kind: src.kind, format: src.format, title: (src.title || src.key).slice(0, 120) } } : {}),
    pending: pending?.card.title ?? "",
    ...(target ? { open: { kind: target.kind, title: target.title.slice(0, 120) || "Untitled", slides: (target.slides ?? []).slice(0, 10), ...(target.onScreen ? { onScreen: target.onScreen } : {}) } } : {}),
    learnings: sent.learnings,
    lastChange: lastUndoable(messages)?.title ?? "",
    speakers: sent.speakers,
    audiences: sent.audiences.map(({ id, name }) => ({ id, name })),
    skills: sent.skills.map(({ slash: s, name, instruction }) => ({ slash: s, name, instruction })),
    competitorAds: hasAds(userId),
    ...(made ? { last: { format: made.format, subject: made.subject } } : {}),
  };
  let ans: { pick: ServerPick | null; p: ServerP } | null = null;
  // Jev reads English best: other text works through the chips and "/" only
  if (mostlyEnglish(text)) {
    live.call();
    try {
      ans = await askAgent(userId, text, fields, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      if (e instanceof EdgeError && e.code === "daily_limit") {
        const words = await feedbackReply(userId, thread, text, live);
        return { text: [CAP_LINE, words.text].filter(Boolean).join("\n\n"), go: words.go };
      }
      if (!o.chip) return { text: FAILED_LINE, turn: "failed" };
    }
  }
  if (signal.aborted) throw new Error("stopped");
  const p = (ans?.p ?? {}) as Record<string, number | null>;
  const cp = ans?.pick ? clientPick(ans.pick, sent) : null;
  // who appears, with its look: a new presenter's look is only known by the server's index
  const speaker = ans?.pick?.who != null ? (sent.speakers[ans.pick.who] ?? null) : null;
  if (!cp) return o.chip ? chipReply(userId, text, o.chip, src, p) : feedbackReply(userId, thread, text, live);
  const act = cp.act;
  if (cp.skill && act !== "approve" && act !== "decline") {
    const mine = sent.skills.find((x) => x.slash === cp.skill);
    const postId = (cp.post === null ? undefined : loadDrafts(userId)[cp.post]?.id) ?? writeDraft();
    if (mine && api) return skillReply(userId, api, mine.slash, { rest: text, postId }, live);
  }
  switch (act) {
    case "approve":
    case "decline":
      return typed(userId, thread, text, act, pending);
    case "make":
    case "remix":
      return makeReply(userId, text, act, cp, p, src, o.chip, speaker, made);
    case "competitor":
      return competitorCard(userId, text, act, p, undefined, cp.name);
    case "campaign":
      return campaignReply(userId, { audience: cp.audience, weeks: cp.weeks, pace: cp.pace, format: cp.format, act, p }).then((r) => (r.card ? guard(userId, r, text) : r));
    case "capabilities":
      return { text: CAPABILITIES, go: [OPEN_SWIPE, OPEN_MY_POSTS] };
    case "refuse":
      return { text: REFUSE[speakerFor(userId)] };
    case "budget":
      return { text: budgetAnswer(await usageNow()) };
    case "memory":
      return { text: memoryAnswer(userId), go: [SEE_LEARNED] };
    case "forget":
      return forgetReply(userId, thread, cp.which, messages);
    case "remember": {
      const scope = cp.scope ?? "all";
      live.call();
      const conflict = await conflictFor(userId, text, scope);
      const c = learningCard(text, scope, conflict && conflict !== "capped" ? conflict : null, act, p);
      const full = !!blockedReason(userId, c, null);
      return { card: c, ...(full ? { go: [OPEN_VOICE] } : {}) };
    }
    case "check": {
      const d = cp.post === null ? undefined : loadDrafts(userId)[cp.post];
      return api ? skillReply(userId, api, "check", { postId: d?.id ?? writeDraft(), rest: text }, live) : feedbackReply(userId, thread, text, live);
    }
    case "answer":
      return guard(userId, { card: answerCard(act, p) }, text);
    case "week":
      if (api) return skillReply(userId, api, "retro", {}, live);
      return dockCard(userId, { act, post: null, day: null, time: null, message: text, p }) ?? feedbackReply(userId, thread, text, live);
    case "edit": {
      if (!target) return feedbackReply(userId, thread, text, live);
      const c = changeCard(target, text, cp.slide, act, p);
      holdTarget(c.id, target);
      return guard(userId, { card: c }, text);
    }
    default: {
      // move, write and the four pastes: today's dock acts, drawn as cards
      const r = dockCard(userId, { act, post: cp.post, day: cp.day, time: cp.time, message: text, p });
      if (!r) return feedbackReply(userId, thread, text, live);
      if (r.card && act === "move" && !needsCard(cp, p, loadAutonomy(userId).changes)) return autoMove(userId, thread, msg, r.card, live);
      return r;
    }
  }
}

/** Busy and budget before any card: the refusal instead of the card when short. */
async function guard(userId: string, r: Reply, text: string): Promise<Reply> {
  return (r.card && (await makeCheck(userId, r.card, topicOf(text)))) || r;
}

async function makeReply(
  userId: string, text: string, act: AgentPick["act"], cp: AgentPick, p: Record<string, number | null>, src: ReturnType<typeof resolveSource>, chip: Chip | undefined,
  speaker: { id: string; look: string } | null, made: ReturnType<typeof lastMake>,
): Promise<Reply> {
  // "another one": the last make's subject and source, in the format asked or the same one (replay D3)
  const again = cp.subject === "last" ? made : null;
  const from = again ? (again.source ? resolveSource(again.source, userId) : null) : src;
  const link = again ? (again.link ?? null) : src ? null : linkIn(text);
  if (act === "remix" && !from && !link) return { text: LINES.noSource, go: [OPEN_SWIPE, OPEN_ANALYTICS] };
  const format = again ? (cp.format ?? again.format) : formatFor(cp.format, chip, src);
  const subject = again ? again.subject : cp.subject;
  const c = makeCard(userId, { plan: planOf(format, link), format, act, p, topic: again ? again.topic || again.subject : text, subject, source: from?.key, link: link ?? undefined, speaker, length: cp.length });
  return (await makeCheck(userId, c, topicOf(text))) ?? { text: LINES.lead, card: c };
}

/** A pressed composer chip with no act from Jev: a card in that format (or the campaign), with no Jev at all. */
async function chipReply(userId: string, text: string, chip: Chip, src: ReturnType<typeof resolveSource>, p: Record<string, number | null>): Promise<Reply> {
  if (chip === "campaign") {
    const r = await campaignReply(userId, { audience: null, weeks: null, pace: null, format: null, act: "campaign", p });
    return r.card ? guard(userId, r, text) : r;
  }
  const format = chipFormat(chip) ?? "post";
  const link = src ? null : linkIn(text);
  const c = makeCard(userId, { plan: planOf(format, link), format, act: "make", p, topic: text, source: src?.key, link: link ?? undefined });
  return (await makeCheck(userId, c, topicOf(text))) ?? { text: LINES.lead, card: c };
}

/** "yes go ahead" or "not now" on the one proposed card; a yes at US$1 or more must be a press. */
/** Leo's standing rule, kept here too: a bare ok is noted, never go. */
const BARE_ACK = /^(ok|okay|k|kk|noted|got it|thanks|thank you|ty)[.!]*$/i;

async function typed(userId: string, thread: string, text: string, act: "approve" | "decline", pending: { msg: string; card: AgentCard } | null): Promise<Out> {
  if (!pending) return { text: NOT_MADE };
  if (act === "approve" && BARE_ACK.test(text.trim())) return { text: `Press ${approveLabel(pending.card)} when you want it.` };
  if (act === "decline") {
    await press(userId, thread, pending.msg, "decline");
    return { text: NOT_MADE };
  }
  const price = pending.card.price;
  if (price && price.usd >= OVER_A_DOLLAR) return { text: `Press Approve to spend ${priceText(price)}.` };
  void press(userId, thread, pending.msg, "approve");
  return { text: `Going ahead with "${pending.card.title}".` };
}

/** "Do it, then tell me": a move Jev is sure of, run at once with its receipt and Undo. */
async function autoMove(userId: string, thread: string, msg: string, c: AgentCard, live: Live): Promise<Out> {
  const starting = nextCard(c, { type: "approve" })!;
  put(userId, thread, msg, { card: starting });
  await runPress(userId, thread, msg, starting, live);
  if (!msgOf(userId, thread, msg)?.receipt) return {};
  const title = c.title.replace(/^(Move|Schedule) /, "");
  return { text: `Moved ${title} to ${c.line.replace(/^To /, "").replace(/\.$/, "")}. You asked me not to check first.` };
}

function forgetReply(userId: string, thread: string, which: string | null, messages: AgentMsg[]): Promise<Out> | Out {
  const r = forgetPick(userId, which, messages);
  if (r.kind === "removed") {
    logActivity(userId, { who: "agent", kind: "learning", title: `Forgot "${r.learning.text.slice(0, 100)}"`, link: links.agent({ thread }) });
    return { receipt: { title: LEARNING_REMOVED, line: r.learning.text, button: SEE_LEARNED, undo: { kind: "learning-off", id: r.learning.id }, undoText: UNDO_LINE } };
  }
  if (r.kind === "undo") return undoReceipt(userId, thread, r.msg).then((line) => ({ text: line === UNDONE ? undidLine(r.title) : line }));
  if (r.kind === "ask") return { text: r.line, go: r.chips.map((c) => ({ label: c.label, path: `forget:${c.which}` })) };
  return { text: r.line };
}

async function feedbackReply(userId: string, thread: string, text: string, live: Live): Promise<Out> {
  if (!feedback) return { text: NO_FEEDBACK };
  live.call();
  live.step("", "writing");
  try {
    const r = await feedback(userId, thread, text);
    return { text: r.text, go: r.go };
  } catch {
    return { text: FAILED_LINE, turn: "failed" };
  }
}

// ---------- skills ----------

async function slash(userId: string, text: string, api: SkillsApi | null, live: Live): Promise<Out> {
  if (!api) return { text: "Skills aren't switched on here yet.", go: [{ label: "Open skills", path: links.skills() }] };
  // any word after the slash: runSkill answers an unknown one with the list
  const m = api.matchSlash(text, api.loadMySkills(userId)) ?? { skill: text.slice(1).trim().split(/\s/)[0] ?? "", rest: "" };
  if (api.PRICED.includes(m.skill)) return guard(userId, { card: answerCard("answer", {}) }, text);
  return skillReply(userId, api, m.skill, { rest: m.rest, postId: writeDraft() }, live);
}

/** One skill run as the agent's answer; one of yours on a post opens Write with a priced rewrite, so it is a card. */
async function skillReply(userId: string, api: SkillsApi, skill: string, input: { postId?: string; rest?: string }, live: Live): Promise<Out> {
  live.step("", "writing");
  const run = await api.runSkill(userId, skill, input);
  for (let i = 0; i < (run.calls ?? 0); i++) live.call();
  if (run.step === "open" && run.postId) {
    const mine = api.loadMySkills(userId).find((x) => x.slash === skill);
    const r = dockCard(userId, { act: "write", post: loadDrafts(userId).findIndex((d) => d.id === run.postId), day: null, time: null, message: mine?.instruction ?? input.rest ?? "", p: {} });
    if (r) return r;
  }
  return { text: run.failed ?? (run.id ? api.skillRunText(run) : run.lines.join("\n")), go: run.links, ...(api.QUOTING.includes(skill) ? { quotes: true as const } : {}) };
}

// ---------- presses ----------

const shadow = (userId: string, c: AgentCard, confirmed: boolean) =>
  void recordShadow(userId, { at: new Date(clock()).toISOString(), act: fieldsOf(c).act, p: fieldsOf(c).p ?? {}, confirmed });

/** A card's button (or a receipt's nudge). Approve checks the budget again first; every approve and decline is logged for autonomy. */
export async function press(userId: string, threadId: string, msgId: string, button: "approve" | "decline" | "retry" | "another-format" | "remember" | "no-thanks"): Promise<void> {
  const m = msgOf(userId, threadId, msgId);
  if (!m) return;
  const c = m.card;
  if (button === "retry") {
    if (c?.status === "failed") return put(userId, threadId, msgId, { card: nextCard(c, { type: "retry" })!, go: [] });
    // a failed or interrupted turn: the message before it, sent again
    const msgs = threadOf(userId, threadId)?.messages ?? [];
    const before = msgs.slice(0, msgs.findIndex((x) => x.id === msgId)).reverse().find((x) => x.role === "user");
    if (before?.text) send(userId, threadId, before.text, before.source ? { source: before.source } : {});
    return;
  }
  if (button === "remember" || button === "no-thanks") {
    const n = c && fieldsOf(c).nudge;
    if (!c || !n) return;
    if (button === "remember") {
      const r = addLearning(userId, { ...n.learning, source: "correction", thread: threadId, msg: msgId });
      if (r.ok === false) return put(userId, threadId, msgId, { text: r.error });
      logActivity(userId, { who: "you", kind: "learning", title: `Learned "${r.item.text}"`, link: links.agent({ thread: threadId, m: msgId }) });
    } else dismissNudge(userId, n.id);
    return put(userId, threadId, msgId, { card: { ...c, plan: { ...c.plan, nudge: undefined } } });
  }
  if (!c || c.status !== "proposed") return;
  if (button === "another-format") {
    const f = fieldsOf(c).format;
    const all: AgentFormat[] = ["post", "carousel", "script", "slideshow", "wall", "speaking", "explainer", "image"];
    return put(userId, threadId, msgId, { go: all.filter((x) => x !== f).map((x) => ({ label: FORMAT_LABEL[x], path: `format:${x}` })) });
  }
  if (button === "decline") {
    shadow(userId, c, false);
    return put(userId, threadId, msgId, { card: nextCard(c, { type: "decline" }) ?? c, go: [] });
  }
  // approve: Starting... at once, then the budget read again, since a card can wait for hours
  if (following.has(msgId)) return;
  following.add(msgId);
  const starting = nextCard(c, { type: "approve" })!;
  put(userId, threadId, msgId, { card: { ...starting, error: undefined }, go: [] });
  const live = liveFor(threadId, msgId);
  const t0 = clock();
  turns.set(threadId, { thread: threadId, msg: msgId, state: "writing", startedAt: t0, steps: 0 });
  emit();
  try {
    const reason = blockedReason(userId, c, await usageNow());
    if (reason) {
      put(userId, threadId, msgId, { card: { ...c, error: reason }, go: offerChips(fieldsOf(c).plan, null, subjectOf(fieldsOf(c))) });
    } else {
      shadow(userId, c, true);
      if (fieldsOf(c).plan === "answer") await pressAnswer(userId, threadId, msgId, starting, live);
      else await runPress(userId, threadId, msgId, starting, live);
    }
    put(userId, threadId, msgId, { meta: { steps: live.steps(), ms: clock() - t0 } });
  } finally {
    following.delete(msgId);
    if (turns.get(threadId)?.msg === msgId) turns.set(threadId, { ...turns.get(threadId)!, state: "done", line: undefined });
    emit();
  }
}

async function pressAnswer(userId: string, thread: string, msg: string, c: AgentCard, live: Live) {
  const api = skillsApi();
  const approved = nextCard(c, { type: "started" })!;
  if (!api) return put(userId, thread, msg, { card: nextCard(c, { type: "fail", error: FAILED_LINE })! });
  live.call();
  live.step("Writing 3 angles...", "writing");
  const run: SkillRunLike = await api.runSkill(userId, "answer", {}).catch((e: unknown) => ({ id: "", name: "", title: "", failed: e instanceof Error ? e.message : FAILED_LINE, lines: [], links: [] }));
  for (let i = 1; i < (run.calls ?? 0); i++) live.call();
  if (run.failed) return put(userId, thread, msg, { card: nextCard(c, { type: "fail", error: run.failed })! });
  put(userId, thread, msg, { card: approved, text: run.id ? api.skillRunText(run) : run.lines.join("\n"), go: run.links, ...(api.QUOTING.includes("answer") ? { quotes: true as const } : {}) });
}

const FORMAT_LABEL: Record<AgentFormat, string> = {
  post: "Post",
  carousel: "Carousel",
  script: "Script",
  slideshow: "Slideshow",
  wall: "Wall of text",
  speaking: "Talking video",
  explainer: "Explainer video",
  image: "Picture",
};

/**
 * Changes a proposed card before its press: the script (70 words at most, re-priced), the picture's prompt, who
 * appears, the voice, another format, or the competitor box. Null when saved, else the line to show.
 */
export function editCard(userId: string, threadId: string, msgId: string, patch: { script?: string; prompt?: string; who?: string; voice?: string; format?: string; name?: string }): string | null {
  const m = msgOf(userId, threadId, msgId);
  let c = m?.card;
  if (!c) return "That card is no longer here.";
  if (c.status !== "proposed") return "Approved. Ask for a new one to change it.";
  const f = fieldsOf(c);
  if (patch.script !== undefined) {
    const words = patch.script.split(/\s+/).filter(Boolean).length;
    if (words > MAX_SCRIPT_WORDS) return `${MAX_SCRIPT_WORDS} words at most.`;
    if (words < MIN_SCRIPT_WORDS) return `Write at least ${MIN_SCRIPT_WORDS} words for a video.`;
    if (f.plan !== "speaking" || c.step !== "video") return "Only a talking video's script changes here.";
    c = withScript(userId, c, patch.script);
  }
  if (patch.prompt !== undefined) {
    const prompt = patch.prompt.trim();
    if (!prompt) return "Type what the picture shows.";
    if (prompt.length > MAX_PROMPT) return `${MAX_PROMPT} characters at most.`;
    c = { ...c, prompt, title: `Picture: ${prompt.slice(0, 40).trimEnd()}` };
  }
  if (patch.who !== undefined) {
    const next = f.plan === "speaking" ? withWho(userId, c, patch.who) : null;
    if (!next) return "That presenter is no longer here. Pick who speaks again.";
    const corr = fieldsOf(next).correction;
    if (corr) noteCorrection(userId, { ...corr, card: c.id });
    c = next;
  }
  if (patch.voice !== undefined) {
    if (!VOICE_IDS.includes(patch.voice as VoiceId)) return "Pick one of the voices.";
    c = { ...c, plan: { ...c.plan, voice: patch.voice }, details: c.details?.map((d) => (d.label === "Voice" ? { ...d, value: VOICES[patch.voice as VoiceId].label } : d)) };
    // a written script is said in the new voice's time, so its length, parts and price are estimated again (replay D5)
    const g = fieldsOf(c);
    if (g.plan === "speaking" && c.step === "video" && g.script) c = withScript(userId, c, g.script);
  }
  if (patch.format !== undefined) {
    const next = reformat(userId, c, patch.format as AgentFormat);
    if (!next) return "Pick another format.";
    noteCorrection(userId, { kind: "format", from: f.format ?? "", to: patch.format, card: c.id });
    c = next;
  }
  if (patch.name !== undefined) {
    if (f.plan !== "competitor") return "Only a competitor card takes a name.";
    c = withInput(c, patch.name);
  }
  const r = patchMsg(userId, threadId, msgId, { card: { ...c, error: undefined }, ...(patch.format !== undefined ? { go: [] } : {}) });
  return r.ok === false ? r.error : null;
}

/** A chip under a message that isn't a page: "say:" asks it here, "forget:" removes that learning at once, "format:" swaps the card's format. */
export function choose(userId: string, threadId: string, msgId: string, path: string): string | null {
  if (path.startsWith("say:")) {
    send(userId, threadId, path.slice(4));
    return null;
  }
  if (path.startsWith("format:")) return editCard(userId, threadId, msgId, { format: path.slice(7) });
  if (path.startsWith("forget:")) {
    const msgs = threadOf(userId, threadId)?.messages ?? [];
    const out = forgetReply(userId, threadId, path.slice(7), msgs);
    const write = (r: Out) => {
      const { turn: _t, ...rest } = r;
      appendMsg(userId, threadId, newMsg("agent", { ...rest, turn: "done" }, new Date(clock())));
    };
    if (out instanceof Promise) void out.then(write);
    else write(out);
    return null;
  }
  return "That isn't something I can do here.";
}

/** Undo on a receipt, from its stored payload (a page's own undo while this tab holds it): "Undone." or the line. */
export async function undoReceipt(userId: string, threadId: string, msgId: string): Promise<string> {
  const r = msgOf(userId, threadId, msgId)?.receipt;
  if (!r?.undo) return "There's nothing to undo here.";
  if (r.undone) return UNDONE;
  let line: string;
  const page = pageUndo(msgId);
  if (r.undo.kind === "page" && page) {
    try {
      page();
      dropPageUndo(msgId);
      line = UNDONE;
    } catch {
      line = `Couldn't undo that. Change it back on ${r.undo.page}.`;
    }
  } else if (r.title === LEARNING_REMOVED && r.undo.kind === "learning-off") {
    // a removed learning's Undo switches it back on (the receipt keeps the learning-off payload for its id)
    const row = loadLearnings(userId).find((l) => l.id === (r.undo as { id: string }).id);
    const back = row && activeLearnings([row]).length === 0 ? setLearningOff(userId, row.id, false) : null;
    line = !row || !back ? "It changed since. Change it on Your voice." : back.ok === false ? back.error : UNDONE;
  } else line = runUndo(userId, r.undo);
  if (line === UNDONE) {
    put(userId, threadId, msgId, { receipt: { ...r, undone: new Date(clock()).toISOString() } as Receipt });
    const kind = r.undo.kind === "remove-competitor" ? "brand" : r.undo.kind === "learning-off" ? "learning" : r.undo.kind === "delete-campaign" ? "plan" : "post";
    logActivity(userId, { who: "you", kind, title: `Undid "${r.title}"`, link: links.agent({ thread: threadId, m: msgId }) });
  }
  return line;
}

// ---------- after a reload, and what Home reads ----------

/**
 * On load: turns left starting, thinking or writing read "This was interrupted." (Send again is press retry), and
 * pressed videos and pictures still running, or paid for and waiting on this device, are followed to their MADE block.
 * `now` is the engine's clock from here on (tests pass their own).
 */
export function resumeAgent(userId: string, now: () => number = () => Date.now()): void {
  clock = now;
  for (const t of loadThreads(userId)) {
    const live = turns.get(t.id);
    for (const m of t.messages) {
      if (running(live) && live!.msg === m.id) continue;
      if (m.turn && ["starting", "thinking", "writing"].includes(m.turn)) put(userId, t.id, m.id, { turn: "failed", text: INTERRUPTED, error: true });
      const c = m.card;
      const mid = c && (c.status === "starting" || (c.status === "approved" && !m.receipt && fieldsOf(c).plan !== "write"));
      if (!c || !mid || following.has(m.id)) continue;
      following.add(m.id);
      const l = liveFor(t.id, m.id);
      turns.set(t.id, { thread: t.id, msg: m.id, state: "making", startedAt: clock(), steps: 0 });
      void resumePress(userId, t.id, m.id, c, l)
        .then((ok) => {
          if (!ok) put(userId, t.id, m.id, { card: nextCard(c.status === "starting" ? c : { ...c, status: "starting" }, { type: "fail", error: INTERRUPTED })! });
        })
        .finally(() => {
          following.delete(m.id);
          if (turns.get(t.id)?.msg === m.id) turns.set(t.id, { ...turns.get(t.id)!, state: "done", line: undefined });
          emit();
        });
    }
  }
  emit();
}

/** Every proposed card on this brand, newest first: Home's Next up. */
export function waitingCards(userId: string): { thread: string; msg: string; card: AgentCard }[] {
  return loadThreads(userId)
    .flatMap((t) => t.messages.flatMap((m) => (m.card?.status === "proposed" ? [{ thread: t.id, msg: m.id, card: m.card }] : [])))
    .sort((a, b) => b.card.proposedAt.localeCompare(a.card.proposedAt));
}

const READY_FOR = 60 * 60_000;
const JOB_NOUN: Record<NonNullable<AgentMsg["job"]>["kind"], string> = { remix: "post", slideshow: "slideshow", wall: "wall of text", talk: "video", video: "video", image: "picture", campaign: "campaign" };
const STATE_WORDS: Partial<Record<Turn["state"], string>> = { starting: "Starting", thinking: "Thinking", writing: "Writing", making: "Making" };

/** What the agent is doing now, for Home: running, a card waiting, something made in the last hour, or idle. */
export function agentNow(userId: string): { kind: "idle" | "running" | "waiting" | "ready"; line: string; to: string } {
  const threads = loadThreads(userId);
  const mine = new Set(threads.map((t) => t.id));
  for (const t of turns.values()) if (running(t) && mine.has(t.thread)) return { kind: "running", line: t.line || STATE_WORDS[t.state] || "Working", to: links.agent({ thread: t.thread, m: t.msg || undefined }) };
  const w = waitingCards(userId)[0];
  if (w) return { kind: "waiting", line: `"${w.card.title}" is waiting for your OK.`, to: links.agent({ thread: w.thread, m: w.msg }) };
  for (const t of threads)
    for (const m of [...t.messages].reverse()) {
      const j = m.job;
      if (j?.state === "done" && j.endedAt && clock() - Date.parse(j.endedAt) < READY_FOR) {
        const noun = j.kind === "remix" && m.card ? ({ post: "post", carousel: "carousel", script: "script" } as Record<string, string>)[fieldsOf(m.card).format ?? "post"] ?? "post" : JOB_NOUN[j.kind];
        return { kind: "ready", line: `Your ${noun} is ready`, to: links.agent({ thread: t.id, m: m.id }) };
      }
    }
  return { kind: "idle", line: "Ask for a post, a remix, a video or a campaign", to: links.agent() };
}

