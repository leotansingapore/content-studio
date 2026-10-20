// A remix run outside React (docs/north-star/items/remix-everywhere.md), the same shape as runCheck in
// following.ts: one module-level job, so leaving the page keeps it going and the pill can say when it is ready.
// Each format is one make call and, when it comes back, exactly one saved draft carrying its source and how it
// was made. In memory only: a reload mid-run loses the run, and the server has refunded any call that failed.
// Before the first row, a source with no breakdown on this device is broken down once (remix-teardown) and the
// breakdown goes into every make. The two video formats (remix-any-format) save their script draft first, then
// hand it to the AI video job (aiVideo.ts), whose steps the row relays; the editor takes the finished video.

import {
  LOOKS,
  MAX_AVATAR_SECONDS,
  aiBusy,
  aiJob,
  avatarCredits,
  makeAvatar,
  makeExplainer,
  makePresenter,
  onAiJob,
  pendingAvatar,
  sliceVoiceover,
} from "@/lib/aiVideo";
import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand, splitDraftIntoSlides } from "@/lib/carousel";
import { draftsChanged, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { EdgeError } from "@/lib/edgeFn";
import { links, slug } from "@/lib/links";
import { stripDashes } from "@/lib/plainText";
import { EMPTY_POSITIONING, loadPositioning } from "@/lib/positioning";
import { ctaTypeFor, voiceForClone, winnersFor } from "@/lib/reelClone";
import {
  AS_NOUN,
  VIDEO_LIMITS,
  carouselDraftText,
  defaultOutput,
  fullText,
  isVideo,
  noteKey,
  platformFor,
  requestMake,
  tooLongLine,
  type Close,
  type FitReason,
  type Flags,
  type Keep,
  type MakeRequest,
  type MakeResult,
  type RemixAs,
  type Speaker,
} from "@/lib/remix";
import { brandPack } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { ensureTeardown, localTeardown, type Teardown } from "@/lib/remixTeardown";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { speak, type VoiceId } from "@/lib/textVoice";
import { loadVoiceProfile } from "@/lib/voiceProfile";

export interface RemixRun {
  source: RemixSource;
  keep: Keep;
  about?: string;
  close: Close;
  /** One to three formats, at most one video; video rows run last. */
  as: RemixAs[];
  note?: string;
  mention: boolean;
  offer: string | null;
  /** The For row's pick; the brand kit's default when missing. */
  speaker?: Speaker;
  /** The video formats' voice (For row, Video voice); alice when missing. */
  voice?: VoiceId;
  fit?: { verdict: string; reasons: FitReason[] };
}

export interface RemixRow {
  as: RemixAs;
  state: "waiting" | "working" | "done" | "failed";
  step?: string;
  draftId?: string;
  href?: string;
  hook?: string;
  error?: string;
  refunded?: boolean;
  flags?: Flags;
  /** A video row: its saved script, so the words survive a failed video. */
  scriptHref?: string;
  /** A "You speaking" voiceover over the limit: no video was paid for. */
  tooLong?: boolean;
  /** A finished avatar's Higgsfield credits (avatarCredits). */
  credits?: number;
  /** A paid avatar waits on this device: the editor finishes it at no cost, and a new one would write over it. */
  waiting?: boolean;
}

export interface RemixJobState {
  id: number;
  key: string;
  state: "working" | "done" | "failed";
  step: string;
  rows: RemixRow[];
  /** The run's own choices: the pill reopens the sheet on them and the done line reads them. `as`: the formats as=
   * holds, left out when they are the source's default. */
  run: Pick<RemixRun, "keep" | "about" | "close" | "mention" | "offer"> & { as?: string };
}

export const READING = "Reading the post";
export const BREAKING = "Breaking it down";
export const CHECKING = "Checking it";
export const VOICEOVER = "Making the voiceover...";
export const writingStep = (as: RemixAs) => (isVideo(as) ? "Writing your video script" : `Writing your ${AS_NOUN[as]}`);
export const NOT_THROUGH = "This one didn't go through.";
export const NOTHING_USED = "This one didn't go through. Nothing was used for it.";
// shortcut: the check runs inside the one server call, so "Checking it" shows after a typical write time;
// switch on a real signal if the function ever streams its steps.
const CHECK_AFTER_MS = 12_000;
/** The read is on the device and instant; its step holds this long so the walk shows it. The call starts at once. */
const READ_MS = 600;

let job: RemixJobState | null = null;
let seq = 0;
const listeners = new Set<(j: RemixJobState | null) => void>();
const emit = (next: RemixJobState | null) => {
  job = next;
  listeners.forEach((l) => l(job));
};

export const remixJob = () => job;

/** The sheet's params for a run, defaults left out: reopening it shows what is running, and "Try again" repeats it. */
export function runParams(key: string, r: RemixJobState["run"]): Record<string, string | null> {
  return {
    remix: key,
    keep: r.keep === "structure" ? null : r.keep,
    about: r.keep === "topic" && r.about ? slug(r.about) : null,
    close: r.close === "balanced" ? null : r.close,
    mention: r.mention ? null : "no",
    offer: r.mention && r.offer ? slug(r.offer) : null,
    as: r.as || null,
  };
}

export function onRemixJob(fn: (j: RemixJobState | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearRemixJob(): void {
  if (job?.state !== "working") emit(null);
}

/** Starts a run unless one is still going (the sheet keeps its button off then). */
export function startRemix(userId: string, run: RemixRun): void {
  if (job?.state === "working") return;
  const id = ++seq;
  // a video takes minutes, so the text formats come back first
  const ordered = { ...run, as: [...run.as.filter((a) => !isVideo(a)), ...run.as.filter(isVideo)] };
  const { keep, about, close, mention, offer } = run;
  const as = run.as.length === 1 && run.as[0] === defaultOutput(run.source) ? undefined : run.as.join(",");
  emit({ id, key: run.source.key, state: "working", step: READING, rows: ordered.as.map((a) => ({ as: a, state: "waiting" })), run: { keep, about, close, mention, offer, as } });
  void runRows(id, userId, ordered);
}

function patch(id: number, i: number, row: Partial<RemixRow>) {
  if (job?.id !== id) return;
  const rows = job.rows.map((r, n) => (n === i ? { ...r, ...row } : r));
  emit({ ...job, rows, step: row.step ?? job.step });
}

async function runRows(id: number, userId: string, run: RemixRun) {
  const text = fullText(run.source, userId);
  // the breakdown first, once per source; a failure or the cap just means the make goes on without it
  let teardown = localTeardown(userId, run.source);
  const broke = !teardown;
  if (!teardown) {
    const breaking = setTimeout(() => {
      if (job?.id === id) emit({ ...job, step: BREAKING });
    }, READ_MS);
    teardown = await ensureTeardown(userId, run.source, text).catch(() => null);
    clearTimeout(breaking);
  }
  // one after another; a failed row never stops the others
  for (let i = 0; i < run.as.length; i++) await makeRow(id, i, userId, run, text, teardown, i === 0 && !broke);
  if (job?.id !== id) return;
  const done = job.rows.some((r) => r.state === "done");
  // a format that failed is tried again with the same note, so it stays until every format is done
  if (job.rows.every((r) => r.state === "done")) {
    try {
      globalThis.window?.localStorage?.removeItem(noteKey(run.source.key));
    } catch {
      // the note just stays for next time
    }
  }
  emit({ ...job, state: done ? "done" : "failed", step: "" });
}

function failure(e: unknown): Pick<RemixRow, "error" | "refunded"> {
  const status = e instanceof EdgeError ? e.status : 0;
  const code = e instanceof EdgeError ? e.code : "";
  if (code === "daily_limit") return { error: "No remixes left today. They reset at 8am Singapore time.", refunded: true };
  if (code === "usage_unavailable") return { error: "Can't check today's uses right now. Try again in a minute.", refunded: true };
  if (status === 400 || status === 403) return { error: (e as Error).message, refunded: true };
  // these the server answered after giving the use back or before counting it; a timeout or a lost connection may have used it
  const refunded = [422, 502, 503].includes(status);
  return { error: refunded ? NOTHING_USED : NOT_THROUGH, refunded };
}

async function makeRow(id: number, i: number, userId: string, run: RemixRun, text: string, teardown: Teardown | null, holdRead: boolean) {
  const as = run.as[i];
  patch(id, i, { state: "working", step: holdRead ? READING : writingStep(as) });
  const platform = platformFor(run.source, as, loadPositioning(userId) ?? EMPTY_POSITIONING);
  const s = run.source;
  const body: MakeRequest = {
    mode: "make",
    as,
    source: { key: s.key, kind: s.kind, format: s.format, platform: s.platform, title: s.title, author: s.author, url: s.url, text },
    keep: run.keep,
    about: run.keep === "topic" ? run.about : undefined,
    close: run.close,
    note: run.note?.trim() || undefined,
    voice: voiceForClone(loadVoiceProfile(userId), winnersFor(userId)),
    brand: brandPack(userId, { platform, mention: run.mention, offer: run.offer, speaker: run.speaker }),
    teardown: teardown ? { hookPattern: teardown.hook.pattern || undefined, beats: teardown.beats, dontReuse: teardown.dontReuse } : undefined,
    fit: run.fit as MakeRequest["fit"],
  };
  // the read is on the device and instant; its step holds a moment so the walk shows it. The call starts at once.
  const writing = holdRead ? setTimeout(() => patch(id, i, { step: writingStep(as) }), READ_MS) : undefined;
  const timer = setTimeout(() => patch(id, i, { step: CHECKING }), CHECK_AFTER_MS);
  let draft: DraftEntry;
  let res: Awaited<ReturnType<typeof requestMake>>;
  try {
    res = await requestMake(body);
    draft = toDraft(userId, run, res.result, res.flags, platform, new Date());
    upsertDraft(userId, draft);
    draftsChanged();
  } catch (e) {
    return patch(id, i, { state: "failed", step: "", ...failure(e) });
  } finally {
    clearTimeout(writing);
    clearTimeout(timer);
  }
  const saved = { draftId: draft.id, hook: draft.hook, flags: res.flags };
  if (!isVideo(as)) return patch(id, i, { state: "done", step: "", href: hrefFor(draft), ...saved });
  // the script is saved before any video is paid for, so its words survive whatever happens next
  patch(id, i, { ...saved, scriptHref: hrefFor(draft) });
  await makeVideo(id, i, run, res.result, draft.hook);
}

/**
 * The AI video after a video row's script. aiVideo's jobs never throw, so aiJob() is read after every await to tell
 * a failure, and aiBusy() right before each paid start: another video anywhere in the app means this one waits for a retry.
 */
async function makeVideo(id: number, i: number, run: RemixRun, r: MakeResult, hook: string) {
  const fail = (error = NOT_THROUGH, extra: Partial<RemixRow> = {}) => patch(id, i, { state: "failed", step: "", error, refunded: false, ...extra });
  const relay = onAiJob((j) => {
    if (j?.state === "working" && j.step) patch(id, i, { step: j.step });
  });
  const name = hook.slice(0, 40) || "AI video";
  const voice = run.voice ?? "alice";
  try {
    if (aiBusy()) return fail(VIDEO_LIMITS.busy);
    if (r.as === "explainer") {
      await makeExplainer(name, r.scenes, voice);
      const j = aiJob();
      if (j?.kind !== "explainer" || j.state !== "done") return fail();
      return patch(id, i, { state: "done", step: "", href: links.edit({ panel: ["ai"], kind: "explainer" }) });
    }
    if (r.as !== "speaking") return fail();
    if (pendingAvatar()) return fail(VIDEO_LIMITS.waiting, { waiting: true });
    patch(id, i, { step: VOICEOVER });
    const vo = await sliceVoiceover(await speak(r.script, voice));
    if (vo.seconds > MAX_AVATAR_SECONDS + 0.5) return fail(tooLongLine(vo.seconds), { tooLong: true });
    if (aiBusy()) return fail(VIDEO_LIMITS.busy);
    await makePresenter(LOOKS[Math.floor(Math.random() * LOOKS.length)]);
    const face = aiJob();
    if (face?.kind !== "presenter" || face.state !== "done" || !face.url) return fail();
    if (aiBusy()) return fail(VIDEO_LIMITS.busy);
    await makeAvatar(name, face.url, vo);
    const j = aiJob();
    // paid for but not put together (a dropped download, a slow poll): the editor picks it up for free
    if (j?.kind !== "avatar" || j.state !== "done") return pendingAvatar() ? fail(VIDEO_LIMITS.waiting, { waiting: true }) : fail();
    patch(id, i, { state: "done", step: "", href: links.edit({ panel: ["ai"], kind: "avatar" }), credits: avatarCredits(vo.slices.map((x) => x.end - x.start)) });
  } catch {
    fail();
  } finally {
    relay();
  }
}

const firstSentence = (t: string) => t.trim().match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? t.trim().split("\n")[0];

export const hrefFor = (d: Pick<DraftEntry, "id" | "format">) => (d.format === "carousel" ? links.carousel({ draft: d.id }) : links.generate({ draft: d.id }));

/** One remix result as a draft: the kit's emoji and hashtag rules and no dashes, with its source and how it was made. */
export function toDraft(userId: string, run: RemixRun, r: MakeResult, flags: Flags, platform: string, now: Date): DraftEntry {
  const kit = loadBrand(userId);
  const clean = (t: string) => stripDashes(applyBrandRules(t.trim(), kit, platform)).trim();
  const base = {
    id: newDraftId(),
    createdAt: now.toISOString(),
    pillar: "topic",
    audience: "general",
    platform,
    source: { ...run.source, remixedAt: now.toISOString() },
    remix: { keep: run.keep, as: r.as, close: run.close, ...(run.keep === "topic" && run.about ? { about: run.about } : {}), ...(run.fit ? { fit: run.fit.verdict } : {}), flags },
  };
  if (r.as === "carousel") {
    const hook = clean(r.hook);
    let draft = clean(carouselDraftText(r.hook, r.slides, r.cta));
    // a CTA the splitter doesn't read as one becomes a 9th point and one is dropped: keep 7 so nothing is
    const split = splitDraftIntoSlides(draft, { hook });
    if (!split.ctaFromDraft && split.dropped > 0) draft = clean(carouselDraftText(r.hook, r.slides.slice(0, 7), r.cta));
    return { ...base, hook, draft, pillarDetail: hook.slice(0, 160), format: "carousel", ctaType: ctaTypeFor(r.cta) };
  }
  if (r.as === "script") {
    const hook = clean(r.hook);
    const draft = clean(`${r.beats.map((b) => b.say).join("\n")}\n\n---\n\nCAPTION:\n${r.caption}`);
    const beats = r.beats.map((b) => ({ ...b, say: stripDashes(b.say), onScreen: stripDashes(b.onScreen) }));
    // exactly the spoken part Write reads, so the shot list isn't out of date the moment the draft opens
    const script = (splitScriptCaption(draft).script ?? draft).trim();
    return { ...base, hook, draft, pillarDetail: hook.slice(0, 160), format: "short-video", ctaType: ctaTypeFor(r.cta), storyboard: { beats, script, madeAt: now.toISOString() } };
  }
  if (r.as === "post") {
    const hook = clean(r.hook);
    const tags = r.hashtags.map((h) => `#${h}`).join(" ");
    const draft = clean([r.hook, r.body, r.cta, tags].filter(Boolean).join("\n\n"));
    return { ...base, hook, draft, pillarDetail: hook.slice(0, 160), format: "text-post", ctaType: ctaTypeFor(r.cta) };
  }
  if (r.as === "speaking" || r.as === "explainer") {
    // the spoken words exactly (an explainer one scene a line), then the caption under the heading Write splits on; no shot list
    const spoken = r.as === "speaking" ? r.script : r.scenes.map((x) => x.say).join("\n");
    const draft = clean(`${spoken}\n\n---\n\nCAPTION:\n${r.caption}`);
    const hook = clean(firstSentence(spoken));
    return { ...base, hook, draft, pillarDetail: hook.slice(0, 160), format: "short-video", ctaType: ctaTypeFor(r.caption) };
  }
  throw new Error(`No draft shape for ${r.as} yet`);
}
