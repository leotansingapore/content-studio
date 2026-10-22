// Posts and carousels in Chinese, Malay or Tamil (edit-translate, Leo only): the runner outside React, so leaving
// Write or the carousel maker keeps a translation going. One job per English source at a time. A version is saved
// only when the call answers in full; a refused or failed call saves nothing (the server refunds what it should).

import { callFn } from "@/lib/edgeFn";
import { draftsChanged, getDraftById, loadDrafts, MAX_DRAFTS, newDraftId, restoreDraft, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { loadCarousels, MAX_SAVED_CAROUSELS, saveCarousel, type SavedCarousel, type Slide } from "@/lib/carousel";
import type { PostLang } from "@/lib/links";
import { textKey } from "@/lib/postScore";
import { scoped } from "@/lib/profiles";
import { asPostLang, LANG_NAMES, langOf, sourceOf, translatePost } from "@/lib/translate";

export const LANGS: PostLang[] = ["zh", "ms", "ta"];
export const FAILED = "Couldn't translate it right now. Try again in a minute.";
export const INCOMPLETE = "The translation came back incomplete. Try again.";

export interface TranslateJob {
  id: number;
  /** The English post or carousel: one job per source at a time. */
  sourceId: string;
  /** post: a new version of a post; again: a version's text made again; carousel: a new carousel version. */
  kind: "post" | "again" | "carousel";
  lang: PostLang;
  /** The English that was sent, so Write can tell whether it changed while the job ran. */
  text: string;
  state: "running" | "done" | "failed";
  /** The version made or replaced. */
  versionId?: string;
  /** again: the version as it was, for Undo. */
  before?: DraftEntry;
  /** The server's line when it failed. */
  error?: string;
  /** When the job last changed (ms). */
  at: number;
}

let seq = 0;
const jobs = new Map<string, TranslateJob>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const put = (job: TranslateJob) => {
  jobs.set(job.sourceId, job);
  emit();
  return job;
};

export const translateJob = (sourceId: string | null | undefined): TranslateJob | null => (sourceId ? (jobs.get(sourceId) ?? null) : null);

export function onTranslateJobs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Forgets a finished job once its page has shown it. */
export function ackJob(job: TranslateJob): void {
  if (job.state === "running" || jobs.get(job.sourceId) !== job) return;
  jobs.delete(job.sourceId);
  emit();
}

async function run(start: Omit<TranslateJob, "id" | "state" | "at">, work: () => Promise<Partial<TranslateJob>>): Promise<TranslateJob> {
  const busy = jobs.get(start.sourceId);
  if (busy?.state === "running") return busy;
  const job = put({ ...start, id: ++seq, state: "running", at: Date.now() });
  try {
    return put({ ...job, ...(await work()), state: "done", at: Date.now() });
  } catch (e) {
    return put({ ...job, state: "failed", error: (e instanceof Error && e.message) || FAILED, at: Date.now() });
  }
}

const firstLine = (text: string) => text.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? "";

/** The versions made from one English post, in the order Chinese, Malay, Tamil. */
export const versionsOf = (drafts: DraftEntry[], sourceId: string): DraftEntry[] =>
  drafts.filter((d) => langOf(d) && sourceOf(d)?.id === sourceId).sort((a, b) => LANGS.indexOf(langOf(a)!) - LANGS.indexOf(langOf(b)!));

/** Saving one more post would drop the oldest from My posts. */
export const draftsFull = (userId: string): boolean => loadDrafts(userId).length >= MAX_DRAFTS;
export const carouselsFull = (userId: string): boolean => loadCarousels(userId).length >= MAX_SAVED_CAROUSELS;

/**
 * A version of the English post as a new draft: the same brief, platform, format, labels and attachments, status
 * draft, linked by the English's id and the textKey of the words that were translated.
 */
function versionOf(source: DraftEntry, lang: PostLang, text: string, t: { text: string; back: string[]; same: number | null }): DraftEntry {
  const at = new Date().toISOString();
  return {
    id: newDraftId(),
    createdAt: at,
    hook: firstLine(t.text),
    draft: t.text,
    pillar: source.pillar,
    pillarDetail: source.pillarDetail,
    audience: source.audience,
    format: source.format,
    platform: source.platform,
    ctaType: source.ctaType,
    status: "draft",
    ...(source.labels?.length ? { labels: source.labels } : {}),
    ...(source.attached?.length ? { attached: source.attached } : {}),
    ...(source.media ? { media: source.media } : {}),
    ...(source.disclosure?.length ? { disclosure: source.disclosure } : {}),
    ...(source.source ? { source: source.source } : {}),
    lang,
    translationOf: { id: source.id, key: textKey(source.platform, text), at },
    back: t.back,
    sameP: t.same,
  };
}

// shortcut: a version saves into whichever brand is open when the call answers; switching brands mid-call files it there
/** Makes a version of the English post `sourceId` in `lang` and saves it to My posts. Null when there is nothing to translate. */
export async function translateDraft(userId: string, sourceId: string, lang: PostLang): Promise<TranslateJob | null> {
  const source = getDraftById(userId, sourceId);
  if (!source?.draft.trim() || langOf(source)) return null;
  const text = source.draft;
  return run({ sourceId, kind: "post", lang, text }, async () => {
    const version = versionOf(source, lang, text, await translatePost(lang, text));
    upsertDraft(userId, version);
    draftsChanged();
    return { versionId: version.id };
  });
}

/** "Translate again": the version's words made again from the English as it is now. Undo puts `before` back. */
export async function translateAgain(userId: string, versionId: string): Promise<TranslateJob | null> {
  const version = getDraftById(userId, versionId);
  const link = version ? sourceOf(version) : null;
  const lang = version ? langOf(version) : null;
  const source = link ? getDraftById(userId, link.id) : null;
  if (!lang || !source?.draft.trim()) return null;
  const text = source.draft;
  return run({ sourceId: source.id, kind: "again", lang, text, versionId }, async () => {
    const t = await translatePost(lang, text);
    const before = getDraftById(userId, versionId);
    if (!before) return {}; // deleted while it ran: never bring it back
    // sameP is always set, so the old answer never carries over to the new words
    upsertDraft(userId, { ...before, hook: firstLine(t.text), draft: t.text, back: t.back, sameP: t.same, translationOf: { id: source.id, key: textKey(source.platform, text), at: new Date().toISOString() } });
    draftsChanged();
    return { before };
  });
}

/** Undo for translateAgain. */
export function undoAgain(userId: string, job: TranslateJob): void {
  if (!job.before) return;
  restoreDraft(userId, job.before);
  draftsChanged();
}

/** A carousel's words as lines for the translation: each slide's title, then each line of its body. */
export const carouselLines = (slides: Slide[]): string[] => slides.flatMap((s) => [s.title, ...s.body.split("\n")]);

/** The slides with their words swapped for `lines` (carouselLines' order); pictures and ids kept. */
export function withLines(slides: Slide[], lines: string[]): Slide[] {
  let i = 0;
  return slides.map((s) => {
    const n = s.body.split("\n").length;
    const title = lines[i] ?? s.title;
    const body = lines.slice(i + 1, i + 1 + n).join("\n");
    i += 1 + n;
    return { ...s, title, body };
  });
}

/** Saves the carousel on screen in `lang` as a new carousel "v:<time>" linked to it. */
export async function translateCarousel(userId: string, carousel: Omit<SavedCarousel, "updatedAt">, lang: PostLang): Promise<TranslateJob | null> {
  const lines = carouselLines(carousel.slides);
  if (!lines.some((l) => l.trim())) return null;
  return run({ sourceId: carousel.id, kind: "carousel", lang, text: lines.join("\n") }, async () => {
    const r = await callFn<{ lines?: unknown; back?: unknown; same?: unknown }>("video-assist", { mode: "translate", kind: "post", back: true, lang, lines }, FAILED);
    const ok = (a: unknown): a is string[] => Array.isArray(a) && a.length === lines.length;
    if (!ok(r?.lines) || !ok(r?.back)) throw new Error(INCOMPLETE);
    const at = new Date();
    const id = `v:${at.getTime().toString(36)}`;
    // the version is not made from the post's text any more, so it carries no draftId
    const { draftId: _draftId, lang: _lang, translationOf: _of, ...look } = carousel;
    saveCarousel(userId, { ...look, id, title: `${carousel.title} (${LANG_NAMES[lang]})`.slice(0, 120), slides: withLines(carousel.slides, r.lines.map(String)), lang, translationOf: { id: carousel.id, at: at.toISOString() } }, at);
    saveMeaning(userId, id, r.back.map(String), typeof r.same === "number" ? r.same : null);
    return { versionId: id };
  });
}

// A carousel version's English meaning (SavedCarousel has no field for it): on this device, the newest 20.
const MEANING = "cs-carousel-meaning-";
type Meanings = Record<string, { back: string[]; same: number | null; at: string }>;

function readMeanings(userId: string): Meanings {
  try {
    const m = JSON.parse(window.localStorage.getItem(MEANING + scoped(userId)) ?? "{}");
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}

function saveMeaning(userId: string, id: string, back: string[], same: number | null): void {
  const all = { ...readMeanings(userId), [id]: { back, same, at: new Date().toISOString() } };
  const kept = Object.entries(all).sort((a, b) => String(b[1]?.at).localeCompare(String(a[1]?.at))).slice(0, MAX_SAVED_CAROUSELS);
  try {
    window.localStorage.setItem(MEANING + scoped(userId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // storage full: the version is saved; only its English meaning is not kept
  }
}

/** A carousel version's English meaning, line by line, and Jev's answer; null when this device didn't make it. */
export function carouselMeaning(userId: string, id: string): { back: string[]; same: number | null } | null {
  const m = readMeanings(userId)[id];
  return m && Array.isArray(m.back) ? { back: m.back.map(String), same: typeof m.same === "number" ? m.same : null } : null;
}

/** My posts' "Make it in" opens Write with { translate: { id, lang } } in navigation state (a pasted link can't carry it). Read once and cleared, so a reload never spends again. */
export function takeNavTranslate(): { id: string; lang: PostLang } | null {
  try {
    const t = window.history.state?.usr?.translate;
    const lang = asPostLang(t?.lang);
    if (!lang || typeof t?.id !== "string") return null;
    window.history.replaceState({ ...window.history.state, usr: null }, "");
    return { id: t.id, lang };
  } catch {
    return null;
  }
}
