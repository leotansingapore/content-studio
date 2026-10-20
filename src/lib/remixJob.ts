// A remix run outside React (docs/north-star/items/remix-everywhere.md), the same shape as runCheck in
// following.ts: one module-level job, so leaving the page keeps it going and the pill can say when it is ready.
// Each format is one make call and, when it comes back, exactly one saved draft carrying its source and how it
// was made. In memory only: a reload mid-run loses the run, and the server has refunded any call that failed.

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
  carouselDraftText,
  fullText,
  noteKey,
  platformFor,
  requestMake,
  type Close,
  type FitReason,
  type Flags,
  type Keep,
  type MakeRequest,
  type MakeResult,
  type RemixAs,
} from "@/lib/remix";
import { brandPack } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { loadVoiceProfile } from "@/lib/voiceProfile";

export interface RemixRun {
  source: RemixSource;
  keep: Keep;
  about?: string;
  close: Close;
  /** This wave sends [defaultOutput(source)]. */
  as: RemixAs[];
  note?: string;
  mention: boolean;
  offer: string | null;
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
}

export interface RemixJobState {
  id: number;
  key: string;
  state: "working" | "done" | "failed";
  step: string;
  rows: RemixRow[];
  /** The run's own choices: the pill reopens the sheet on them and the done line reads them. */
  run: Pick<RemixRun, "keep" | "about" | "close" | "mention" | "offer">;
}

export const READING = "Reading the post";
export const CHECKING = "Checking it";
export const writingStep = (as: RemixAs) => `Writing your ${AS_NOUN[as]}`;
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
  const { keep, about, close, mention, offer } = run;
  emit({ id, key: run.source.key, state: "working", step: READING, rows: run.as.map((as) => ({ as, state: "waiting" })), run: { keep, about, close, mention, offer } });
  void runRows(id, userId, run);
}

function patch(id: number, i: number, row: Partial<RemixRow>) {
  if (job?.id !== id) return;
  const rows = job.rows.map((r, n) => (n === i ? { ...r, ...row } : r));
  emit({ ...job, rows, step: row.step ?? job.step });
}

async function runRows(id: number, userId: string, run: RemixRun) {
  // one after another; a failed row never stops the others
  for (let i = 0; i < run.as.length; i++) await makeRow(id, i, userId, run);
  if (job?.id !== id) return;
  const done = job.rows.some((r) => r.state === "done");
  if (done) {
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
  return { error: refunded ? "That remix didn't go through. Nothing was used." : "That remix didn't go through.", refunded };
}

async function makeRow(id: number, i: number, userId: string, run: RemixRun) {
  const as = run.as[i];
  patch(id, i, { state: "working", step: READING });
  const platform = platformFor(run.source, as, loadPositioning(userId) ?? EMPTY_POSITIONING);
  const s = run.source;
  const body: MakeRequest = {
    mode: "make",
    as,
    source: { key: s.key, kind: s.kind, format: s.format, platform: s.platform, title: s.title, author: s.author, url: s.url, text: fullText(s, userId) },
    keep: run.keep,
    about: run.keep === "topic" ? run.about : undefined,
    close: run.close,
    note: run.note?.trim() || undefined,
    voice: voiceForClone(loadVoiceProfile(userId), winnersFor(userId)),
    brand: brandPack(userId, { platform, mention: run.mention, offer: run.offer }),
    fit: run.fit as MakeRequest["fit"],
  };
  const writing = setTimeout(() => patch(id, i, { step: writingStep(as) }), READ_MS);
  const timer = setTimeout(() => patch(id, i, { step: CHECKING }), CHECK_AFTER_MS);
  try {
    const res = await requestMake(body);
    const draft = toDraft(userId, run, res.result, res.flags, platform, new Date());
    upsertDraft(userId, draft);
    draftsChanged();
    patch(id, i, { state: "done", step: "", draftId: draft.id, href: hrefFor(draft), hook: draft.hook, flags: res.flags });
  } catch (e) {
    patch(id, i, { state: "failed", step: "", ...failure(e) });
  } finally {
    clearTimeout(writing);
    clearTimeout(timer);
  }
}

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
  throw new Error(`No draft shape for ${r.as} yet`);
}
