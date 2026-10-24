// The review queue's actions (plan-review-queue, Leo only), outside React so a Make or a Swap keeps going when the
// page is left. Make never posts (Post it for me stays its own press): it puts the post on the calendar as a
// scheduled My posts entry cmp_<campaign>_<n> at its day and time. A text post, carousel or short video script is
// made at once (/carousel?draft= rebuilds the same slides from the same words, so no carousel is saved). A slideshow
// runs the slideshow maker from the hook and brief and schedules what it made. A wall of text and an AI video leave
// a scheduled short-video draft first and run their makers with its id, so the editor's Save to your post updates
// it; they count as made once the editor has the video. An AI video with no saved "Who appears" opens the AI video
// maker on that draft instead. Swap writes one post again (idea-dump mode campaign, swap, cap campaign-swap) and
// keeps the old words for Undo. A make in this tab is in memory: a reload leaves the post "making", and the queue
// picks it up (a paid AI video waiting on this device, at no cost) or puts it back to ready (resumeMakes). Make on a
// post whose paid video still waits (over 20 minutes at Higgsfield) picks it up the same way and never pays again.

import { aiBusy, pendingAvatar } from "@/lib/aiVideo";
import { loadAudiences } from "@/lib/audiences";
import { presenterVoice } from "@/lib/presenters";
import { applyBrandRules, avoidList } from "@/lib/brandRules";
import { campaignRequest, startDrafting } from "@/lib/campaignJob";
import { AI_VIDEO, dropsPostedDraft, FREE_FORMATS, getCampaign, updatePost, type Campaign, type CampaignPost } from "@/lib/campaigns";
import { shortDay } from "@/lib/campaignWizard";
import { loadBrand } from "@/lib/carousel";
import { keyToDate, scheduleAt, timeLabel } from "@/lib/dueDates";
import { deleteDraft, draftsChanged, MAX_DRAFTS, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { links } from "@/lib/links";
import { findWords } from "@/lib/platformCounters";
import { loadRemixPrefs } from "@/lib/remixBrand";
import { loadSlideshows, MAX_SHOWS, saveSlideshow, slideshowToDraft } from "@/lib/slideshow";
import { slideshowBusy, slideshowJob, startSlideshow, FINISH_FAILED as SHOW_FAILED } from "@/lib/slideshowJob";
import { splitDraftIntoSlides } from "@/lib/carousel";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { asTopic, defaultWho, scriptEstimate, speakerOf, speakers, wordCount, type TalkWho } from "@/lib/talkingHead";
import { onTalkJob, resumeTalk, startTalk, talkBusy, talkJob } from "@/lib/talkingHeadJob";
import { onWallJob, startWall, wallBusy, wallJob, FINISH_FAILED as WALL_FAILED } from "@/lib/wallJob";
import type { WrittenPost } from "../../supabase/functions/idea-dump/logic.ts";
import { speakingWords } from "../../supabase/functions/remix/logic.ts";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

export type MakeOutcome = { ok: true; toast: string; undo(): void; open?: string } | { ok: false; error: string; capped?: true };

export const GONE_LINE = "This post isn't here any more.";
export const MADE_LINE = "This post is already made.";
export const WRITING_LINE = "This post is still being written.";
export const MAKING_LINE = "This post is being made.";
export const SAVE_LINE = "Couldn't save. Try again.";
export const SWAP_MADE_LINE = "Made posts are changed in My posts.";
export const SWAP_FAILED = "Couldn't write new words. Try again in a minute.";
export const SWAP_CAP_LINE = `You've used all ${DAILY_LIMITS["campaign-swap"]} swaps for today. It resets at 8am Singapore time. Edit the words instead.`;
export const SHOW_BUSY = "Another slideshow is being made. Wait for it to finish.";
export const WALL_BUSY = "Another wall of text is being made. Wait for it to finish.";
export const AI_BUSY = "Another AI video is being made. Wait for it to finish.";
export const AI_WAITING = "Another AI video is still being made. Make this one once it's in the editor.";
export const VIDEO_FAILED = "The AI video could not be made.";
export const STOPPED_LINE = "This make stopped before it finished. Press Make to try again.";
export const SHORT_SCRIPT = `This script is under ${speakingWords(15).low} words, too short to speak as written. Edit or swap it first.`;

const FIELDS = ["hook", "body", "script", "brief", "cta"] as const;
type Words = Pick<CampaignPost, (typeof FIELDS)[number]>;

/** The My posts entry a campaign post becomes: `cmp_<campaign>_<n>` (campaign ids never hold "_"). */
export const draftIdOf = (campaignId: string, n: number) => `cmp_${campaignId}_${n}`;

/** "Thu 30 Oct, 8pm", or the day alone when the slot has no time. */
export const whenText = (p: Pick<CampaignPost, "day" | "time">) => `${shortDay(keyToDate(p.day))}${p.time ? `, ${timeLabel(p.time)}` : ""}`;

/** The words that go out: a script as it is spoken, a slideshow's or wall's hook and brief, else hook, body and call to action. */
export function postText(p: Pick<CampaignPost, "format" | (typeof FIELDS)[number]>): string {
  if (p.format === "short-video" || p.format === "ai-video") return (p.script ?? "").trim();
  const middle = p.format === "slideshow" || p.format === "wall" ? p.brief : p.body;
  return [p.hook, middle, p.cta].map((t) => t?.trim()).filter(Boolean).join("\n\n");
}

/** An AI video post's caption: the writer's caption (body) and the call to action, or the call to action alone. */
export const videoCaption = (p: Pick<CampaignPost, "body" | "cta">) => [p.body, p.cta].map((t) => t?.trim()).filter(Boolean).join("\n\n");

/** A carousel's slides as the queue shows them and as /carousel?draft= rebuilds them from the made draft. */
export const postSlides = (p: Pick<CampaignPost, "format" | (typeof FIELDS)[number]>) => splitDraftIntoSlides(postText(p), { hook: p.hook ?? "" }).slides;

/**
 * The scheduled My posts entry for a post: a wall and an AI video wait in it as a short video script, an AI video's
 * with its caption under it in Clone a reel's shape (script, a --- line, CAPTION:), which the AI panel carries to the editor.
 */
export function postDraft(userId: string, c: Pick<Campaign, "id" | "audience" | "angles" | "platforms">, p: CampaignPost, now: Date): DraftEntry {
  const caption = p.format === "ai-video" ? videoCaption(p) : "";
  return {
    id: draftIdOf(c.id, p.n),
    createdAt: now.toISOString(),
    hook: p.hook ?? "",
    draft: caption ? `${postText(p)}\n\n---\n\nCAPTION:\n${caption}` : postText(p),
    pillar: p.pillar,
    pillarDetail: c.angles.find((a) => a.id === p.angleId)?.title ?? "",
    audience: loadAudiences(userId).find((a) => a.id === c.audience)?.lifeStage ?? "general",
    format: FREE_FORMATS.includes(p.format) ? p.format : "short-video",
    platform: c.platforms[0] ?? "linkedin",
    ctaType: p.ctaType,
    ...(p.formulaId ? { hookFormula: p.formulaId } : {}),
    status: "scheduled",
    scheduledFor: scheduleAt(p.day, p.time),
  };
}

/** The hook of the posted (or measured) My posts entry one more post pushes out, else null: Make asks first. */
export const droppedHook = (drafts: DraftEntry[]): string | null =>
  dropsPostedDraft(drafts, 1) ? drafts[MAX_DRAFTS - 1]?.hook || drafts[MAX_DRAFTS - 1]?.draft.slice(0, 60) || "an older post" : null;

/** The line before a slideshow's Make when Slideshows is full and this one pushes the oldest out; else null. */
export function showDropLine(userId: string): string | null {
  const shows = loadSlideshows(userId);
  return shows.length >= MAX_SHOWS ? `Slideshows keeps your newest ${MAX_SHOWS}, so this drops ${shows[MAX_SHOWS - 1]?.title || "your oldest one"}.` : null;
}

// ---- What runs in this tab -------------------------------------------------------------

export type Maker = "slideshow" | "wall" | "talk";
const making = new Map<string, Maker>();
const swapping = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const keyOf = (campaignId: string, n: number) => `${campaignId}:${n}`;

/** The maker running for this post in this tab, else null. */
export const makerOf = (campaignId: string, n: number): Maker | null => making.get(keyOf(campaignId, n)) ?? null;
export const isSwapping = (campaignId: string, n: number) => swapping.has(keyOf(campaignId, n));
/** Fires when a make or swap starts or stops in this tab (the store's own event covers the words). */
export function onActions(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
const busy = (k: string, m: Maker | null) => {
  if (m) making.set(k, m);
  else making.delete(k);
  notify();
};

const find = (userId: string, campaignId: string, n: number) => {
  const c = getCampaign(userId, campaignId);
  return { c, p: c?.posts.find((x) => x.n === n) ?? null };
};

/** Why this post can't be made now (a made post, one still being written or being made), else null. */
function notMakeable(campaignId: string, p: CampaignPost | null): string | null {
  if (!p) return GONE_LINE;
  if (p.state === "made") return MADE_LINE;
  if (makerOf(campaignId, p.n) || isSwapping(campaignId, p.n)) return MAKING_LINE;
  // a "making" post with no maker here was stopped (a reload): it can be made again
  return p.hook && (p.state === "ready" || p.state === "making") ? null : WRITING_LINE;
}

const writeDraft = (userId: string, d: DraftEntry) => {
  upsertDraft(userId, d);
  draftsChanged();
};
const dropDraft = (userId: string, id: string) => {
  deleteDraft(userId, id);
  draftsChanged();
};

// ---- Make ----------------------------------------------------------------------------

export async function makePost(userId: string, campaignId: string, n: number, now = new Date()): Promise<MakeOutcome> {
  const { c, p } = find(userId, campaignId, n);
  const no = notMakeable(campaignId, p);
  if (no || !c || !p) return { ok: false, error: no ?? GONE_LINE };
  if (FREE_FORMATS.includes(p.format)) return makeNow(userId, c, p, now);
  if (p.format === "slideshow") return makeShow(userId, c, p, now);
  if (p.format === "wall") return makeWall(userId, c, p, now);
  return makeVideo(userId, c, p, now);
}

const undoOf = (userId: string, campaignId: string, n: number) => () => void undoMake(userId, campaignId, n);

function makeNow(userId: string, c: Campaign, p: CampaignPost, now: Date): MakeOutcome {
  const d = postDraft(userId, c, p, now);
  writeDraft(userId, d);
  if (!updatePost(userId, c.id, p.n, { state: "made", draftId: d.id, made: { kind: "draft", id: d.id }, error: undefined })) {
    dropDraft(userId, d.id);
    return { ok: false, error: SAVE_LINE };
  }
  return { ok: true, toast: `Post ${p.n} is on your calendar for ${whenText(p)}.`, undo: undoOf(userId, c.id, p.n) };
}

/** Every picture this campaign's made slideshows show, once per slide: the next one leans on the Media screens used least. */
function campaignPictures(userId: string, c: Pick<Campaign, "posts">): string[] {
  const shows = loadSlideshows(userId);
  return c.posts.flatMap((x) => (x.made?.kind === "slideshow" ? (shows.find((s) => s.id === x.made?.id)?.slides ?? []).flatMap((s) => (s.image ? [s.image] : [])) : []));
}

async function makeShow(userId: string, c: Campaign, p: CampaignPost, now: Date): Promise<MakeOutcome> {
  if (slideshowBusy()) return { ok: false, error: SHOW_BUSY };
  const k = keyOf(c.id, p.n);
  if (!updatePost(userId, c.id, p.n, { state: "making", error: undefined })) return { ok: false, error: SAVE_LINE };
  busy(k, "slideshow");
  const run = startSlideshow(
    userId,
    { source: null, topic: p.hook ?? "", note: p.brief ?? "", mention: true, size: c.platforms[0] === "tiktok" ? "9x16" : "4x5", pictures: c.pictures },
    { used: campaignPictures(userId, c), start: p.n },
  );
  const id = slideshowJob()?.id;
  await run;
  busy(k, null);
  const j = slideshowJob();
  const show = j?.id === id && j.state === "done" ? loadSlideshows(userId).find((s) => s.id === j.showId) : undefined;
  if (!show) {
    const error = (j?.id === id && j.error) || SHOW_FAILED;
    updatePost(userId, c.id, p.n, { state: "ready", error });
    return { ok: false, error, ...(j?.id === id && j.capped ? { capped: true as const } : {}) };
  }
  const draftId = draftIdOf(c.id, p.n);
  const linked = { ...show, draftId };
  saveSlideshow(userId, linked);
  const base = postDraft(userId, c, p, now);
  writeDraft(userId, { ...slideshowToDraft(linked, now.toISOString()), pillar: base.pillar, pillarDetail: base.pillarDetail, audience: base.audience, ctaType: base.ctaType, ...(base.hookFormula ? { hookFormula: base.hookFormula } : {}), status: "scheduled", scheduledFor: base.scheduledFor });
  updatePost(userId, c.id, p.n, { state: "made", draftId, made: { kind: "slideshow", id: show.id }, error: undefined });
  return { ok: true, toast: `Post ${p.n} is on your calendar for ${whenText(p)}, with its slides.`, undo: undoOf(userId, c.id, p.n) };
}

/** Marks the post made once the editor has its video; else back to ready (the draft goes unless a paid video still waits for it). */
function settle(userId: string, c: Pick<Campaign, "id">, p: Pick<CampaignPost, "n">, draftId: string, done: boolean, error: string, what: string, wrote?: { text?: string; caption?: string }): MakeOutcome {
  if (done) {
    const { text, caption } = wrote ?? {};
    updatePost(userId, c.id, p.n, { state: "made", draftId, made: { kind: "video", id: draftId, ...(text ? { text } : {}), ...(caption ? { caption } : {}) }, error: undefined });
    return { ok: true, toast: `Post ${p.n}'s ${what} is in the editor. Check it and export it there.`, undo: undoOf(userId, c.id, p.n) };
  }
  if (pendingAvatar()?.extra?.draftId === draftId) updatePost(userId, c.id, p.n, { error });
  else {
    dropDraft(userId, draftId);
    updatePost(userId, c.id, p.n, { state: "ready", draftId: undefined, error });
  }
  return { ok: false, error };
}

async function makeWall(userId: string, c: Campaign, p: CampaignPost, now: Date): Promise<MakeOutcome> {
  if (wallBusy("wall")) return { ok: false, error: WALL_BUSY };
  const d = postDraft(userId, c, p, now);
  writeDraft(userId, d);
  if (!updatePost(userId, c.id, p.n, { state: "making", draftId: d.id, error: undefined })) {
    dropDraft(userId, d.id);
    return { ok: false, error: SAVE_LINE };
  }
  const k = keyOf(c.id, p.n);
  busy(k, "wall");
  return new Promise((resolve) => {
    let id: number | undefined;
    const off = onWallJob((j) => {
      if (id === undefined || (j && j.id === id && j.state !== "joining" && j.state !== "done" && j.state !== "failed")) return;
      off();
      busy(k, null);
      const done = !!j && j.id === id && (j.state === "joining" || j.state === "done");
      // the words and caption the wall maker wrote, which the queue shows in place of the hook and brief (live-p5dog D8)
      resolve(settle(userId, c, p, d.id, done, (j?.id === id && j.error) || WALL_FAILED, "wall of text", done ? j?.written : undefined));
    }, "wall");
    void startWall(userId, { source: null, about: p.hook ?? "", note: p.brief ?? "", mention: true, bg: "stock", draftId: d.id });
    const j = wallJob("wall");
    if (j?.ask.draftId === d.id) id = j.id;
    else {
      off();
      busy(k, null);
      resolve(settle(userId, c, p, d.id, false, WALL_BUSY, "wall of text"));
    }
  });
}

/** The brand's saved "Who appears" when it can speak now (your face while it is on, or a presenter); null is Ask each time. */
export function savedWho(userId: string): TalkWho | null {
  const s = speakers(userId);
  const who = defaultWho(s);
  return who && speakerOf(s, who) ? (who as TalkWho) : null;
}

/** The voice for who appears: a presenter's own (one that fits their look), else the remix voice remembered. */
function voiceFor(userId: string, who: TalkWho) {
  const remembered = loadRemixPrefs(userId).voice;
  const sp = speakerOf(speakers(userId), who);
  return sp?.person === "presenter" ? presenterVoice(sp.p, remembered) : remembered;
}

/** The voice Make speaks a post in: who appears' own, else (Ask each time) the remix voice remembered. */
const voiceOfPost = (userId: string) => {
  const who = savedWho(userId);
  return who ? voiceFor(userId, who) : loadRemixPrefs(userId).voice;
};

/**
 * What an AI video post costs on the card before Make (live-p5dog day 3): its script's estimate in the voice Make
 * speaks it in, plus the voiceover; AI_VIDEO while it has no script.
 */
export function videoPriceOf(userId: string, p: Pick<CampaignPost, "script">): Price {
  const words = wordCount(p.script ?? "");
  return words ? (sumPrices(scriptEstimate(words, voiceOfPost(userId)), priceOf("ai-voice")) as Price) : AI_VIDEO;
}

/** Follows the talking head run `start` begins or picks up (true when it did) until the editor has the video, or it stops. */
function followTalk(userId: string, c: Pick<Campaign, "id">, p: Pick<CampaignPost, "n">, draftId: string, start: () => boolean): Promise<MakeOutcome> {
  const k = keyOf(c.id, p.n);
  busy(k, "talk");
  return new Promise((resolve) => {
    let id: number | undefined;
    const off = onTalkJob((j) => {
      // a priced run waits for "Make it for US$x" (goOnAtPrice) on the same run
      if (id === undefined || (j && j.id === id && j.state !== "joining" && j.state !== "done" && j.state !== "failed")) return;
      off();
      busy(k, null);
      const done = !!j && j.id === id && (j.state === "joining" || j.state === "done");
      resolve(settle(userId, c, p, draftId, done, (j?.id === id && j.error) || VIDEO_FAILED, "AI video"));
    });
    if (start()) id = talkJob()?.id;
    if (id === undefined) {
      off();
      busy(k, null);
      resolve(settle(userId, c, p, draftId, false, AI_BUSY, "AI video"));
    }
  });
}

/** The paid video waiting on this device for this post (one that took over 20 minutes), else null. */
export const waitingFor = (c: Pick<Campaign, "id">, p: Pick<CampaignPost, "n" | "draftId">) => {
  const w = pendingAvatar();
  return w?.extra?.draftId && w.extra.draftId === (p.draftId ?? draftIdOf(c.id, p.n)) ? w : null;
};

async function makeVideo(userId: string, c: Campaign, p: CampaignPost, now: Date): Promise<MakeOutcome> {
  // its paid video is still waiting here: Make picks it up at no cost and never pays again (live-p5dog D4)
  if (waitingFor(c, p)) {
    if (aiBusy() || talkBusy()) return { ok: false, error: AI_BUSY };
    const draftId = p.draftId ?? draftIdOf(c.id, p.n);
    if (!updatePost(userId, c.id, p.n, { state: "making", draftId, error: undefined })) return { ok: false, error: SAVE_LINE };
    return followTalk(userId, c, p, draftId, () => resumeTalk(userId));
  }
  const who = savedWho(userId);
  const d = postDraft(userId, c, p, now);
  if (!who) {
    // Ask each time: the maker opens on the scheduled draft and the person picks who appears there
    const made = makeNow(userId, c, p, now);
    return made.ok ? { ...made, toast: `Post ${p.n} is on your calendar for ${whenText(p)}. Pick who appears to make the video.`, open: links.edit({ panel: ["ai"], kind: "avatar", draft: d.id }) } : made;
  }
  if (aiBusy() || talkBusy()) return { ok: false, error: AI_BUSY };
  // another post's paid video waits on this device, and a new one would take its place
  if (pendingAvatar()) return { ok: false, error: AI_WAITING };
  const script = (p.script ?? "").trim();
  // the talking head writes a fresh script from anything shorter, which would spend a remix and change the words
  if (asTopic(script, 15)) return { ok: false, error: SHORT_SCRIPT };
  writeDraft(userId, d);
  if (!updatePost(userId, c.id, p.n, { state: "making", draftId: d.id, error: undefined })) {
    dropDraft(userId, d.id);
    return { ok: false, error: SAVE_LINE };
  }
  const voice = voiceFor(userId, who);
  return followTalk(userId, c, p, d.id, () => {
    // the post's own caption and call to action go to the editor with it (live-p5dog D3); the price check stops only
    // above the card's estimate (videoPriceOf), not a 15 s video's
    void startTalk(userId, {
      source: null, text: script, who, photo: null, look: "", setting: "office", voice, length: 15, mention: true, caption: videoCaption(p), draftId: d.id,
      quoted: scriptEstimate(wordCount(script), voice).usd,
    });
    return talkJob()?.ask?.draftId === d.id;
  });
}

/**
 * Posts left "making" with no maker in this tab (a reload, a closed tab): a paid AI video waiting on this device for
 * its draft is picked up at no cost and marked made when the editor has it; any other goes back to ready, its
 * scheduled draft kept so another tab still making it loses nothing. Returns the picked-up runs (for their toasts).
 */
export function resumeMakes(userId: string, campaignId: string): Promise<MakeOutcome>[] {
  const c = getCampaign(userId, campaignId);
  if (!c) return [];
  const out: Promise<MakeOutcome>[] = [];
  for (const p of c.posts) {
    if (p.state !== "making" || makerOf(c.id, p.n)) continue;
    const draftId = p.draftId ?? draftIdOf(c.id, p.n);
    if (p.format === "ai-video" && waitingFor(c, { ...p, draftId })) {
      if (!aiBusy() && !talkBusy()) out.push(followTalk(userId, c, p, draftId, () => resumeTalk(userId)));
    } else updatePost(userId, c.id, p.n, { state: "ready", error: STOPPED_LINE });
  }
  return out;
}

/** Undo for a Make: the scheduled draft comes off the calendar and the post is ready again (a made slideshow stays in Slideshows). */
export function undoMake(userId: string, campaignId: string, n: number): string | null {
  const { p } = find(userId, campaignId, n);
  if (!p || p.state !== "made") return null;
  dropDraft(userId, p.draftId ?? draftIdOf(campaignId, n));
  return updatePost(userId, campaignId, n, { state: "ready", draftId: undefined, made: undefined, error: undefined }) ? null : SAVE_LINE;
}

/** Makes every written text post, carousel and short video script in order; onStep(done, of) after each. */
export async function makeFreePosts(
  userId: string,
  campaignId: string,
  onStep: (done: number, of: number) => void = () => {},
): Promise<{ made: number; failed: number; undo(): void }> {
  const ns = (getCampaign(userId, campaignId)?.posts ?? []).filter((p) => FREE_FORMATS.includes(p.format) && p.state === "ready").map((p) => p.n);
  const undos: (() => void)[] = [];
  let failed = 0;
  for (const n of ns) {
    const r = await makePost(userId, campaignId, n);
    if (r.ok) undos.push(r.undo);
    else failed++;
    onStep(undos.length + failed, ns.length);
  }
  return { made: undos.length, failed, undo: () => undos.forEach((u) => u()) };
}

// ---- Swap, Edit, Skip ---------------------------------------------------------------------

/** One written post's words inside the brand kit's emoji and hashtag rules; null when it is missing or uses a word the kit forbids. */
function wordsOf(w: WrittenPost | undefined, userId: string, platform: string): Partial<CampaignPost> | null {
  if (!w || typeof w.hook !== "string" || !w.hook.trim()) return null;
  const brand = loadBrand(userId);
  const words = Object.fromEntries(FIELDS.map((f) => [f, typeof w[f] === "string" && w[f].trim() ? applyBrandRules(w[f] as string, brand, platform) : undefined]));
  if (findWords(Object.values(words).filter(Boolean).join("\n"), avoidList(brand)).length) return null;
  return { ...words, mas: typeof w.mas === "boolean" ? w.mas : null };
}

/** New words for one written post, same angle and format; the old ones wait in `prev` for Undo. */
export async function swapPost(userId: string, campaignId: string, n: number): Promise<MakeOutcome> {
  const { c, p } = find(userId, campaignId, n);
  if (!c || !p) return { ok: false, error: GONE_LINE };
  if (p.state === "made") return { ok: false, error: SWAP_MADE_LINE };
  const no = notMakeable(campaignId, p);
  if (no || p.state !== "ready" || !p.hook) return { ok: false, error: no ?? WRITING_LINE };
  const k = keyOf(c.id, n);
  swapping.add(k);
  notify();
  try {
    const base = campaignRequest(userId, c, [p]);
    // the swapped post's own hook first: idea-dump refuses a new hook that repeats it (wave 2 live fix)
    const avoid = [p.hook, ...base.avoid.filter((h) => h !== p.hook)].slice(0, 20);
    const r = await callFn<{ posts?: WrittenPost[] }>("idea-dump", { ...base, swap: true, avoid }, SWAP_FAILED);
    const words = wordsOf(r?.posts?.find((w) => w?.n === n), userId, c.platforms[0]);
    if (!words) return { ok: false, error: SWAP_FAILED };
    const now = find(userId, campaignId, n).p;
    if (!now || now.state !== "ready") return { ok: false, error: now ? MADE_LINE : GONE_LINE };
    const prev = Object.fromEntries(FIELDS.map((f) => [f, now[f]])) as CampaignPost["prev"];
    if (!updatePost(userId, campaignId, n, { ...words, prev })) return { ok: false, error: SAVE_LINE };
    return { ok: true, toast: `New words for post ${n}.`, undo: () => void undoSwap(userId, campaignId, n) };
  } catch (e) {
    if (e instanceof EdgeError && e.status === 429) return { ok: false, error: SWAP_CAP_LINE, capped: true };
    return { ok: false, error: (e instanceof EdgeError && e.message) || SWAP_FAILED };
  } finally {
    swapping.delete(k);
    notify();
  }
}

/** Undo for a Swap: the old words back (Jev's answer was for them, so the pattern check stands in). */
export function undoSwap(userId: string, campaignId: string, n: number): string | null {
  const { p } = find(userId, campaignId, n);
  if (!p?.prev || p.state !== "ready") return null;
  const back = Object.fromEntries(FIELDS.map((f) => [f, p.prev?.[f]]));
  return updatePost(userId, campaignId, n, { ...back, prev: undefined, mas: null }) ? null : SAVE_LINE;
}

/** Saves typed words over an unmade post. Jev's answer was for the old words, so the pattern check stands in. Null when saved. */
export function editPost(userId: string, campaignId: string, n: number, patch: Words): string | null {
  const { p } = find(userId, campaignId, n);
  if (!p) return GONE_LINE;
  if (p.state === "made") return SWAP_MADE_LINE;
  const words = Object.fromEntries(FIELDS.filter((f) => f in patch).map((f) => [f, patch[f]?.trim() || undefined]));
  return updatePost(userId, campaignId, n, { ...words, mas: null }) ? null : SAVE_LINE;
}

/** Skip toggles: a skipped post leaves the cost and the angle mix; Skip again brings it back (written again if it had no words). */
export function skipPost(userId: string, campaignId: string, n: number): MakeOutcome {
  const { p } = find(userId, campaignId, n);
  if (!p) return { ok: false, error: GONE_LINE };
  if (p.state === "made") return { ok: false, error: SWAP_MADE_LINE };
  if (p.state === "drafting" || p.state === "making" || isSwapping(campaignId, n)) return { ok: false, error: p.state === "drafting" ? WRITING_LINE : MAKING_LINE };
  const back = p.state === "skipped";
  const state = back ? (p.hook ? "ready" : "waiting") : "skipped";
  if (!updatePost(userId, campaignId, n, { state })) return { ok: false, error: SAVE_LINE };
  if (state === "waiting") startDrafting(userId, campaignId);
  return { ok: true, toast: back ? "" : `Post ${n} skipped.`, undo: () => void skipPost(userId, campaignId, n) };
}
