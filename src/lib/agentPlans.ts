// What each plan runs (phase6-build-brief.md, "What each plan runs"): the first card of every plan the agent proposes,
// priced from the price table, the busy and budget checks before a card and again on its press, and what each press
// runs through the makers that already exist (called, never changed). Nothing priced runs before a press on a card
// that shows its price; a press writes its outcome (the card's state, the MADE block, the receipt) into the card's
// own message, so leaving the page loses nothing. The engine (agentRun.ts) routes messages and presses here.

import { leftOf, needsOf, refusal, shortOf, cheaperFor, unitOf, type Need, type Plan, type Short } from "@/lib/agentBudget";
import { newCardId, nextCard, estimateScript, type AgentAct, type AgentCard, type AgentFormat, type CardStep, type Receipt } from "@/lib/agentCards";
import { LEARNING_RECORDED, SEE_LEARNED, UNDO_LINE, correctionNudge, followingLine, scopeWords, type Correction, type Nudge } from "@/lib/agentMemory";
import { patchMsg, type AgentMsg } from "@/lib/agentThreads";
import { logActivity, type ActivityKind } from "@/lib/activity";
import { readUsage, type Usage } from "@/lib/aiUsage";
import { AI_FOLDER, imageBusy, imageJob, makeImage, onImageJob, resumeImage } from "@/lib/aiImage";
import { LOOKS, aiBusy, aiJob, avatarCredits, creditsUsd, explainerCredits, makeExplainer, onAiJob, pendingExplainer, resumeExplainer, type Scene } from "@/lib/aiVideo";
import { callFn } from "@/lib/edgeFn";
import { actFor, moveWhen, titleOf as draftTitle } from "@/lib/assistantActs";
import { anglesFor } from "@/lib/angles";
import { loadAudiences } from "@/lib/audiences";
import { addCampaign, campaignCost, FREE_FORMATS, planCampaign, type CampaignAsk, type CampaignFormat } from "@/lib/campaigns";
import { BATCH, startDrafting } from "@/lib/campaignJob";
import { addCompetitor, loadCompetitors, MAX_COMPETITORS, parseInput, runRead, sameCompetitor, type Competitor } from "@/lib/competitors";
import { scanCompliance } from "@/lib/compliance";
import { localDateKey } from "@/lib/dueDates";
import { loadDrafts } from "@/lib/draftHistory";
import { currentEditTarget, type EditTarget, type Proposal } from "@/lib/editTarget";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { loadProjects } from "@/lib/videoProjects";
import { loadPositioning } from "@/lib/positioning";
import { priceOf, priceText, sumPrices, WRITE_PRICE, type Price } from "@/lib/prices";
import { defaultOutput } from "@/lib/remix";
import { loadRemixPrefs, ownBrandName, speakerFor } from "@/lib/remixBrand";
import { NOT_THROUGH, NOTHING_USED, onRemixJob, remixJob, startRemix, writingStep } from "@/lib/remixJob";
import { EdgeError } from "@/lib/edgeFn";
import { linkRead, startLinkRead } from "@/lib/remixLink";
import type { RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { cutAtWord } from "@/lib/scriptCaption";
import { removeSlideshow } from "@/lib/slideshow";
import { onSlideshowJob, slideshowBusy, slideshowJob, startSlideshow, stepText as showStep } from "@/lib/slideshowJob";
import { DEFAULT_LENGTH, TALK_LENGTHS, asTopic, defaultWho, scriptEstimate, scriptSeconds, speakers, wordCount, type TalkLength, type TalkWho } from "@/lib/talkingHead";
import { WRITE_FAILED, goOnAtPrice, madePresenter, onTalkJob, resumeTalk, startTalk, talkBusy, talkJob, type TalkAsk } from "@/lib/talkingHeadJob";
import { VOICES, type VoiceId } from "@/lib/textVoice";
import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { stripDashes } from "@/lib/plainText";
import { presenterVoice } from "@/lib/presenters";
import { requestMake, type Flags } from "@/lib/remix";
import { makeBody } from "@/lib/slideshowJob";
import { activeLearnings, addLearning, loadLearnings, MAX_LEARNINGS, type LearningScope } from "@/lib/voiceMemory";
import { onWallJob, startWall, stepText as wallStep, wallBusy, wallJob } from "@/lib/wallJob";
import { GLOBAL_COUNTER_USER, type UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { MAX_TOPIC, speakingWords } from "../../supabase/functions/remix/logic.ts";

/** A chip under a message: a path starting "/" opens a page; "say:<text>" sends the text here, "forget:<which>" and
 *  "format:<format>" go to agentRun's choose() with no Jev call. */
export interface Chip {
  path: string;
  label: string;
}
/** What the agent writes in its row for a message. */
export interface Reply {
  text?: string;
  go?: Chip[];
  card?: AgentCard;
  receipt?: Receipt;
  /** The text quotes outside text (agentThreads AgentMsg.quotes). */
  quotes?: true;
}
/** The engine's turn while a press runs: the step line, and one more server call. */
export interface Live {
  step(line: string, state: "writing" | "making"): void;
  call(): void;
}
/** The plans a card can run: the budget's plans plus pasting into Reply drafts (today's engage acts). */
export type PlanName = Plan | "paste";

/** What a card's run needs, kept in the card (synced) so a press after a reload still knows it. */
export interface PlanFields {
  plan: PlanName;
  act: AgentAct;
  /** Jev's probabilities for the message that proposed it, for the shadow log. */
  p: Record<string, number | null>;
  format?: AgentFormat;
  /** The message, as the topic (MAX_TOPIC) or the note on a source. */
  topic?: string;
  /** What it is about in the message's own words (Jev's subject), for titles, chips and "another one". */
  subject?: string;
  source?: string;
  link?: string;
  who?: TalkWho;
  look?: string;
  voice?: VoiceId;
  length?: TalkLength;
  script?: string;
  /** The writer's caption for the script, ending with its call to action: the made video takes it to the editor (replay D13). */
  caption?: string;
  scenes?: Scene[];
  priced?: boolean;
  input?: string;
  draft?: string;
  day?: string | null;
  time?: string | null;
  message?: string;
  ask?: CampaignAsk;
  scope?: LearningScope;
  replaces?: string | null;
  slide?: number | null;
  kind?: EditTarget["kind"];
  correction?: Omit<Correction, "at" | "card">;
  nudge?: Nudge;
}
export const fieldsOf = (c: AgentCard) => c.plan as unknown as PlanFields;
const withFields = (f: PlanFields) => f as unknown as Record<string, unknown>;

// ---------- copy ----------

export const LINES = {
  remixBusy: "Another remix is being written. Try this again when it's done.",
  videoBusy: "Another video is being made. Ask again when it's done.",
  imageBusy: "Another picture is being made. Ask again when it's done.",
  showBusy: "Another slideshow is being made. Ask again when it's done.",
  wallBusy: "Another wall of text is being made. Ask again when it's done.",
  videoBusyCard: "Another video is being made. Approve this one when it's done.",
  imageBusyCard: "Another picture is being made. Approve this one when it's done.",
  lead: "Here's what I'd make. Nothing is made until you approve it.",
  scriptLead: "Here's the script. Nothing is made or charged until you approve it.",
  competitorLead: (name: string) => `This adds ${name} once to the competitors you track.`,
  noSource: "Which post? Press Remix on one in Swipe file or Analytics, then Ask the agent instead.",
  campaign: "I'll set it up in the campaign planner.",
  paid: "Paid makes can't be undone. Delete the draft in My posts if you don't want it.",
  gone: (kind: string) => `That ${kind} is no longer open. Open it and ask again.`,
  editFailed: "That change didn't go through. Nothing changed.",
  learningsFull: "30 is the most. Remove one on Your voice to add another.",
  typeCompetitor: "Type a name, a website or a social link.",
  lost: "This was interrupted.",
} as const;
export const OPEN_SWIPE = { path: "/swipe", label: "Open Swipe file" };
export const OPEN_ANALYTICS = { path: "/analytics", label: "Open Analytics" };
export const OPEN_VOICE = { path: links.voice({ section: "learned" }), label: "Open Your voice" };
const BACK = "Back at 8am Singapore time.";
const MADE_WITH = "Higgsfield Speak and ElevenLabs";
/** An explainer's pictures are Higgsfield Soul's: no one speaks on camera (replay D14). */
const EXPLAINER_MADE_WITH = "Higgsfield Soul pictures and ElevenLabs";

const NOUN: Record<AgentFormat, string> = {
  post: "post",
  carousel: "carousel",
  script: "script",
  slideshow: "slideshow",
  wall: "wall of text",
  speaking: "talking video",
  explainer: "explainer video",
  image: "picture",
};
const MAKE_LINE: Partial<Record<AgentFormat, string>> = {
  post: "A written post, saved to My posts.",
  carousel: "A carousel to swipe through, saved to My posts.",
  script: "A script you film yourself, saved to My posts.",
  slideshow: "Words on a few photos, saved to your slideshows.",
  wall: "One bold claim over a short clip, opened in the video editor.",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** At most `n` characters, cut at a word (replay D12: "consi...", "follow-u...."). */
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  // a cut at a sentence's end drops its mark, so it never reads "tracks it...."
  return t.length > n ? `${cutAtWord(t, n - 3).replace(/[.!?]+$/, "")}...` : t;
};
/** A line as a sentence: a full stop only when it has no end mark of its own ("remember.. It's in My posts."). */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** "A 15-second video", "An 18-second video". */
const aSeconds = (n: number) => `${/^(8|11|18)$|^8\d$/.test(String(n)) ? "An" : "A"} ${n}-second video`;
/** What a card's chips and titles name: Jev's subject, else the message as its topic. */
export const subjectOf = (f: Pick<PlanFields, "subject" | "topic">) => f.subject ?? f.topic ?? "";
/** The message as a topic: one line, MAX_TOPIC at most, cut at a word. */
export function topicOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_TOPIC) return t;
  const head = t.slice(0, MAX_TOPIC + 1);
  return head.slice(0, head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : MAX_TOPIC);
}
/** The first http(s) link in a message. */
export const linkIn = (text: string) => text.match(/https?:\/\/[^\s<>"]+/i)?.[0] ?? null;

// ---------- prices, budget and busy ----------

const price = (f: UsageFeature, o = {}) => priceOf(f, o) as Price | null;
const sum = (...ps: (Price | "pick" | null)[]) => (sumPrices(...ps) as Price | null) ?? undefined;

/** Today's counts, or null when they can't be read (the server decides then). */
export async function usageNow(): Promise<Usage | null> {
  return readUsage().catch(() => null);
}
export const shortFor = (userId: string, needs: Need[], usage: Usage | null): Short[] => shortOf(needs, usage, { leoGlobal: userId === GLOBAL_COUNTER_USER });

const isVideo = (p: PlanName) => p === "speaking" || p === "explainer";
const REMIXES: PlanName[] = ["post", "carousel", "script", "link"];
/** A priced talk waits on its price check; another talk would replace it, so it counts as busy unless it is this card's. */
const talkWaiting = () => talkJob()?.state === "priced";

/** The line when the maker this plan needs is busy, before a card is drawn; null when it is free. */
export function busyLine(plan: PlanName): string | null {
  if (REMIXES.includes(plan) && remixJob()?.state === "working") return LINES.remixBusy;
  if (plan === "slideshow" && slideshowBusy()) return LINES.showBusy;
  if (plan === "wall" && wallBusy()) return LINES.wallBusy;
  if (isVideo(plan) && (aiBusy() || talkBusy() || talkWaiting())) return LINES.videoBusy;
  if (plan === "image" && imageBusy()) return LINES.imageBusy;
  return null;
}

/** Why a card's Approve is off now (checked when it is drawn and again on the press), or null when it can run. */
export function blockedReason(userId: string, card: AgentCard, usage: Usage | null): string | null {
  const f = fieldsOf(card);
  if (card.status !== "proposed") return null;
  if (f.plan === "learning" && !f.replaces && activeLearnings(loadLearnings(userId)).length >= MAX_LEARNINGS) return LINES.learningsFull;
  if (f.plan === "competitor" && !parseInput(f.input ?? "")) return LINES.typeCompetitor;
  const ownPriced = f.plan === "speaking" && f.priced && talkWaiting();
  if (isVideo(f.plan) && card.step === "video" && !ownPriced && (aiBusy() || talkBusy() || talkWaiting())) return LINES.videoBusyCard;
  if (f.plan === "image" && imageBusy()) return LINES.imageBusyCard;
  const b = isVideo(f.plan) || f.plan === "image" ? null : busyLine(f.plan);
  if (b) return b;
  const short = shortFor(userId, card.needs, usage)[0];
  return short ? `No ${unitOf(short.feature.replace(/-global$/, "") as Need["feature"], 2)} left today. ${BACK}` : null;
}

/** The refusal when a plan is short, with its cheaper offers as chips that ask again here. */
export function refusalReply(plan: PlanName, short: Short[], usage: Usage | null, topic: string): Reply {
  const offers = plan === "paste" ? [] : cheaperFor(plan, usage);
  return { text: refusal(plan === "paste" ? "post" : plan, short, offers), go: offerChips(plan, usage, topic) };
}
const ASK_AGAIN: Record<string, string> = {
  image: "Make a picture post about",
  script: "Write a script about",
  carousel: "Make a carousel about",
  post: "Make a text post about",
};
/** Cheaper options as chips: "say:" asks again in this chat, Write and Competitors open their page. */
export function offerChips(plan: PlanName, usage: Usage | null, topic: string): Chip[] {
  if (plan === "paste") return [];
  return cheaperFor(plan, usage).map((o) => {
    if (o.plan === "write") return { label: o.chip, path: links.generate({ detail: topic, format: o.format }) };
    if (o.plan === "paste") return { label: o.chip, path: links.competitors({ view: "list" }) };
    return { label: o.chip, path: `say:${ASK_AGAIN[o.plan]} ${topic}` };
  });
}

// ---------- the first card of each plan ----------

/** What a make needs to be proposed (and proposed again on another format). */
export interface MakeAsk {
  plan: Extract<PlanName, "post" | "carousel" | "script" | "slideshow" | "wall" | "link" | "speaking" | "explainer" | "image">;
  format: AgentFormat;
  act: AgentAct;
  p: Record<string, number | null>;
  topic: string;
  source?: string;
  link?: string;
  /** Jev's pick of who appears (speakers sent), else the brand's "Who appears". */
  speaker?: { id: string; look: string } | null;
  length?: TalkLength | null;
  correction?: PlanFields["correction"];
  /** Jev's subject: the title and the chips name it instead of the message. */
  subject?: string | null;
}

const card = (kind: AgentCard["kind"], f: PlanFields, c: Partial<AgentCard> & Pick<AgentCard, "title" | "line" | "needs">, now = new Date()): AgentCard => ({
  id: newCardId(now),
  kind,
  status: "proposed",
  proposedAt: now.toISOString(),
  ...c,
  plan: withFields(f),
});

/** Who appears in a talking video: Jev's pick, else the brand's saved choice, else a new Singaporean presenter. */
export function whoFor(userId: string, pickd: { id: string; look: string } | null | undefined): { who: TalkWho; look: string } {
  const s = speakers(userId);
  const saved = (id: string) => (id === "mine" ? !!s.face : s.presenters.some((p) => p.id === id));
  if (pickd && pickd.id !== "new" && saved(pickd.id)) return { who: pickd.id as TalkWho, look: pickd.look };
  if (pickd?.id === "new" && LOOKS.includes(pickd.look)) return { who: "presenter", look: pickd.look };
  const d = defaultWho(s);
  if (d && saved(d)) return { who: d as TalkWho, look: s.presenters.find((p) => p.id === d)?.look ?? "" };
  return { who: "presenter", look: LOOKS[Math.floor(Math.random() * LOOKS.length)] };
}
const whoWords = (userId: string, who: TalkWho, look: string) =>
  who === "mine" ? "Your face" : who === "presenter" ? `AI presenter, labelled on the post: ${look}` : `${speakers(userId).presenters.find((p) => p.id === who)?.name ?? "Your presenter"}, AI presenter, labelled on the post`;
const newPresenter = (f: Pick<PlanFields, "who" | "look">) => f.who === "presenter" && !madePresenter(f.look ?? "", "office");
/** A presenter speaks in a voice that fits their look, as a campaign's AI video does (replay D4: Raj spoke as Alice); your face keeps yours. */
const voiceFor = (w: { who: TalkWho; look: string }, voice: VoiceId): VoiceId => (w.who === "mine" ? voice : presenterVoice({ look: w.look }, voice));
/** The most words a script can run to and still last `length` in `voice`, at its slowest measured read (replay D5). */
export function wordsFor(length: TalkLength, voice: VoiceId): number {
  let n = speakingWords(length).high;
  while (n > 12 && scriptSeconds(n, voice) >= length) n--;
  return n;
}
/** The longest length whose words the script reaches, so the talking head never takes the script for a topic and writes a new one. */
const lengthFor = (words: number): TalkLength => [...TALK_LENGTHS].reverse().find((s) => words >= speakingWords(s).low) ?? TALK_LENGTHS[0];
export const MIN_SCRIPT_WORDS = speakingWords(TALK_LENGTHS[0]).low;
export const MAX_SCRIPT_WORDS = 70;

/** A video card's rows: who, voice, length, how it is made, and the learnings it follows. */
function videoDetails(userId: string, f: PlanFields, seconds: number): AgentCard["details"] {
  const talking = f.plan === "speaking";
  // the video learnings shape who appears; an explainer has no one on camera and its writer is not sent them (replay D14)
  const following = talking ? followingLine(loadLearnings(userId), "videos").replace(/^Following: /, "") : "";
  return [
    ...(talking ? [{ label: "Who appears", value: whoWords(userId, f.who!, f.look ?? "") }] : []),
    { label: "Voice", value: VOICES[f.voice ?? "alice"].label },
    { label: "Length", value: `about ${Math.round(seconds)} seconds` },
    { label: "Made with", value: talking ? MADE_WITH : EXPLAINER_MADE_WITH },
    ...(following ? [{ label: "Following", value: following }] : []),
  ];
}

/** The first card of a make, before anything is written or paid for. */
export function makeCard(userId: string, a: MakeAsk, now = new Date()): AgentCard {
  const subject = a.subject?.trim() ? topicOf(a.subject) : undefined;
  const f: PlanFields = { plan: a.plan, act: a.act, p: a.p, format: a.format, topic: topicOf(a.topic), ...(subject ? { subject } : {}), ...(a.source ? { source: a.source } : {}), ...(a.link ? { link: a.link } : {}), ...(a.correction ? { correction: a.correction } : {}) };
  // the title names the subject, not the command (replay D12)
  const about = clip(subject ?? a.topic, 60);
  if (a.plan === "link")
    return card("make", f, { title: `Remix this link into a ${NOUN[a.format]}`, line: a.link ?? "", price: sum(price("remix-link"), price("remix-make")), needs: needsOf("link") }, now);
  if (a.plan === "speaking") {
    const w = whoFor(userId, a.speaker);
    const length = a.length ?? DEFAULT_LENGTH;
    const g: PlanFields = { ...f, ...w, length, voice: voiceFor(w, loadRemixPrefs(userId).voice) };
    return card("video", g, { step: "script", title: `Talking video: "${about}"`, line: `${aSeconds(length)}. The script comes first, then its price.`, details: videoDetails(userId, g, length), price: price("remix-make") ?? undefined, needs: needsOf("speaking", { write: true, presenter: newPresenter(g) }) }, now);
  }
  if (a.plan === "explainer") {
    const g: PlanFields = { ...f, voice: loadRemixPrefs(userId).voice };
    return card("explainer", g, { step: "script", title: `Explainer video: "${about}"`, line: "The script and its scenes come first, then the video's price.", price: price("ai-video-script") ?? undefined, needs: needsOf("explainer") }, now);
  }
  if (a.plan === "image")
    return card("image", f, { title: `Picture: ${cutAtWord(subject ?? a.topic, 40)}`, line: "One picture, 3:4, saved to Media under AI images.", prompt: a.topic.trim(), price: price("ai-image") ?? undefined, needs: needsOf("image") }, now);
  return card("make", f, { title: `${cap(NOUN[a.format])}: "${about}"`, line: MAKE_LINE[a.format] ?? "", price: price("remix-make") ?? undefined, needs: needsOf(a.plan) }, now);
}

/** The newest make in a chat, for "another one" (replay D3): what it was, about what, and from which post or link. */
export function lastMake(messages: AgentMsg[]): { format: AgentFormat; subject: string; topic: string; source?: string; link?: string } | null {
  for (const m of [...messages].reverse()) {
    const f = m.card ? fieldsOf(m.card) : null;
    if (!f?.format || !MAKES.includes(f.plan)) continue;
    return { format: f.format, subject: clip(subjectOf(f), 120), topic: f.topic ?? "", ...(f.source ? { source: f.source } : {}), ...(f.link ? { link: f.link } : {}) };
  }
  return null;
}
const MAKES: PlanName[] = ["post", "carousel", "script", "slideshow", "wall", "link", "speaking", "explainer", "image"];

/** The plan a format runs, and the format a chip means. */
export const planOf = (format: AgentFormat, link: string | null): MakeAsk["plan"] => (link && !["speaking", "explainer", "image"].includes(format) ? "link" : format);
export const chipFormat = (chip: string | undefined): AgentFormat | null => (chip === "post" || chip === "carousel" ? chip : chip === "video" ? "speaking" : null);
/** A make's format: Jev's, else the chip's, else what the source was, else a post. */
export const formatFor = (picked: AgentFormat | null, chip: string | undefined, source: RemixSource | null): AgentFormat =>
  picked ?? chipFormat(chip) ?? (source ? defaultOutput(source) : "post");

/** Busy and budget before a make's card: the line instead of a card, or null when it may be proposed. */
export async function makeCheck(userId: string, c: AgentCard, topic: string): Promise<Reply | null> {
  const f = fieldsOf(c);
  // the refusal's chips ask again about the subject, never the whole ask (replay D3)
  if (f.subject) topic = f.subject;
  const busy = busyLine(f.plan);
  if (busy) return { text: busy };
  // a talking video is checked for its video and voiceover too, so no script is written that can't be voiced
  const needs = f.plan === "speaking" ? needsOf("speaking", { write: true, presenter: newPresenter(f) }) : c.needs;
  const usage = await usageNow();
  const short = shortFor(userId, needs, usage);
  return short.length ? refusalReply(f.plan, short, usage, topic) : null;
}

/** A competitor row from the box, as the add bar builds it. */
function rowOf(input: string): Omit<Competitor, "id" | "addedAt"> | null {
  const parsed = parseInput(input);
  if (!parsed) return null;
  return {
    name: parsed.kind === "site" ? parsed.site : parsed.name,
    site: parsed.kind === "site" ? parsed.site : null,
    logo: null,
    why: "",
    fbPageId: parsed.kind === "link" ? parsed.fbPageId : null,
    handles: parsed.kind === "link" ? parsed.handles : {},
    adsCountry: "SG",
    source: "typed",
  };
}

/**
 * The competitor card: its box filled from a link or @handle in the message, else the name Jev read in it, else empty;
 * one already watched is said instead.
 */
export function competitorCard(userId: string, message: string, act: AgentAct, p: PlanFields["p"], now = new Date(), name: string | null = null): Reply {
  const word = message.match(/(?:https?:\/\/[^\s]+|@[A-Za-z0-9._]{2,30})/)?.[0] ?? name?.trim() ?? "";
  const row = rowOf(word);
  const twin = row && loadCompetitors(userId).list.find((x) => sameCompetitor(x, row));
  // a watched competitor's name may come from a page read
  if (twin) return { text: `You already watch ${twin.name}.`, go: [{ label: "Competitors", path: links.competitors({ view: "list" }) }], quotes: true };
  const c = withInput(card("competitor", { plan: "competitor", act, p, input: "" }, { title: "Add a competitor", line: "", needs: [] }, now), word);
  return { text: row ? LINES.competitorLead(row.name) : undefined, card: c };
}
/** The competitor card with `input` in its box: its name, its site or handle, and the price only a read pays. */
export function withInput(c: AgentCard, input: string): AgentCard {
  const parsed = parseInput(input);
  const name = !parsed ? "" : parsed.kind === "site" ? parsed.site : parsed.name;
  const where = !parsed ? "" : parsed.kind === "site" ? parsed.site : parsed.kind === "link" ? (Object.values(parsed.handles).map((h) => `@${h}`)[0] ?? input.trim()) : "";
  const read = !!parsed && parsed.kind !== "link";
  return {
    ...c,
    title: name ? `Add ${name} as a competitor` : "Add a competitor",
    line: where,
    price: read ? (price("competitor-read") ?? undefined) : undefined,
    needs: read ? needsOf("competitor") : [],
    plan: withFields({ ...fieldsOf(c), input: input.trim().slice(0, 500) }),
  };
}

/** The campaign card from saved angles, or the planner chip when the audience has none. */
export async function campaignReply(userId: string, o: { audience: string | null; weeks: number | null; pace: number | null; format: AgentFormat | null; act: AgentAct; p: PlanFields["p"] }, now = new Date()): Promise<Reply> {
  const audiences = loadAudiences(userId, now);
  const aud = audiences.find((a) => a.id === o.audience) ?? audiences[0];
  const angles = aud ? anglesFor(userId, aud.id).slice(0, 5) : [];
  if (!aud || !angles.length) return { text: LINES.campaign, go: [{ label: "Plan a campaign", path: links.campaignNew({ audience: aud?.id, step: aud ? "angles" : undefined }) }] };
  const extra: Partial<Record<AgentFormat, CampaignFormat>> = { slideshow: "slideshow", wall: "wall", speaking: "ai-video", explainer: "ai-video" };
  const pick = o.format ? extra[o.format] : undefined;
  const month = now.toLocaleDateString("en-SG", { month: "long" });
  const ask: CampaignAsk = {
    audience: aud.id,
    angles: angles.map(({ id, title, line }) => ({ id, title, line })),
    platforms: [loadPositioning(userId)?.platform ?? "instagram"],
    formats: [...FREE_FORMATS, ...(pick ? [pick] : [])],
    weeks: o.weeks ?? 4,
    perWeek: ([2, 3, 5, 7] as const).find((n) => n === o.pace) ?? 3,
    pictures: "stock",
    name: `${aud.name}, ${month}`,
  };
  const c = planCampaign(userId, ask, now);
  const posts = c.posts.length;
  const later = campaignCost(c, { video: null, remix: null });
  const needs = needsOf("campaign", { posts });
  const writing = sum(...Array.from({ length: Math.ceil(posts / BATCH) }, () => price("campaign-draft")));
  const makes = [later.made.slideshows && `${later.made.slideshows} slideshows`, later.made.walls && `${later.made.walls} walls of text`, later.made.videos && `${later.made.videos} AI videos`].filter(Boolean).join(", ");
  return {
    card: card("campaign", { plan: "campaign", act: o.act, p: o.p, ask }, {
      title: `Campaign: ${ask.name}`,
      line: `${posts} posts over ${ask.weeks} weeks, ${ask.perWeek} a week, for ${aud.name}.`,
      details: [
        { label: "Writing them", value: writing ? priceText(writing) : "Free" },
        { label: "Later makes", value: later.usd ? `About US$${later.usd.toFixed(2)} for ${makes}, each with its own price when you make it` : "None: every post is words only" },
      ],
      price: writing,
      needs,
    }, now),
  };
}

/** A remember card: their own words under the scope's question, and the note it replaces. */
export function learningCard(message: string, scope: LearningScope, replaces: { id: string; text: string } | null, act: AgentAct, p: PlanFields["p"], now = new Date()): AgentCard {
  const text = message.trim().slice(0, 140);
  return card("learning", { plan: "learning", act, p, message: text, scope, replaces: replaces?.id ?? null }, {
    title: `Remember this for your ${scopeWords(scope)}?`,
    line: [`"${text}"`, ...(replaces ? [`This replaces: "${replaces.text}"`] : [])].join("\n"),
    needs: [],
  }, now);
}

/** Today's dock acts (move, write, paste into Reply drafts) as a card, an answer, or null (nothing it can do). */
export function dockCard(userId: string, a: { act: AgentAct; post: number | null; day: string | null; time: string | null; message: string; p: PlanFields["p"] }, now = new Date()): Reply | null {
  const drafts = loadDrafts(userId);
  const today = localDateKey(now);
  const dock = actFor(userId, { act: a.act as "move", post: a.post, day: a.day, time: a.time }, a.message, drafts.slice(0, 50), today, () => {});
  if (!dock) return null;
  if ("say" in dock) return { text: dock.say, go: dock.go };
  const d = a.post === null ? undefined : drafts[a.post];
  if (a.act === "move" && d) {
    const to = moveWhen(d, a, today)!;
    const verb = dock.yes;
    return { card: card("move", { plan: "move", act: a.act, p: a.p, draft: d.id, day: a.day, time: a.time }, { title: `${verb.replace(/ it$/, "")} "${draftTitle(d)}"`, line: `To ${to.label}.`, needs: [] }, now) };
  }
  if (a.act === "write" && d)
    return { card: card("make", { plan: "write", act: a.act, p: a.p, draft: d.id, message: a.message }, { title: `Rewrite "${draftTitle(d)}" in Write`, line: dock.ask.split("\n").slice(1).join("\n") || `"${clip(a.message.trim(), 160)}"`, price: WRITE_PRICE, needs: [] }, now) };
  const [title, ...rest] = dock.ask.split("\n");
  return { card: card("make", { plan: "paste", act: a.act, p: a.p, message: a.message }, { title, line: rest.join("\n"), needs: [] }, now) };
}

/** The edit card's first step: the change asked for, priced by the writer it calls. */
export function changeCard(target: EditTarget, ask: string, slide: number | null, act: AgentAct, p: PlanFields["p"], now = new Date()): AgentCard {
  const video = target.kind === "video";
  return card("edit", { plan: "edit", act, p, message: ask.trim().slice(0, 300), slide, kind: target.kind }, {
    step: "write",
    title: slide ? `Change slide ${slide} of "${target.title}"?` : `Change "${target.title}"?`,
    line: `"${clip(ask.trim(), 160)}"`,
    price: price(video ? "vibe-edit" : "edit-ask") ?? undefined,
    needs: needsOf("edit", { video }),
  }, now);
}

/** "Answer a competitor's new ad": one Jev pick and three angles, after the press. */
export const answerCard = (act: AgentAct, p: PlanFields["p"], now = new Date()): AgentCard =>
  card("make", { plan: "answer", act, p }, { title: "Answer a competitor's new ad", line: "Three post ideas that answer it in your own words.", price: price("skill-answer") ?? undefined, needs: needsOf("answer") }, now);

/** The Approve button's words for a card; the price beside it is card.price (PriceChip). */
export function approveLabel(c: AgentCard): string {
  const f = fieldsOf(c);
  switch (f.plan) {
    case "link":
      return `Remix this link into a ${NOUN[f.format ?? "post"]}`;
    case "speaking":
      if (c.step !== "video") return "Write the script";
      return f.priced && c.price ? `Make it for US$${c.price.usd.toFixed(2)}` : "Approve and make";
    case "explainer":
      return c.step === "video" ? "Approve and make" : "Write the script";
    case "image":
      return "Approve and make";
    case "competitor":
      return "Add them";
    case "move":
      return c.title.startsWith("Schedule") ? "Schedule it" : "Move it";
    case "write":
      return "Open in Write";
    case "paste":
      return "Paste it";
    case "campaign":
      return "Add and write";
    case "learning":
      return "Remember";
    case "edit":
      return c.step === "apply" ? "Use this" : "Write the change";
    case "answer":
      return "Write 3 angles";
    default:
      return "Make it";
  }
}

/** Another format for a proposed make: that format's first card, carrying the change for the corrections nudge. */
export function reformat(userId: string, c: AgentCard, format: AgentFormat): AgentCard | null {
  const f = fieldsOf(c);
  if (!f.format || f.format === format || !["make", "video", "explainer", "image"].includes(c.kind)) return null;
  const next = makeCard(userId, {
    plan: planOf(format, f.link ?? null),
    format,
    act: f.act,
    p: f.p,
    topic: f.topic ?? "",
    subject: f.subject,
    source: f.source,
    link: f.link,
    speaker: f.who ? { id: f.who === "presenter" ? "new" : f.who, look: f.look ?? "" } : null,
    length: f.length,
    correction: { kind: "format", from: f.format, to: format },
  });
  return { ...next, id: c.id, proposedAt: c.proposedAt };
}

/** A talking video's card after its script changed (by the writer or by hand): lines, length, price and credits. */
export function withScript(userId: string, c: AgentCard, script: string, caption?: string): AgentCard {
  const f = { ...fieldsOf(c), script: script.trim(), priced: false, ...(caption ? { caption } : {}) };
  const words = wordCount(script);
  const est = estimateScript(words, { presenter: newPresenter(f), voice: f.voice ?? "alice" });
  const g: PlanFields = { ...f, length: lengthFor(words) };
  return {
    ...c,
    step: "video",
    title: `Talking video: "${clip(script.trim(), 50)}"`,
    // "It takes a few minutes and opens in the video editor." is the card's own row under the price (agent-approvals)
    line: `${aSeconds(Math.round(est.seconds))} of ${f.who === "mine" ? "you" : "your presenter"} saying this script.`,
    script: script.trim().split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"])/).map((l) => l.trim()).filter(Boolean),
    details: videoDetails(userId, g, est.seconds),
    price: est.price,
    credits: est.credits,
    needs: needsOf("speaking", { write: false, presenter: newPresenter(g) }),
    plan: withFields(g),
  };
}

/** A talking video's card with another speaker: who appears, its details and its price. */
export function withWho(userId: string, c: AgentCard, who: string): AgentCard | null {
  const f = fieldsOf(c);
  const s = speakers(userId);
  const next = who === "new" || who === "presenter" ? { who: "presenter" as TalkWho, look: f.who === "presenter" ? (f.look ?? LOOKS[0]) : LOOKS[0] } : who === "mine" ? (s.face ? { who: "mine" as TalkWho, look: "" } : null) : (() => {
    const pr = s.presenters.find((p) => p.id === who);
    return pr ? { who: pr.id as TalkWho, look: pr.look } : null;
  })();
  if (!next) return null;
  const voice = voiceFor(next, f.voice ?? loadRemixPrefs(userId).voice);
  const moved = { ...c, plan: withFields({ ...f, ...next, voice, correction: { kind: "face", from: f.who === "mine" ? "mine" : "ai", to: next.who === "mine" ? "mine" : "ai" } }) };
  return f.script ? withScript(userId, moved, f.script) : { ...moved, details: videoDetails(userId, fieldsOf(moved), f.length ?? DEFAULT_LENGTH), needs: needsOf("speaking", { write: true, presenter: newPresenter(fieldsOf(moved)) }) };
}

// ---------- the press ----------

/** In memory: the edit target each edit card was proposed on, its writer's proposal, and the page undos a receipt holds. */
const targets = new Map<string, EditTarget>();
const proposals = new Map<string, Proposal>();
const pageUndos = new Map<string, () => void>();
export const holdTarget = (cardId: string, t: EditTarget) => void targets.set(cardId, t);
export const pageUndo = (msgId: string) => pageUndos.get(msgId) ?? null;
export const dropPageUndo = (msgId: string) => void pageUndos.delete(msgId);

let navigate: ((path: string) => void) | null = null;
/** The page's router, so "Open in Write" opens Write on the press, as the dock's card does. */
export const setNavigate = (fn: ((path: string) => void) | null) => void (navigate = fn);

/** Waits for a maker's store to settle; `step` relays its lines meanwhile. */
function until<T>(on: (fn: (j: T | null) => void) => () => void, get: () => T | null, settled: (j: T | null) => boolean, step?: (j: T) => void): Promise<T | null> {
  return new Promise((resolve) => {
    if (settled(get())) return resolve(get());
    const off = on((j) => {
      if (j && step) step(j);
      if (settled(j)) {
        off();
        resolve(j);
      }
    });
  });
}

/** Warnings that never block, for a person's brand only: Jev's MAS flag, else scanCompliance's matches. */
export function flagsFor(userId: string, text: string, mas?: boolean | null): string[] {
  if (speakerFor(userId) !== "person") return [];
  if (mas === true) return ["Check: this may need a compliance review before it goes out."];
  if (mas === false) return [];
  return scanCompliance(text).map((f) => `Check: "${f.match}" is flagged.`);
}

const videoReceipt = (hook: string, credits: number, open: string): Receipt => ({
  title: "Video made",
  line: `${sentence(clip(hook, 80))} It used ${credits} Higgsfield credits, about US$${creditsUsd(credits).toFixed(2)}.`,
  button: { label: "Open in the video editor", path: open },
  undoText: LINES.paid,
});

/** One press: the card as it moves, and the writes into its message. */
function pressOf(userId: string, thread: string, msgId: string, card: AgentCard) {
  let c = card;
  const f = fieldsOf(card);
  const startedAt = new Date().toISOString();
  const put = (patch: Partial<Omit<AgentMsg, "id">>) => void patchMsg(userId, thread, msgId, patch);
  const self = {
    f,
    /** The chat that started it: each maker's job carries it, so /activity logs the make as the agent's (replay D6). */
    agent: { thread, msg: msgId },
    card: () => c,
    put,
    /** Approved: the run got going. */
    started() {
      c = nextCard(c, { type: "started" }) ?? c;
      put({ card: c });
    },
    /**
     * Didn't go through, with cheaper chips that ask again. `refunded` only when the server gave the use back (replay D8:
     * every failed card said so, after a 422 that kept it and a dropped connection the server had counted).
     */
    fail(error: string, refunded = false) {
      c = { ...(nextCard(c, { type: "fail", error }) ?? { ...c, status: "failed" as const, error }), ...(refunded ? { refunded } : {}) };
      put({ card: c, go: offerChips(f.plan, null, subjectOf(f)) });
    },
    /** The next press of the same card (a script's video, an edit's Use this). */
    step(s: CardStep, patch: Partial<AgentCard>) {
      c = nextCard(c, { type: "next", step: s, patch }) ?? c;
      put({ card: c });
    },
    /** Made: the receipt and the MADE block, and the corrections nudge when this card was corrected a third time. */
    done(receipt: Receipt, job?: Omit<NonNullable<AgentMsg["job"]>, "startedAt">, patch: Partial<AgentCard> = {}) {
      c = { ...(nextCard(c, { type: "started" }) ?? c), ...patch };
      const n = f.correction ? correctionNudge(userId, f.correction) : null;
      if (n) c = { ...c, plan: withFields({ ...fieldsOf(c), nudge: n }) };
      put({ card: c, receipt, ...(job ? { job: { ...job, startedAt, endedAt: new Date().toISOString() } } : {}) });
    },
    log(kind: ActivityKind, title: string) {
      logActivity(userId, { who: "agent", kind, title, link: links.agent({ thread, m: msgId }) });
    },
  };
  return self;
}
type Press = ReturnType<typeof pressOf>;

/** Runs a pressed card's step (its status already "starting") and writes what happened into its message. */
export async function runPress(userId: string, thread: string, msgId: string, card: AgentCard, live: Live): Promise<void> {
  const x = pressOf(userId, thread, msgId, card);
  const { f } = x;
  const src = f.source ? resolveSource(f.source, userId) : null;
  if (f.source && !src) return x.fail("That post is no longer on this device. Press Remix on it again.");
  try {
    switch (f.plan) {
      case "post":
      case "carousel":
      case "script":
        return await remixPress(userId, thread, msgId, x, src, live);
      case "link": {
        live.call();
        live.step("Reading the post", "writing");
        await startLinkRead(userId, { url: f.link ?? "" });
        const r = linkRead();
        const read = r?.state === "done" && r.key ? resolveSource(r.key, userId) : null;
        if (!read) return x.fail(r?.error ?? NOT_THROUGH);
        const format = f.format ?? defaultOutput(read);
        const plan: PlanName = format === "slideshow" || format === "wall" || format === "carousel" || format === "script" ? format : "post";
        return await runPress(userId, thread, msgId, { ...x.card(), plan: withFields({ ...f, plan, format: plan, source: read.key }) }, live);
      }
      case "slideshow": {
        live.call();
        live.step("Writing the slides...", "writing");
        const off = onSlideshowJob((j) => void (j && showStep(j) && live.step(showStep(j), "writing")));
        await startSlideshow(userId, { source: src, topic: src ? "" : (f.topic ?? ""), note: src ? (f.topic ?? "") : "", mention: loadRemixPrefs(userId).mention, size: "4x5", pictures: loadMedia(userId).length ? "mine" : "stock", agent: x.agent }).finally(off);
        const j = slideshowJob();
        if (j?.state !== "done" || !j.showId) return x.fail(j?.error ?? NOT_THROUGH);
        const id = j.showId;
        pageUndos.set(msgId, () => void removeSlideshow(userId, id));
        const open = links.slideshow({ s: id });
        return x.done({ title: "Slideshow made", line: `"${clip(subjectOf(f), 80)}". It's in your slideshows.`, button: { label: "Open", path: open }, undo: { kind: "page", page: "Slideshows" } }, { kind: "slideshow", state: "done", open, title: subjectOf(f) });
      }
      case "wall": {
        live.call();
        live.step("Writing the text...", "writing");
        const off = onWallJob((j) => void (j && wallStep(j) && live.step(wallStep(j), "writing")));
        await startWall(userId, { source: src, about: f.topic ?? "", mention: loadRemixPrefs(userId).mention, bg: "stock", agent: x.agent }).finally(off);
        const j = wallJob();
        if (j?.state !== "done") return x.fail(j?.error ?? NOT_THROUGH);
        const text = j.written?.text ?? "";
        const open = links.edit();
        return x.done({ title: "Wall of text made", line: `"${clip(text, 80)}"`, button: { label: "Open in editor", path: open }, undoText: "Delete it in My posts" }, { kind: "wall", state: "done", open, title: clip(text, 80) }, { flags: flagsFor(userId, text, j.written?.flags.mas) });
      }
      case "speaking":
        return await talkPress(userId, x, src, live);
      case "explainer":
        return await explainerPress(userId, x, src, live);
      case "image": {
        if (imageBusy()) return x.fail(LINES.imageBusyCard);
        live.call();
        live.step("Making your picture...", "making");
        x.started();
        const prompt = x.card().prompt ?? f.topic ?? "";
        await makeImage(userId, prompt, clip(prompt, 40), undefined, x.agent);
        return settleImage(x, prompt);
      }
      case "competitor": {
        const parsed = parseInput(f.input ?? "");
        const row = rowOf(f.input ?? "");
        if (!parsed || !row) return x.fail(LINES.typeCompetitor);
        const r = addCompetitor(userId, row);
        if (r.ok === false) return x.fail(r.reason === "duplicate" ? `You already watch ${r.existing?.name ?? "them"}.` : `${MAX_COMPETITORS} of ${MAX_COMPETITORS}. Remove one to add another.`);
        // a link or handle needs no read; a site or a name is read in its own job, as the add bar does
        if (parsed.kind !== "link") {
          live.call();
          void runRead(userId, r.c.id, parsed.kind === "site" ? parsed.site : parsed.name);
        }
        x.log("brand", `Added "${r.c.name}" as a competitor`);
        return x.done({ title: "Competitor added", line: `${r.c.name} is on your list.`, button: { label: "Competitors", path: links.competitors({ view: "list" }) }, undo: { kind: "remove-competitor", id: r.c.id } });
      }
      case "move": {
        const d = loadDrafts(userId).find((y) => y.id === f.draft);
        if (!d) return x.fail("That post is no longer in My posts.");
        const today = localDateKey();
        const dock = actFor(userId, { act: "move", post: 0, day: f.day ?? null, time: f.time ?? null }, "", [d], today, () => {});
        if (!dock) return x.fail("That post can't move to that day.");
        if ("say" in dock) return x.fail(dock.say);
        const done = dock.run();
        const after = loadDrafts(userId).find((y) => y.id === d.id);
        const when = moveWhen(d, { day: f.day ?? null, time: f.time ?? null }, today)?.label ?? "";
        x.log("post", done.done.replace(/\.$/, ""));
        return x.done({ title: "Moved", line: `"${draftTitle(d)}" now goes out ${when}.`, button: { label: "Open Calendar", path: links.calendar() }, undo: { kind: "restore-draft", draft: d, was: after?.scheduledFor ?? "" } });
      }
      case "write":
      case "paste": {
        const d = f.plan === "write" ? loadDrafts(userId).find((y) => y.id === f.draft) : undefined;
        if (f.plan === "write" && !d) return x.fail("That post is no longer in My posts.");
        const dock = actFor(userId, { act: f.act as "write", post: d ? 0 : null, day: null, time: null }, f.message ?? "", d ? [d] : [], localDateKey(), (path) => navigate?.(path));
        if (!dock) return x.fail(NOT_THROUGH);
        if ("say" in dock) return x.fail(dock.say);
        const r = dock.run();
        x.log("post", r.done.replace(/\.$/, "").split(". ")[0]);
        if (f.plan === "write") {
          x.started();
          x.put({ text: r.done, go: r.open ? [{ label: "Open in Write", path: r.open }] : [] });
          if (r.open) navigate?.(r.open);
          return;
        }
        if (r.undo) pageUndos.set(msgId, r.undo);
        return x.done({ title: "Pasted", line: r.done, ...(r.open ? { button: { label: "Open Reply drafts", path: r.open } } : {}), ...(r.undo ? { undo: { kind: "page" as const, page: "Reply drafts" } } : {}) });
      }
      case "campaign": {
        const plan = planCampaign(userId, f.ask!, new Date());
        const line = addCampaign(userId, plan);
        if (line) return x.fail(line);
        live.call();
        startDrafting(userId, plan.id);
        x.log("plan", `Planned "${plan.name}"`);
        return x.done({ title: "Campaign added", line: `${plan.posts.length} posts are being written now. Leaving this page loses none.`, button: { label: "Open the campaign", path: links.campaign(plan.id, { section: "queue" }) }, undo: { kind: "delete-campaign", id: plan.id }, undoText: "The writing already used is not given back." });
      }
      case "learning": {
        const r = addLearning(userId, { text: f.message ?? "", scope: f.scope ?? "all", source: "assistant", thread, msg: msgId }, f.replaces ?? null);
        // storage refused or 30 on: the card stays proposed with the line
        if (r.ok === false) return x.put({ card: { ...x.card(), status: "proposed", decidedAt: undefined, error: r.error } });
        x.log("learning", `Learned "${r.item.text}"`);
        return x.done({ title: LEARNING_RECORDED, line: r.item.text, button: SEE_LEARNED, ...(r.existed ? {} : { undo: { kind: "learning-off" as const, id: r.item.id } }), undoText: UNDO_LINE });
      }
      case "edit":
        return await editPress(userId, msgId, x, live);
      case "answer":
        return x.fail(NOT_THROUGH); // the engine runs it through the answer skill
    }
  } catch (e) {
    // a 502 or 503 comes back before the provider answered, after the server gave the use back; anything else may have used it
    const back = e instanceof EdgeError && (e.status === 502 || e.status === 503);
    return x.fail(f.plan === "edit" ? LINES.editFailed : e instanceof Error && e.message ? e.message : NOT_THROUGH, back);
  }
}

async function remixPress(userId: string, thread: string, msgId: string, x: Press, src: RemixSource | null, live: Live): Promise<void> {
  const { f } = x;
  if (remixJob()?.state === "working") return x.fail(LINES.remixBusy);
  const as = (f.format ?? "post") as "post" | "carousel" | "script";
  startRemix(userId, {
    source: src,
    ...(src ? { note: f.topic } : { topic: f.topic }),
    keep: "structure",
    close: "balanced",
    as: [as],
    mention: loadRemixPrefs(userId).mention,
    offer: null,
    agent: { thread, msg: msgId },
  });
  const id = remixJob()?.id;
  if (remixJob()?.state !== "working") return x.fail(NOT_THROUGH);
  live.call();
  live.step(writingStep(as), "writing");
  x.started();
  const j = await until(onRemixJob, remixJob, (y) => !y || y.id !== id || y.state !== "working", (y) => void (y.id === id && y.step && live.step(y.step, "writing")));
  const row = j?.id === id ? j.rows[0] : undefined;
  // remixJob's NOTHING_USED is its 502 or 503, the model never answered; its other refunded rows were never counted
  if (row?.state !== "done" || !row.draftId) return x.fail(row?.error ?? NOT_THROUGH, row?.refunded === true && row.error === NOTHING_USED);
  const draft = loadDrafts(userId).find((d) => d.id === row.draftId);
  x.done(
    { title: `${cap(NOUN[as])} written`, line: `${row.hook ? `${sentence(row.hook)} ` : ""}It's in My posts.`, button: { label: "Open", path: row.href ?? links.drafts() }, undo: { kind: "delete-drafts", ids: [row.draftId] } },
    { kind: "remix", state: "done", drafts: [row.draftId], open: row.href, title: row.hook },
    { flags: flagsFor(userId, draft?.draft ?? row.hook ?? "", row.flags?.mas) },
  );
}

async function talkPress(userId: string, x: Press, src: RemixSource | null, live: Live): Promise<void> {
  const { f } = x;
  const ask: TalkAsk = {
    source: src,
    text: f.topic ?? "",
    who: f.who ?? "presenter",
    photo: null,
    look: f.look ?? LOOKS[0],
    setting: "office",
    voice: f.voice ?? "alice",
    length: f.length ?? DEFAULT_LENGTH,
    mention: loadRemixPrefs(userId).mention,
    ...(f.caption ? { caption: f.caption } : {}),
    agent: x.agent,
  };
  if (x.card().step !== "video") {
    if (talkBusy() || talkWaiting()) return x.fail(LINES.videoBusy);
    live.call();
    live.step("Writing your script...", "writing");
    // the script only (one remix-make use, the card's price): nothing else runs until the video card's press
    const w = await writeScript(userId, ask);
    // written here, not by the talk job, so its line on /activity is written here too, as the recorder writes the job's
    logActivity(userId, { who: "agent", kind: "make", title: "Wrote a talking video script", detail: w.script, link: links.agent({ thread: x.agent.thread, m: x.agent.msg }) });
    x.step("video", { ...withScript(userId, x.card(), w.script, w.caption), flags: flagsFor(userId, w.script, w.flags?.mas) });
    return x.put({ text: LINES.scriptLead });
  }
  const ownPriced = !!f.priced && talkWaiting();
  if (!ownPriced && (aiBusy() || talkBusy() || talkWaiting())) return x.fail(LINES.videoBusyCard);
  live.call();
  x.started();
  const off = onTalkJob((j) => void (j?.step && live.step(j.step, "making")));
  try {
    if (ownPriced) await goOnAtPrice(userId);
    // the price check stops only above the video's price on this card (withScript's), not the length's estimate
    else await startTalk(userId, { ...ask, text: f.script ?? "", quoted: scriptEstimate(wordCount(f.script ?? ""), ask.voice).usd });
  } finally {
    off();
  }
  settleTalk(x);
}

/**
 * The talking video's script, as talkingHeadJob's write does it, with the words its length takes in the card's voice
 * (replay D5: 45 words ran 18 s in Alice's voice for a 15 s card) and the writer's caption with its call to action (D13).
 */
async function writeScript(userId: string, a: TalkAsk): Promise<{ script: string; caption: string; flags?: Flags }> {
  const t = a.text.trim();
  const body = makeBody(userId, { source: a.source, topic: a.source ? "" : t, note: a.source && asTopic(t, a.length) ? t : "", mention: a.mention, size: "9x16" }, "speaking", { seconds: a.length });
  const res = await requestMake({ ...body, words: wordsFor(a.length, a.voice) });
  if (res?.result?.as !== "speaking" || !res.result.script.trim()) throw new Error(WRITE_FAILED);
  return { script: stripDashes(res.result.script).trim(), caption: stripDashes(applyBrandRules(res.result.caption, loadBrand(userId), "tiktok")).trim(), flags: res.flags };
}

/** A talk after its press or picked up after a reload: priced goes back to a card, done to MADE and the receipt. */
function settleTalk(x: Press): void {
  const j = talkJob();
  if (j?.state === "priced" && j.real) {
    return x.step("video", {
      price: j.real.price,
      line: `The voiceover runs ${Math.round(j.real.seconds)} seconds, so this costs about US$${j.real.price.usd.toFixed(2)}.`,
      plan: withFields({ ...x.f, priced: true }),
    });
  }
  if (j?.state !== "done") return x.fail(j?.error ?? NOT_THROUGH);
  const credits = j.voice ? avatarCredits(j.voice.slices.map((s) => s.end - s.start)) : (x.card().credits ?? 0);
  const script = j.script ?? x.f.script ?? "";
  // the editor opens on the made video: /edit takes the joined video into its project, and madeOpen finds it after (replay D7)
  const open = links.edit();
  x.done(videoReceipt(script, credits, open), { kind: "talk", state: "done", open, title: clip(script, 80), name: script.slice(0, 40) || "Talking head" });
}

/** The explainer's scenes, as aiVideo's writeExplainer asks, in the brand's voice: a business never ends "Message me" (D14). */
async function writeScenes(userId: string, topic: string): Promise<Scene[]> {
  const business = speakerFor(userId) === "business";
  // the brand's name only, not the video learnings, which carry the presenter's look (replay D14, live-p7a D23)
  const name = business ? ownBrandName(userId) : "";
  const { scenes } = await callFn<{ scenes: Scene[] }>(
    "ai-video",
    { mode: "script", topic, ...(business ? { speaker: "business" } : {}), ...(name ? { notes: `The brand is ${name}. Name it once.` } : {}) },
    "Couldn't write the explainer. Try again in a minute.",
  );
  return scenes;
}

async function explainerPress(userId: string, x: Press, src: RemixSource | null, live: Live): Promise<void> {
  const { f } = x;
  if (x.card().step !== "video") {
    live.call();
    live.step("Writing the script...", "writing");
    const scenes = await writeScenes(userId, src ? `${src.title}. ${f.topic ?? ""}`.slice(0, MAX_TOPIC) : (f.topic ?? ""));
    const seconds = wordCount(scenes.map((s) => s.say).join(" ")) / 2.5;
    x.put({ text: LINES.scriptLead });
    return x.step("video", {
      title: `Explainer video: ${clip(scenes[0]?.say ?? "", 60)}`,
      line: `${scenes.length} pictures with your voiceover, about ${Math.round(seconds)} seconds.`,
      script: scenes.map((s) => s.say),
      details: videoDetails(userId, f, seconds),
      // the price chip carries it: a fraction of a credit beside it read as the price (replay D14, "about 0.45 Higgsfield credits")
      price: sum(price("ai-video", { scenes: scenes.length }), price("ai-voice")),
      needs: [{ feature: "ai-video", n: 1 }, { feature: "ai-voice", n: 1 }],
      plan: withFields({ ...f, scenes }),
    });
  }
  if (aiBusy()) return x.fail(LINES.videoBusyCard);
  live.call();
  x.started();
  const off = onAiJob((j) => void (j?.kind === "explainer" && j.state === "working" && live.step(j.step, "making")));
  await makeExplainer(explainerName(f), f.scenes ?? [], f.voice ?? "alice", undefined, undefined, x.agent).finally(off);
  settleExplainer(x);
}

/** The explainer's file name, which its project in the editor takes. */
const explainerName = (f: PlanFields) => clip(f.scenes?.[0]?.say ?? "Explainer", 40);

/**
 * Where a made video opens: its own project once the editor has taken it, the first saved under its file name since
 * the make began (replay D7: Open went to the empty AI panel), else the job's link, whose /edit takes the video.
 */
export function madeOpen(userId: string, job: AgentMsg["job"]): string | undefined {
  if (!job?.name) return job?.open;
  const p = loadProjects(userId)
    .filter((x) => x.name === job.name && x.createdAt >= job.startedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return p ? links.edit({ p: p.id }) : job.open;
}

function settleExplainer(x: Press): void {
  const j = aiJob();
  if (j?.kind !== "explainer" || j.state !== "done") return x.fail(j?.error ?? NOT_THROUGH);
  const hook = x.f.scenes?.[0]?.say ?? "";
  const open = links.edit();
  x.done(videoReceipt(hook, explainerCredits(x.f.scenes?.length ?? 0), open), { kind: "video", state: "done", open, title: clip(hook, 80), name: explainerName(x.f) });
}

function settleImage(x: Press, prompt: string): void {
  const j = imageJob();
  if (j?.state !== "done") return x.fail(j?.error ?? NOT_THROUGH);
  const open = links.media({ folder: AI_FOLDER });
  x.done({ title: "Picture made", line: "Saved to Media under AI images.", button: { label: "Open Media", path: open }, undoText: LINES.paid }, { kind: "image", state: "done", open, title: clip(prompt, 60) });
}

async function editPress(userId: string, msgId: string, x: Press, live: Live): Promise<void> {
  const { f } = x;
  const target = targets.get(x.card().id);
  if (!target || currentEditTarget() !== target) return x.fail(LINES.gone(f.kind ?? "item"));
  if (x.card().step !== "apply") {
    live.call();
    live.step("Writing the change...", "writing");
    const p = await target.propose(f.message ?? "", f.slide ?? null);
    if (currentEditTarget() !== target) return x.fail(LINES.gone(target.kind));
    // an empty change means it isn't a words change: the writer's own words say where to do it. Not a failure, so
    // no refund line (the use was spent) and no Try again (it would spend again for the same answer)
    if (!p.preview.trim()) return x.done({ title: "No change made", line: p.reply || LINES.editFailed });
    proposals.set(x.card().id, p);
    return x.step("apply", { line: p.reply, preview: clip(p.preview.trim(), 160), flags: [...p.flags, ...flagsFor(userId, p.preview)], price: undefined, needs: [] });
  }
  const p = proposals.get(x.card().id);
  if (!p) return x.fail(LINES.gone(target.kind));
  const r = p.apply();
  proposals.delete(x.card().id);
  pageUndos.set(msgId, r.undo);
  x.log("post", r.done.replace(/^Done\.\s*/, "").replace(/\.$/, "").split(". ")[0]);
  x.done({ title: "Changed", line: r.done, undo: { kind: "page", page: `the ${target.kind}` } });
}

/**
 * After a reload: a pressed video or picture whose job runs on (or was paid for and waits on this device) is followed
 * to its MADE block; true when one was picked up. Anything else that was running is gone with the page.
 */
export async function resumePress(userId: string, thread: string, msgId: string, card: AgentCard, live: Live): Promise<boolean> {
  const x = pressOf(userId, thread, msgId, card);
  const step = (s: string) => live.step(s, "making");
  if (x.f.plan === "speaking" && card.step === "video") {
    const running = talkBusy() || resumeTalk(userId);
    if (!running) return false;
    await until(onTalkJob, talkJob, (j) => !j || !["writing", "presenter", "voice", "video", "joining"].includes(j.state), (j) => void (j.step && step(j.step)));
    settleTalk(x);
    return true;
  }
  if (x.f.plan === "explainer" && card.step === "video") {
    if (!(aiJob()?.kind === "explainer" && aiBusy())) {
      if (!pendingExplainer()) return false;
      resumeExplainer();
    }
    await until(onAiJob, aiJob, (j) => !j || j.state !== "working", (j) => void (j.step && step(j.step)));
    settleExplainer(x);
    return true;
  }
  if (x.f.plan === "image") {
    if (!imageBusy()) resumeImage(userId);
    if (!imageBusy()) return false;
    await until(onImageJob, imageJob, (j) => !j || (j.state !== "working" && j.state !== "saving"));
    settleImage(x, card.prompt ?? "");
    return true;
  }
  return false;
}

/** Uses left of a card's first need (null when unread), for its price line. */
export const leftFor = (c: AgentCard, usage: Usage | null): number | null => (c.needs[0] ? leftOf(usage, c.needs[0].feature) : null);
