// Your library (/library, docs/north-star/items/publish-library.md): everything made, from every store, in one
// list, plus what is still being made. Pure: the page reads the stores and the jobs and hands them in, so every
// rule here is tested in node. A new job kind adds one mapper below and one subscription in MakingNow; a phase 3
// format adds neither, since it mirrors its step into formatJob.ts.

import { AI_FOLDER, type ImageJob } from "@/lib/aiImage";
import type { AiJob } from "@/lib/aiVideo";
import { tiktokReason } from "@/lib/autoPost";
import type { SavedCarousel } from "@/lib/carousel";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { daysOverdue, keyToDate, localDateKey, overdueLabel, postedDay, scheduleTime, timeLabel } from "@/lib/dueDates";
import type { FormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import type { MediaItem } from "@/lib/mediaLibrary";
import type { MontageJob } from "@/lib/montage";
import type { RemixAs } from "@/lib/remix";
import { runParams, type RemixJobState } from "@/lib/remixJob";
import { slideWords, type Slideshow } from "@/lib/slideshow";
import { askParams, stepText, type SlideshowJob } from "@/lib/slideshowJob";
import type { ExportJob, JoinJob } from "@/lib/videoMedia";
import { fileKey, type VideoProject } from "@/lib/videoProjects";
import { stepText as wallStep, wallParams, type WallJob } from "@/lib/wallJob";

export type LibraryFormat = "text" | "carousel" | "video" | "image";
export type LibraryStatus = "ready" | "scheduled" | "posted" | "making" | "failed";
export const LIBRARY_FORMATS: LibraryFormat[] = ["text", "carousel", "video", "image"];
export const LIBRARY_STATUSES: LibraryStatus[] = ["ready", "scheduled", "posted", "making", "failed"];
export const FORMAT_LABELS: Record<LibraryFormat, string> = { text: "Text", carousel: "Carousel", video: "Video", image: "Image" };
export const STATUS_LABELS: Record<LibraryStatus, string> = { ready: "Ready", scheduled: "Scheduled", posted: "Posted", making: "Making", failed: "Failed" };

export interface LibraryItem {
  /** "d:<draftId>", "c:<carouselId>", "s:<slideshowId>", "v:<projectId>", "i:<mediaKey>", "j:<job kind>" */
  key: string;
  format: LibraryFormat;
  status: LibraryStatus;
  /** 80 characters at most. */
  title: string;
  /** What search reads, besides the title. */
  words: string;
  /** ISO: made or last changed. */
  at: string;
  /** scheduledFor or postedAt. */
  when?: string;
  thumb?: { kind: "slide"; carouselId: string } | { kind: "show"; showId: string } | { kind: "url"; url: string } | { kind: "media"; key: string };
  /** Where Open goes. */
  href: string;
  /** Ready drafts only. */
  scheduleHref?: string;
  /** Failed items: where Try again goes. */
  retryHref?: string;
  live?: { platform: string; url: string }[];
  /** A job's step, a failure's reason, "Script only". */
  note?: string;
  /** Zernio has it scheduled. */
  autoPost?: boolean;
  /** Making, but nothing runs until its page opens. */
  waiting?: boolean;
  /** A video's file key on this device (deviceFiles.ts), checked once its card is on screen. */
  file?: string;
}

export interface LibraryJob {
  kind: string;
  label: string;
  format: LibraryFormat;
  state: "working" | "failed" | "ready";
  step?: string;
  error?: string;
  href: string;
  /** Working, but nothing runs until `href` opens (a paid avatar after a reload). */
  waiting?: boolean;
}

const TITLE_MAX = 80;
const clip = (s: string) => (s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 3).trimEnd()}...` : s);
const firstLine = (s: string) => s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
const latest = (...isos: (string | undefined)[]) => isos.filter((s): s is string => !!s).sort().pop() ?? "";
const carouselWords = (c: SavedCarousel) => c.slides.map((s) => `${s.title}\n${s.body}`).join("\n");

/** The first of each key, so the newest of two linked to one draft is the one used. */
function firstBy<T>(list: T[], key: (t: T) => string | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const t of list) {
    const k = key(t);
    if (k && !m.has(k)) m.set(k, t);
  }
  return m;
}

function draftItem(d: DraftEntry, show?: Slideshow, car?: SavedCarousel, project?: VideoProject): LibraryItem {
  const pid = d.id.startsWith("video-") ? d.id.slice("video-".length) : null;
  const format: LibraryFormat = show || car || d.format === "carousel" ? "carousel" : d.format === "short-video" ? "video" : "text";
  const z = d.zernio;
  const zFailed = z?.status === "failed" || z?.status === "partial";
  const st = draftStatus(d);
  const status: LibraryStatus = zFailed ? "failed" : st === "draft" ? "ready" : st;
  const href = show
    ? links.slideshow({ s: show.id })
    : car
      ? links.carousel({ carousel: car.id })
      : pid
        ? links.edit({ p: pid })
        : d.format === "carousel"
          ? links.carousel({ draft: d.id })
          : links.generate({ draft: d.id });
  return {
    key: `d:${d.id}`,
    format,
    status,
    title: clip(d.hook?.trim() || firstLine(d.draft) || project?.name || show?.title || car?.title || "Untitled"),
    words: [d.hook, d.draft, d.firstComment, car && carouselWords(car), show && slideWords(show), project?.name, project?.caption].filter(Boolean).join("\n"),
    at: latest(d.createdAt, car?.updatedAt, show?.updatedAt, project?.updatedAt),
    ...(status === "scheduled" && d.scheduledFor ? { when: d.scheduledFor } : {}),
    ...(status === "posted" && d.postedAt ? { when: d.postedAt } : {}),
    ...(show ? { thumb: { kind: "show" as const, showId: show.id } } : car ? { thumb: { kind: "slide" as const, carouselId: car.id } } : project?.thumb ? { thumb: { kind: "url" as const, url: project.thumb } } : {}),
    href,
    // month view, as SlideshowPage does: a remembered Upcoming view shows no editor for the post
    ...(status === "ready" ? { scheduleHref: `${links.calendar({ post: d.id })}&view=month` } : {}),
    ...(zFailed ? { retryHref: links.drafts({ status: "scheduled" }) } : {}),
    ...(status === "posted" && z?.links?.length ? { live: z.links } : {}),
    ...(zFailed
      ? { note: z?.error ? `Zernio couldn't post it: ${tiktokReason(z.error)}` : "Zernio couldn't post it." }
      : format === "video" && !pid
        ? { note: "Script only" }
        : {}),
    ...(status === "scheduled" && z?.postId && z.status !== "cancelled" ? { autoPost: true } : {}),
    ...(project ? { file: fileKey(project) } : {}),
  };
}

function jobItem(j: LibraryJob, now: Date): LibraryItem {
  const status: LibraryStatus = j.state === "working" ? "making" : j.state;
  const note = j.state === "failed" ? j.error || "That didn't go through." : j.step;
  return {
    key: `j:${j.kind}`,
    format: j.format,
    status,
    title: clip(j.label),
    words: [j.label, note].filter(Boolean).join("\n"),
    at: now.toISOString(),
    href: j.href,
    ...(note ? { note } : {}),
    ...(j.state === "failed" ? { retryHref: j.href } : {}),
    ...(j.waiting ? { waiting: true } : {}),
  };
}

/** Every store merged into one list, newest first. A carousel, slideshow or video project tied to a draft is that draft's card, never a second one. */
export function buildLibrary(i: {
  drafts: DraftEntry[];
  carousels: SavedCarousel[];
  slideshows: Slideshow[];
  projects: VideoProject[];
  media: MediaItem[];
  jobs: LibraryJob[];
  now: Date;
}): LibraryItem[] {
  const draftIds = new Set(i.drafts.map((d) => d.id));
  const tied = (id?: string) => (id && draftIds.has(id) ? id : undefined);
  const showOf = firstBy(i.slideshows, (s) => tied(s.draftId));
  const carouselOf = firstBy(i.carousels, (c) => tied(c.draftId));
  const projectOf = firstBy(i.projects, (p) => tied(`video-${p.id}`));
  const items: LibraryItem[] = [
    ...i.drafts.map((d) => draftItem(d, showOf.get(d.id), carouselOf.get(d.id), projectOf.get(d.id))),
    ...i.carousels
      .filter((c) => !tied(c.draftId))
      .map((c): LibraryItem => ({
        key: `c:${c.id}`,
        format: "carousel",
        status: "ready",
        title: clip(c.title || firstLine(c.slides[0]?.title ?? "") || "Carousel"),
        words: carouselWords(c),
        at: c.updatedAt,
        thumb: { kind: "slide", carouselId: c.id },
        href: links.carousel({ carousel: c.id }),
      })),
    ...i.slideshows
      .filter((s) => !tied(s.draftId))
      .map((s): LibraryItem => ({
        key: `s:${s.id}`,
        format: "carousel",
        status: "ready",
        title: clip(s.title),
        words: slideWords(s),
        at: s.updatedAt,
        thumb: { kind: "show", showId: s.id },
        href: links.slideshow({ s: s.id }),
      })),
    ...i.projects
      .filter((p) => !tied(`video-${p.id}`))
      .map((p): LibraryItem => ({
        key: `v:${p.id}`,
        format: "video",
        status: "ready",
        title: clip(p.name || "Video"),
        words: [p.name, p.caption].filter(Boolean).join("\n"),
        at: p.updatedAt,
        ...(p.thumb ? { thumb: { kind: "url" as const, url: p.thumb } } : {}),
        href: links.edit({ p: p.id }),
        file: fileKey(p),
      })),
    ...i.media
      .filter((m) => m.folder === AI_FOLDER)
      .map((m): LibraryItem => ({
        key: `i:${m.key}`,
        format: "image",
        status: "ready",
        title: clip(m.name || "AI picture"),
        words: [m.name, m.alt].filter(Boolean).join("\n"),
        at: m.addedAt,
        thumb: { kind: "media", key: m.key },
        href: links.media({ item: m.key }),
      })),
    ...i.jobs.map((j) => jobItem(j, i.now)),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export interface LibraryFilter {
  format?: LibraryFormat | null;
  status?: LibraryStatus | null;
  q?: string;
}

/** Format, status and search together; search is case-insensitive over the title and every word kept. */
export function filterLibrary(items: LibraryItem[], f: LibraryFilter): LibraryItem[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  return items.filter((it) => (!f.format || it.format === f.format) && (!f.status || it.status === f.status) && (!q || `${it.title}\n${it.words}`.toLowerCase().includes(q)));
}

/** Counts per status for the pills, plus all. */
export function countBy(items: LibraryItem[]): Record<LibraryStatus | "all", number> {
  const out = { all: items.length, ready: 0, scheduled: 0, posted: 0, making: 0, failed: 0 };
  for (const it of items) out[it.status]++;
  return out;
}

/** Everything that exists: neither still being made nor failed. */
export const madeCount = (items: LibraryItem[]) => items.filter((it) => it.status !== "making" && it.status !== "failed").length;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Thu 23 Oct", the same in every browser language. */
const dayLabel = (day: string) => {
  const d = keyToDate(day);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};

/** The card's line under its title, by status. Making and failed say their note. `today`: the local day key. */
export function statusLine(it: Pick<LibraryItem, "status" | "when" | "note">, today = localDateKey()): string {
  if (it.status === "scheduled") {
    // Plan can mark a post scheduled with no day yet
    if (!it.when) return STATUS_LABELS.scheduled;
    // a past day, the way the calendar says it (My posts calls it Overdue)
    const late = daysOverdue(it.when, today);
    if (late > 0) return overdueLabel(late);
    const time = scheduleTime(it.when);
    return `Goes out ${dayLabel(it.when.slice(0, 10))}${time ? `, ${timeLabel(time)}` : ""}`;
  }
  if (it.status === "posted") return it.when ? `Posted ${dayLabel(postedDay(it.when))}` : "Posted";
  if (it.status === "ready") return "Not scheduled yet";
  return it.note ?? "";
}

// ---- job mappers: one per job module ----

export const AI_LABELS: Record<AiJob["kind"], string> = { avatar: "Avatar video", presenter: "Presenter picture", explainer: "Explainer", template: "Template clip" };
/** /edit's AI panel knows template, montage, avatar and explainer; the presenter is made inside the avatar form. */
const aiHref = (kind: AiJob["kind"]) => links.edit({ panel: ["ai"], kind: kind === "presenter" ? "avatar" : kind });

/** The AI video job; with none in memory (a reload), a paid avatar or template clip still waiting to be put together. */
export function aiJobs(j: AiJob | null, pending: { kind?: "template" } | null): LibraryJob[] {
  if (j) {
    if (j.state === "done") return [];
    const base = { kind: "ai", label: AI_LABELS[j.kind], format: j.kind === "presenter" ? ("image" as const) : ("video" as const), href: aiHref(j.kind) };
    return [j.state === "working" ? { ...base, state: "working", step: j.step } : { ...base, state: "failed", error: j.error }];
  }
  if (!pending) return [];
  const kind = pending.kind ?? "avatar";
  // only AiVideo on /edit resumes it, so it waits for Leo rather than spinning
  return [{ kind: "ai", label: AI_LABELS[kind], format: "video", state: "working", waiting: true, step: "Open the editor to finish it", href: aiHref(kind) }];
}

export function montageJobs(j: MontageJob | null): LibraryJob[] {
  if (!j || j.state === "done") return [];
  const base = { kind: "montage", label: "Montage", format: "video" as const, href: links.edit({ panel: ["ai"], kind: "montage" }) };
  if (j.state === "failed") return [{ ...base, state: "failed", error: j.error }];
  const step = j.state === "writing" ? "Writing the beats" : j.state === "finding" ? `Finding clips ${j.done} of ${j.of}` : "Putting it together";
  return [{ ...base, state: "working", step }];
}

export function imageJobs(j: ImageJob | null): LibraryJob[] {
  if (!j || j.state === "done") return [];
  const base = { kind: "image", label: "AI picture", format: "image" as const, href: links.generate() };
  if (j.state === "failed") return [{ ...base, state: "failed", error: j.error }];
  return [{ ...base, state: "working", step: j.state === "saving" ? "Saving it to Media" : j.fix ? "Fixing the picture" : "Making the picture" }];
}

/** ExportJob.id is a run counter, not a project id, so it links /edit as ExportPill does. */
export function exportJobs(j: ExportJob | null): LibraryJob[] {
  if (!j || j.state === "done") return [];
  const base = { kind: "export", label: "Export", format: "video" as const, href: links.edit() };
  if (j.state === "failed") return [{ ...base, state: "failed", error: j.error }];
  return [{ ...base, state: "working", step: `Exporting ${j.name} ${Math.round(j.progress * 100)}%` }];
}

/** A finished join the editor hasn't taken yet: AI videos, montages and formats become projects only once /edit opens. */
export function joinJobs(j: JoinJob | null): LibraryJob[] {
  if (j?.state !== "done" || !j.file) return [];
  const name = j.file.name.replace(/\.[a-z0-9]+$/i, "").trim();
  return [{ kind: "join", label: name || "Your video", format: "video", state: "ready", step: "Open it in the editor", href: links.edit() }];
}

const REMIX_FORMAT: Record<RemixAs, LibraryFormat> = {
  post: "text", carousel: "carousel", script: "video", speaking: "video", explainer: "video", slideshow: "carousel", wall: "video",
  // phase 3's format pages: a green screen's note list and a hook plus demo end as videos
  notes: "video", hooks: "video", image: "image", meme: "image",
};

/** `base` with the Remix sheet open on the run's own choices, so the row reopens what is running and Try again repeats it. */
export function sheetHref(base: string, key: string, run: RemixJobState["run"]): string {
  const [path, search = ""] = base.split("?");
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(runParams(key, run))) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  return `${path}?${p}`;
}

/** Remix rows still to come or failed; a done row is already a draft. */
export function remixJobs(j: RemixJobState | null, base: string = links.library()): LibraryJob[] {
  if (!j) return [];
  const href = sheetHref(base, j.key, j.run);
  return j.rows.flatMap((r, n): LibraryJob[] => {
    const one = { kind: `remix-${j.id}-${n}`, label: "Remix", format: REMIX_FORMAT[r.as], href };
    if (r.state === "failed") return [{ ...one, state: "failed", error: r.error }];
    if (j.state !== "working" || r.state === "done") return [];
    return [{ ...one, state: "working", step: r.state === "working" ? r.step || j.step : "Up next" }];
  });
}

/** A slideshow being made or failed; a done one is already saved, so it shows as its slideshow. */
export function slideshowJobs(j: SlideshowJob | null): LibraryJob[] {
  if (!j || j.state === "done") return [];
  const base = { kind: "slideshow", label: "Slideshow", format: "carousel" as const, href: links.makeFormat("slideshow", askParams(j.ask)) };
  if (j.state === "failed") return [{ ...base, state: "failed", error: j.error }];
  return [{ ...base, state: "working", step: stepText(j).replace(/\.\.\.$/, "") }];
}

/**
 * A wall of text being made links back to its page with the run's choices; at its join it links the editor, which
 * shows the progress and takes the video. A done one is the join's own ready row until the editor opens it.
 */
export function wallJobs(j: WallJob | null): LibraryJob[] {
  if (!j || j.state === "done") return [];
  const base = { kind: "wall", label: "Wall of text", format: "video" as const, href: links.makeFormat("wall-of-text", wallParams(j.ask)) };
  if (j.state === "failed") return [{ ...base, state: "failed", error: j.error }];
  return [{ ...base, ...(j.state === "joining" ? { href: links.edit() } : {}), state: "working", step: wallStep(j).replace(/\.\.\.$/, "") }];
}

/** Phase 3 format jobs (formatJob.ts), keyed by slug apart from the job kinds above, so a "slideshow" format job never collides. */
export function formatLibraryJobs(list: FormatJob[]): LibraryJob[] {
  return list.map(({ slug, ...j }) => ({ ...j, kind: `format-${slug}` }));
}
